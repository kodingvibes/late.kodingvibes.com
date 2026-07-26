"""
State + history backend for the /dashboard microfrontend.

Splits the previous inline state-gathering out of the
HTML-render path so it can serve the WS feed the new MF
expects, and adds a periodic background task that pushes
fresh snapshots to every connected client.

Public surface (mounted by dashboard_ws.py):
- snapshot() -> dict
- history(metric, range_seconds) -> list[dict]
- start() / stop() for the background gather loop.
"""
from __future__ import annotations

import asyncio
import json
import os
import shutil
import sqlite3
import subprocess
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Awaitable, Callable, Optional
from zoneinfo import ZoneInfo

import httpx

import dashboard_history

# Backend service URLs — local loopback, the deployd runs
# next to them.
LATE_AUTH_URL = os.environ.get("LATE_AUTH_URL", "http://127.0.0.1:9300")
CHAT_URL = "http://127.0.0.1:9100"
ICECAST_URL = "http://127.0.0.1:8000"
LATE_AUTH_SECRET = os.environ.get("LATE_AUTH_SECRET", "")

# Time-series store path. Override for tests.
os.environ.setdefault("LATE_DASHBOARD_HISTORY_DIR", "/var/lib/late-dashboard/metrics")
HISTORY_DIR = Path(os.environ["LATE_DASHBOARD_HISTORY_DIR"])

DB_AUTH = os.environ.get("LATE_AUTH_DB", "/data/late-auth/auth.db")
DB_CHAT = os.environ.get("LATE_CHAT_DB", "/data/late-chat-service/chat.db")

# ponytail: 4 s ceiling per gather. The slowest thing in
# practice is /status-json.xsl, which returns in ~50 ms.
# 4 s is enough to absorb a slow healthcheck and short
# enough to not stall the WS broadcast loop.
GATHER_TIMEOUT_S = 4.0

# How often the background loop snapshots and broadcasts.
BROADCAST_INTERVAL_S = 3.0

# ponytail: gauges (cpu/mem/swap) get their own faster tick
# because a 3s interval makes the tachometer digits read as
# a slideshow. The full /api/dashboard/state still broadcasts
# at 3s so the heavy gatherers (docker ps, icecast status,
# du -sb) don't run every second.
BROADCAST_FAST_INTERVAL_S = 1.0

# 18 SomaFM streams — exposed in the state so the MF can
# render the catalog. Kept in sync with start_soma_relays.sh.
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


# ---------------------------------------------------------------------------
# Auth gate (lifted from dashboard.py so the WS endpoint
# can use the same redirect-on-no-auth helper as the HTML
# page used to).
# ---------------------------------------------------------------------------
async def require_super_admin_response(request) -> Any:
    """Validate session and require super_admin. Returns either
    the user dict or an HTTPException. JSON clients (REST,
    WS) get 401/403; the WS endpoint translates that into
    a close code. No redirects — there is no HTML page
    to redirect to anymore.
    """
    from fastapi import HTTPException
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "missing bearer token")
    token = auth[7:].strip()
    if not token:
        raise HTTPException(401, "empty bearer token")
    if not LATE_AUTH_SECRET:
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
    user = body.get("user", body) if isinstance(body, dict) else body
    if user.get("global_role") != "super_admin":
        raise HTTPException(403, "super_admin required")
    return user


# ---------------------------------------------------------------------------
# Gatherers (each returns a small dict; missing data is fine).
# ---------------------------------------------------------------------------
async def check_http(url: str, *, timeout: float = 2.0) -> dict:
    t0 = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.get(url)
        ms = int((time.perf_counter() - t0) * 1000)
        return {"ok": r.status_code < 500, "status": r.status_code, "ms": ms}
    except httpx.HTTPError as e:
        ms = int((time.perf_counter() - t0) * 1000)
        return {"ok": False, "status": 0, "ms": ms, "error": str(e)}


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
                    info[k] = int(v) * 1024
    except OSError:
        pass
    total = info.get("MemTotal", 0)
    avail = info.get("MemAvailable", 0)
    used = max(total - avail, 0)
    pct = int(used * 100 / total) if total else 0
    return {"total": total, "used": used, "avail": avail, "pct": pct}


def _swap() -> dict:
    info: dict[str, int] = {}
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                if ":" in line:
                    k, v = line.split(":", 1)
                    v = v.strip().split()[0] if v.strip() else "0"
                    info[k] = int(v) * 1024
    except OSError:
        pass
    total = info.get("SwapTotal", 0)
    free = info.get("SwapFree", 0)
    used = max(total - free, 0)
    pct = int(used * 100 / total) if total else 0
    return {"total": total, "used": used, "free": free, "pct": pct}


def _disk(path: str) -> dict:
    # shutil.disk_usage covers bytes but not inodes; statvfs adds
    # f_files/f_ffree. The /data filesystem is typically a single
    # ext4 mount on a small droplet, so this is cheap.
    try:
        st = shutil.disk_usage(path)
    except OSError as e:
        return {"error": str(e)}
    pct = int(st.used * 100 / st.total) if st.total else 0
    out: dict = {"total": st.total, "used": st.used, "free": st.free, "pct": pct}
    try:
        sv = os.statvfs(path)
        inodes_total = sv.f_files
        inodes_free = sv.f_ffree
        inodes_used = inodes_total - inodes_free
        inodes_pct = int(inodes_used * 100 / inodes_total) if inodes_total else 0
        out["inodes"] = {
            "total": inodes_total,
            "used": inodes_used,
            "free": inodes_free,
            "pct": inodes_pct,
        }
    except OSError:
        pass
    return out


def _top_dirs() -> list[dict]:
    # A focused top-5 of the directories that actually grow on this
    # host. `du -sb` is blocking and can take a while once these
    # directories are large, so this only ever runs from the
    # expensive (3s) path, never from fast_snapshot's per-second tick.
    candidates = [
        ("/data/late-auth", "/data/late-auth"),
        ("/data/late-chat-service", "/data/late-chat-service"),
        ("/data/chat-bridge", "/data/chat-bridge"),
        ("/var/log/late-deployd", "/var/log/late-deployd"),
        ("/var/lib/late-dashboard", "/var/lib/late-dashboard"),
    ]
    rows: list[dict] = []
    for path, label in candidates:
        try:
            out = subprocess.run(
                ["du", "-sb", "--", path],
                capture_output=True, text=True, timeout=4,
            )
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue
        if out.returncode != 0 or not out.stdout.strip():
            continue
        try:
            size = int(out.stdout.split()[0])
        except (ValueError, IndexError):
            continue
        rows.append({"path": path, "label": label, "bytes": size})
    rows.sort(key=lambda r: r["bytes"], reverse=True)
    return rows[:5]


def _uptime() -> Optional[int]:
    try:
        with open("/proc/uptime") as f:
            return int(float(f.read().split()[0]))
    except (OSError, ValueError, IndexError):
        return None


def _cpu_sample() -> Optional[tuple]:
    try:
        with open("/proc/stat") as f:
            line = f.readline()
        parts = line.split()
        nums = [int(x) for x in parts[1:]]
        total = sum(nums)
        idle = nums[3] if len(nums) > 3 else 0
        return total - idle, total
    except (OSError, ValueError, IndexError):
        return None


def _cpu_pct() -> Optional[int]:
    a = _cpu_sample()
    if a is None:
        return None
    time.sleep(0.2)
    b = _cpu_sample()
    if b is None:
        return None
    busy = b[0] - a[0]
    total = b[1] - a[1]
    if total <= 0:
        return 0
    return int(busy * 100 / total)


def _system_cheap_sync() -> dict:
    """loadavg/mem/swap/cpu: what the per-second gauge tick needs.
    Still blocking (the cpu sample sleeps 200ms) — only ever call
    this via asyncio.to_thread, never directly from a coroutine."""
    return {
        "loadavg": _loadavg(),
        "memory": _mem(),
        "swap": _swap(),
        "cpu_pct": _cpu_pct(),
    }


def _system_extras_sync() -> dict:
    """disk/top_dirs/uptime: only needed by the full 3s snapshot.
    top_dirs() can spawn up to 5 `du` subprocesses, so this stays
    off the per-second path."""
    return {
        "disk_data": _disk("/data"),
        "top_dirs": _top_dirs(),
        "uptime_s": _uptime(),
    }


async def _system_cheap() -> dict:
    return await asyncio.to_thread(_system_cheap_sync)


async def g_system() -> dict:
    cheap, extras = await asyncio.gather(
        asyncio.to_thread(_system_cheap_sync),
        asyncio.to_thread(_system_extras_sync),
    )
    return {**cheap, **extras}


async def g_service_health() -> dict:
    auth, chat, ice, deployd = await asyncio.gather(
        check_http(f"{LATE_AUTH_URL}/api/auth/healthz"),
        check_http(f"{CHAT_URL}/healthz"),
        check_http(f"{ICECAST_URL}/status-json.xsl", timeout=3.0),
        _self_probe(),
    )
    return {
        "late_auth_service": auth,
        "late_chat_service": chat,
        "icecast": ice,
        "late_deployd": deployd,
    }


async def _self_probe() -> dict:
    t0 = time.perf_counter()
    await asyncio.sleep(0)
    return {"ok": True, "status": 200, "ms": int((time.perf_counter() - t0) * 1000)}


async def g_docker() -> dict:
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

    def _df() -> dict:
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

    def _collect() -> dict:
        return {"containers": _ps(), "df": _df()}

    return await asyncio.to_thread(_collect)


async def g_icecast() -> dict:
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
    return [{"mount": m, "label": label} for m, label in STREAMS]


async def g_recent_deploys(limit: int = 10) -> list[dict]:
    def _scan() -> list[dict]:
        log_dir = Path(os.environ.get("LOG_DIR", "/var/log/late-deployd"))
        if not log_dir.exists():
            return []
        files = sorted(log_dir.glob("*.log"), key=lambda p: p.stat().st_mtime, reverse=True)[:limit]
        out = []
        import re as _re
        for f in files:
            try:
                lines = f.read_text(encoding="utf-8", errors="replace").splitlines()
            except OSError:
                continue
            tail = lines[-1] if lines else ""
            ok = "deploy finished with code 0" in tail or "deploy succeeded" in tail.lower()
            started = lines[0] if lines else ""
            commit = ""
            for line in lines:
                m = _re.search(r"HEAD is now at ([0-9a-f]+)", line)
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

    auth_counts, chat_counts = await asyncio.gather(
        asyncio.to_thread(_counts, DB_AUTH, ["users", "sessions"]),
        asyncio.to_thread(_counts, DB_CHAT, [
            "channels", "messages", "attachments", "voice_notes",
            "channel_members", "reactions", "notes",
        ]),
    )
    return {
        "auth_db": {**_stat(DB_AUTH), "counts": auth_counts},
        "chat_db": {**_stat(DB_CHAT), "counts": chat_counts},
    }


# ---------------------------------------------------------------------------
# Snapshot + history (read paths exposed to the WS / REST).
# ---------------------------------------------------------------------------
GATHERERS: list[tuple[str, Callable[[], Awaitable[dict]]]] = [
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


async def fast_snapshot() -> dict:
    """Cheap snapshot for the per-second gauge tick.

    Calls _system_cheap() (loadavg/mem/swap/cpu only, offloaded via
    asyncio.to_thread), not g_system() — the full snapshot's
    disk_data/top_dirs/uptime_s (and top_dirs' `du` subprocesses)
    stay off the per-second path. 'system' here is a subset of what
    snapshot()['system'] carries; a 'gathered_at' is included so the
    WS payload is self-describing.
    """
    sys = await _system_cheap()
    return {
        "system": sys,
        "gathered_at": datetime.now(ZoneInfo("UTC")).isoformat(),
    }


async def snapshot() -> dict:
    pairs = await asyncio.gather(*[_one(n, f) for n, f in GATHERERS])
    out = dict(pairs)
    out["gathered_at"] = datetime.now(ZoneInfo("UTC")).isoformat()
    # Append one sample per metric so the time-range chart
    # has data to draw. /proc reads are cheap; the 200ms cpu
    # sample is the worst case.
    system = out.get("system", {}) or {}
    if system.get("cpu_pct") is not None:
        dashboard_history.append_sample("cpu", system["cpu_pct"])
    mem = system.get("memory", {}) or {}
    if mem.get("pct") is not None:
        dashboard_history.append_sample("memory", mem["pct"])
    swap = system.get("swap", {}) or {}
    if swap.get("pct") is not None:
        dashboard_history.append_sample("swap", swap["pct"])
    # Three more series: total icecast listeners, average
    # service latency, and 1m load average. Same 3s
    # cadence as the gauges, so all the recharts time
    # series move on the same x axis.
    ice = out.get("icecast", {}) or {}
    if ice.get("total_listeners") is not None:
        dashboard_history.append_sample("listeners", int(ice["total_listeners"]))
    svcs = out.get("services", {}) or {}
    lats = [int(v.get("ms", 0)) for v in svcs.values() if isinstance(v, dict) and v.get("ms") is not None]
    if lats:
        dashboard_history.append_sample("latency_ms", int(sum(lats) / len(lats)))
    loadavg = (system.get("loadavg") or "").split()
    if loadavg:
        try:
            dashboard_history.append_sample("load_1m", float(loadavg[0]))
        except ValueError:
            pass
    return out


_last_roll = 0.0
# roll() scans every metric's .jsonl file; retention is 31 days, so
# rolling more often than this is pointless work.
ROLL_INTERVAL_S = 60.0


def _history_sync(metric: str, range_seconds: int) -> list[dict]:
    global _last_roll
    now = time.time()
    if now - _last_roll > ROLL_INTERVAL_S:
        dashboard_history.roll()
        _last_roll = now
    return dashboard_history.read_samples(metric, range_seconds)


async def history(metric: str, range_seconds: int) -> list[dict]:
    """Return time-series samples for a metric in a range.

    Offloaded to a thread: roll()/read_samples() do blocking file I/O,
    and the broadcast loops in dashboard_ws.py call this several times
    per tick — running it inline was stalling the event loop.
    """
    if metric not in ("cpu", "memory", "swap", "listeners", "latency_ms", "load_1m"):
        return []
    return await asyncio.to_thread(_history_sync, metric, range_seconds)
