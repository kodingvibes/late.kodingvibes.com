"""
late-deployd dashboard at /dashboard.

Read-only operational view for super_admin. Renders an HTML page
that lists the state of every service we run on this host, the
recent deploys, the radio streams, and the system load.

Auth: the request must carry `Authorization: Bearer <session_id>`.
We validate the session against late-auth-service and require
global_role == 'super_admin'.

The page polls itself every 30 s. The script reads the bearer
from localStorage on the same origin and refreshes; no JS
framework, just vanilla DOM.

The system uses a non-blocking gather pattern: every metric is a
small async function that returns a (key, dict) pair, all run in
parallel via asyncio.gather, then the template renders.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import sqlite3
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable, Optional

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse

# ponytail: same file as the auth service, shared secret.
# late-deployd lives in the same trust zone as late-auth-service
# (both run on the host, systemd, root). The secret is rotated
# together with late-chat-service.
LATE_AUTH_URL = os.environ.get("LATE_AUTH_URL", "http://127.0.0.1:9300")
LATE_AUTH_SECRET = os.environ.get("LATE_AUTH_SECRET", "")
CHAT_URL = "http://127.0.0.1:9100"
ICECAST_URL = "http://127.0.0.1:8000"
DASHBOARD_TEMPLATE_PATH = Path(__file__).parent / "dashboard.html"

# SomaFM streams. The list matches scripts/start_soma_relays.sh;
# kept inline so the dashboard doesn't need a config file.
STREAMS = [
    ("groovesalad", "Groove Salad"),
    ("dronezone", "Drone Zone"),
    ("fluid", "Fluid"),
    ("indiepop", "Indie Pop Rocks!"),
    ("u80s", "Underground 80s"),
    ("vaporwaves", "Vapor Waves"),
    ("metal", "Metal Detector"),
    ("dubstep", "Dub Step Beyond"),
    ("7soul", "Seven Inch Soul"),
    ("beatblender", "Beat Blender"),
    ("bootliquor", "Boot Liquor"),
    ("doomed", "Doomed"),
    ("illstreet", "Illinois Street Lounge"),
    ("lush", "Lush"),
    ("poptron", "PopTron"),
    ("secretagent", "Secret Agent"),
    ("suburbsofgoa", "Suburbs of Goa"),
    ("thetrip", "The Trip"),
]

# ponytail: a 4 s ceiling per gather. The slowest thing in
# practice is /status-json.xsl, which returns in ~50 ms. 4 s
# is enough to absorb a slow healthcheck and short enough to
# not stall the page render.
GATHER_TIMEOUT_S = 4.0


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
async def require_super_admin(request: Request) -> dict:
    """Validate the session against late-auth and require super_admin."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "missing bearer token")
    token = auth[7:].strip()
    if not token:
        raise HTTPException(401, "empty bearer token")
    if not LATE_AUTH_SECRET:
        # ponytail: the deployd has no auth material; refuse to
        # render any data rather than hand it to anyone with the
        # path. The page returns 503 so it's obvious from the
        # browser too.
        raise HTTPException(503, "LATE_AUTH_SECRET not configured on deployd")
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(
                f"{LATE_AUTH_URL}/api/auth/validate",
                headers={
                    "Authorization": f"Bearer {LATE_AUTH_SECRET}",
                    "X-Session-Id": token,
                },
            )
    except httpx.HTTPError as e:
        raise HTTPException(503, f"late-auth unreachable: {e}")
    if r.status_code != 200:
        raise HTTPException(401, "invalid session")
    body = r.json()
    # /api/auth/validate returns {"valid": true, "user": {...}}; we
    # want the user dict for the role check. If the body is already
    # a user-shaped dict (id, global_role), use it as-is so we
    # don't break against an older or simpler late-auth.
    user = body.get("user", body) if isinstance(body, dict) else body
    if user.get("global_role") != "super_admin":
        raise HTTPException(403, "super_admin required")
    return user


# ---------------------------------------------------------------------------
# Gatherers — each returns a small dict; missing data is fine.
# ---------------------------------------------------------------------------
async def check_http(url: str, *, timeout: float = 2.0) -> dict:
    """Best-effort HTTP probe. Returns {ok, status, ms, body}."""
    t0 = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.get(url)
        ms = int((time.perf_counter() - t0) * 1000)
        return {"ok": r.status_code < 500, "status": r.status_code, "ms": ms}
    except httpx.HTTPError as e:
        ms = int((time.perf_counter() - t0) * 1000)
        return {"ok": False, "status": 0, "ms": ms, "error": str(e)}


async def g_system() -> dict:
    """Host-level metrics: load avg, memory, disk, uptime."""
    def _loadavg() -> Optional[str]:
        try:
            with open("/proc/loadavg") as f:
                return " ".join(f.read().split()[:3])
        except OSError:
            return None

    def _mem() -> dict:
        info: dict[str, int] = {}
        try:
            with open("/proc/meminfo") as f:
                for line in f:
                    if ":" in line:
                        k, v = line.split(":", 1)
                        v = v.strip().split()[0] if v.strip() else "0"
                        info[k] = int(v) * 1024  # kB -> bytes
        except OSError:
            pass
        total = info.get("MemTotal", 0)
        avail = info.get("MemAvailable", 0)
        used = max(total - avail, 0)
        pct = int(used * 100 / total) if total else 0
        return {"total": total, "used": used, "avail": avail, "pct": pct}

    def _disk(path: str) -> dict:
        try:
            st = shutil.disk_usage(path)
            pct = int(st.used * 100 / st.total) if st.total else 0
            return {"total": st.total, "used": st.used, "free": st.free, "pct": pct}
        except OSError as e:
            return {"error": str(e)}

    def _uptime() -> Optional[int]:
        try:
            with open("/proc/uptime") as f:
                return int(float(f.read().split()[0]))
        except (OSError, ValueError, IndexError):
            return None

    return {
        "loadavg": _loadavg(),
        "memory": _mem(),
        "disk_root": _disk("/"),
        "disk_data": _disk("/data"),
        "uptime_s": _uptime(),
    }


async def g_service_health() -> dict:
    """Five service probes in parallel."""
    auth, chat, ice, deployd = await asyncio.gather(
        check_http(f"{LATE_AUTH_URL}/api/auth/healthz"),
        check_http(f"{CHAT_URL}/healthz"),
        check_http(f"{ICECAST_URL}/status-json.xsl", timeout=3.0),
        # self: we are running this, so it's always ok. Compute the
        # response time for symmetry with the others.
        _self_probe(),
        return_exceptions=False,
    )
    return {
        "late_auth_service": auth,
        "late_chat_service": chat,
        "icecast": ice,
        "late_deployd": deployd,
    }


async def _self_probe() -> dict:
    """A no-op HTTP to ourselves would be silly; this is a stopwatch."""
    t0 = time.perf_counter()
    await asyncio.sleep(0)
    return {"ok": True, "status": 200, "ms": int((time.perf_counter() - t0) * 1000)}


async def g_docker() -> dict:
    """List running containers. No docker -> empty list."""
    def _ps() -> list[dict]:
        try:
            out = subprocess.run(
                ["docker", "ps", "--no-trunc", "--format", "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}"],
                capture_output=True, text=True, timeout=3,
            )
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return []
        if out.returncode != 0:
            return []
        rows = []
        for line in out.stdout.strip().splitlines():
            parts = line.split("|", 4)
            if len(parts) != 5:
                continue
            cid, name, image, status, ports = parts
            rows.append({
                "id": cid[:12],
                "name": name,
                "image": image,
                "status": status,
                "ports": ports,
            })
        return rows

    def _disk_used() -> dict:
        try:
            out = subprocess.run(
                ["docker", "system", "df", "--format", "{{.Type}}|{{.Size}}|{{.Reclaimable}}"],
                capture_output=True, text=True, timeout=3,
            )
            rows = {}
            for line in out.stdout.strip().splitlines():
                t, s, r = line.split("|", 2)
                rows[t] = {"size": s, "reclaimable": r}
            return rows
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return {}

    return {"containers": _ps(), "df": _disk_used()}


async def g_icecast() -> dict:
    """Pull /status-json.xsl, summarize sources, total listeners."""
    def _fetch() -> Optional[dict]:
        try:
            out = subprocess.run(
                ["curl", "-fsS", "--max-time", "3", f"{ICECAST_URL}/status-json.xsl"],
                capture_output=True, text=True, timeout=4,
            )
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return None
        if out.returncode != 0:
            return None
        try:
            return json.loads(out.stdout)
        except json.JSONDecodeError:
            return None

    data = await asyncio.to_thread(_fetch)
    if not data:
        return {"ok": False, "sources": [], "total_listeners": 0}
    sources = data.get("icestats", {}).get("source", [])
    if isinstance(sources, dict):
        sources = [sources]
    out = []
    total = 0
    for s in sources:
        listeners = int(s.get("listeners", 0) or 0)
        total += listeners
        out.append({
            "mount": s.get("listenurl", "").rsplit("/", 1)[-1],
            "listeners": listeners,
            "title": s.get("title", "") or s.get("yp_name", ""),
            "bitrate": s.get("bitrate", 0),
        })
    out.sort(key=lambda r: r["mount"])
    return {"ok": True, "sources": out, "total_listeners": total}


async def g_streams_static() -> list[dict]:
    """The 18 SomaFM mounts. Always returns, even if icecast is down."""
    return [
        {"mount": m, "label": label} for m, label in STREAMS
    ]


async def g_recent_deploys(limit: int = 10) -> list[dict]:
    """Tail the latest N log files. Summary only — last line tells ok/fail."""
    def _scan() -> list[dict]:
        log_dir = Path(os.environ.get("LOG_DIR", "/var/log/late-deployd"))
        if not log_dir.exists():
            return []
        files = sorted(log_dir.glob("*.log"), key=lambda p: p.stat().st_mtime, reverse=True)[:limit]
        out = []
        for f in files:
            try:
                lines = f.read_text(encoding="utf-8", errors="replace").splitlines()
            except OSError:
                continue
            tail = lines[-1] if lines else ""
            ok = "deploy finished with code 0" in tail or "deploy succeeded" in tail.lower()
            started = lines[0] if lines else ""
            # ponytail: extract the commit short hash from the
            # `git pull` block if present, otherwise leave it.
            commit = ""
            for line in lines:
                m = re.search(r"HEAD is now at ([0-9a-f]+)", line)
                if m:
                    commit = m.group(1)[:8]
                    break
            out.append({
                "file": f.name,
                "mtime": f.stat().st_mtime,
                "ok": ok,
                "size": f.stat().st_size,
                "commit": commit,
                "started": started,
                "tail": tail[:160],
            })
        return out

    return await asyncio.to_thread(_scan)


async def g_db_metrics() -> dict:
    """File sizes + row counts for the two SQLite DBs."""
    def _stat(p: str) -> dict:
        try:
            return {"bytes": Path(p).stat().st_size}
        except OSError as e:
            return {"error": str(e)}

    def _counts(db: str, tables: list[str]) -> dict:
        out: dict[str, Any] = {}
        try:
            conn = sqlite3.connect(f"file:{db}?mode=ro", timeout=2)
            try:
                for t in tables:
                    try:
                        n = conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
                        out[t] = n
                    except sqlite3.OperationalError as e:
                        out[t] = f"err: {e}"
            finally:
                conn.close()
        except sqlite3.Error as e:
            return {"error": str(e)}
        return out

    auth_path = os.environ.get("LATE_AUTH_DB", "/data/late-auth/auth.db")
    chat_path = os.environ.get("LATE_CHAT_DB", "/data/late-chat-service/chat.db")

    auth_counts, chat_counts = await asyncio.gather(
        asyncio.to_thread(_counts, auth_path, ["users", "sessions"]),
        asyncio.to_thread(_counts, chat_path, [
            "channels", "messages", "attachments", "voice_notes",
            "channel_members", "reactions", "notes",
        ]),
    )
    return {
        "auth_db": {**_stat(auth_path), "counts": auth_counts},
        "chat_db": {**_stat(chat_path), "counts": chat_counts},
    }


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------
async def gather_all() -> dict:
    """Run all gatherers in parallel. Each is bounded by GATHER_TIMEOUT_S."""
    gatherers: list[tuple[str, Callable[[], Awaitable[dict]]]] = [
        ("system", g_system),
        ("services", g_service_health),
        ("docker", g_docker),
        ("icecast", g_icecast),
        ("streams", g_streams_static),
        ("deploys", g_recent_deploys),
        ("db", g_db_metrics),
    ]
    async def _one(name: str, fn) -> tuple[str, dict]:
        try:
            return name, await asyncio.wait_for(fn(), timeout=GATHER_TIMEOUT_S)
        except (asyncio.TimeoutError, Exception) as e:
            return name, {"error": f"{type(e).__name__}: {e}"}
    pairs = await asyncio.gather(*[_one(n, f) for n, f in gatherers])
    out = dict(pairs)
    out["gathered_at"] = datetime.now(timezone.utc).isoformat()
    return out


# ---------------------------------------------------------------------------
# Render
# ---------------------------------------------------------------------------
def human_bytes(n: int) -> str:
    if not n:
        return "0"
    for unit, k in (("GiB", 1024 ** 3), ("MiB", 1024 ** 2), ("KiB", 1024)):
        if n >= k:
            return f"{n / k:.1f} {unit}"
    return f"{n} B"


def uptime_str(s: Optional[int]) -> str:
    if not s:
        return "—"
    d, r = divmod(s, 86400)
    h, r = divmod(r, 3600)
    m, _ = divmod(r, 60)
    if d:
        return f"{d}d {h}h {m}m"
    if h:
        return f"{h}h {m}m"
    return f"{m}m"


def fmt_ts(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def status_dot(ok: bool) -> str:
    return "🟢" if ok else "🔴"


def service_status_row(label: str, p: dict) -> str:
    if p.get("error"):
        return f"""
        <tr><td class="px-4 py-2 text-slate-300">{label}</td>
            <td class="px-4 py-2">🔴 error</td>
            <td class="px-4 py-2 text-slate-400">—</td>
            <td class="px-4 py-2 text-slate-400 text-xs">{escape(p['error'])}</td></tr>"""
    if p.get("status") == 0:
        return f"""
        <tr><td class="px-4 py-2 text-slate-300">{label}</td>
            <td class="px-4 py-2">🔴 down</td>
            <td class="px-4 py-2 text-slate-400">—</td>
            <td class="px-4 py-2 text-slate-400 text-xs">unreachable</td></tr>"""
    return f"""
    <tr><td class="px-4 py-2 text-slate-300">{label}</td>
        <td class="px-4 py-2">{status_dot(p.get('ok', False))} {p.get('status', '—')}</td>
        <td class="px-4 py-2 text-slate-400">{p.get('ms', '—')} ms</td>
        <td class="px-4 py-2 text-slate-400 text-xs">—</td></tr>"""


def escape(s: Any) -> str:
    if s is None:
        return ""
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def render_dashboard_html(payload: dict) -> str:
    """Render the dashboard HTML page. Pure f-string; no template engine."""
    system = payload.get("system", {})
    services = payload.get("services", {})
    docker = payload.get("docker", {})
    icecast = payload.get("icecast", {})
    streams = payload.get("streams", [])
    deploys = payload.get("deploys", [])
    db = payload.get("db", {})

    # Overall status: red if any service is not ok, otherwise green.
    services_ok = all(
        p.get("ok") for p in services.values() if isinstance(p, dict)
    )
    overall_ok = services_ok and bool(icecast.get("ok"))
    overall_label = "operational" if overall_ok else "degraded"

    # Service health table rows
    service_rows = "\n".join(
        service_status_row(name, p)
        for name, p in services.items()
    )

    # System
    mem = system.get("memory", {})
    disk_root = system.get("disk_root", {})
    disk_data = system.get("disk_data", {})

    # Docker
    containers = docker.get("containers", []) if isinstance(docker, dict) else []
    container_rows = "\n".join(
        f'<tr><td class="px-3 py-1.5 text-slate-200 font-mono text-xs">{escape(c["name"])}</td>'
        f'<td class="px-3 py-1.5 text-slate-400 text-xs">{escape(c["image"])}</td>'
        f'<td class="px-3 py-1.5 text-slate-400 text-xs">{escape(c["status"])}</td>'
        f'<td class="px-3 py-1.5 text-slate-500 text-xs">{escape(c["ports"][:60])}</td></tr>'
        for c in containers
    )

    # Icecast sources
    icecast_sources = icecast.get("sources", []) if isinstance(icecast, dict) else []
    icecast_rows = "\n".join(
        f'<tr><td class="px-3 py-1.5 text-slate-200 font-mono text-xs">/{escape(s["mount"])}</td>'
        f'<td class="px-3 py-1.5 text-slate-400 text-xs">{s["listeners"]} listeners</td>'
        f'<td class="px-3 py-1.5 text-slate-300 text-xs">{escape(s["title"] or "—")}</td></tr>'
        for s in icecast_sources
    )

    # Streams list (always 18)
    stream_rows = "\n".join(
        f'<tr><td class="px-3 py-1.5 text-slate-200 font-mono text-xs">/{escape(s["mount"])}</td>'
        f'<td class="px-3 py-1.5 text-slate-400 text-xs">{escape(s["label"])}</td>'
        f'<td class="px-3 py-1.5 text-slate-500 text-xs">—</td></tr>'
        for s in streams
    )

    # Deploys table
    deploy_rows = "\n".join(
        f'<tr><td class="px-3 py-1.5 text-slate-400 text-xs">{fmt_ts(d["mtime"])}</td>'
        f'<td class="px-3 py-1.5 text-slate-200 font-mono text-xs">{escape(d["file"].replace(".log", ""))}</td>'
        f'<td class="px-3 py-1.5">{status_dot(d["ok"])} {escape("ok" if d["ok"] else "fail")}</td>'
        f'<td class="px-3 py-1.5 text-slate-500 text-xs font-mono">{escape(d["commit"] or "—")}</td></tr>'
        for d in deploys
    )

    # DB metrics
    auth_db = db.get("auth_db", {}) if isinstance(db, dict) else {}
    chat_db = db.get("chat_db", {}) if isinstance(db, dict) else {}
    auth_counts = auth_db.get("counts", {}) if isinstance(auth_db.get("counts"), dict) else {}
    chat_counts = chat_db.get("counts", {}) if isinstance(chat_db.get("counts"), dict) else {}

    template = DASHBOARD_TEMPLATE_PATH.read_text(encoding="utf-8")
    overall_class_pill = "ok" if overall_ok else "bad"
    mem_bar_class = "warn" if mem.get("pct", 0) >= 85 else ""
    mem_bar_width = min(int(mem.get("pct", 0)), 100)
    disk_root_bar_class = "warn" if disk_root.get("pct", 0) >= 85 else ""
    disk_root_bar_width = min(int(disk_root.get("pct", 0)), 100)
    disk_data_bar_class = "warn" if disk_data.get("pct", 0) >= 85 else ""
    disk_data_bar_width = min(int(disk_data.get("pct", 0)), 100)
    container_s = "" if len(containers) == 1 else "s"
    listener_s = "" if (icecast.get("total_listeners", 0) if isinstance(icecast, dict) else 0) == 1 else "s"
    return template.format(
        overall_label=overall_label,
        overall_class="text-emerald-400" if overall_ok else "text-rose-400",
        overall_class_pill=overall_class_pill,
        overall_dot="🟢" if overall_ok else "🔴",
        service_rows=service_rows,
        loadavg=escape(system.get("loadavg", "—")),
        mem_pct=mem.get("pct", 0),
        mem_used=human_bytes(mem.get("used", 0)),
        mem_total=human_bytes(mem.get("total", 0)),
        mem_bar_class=mem_bar_class,
        mem_bar_width=mem_bar_width,
        disk_root_pct=disk_root.get("pct", 0),
        disk_root_used=human_bytes(disk_root.get("used", 0)),
        disk_root_total=human_bytes(disk_root.get("total", 0)),
        disk_root_bar_class=disk_root_bar_class,
        disk_root_bar_width=disk_root_bar_width,
        disk_data_pct=disk_data.get("pct", 0),
        disk_data_used=human_bytes(disk_data.get("used", 0)),
        disk_data_total=human_bytes(disk_data.get("total", 0)),
        disk_data_bar_class=disk_data_bar_class,
        disk_data_bar_width=disk_data_bar_width,
        uptime=uptime_str(system.get("uptime_s")),
        container_rows=container_rows or '<tr><td colspan="4" class="px-3 py-2 text-slate-500 text-xs">no containers</td></tr>',
        container_count=len(containers),
        container_s=container_s,
        icecast_total=icecast.get("total_listeners", 0) if isinstance(icecast, dict) else 0,
        icecast_rows=icecast_rows or '<tr><td colspan="3" class="px-3 py-2 text-slate-500 text-xs">icecast down or empty</td></tr>',
        listener_s=listener_s,
        stream_rows=stream_rows,
        deploy_rows=deploy_rows or '<tr><td colspan="4" class="px-3 py-2 text-slate-500 text-xs">no deploys</td></tr>',
        auth_db_size=human_bytes(auth_db.get("bytes", 0)),
        auth_users=auth_counts.get("users", "—"),
        auth_sessions=auth_counts.get("sessions", "—"),
        chat_db_size=human_bytes(chat_db.get("bytes", 0)),
        chat_channels=chat_counts.get("channels", "—"),
        chat_messages=chat_counts.get("messages", "—"),
        chat_attachments=chat_counts.get("attachments", "—"),
        chat_voice=chat_counts.get("voice_notes", "—"),
        gathered_at=escape(payload.get("gathered_at", "—")),
    )


# ---------------------------------------------------------------------------
# Mount
# ---------------------------------------------------------------------------
def register(app: FastAPI) -> None:
    @app.get("/dashboard", response_class=HTMLResponse)
    async def dashboard(request: Request) -> HTMLResponse:
        await require_super_admin(request)
        payload = await gather_all()
        return HTMLResponse(render_dashboard_html(payload))
