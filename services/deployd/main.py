#!/usr/bin/env python3
"""
late-deployd: GitHub webhook receiver that auto-deploys repos on push to main.

Endpoints:
  POST /deploy-webhook  -> receive GitHub push events (returns 202, deploys async)
  GET  /health          -> health check
  GET  /logs            -> list recent deploy logs

Environment (from /root/.deployd.env):
  GITHUB_WEBHOOK_SECRET  -> HMAC secret shared with GitHub webhooks
  LOG_DIR                -> where deploy logs are written
"""

import hashlib
import hmac
import json
import logging
import os
import subprocess
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Header, HTTPException, Request

import dashboard_history  # noqa: F401  (sibling module)
import dashboard_state  # noqa: F401
import dashboard_ws  # late-deployd dashboard WS + REST endpoints

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
REPOS = {
    "late.kodingvibes.com": {
        "path": "/root/late.kodingvibes.com",
        "branch": "main",
        "deploy": "shell_only",
    },
    "late-micro-radio": {
        "path": "/root/late-micro-radio",
        "branch": "main",
        "deploy": "micro_radio",
    },
    "late-micro-chat": {
        "path": "/root/late-micro-chat",
        "branch": "main",
        "deploy": "micro_chat",
    },
    "late-chat-service": {
        "path": "/root/late-chat-service",
        "branch": "main",
        "deploy": "chat_service",
    },
    "late-auth-service": {
        "path": "/root/late-auth-service",
        "branch": "main",
        "deploy": "auth_service",
    },
}

SHELL_DIR = "/root/late.kodingvibes.com"

LOG_DIR = Path(os.environ.get("LOG_DIR", "/var/log/late-deployd"))
SECRET = os.environ.get("GITHUB_WEBHOOK_SECRET", "").encode()

APP = FastAPI(title="late-deployd")
dashboard_ws.register(APP)

LOG_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("deployd")

# Lock per repo so concurrent pushes on the same repo queue instead of racing.
LOCKS: dict[str, threading.Lock] = {name: threading.Lock() for name in REPOS}
# Global lock around any write to /var/www/html/ (shell copy or micro symlink updates).
WWW_LOCK = threading.Lock()


def _env() -> dict:
    """Environment with Node from nvm available to all subprocesses."""
    return {"PATH": "/root/.nvm/versions/node/v24.18.0/bin:" + os.environ.get("PATH", "")}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def verify_signature(body: bytes, signature: Optional[str]) -> bool:
    if not SECRET:
        logger.error("GITHUB_WEBHOOK_SECRET not configured")
        return False
    if not signature:
        return False
    prefix = "sha256="
    if not signature.startswith(prefix):
        return False
    expected = signature[len(prefix):].encode()
    digest = hmac.new(SECRET, body, hashlib.sha256).hexdigest().encode()
    return hmac.compare_digest(digest, expected)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def write_deploy_log(repo_name: str, lines: list[str]) -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    log_file = LOG_DIR / f"{repo_name}-{stamp}.log"
    log_file.write_text("\n".join(lines), encoding="utf-8")
    logger.info("deploy log written to %s", log_file)
    return log_file


def run(cmd: list[str], cwd: Optional[str] = None, extra_env: Optional[dict] = None) -> tuple[int, str, str]:
    env = {**os.environ, **_env(), **(extra_env or {})}
    proc = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True)
    return proc.returncode, proc.stdout, proc.stderr


def git_pull(repo_path: str) -> tuple[int, list[str]]:
    log: list[str] = [f"[{now_iso()}] git pull --ff-only in {repo_path}"]
    rc, out, err = run(["git", "pull", "--ff-only"], cwd=repo_path)
    log.append(out.rstrip())
    if err:
        log.append(f"stderr: {err.rstrip()}")
    log.append(f"exit code: {rc}")
    return rc, log


def paths_changed(repo_path: str, prefixes: list[str]) -> bool:
    """Check whether the latest pull touched any of the given path prefixes."""
    ranges = ["HEAD@{1}..HEAD", "HEAD~1..HEAD"]
    prefix_filter = "|".join(f"^{p}" for p in prefixes)
    for rng in ranges:
        rc, out, err = run(
            ["bash", "-c", f"git diff --name-only {rng} | grep -qE '{prefix_filter}'"],
            cwd=repo_path,
        )
        if rc == 0:
            return True
        if "HEAD@{1}" in rng and "unknown revision" in (err or ""):
            continue
        break
    return False


def deployd_changed(repo_path: str) -> bool:
    return paths_changed(repo_path, ["services/deployd/"])


def extract_vendor(log: list[str]) -> int:
    log.append(f"[{now_iso()}] extract vendor")
    rc, out, err = run(["bash", f"{SHELL_DIR}/scripts/extract-vendor.sh"])
    log.append(out.rstrip())
    if err:
        log.append(f"stderr: {err.rstrip()}")
    if rc != 0:
        log.append(f"vendor extract failed: {rc}")
    return rc


def build_shell(log: list[str]) -> int:
    log.append(f"[{now_iso()}] build shell")
    ui_dir = f"{SHELL_DIR}/late-web-ui"
    rc, out, err = run(["bash", "-c", "npm run build"], cwd=ui_dir)
    log.append(out.rstrip())
    if err:
        log.append(f"stderr: {err.rstrip()}")
    if rc != 0:
        log.append(f"shell build failed: {rc}")
    return rc


def copy_shell_to_www(log: list[str]) -> int:
    log.append(f"[{now_iso()}] copy dist to /var/www/html")
    ui_dir = f"{SHELL_DIR}/late-web-ui"
    rc, out, err = run(
        ["bash", "-c", "rm -rf /var/www/html/assets /var/www/html/index.html && cp -r dist/. /var/www/html/"],
        cwd=ui_dir,
    )
    log.append(out.rstrip())
    if err:
        log.append(f"stderr: {err.rstrip()}")
    if rc != 0:
        log.append(f"copy failed: {rc}")
    return rc


def reload_nginx(log: list[str]) -> int:
    log.append(f"[{now_iso()}] reload nginx")
    rc, out, err = run(["nginx", "-s", "reload"])
    log.append(out.rstrip())
    if err:
        log.append(f"stderr: {err.rstrip()}")
    if rc != 0:
        log.append(f"nginx reload failed: {rc}")
    return rc


CHAT_SERVICE_RESTART_SCRIPT = os.environ.get(
    "CHAT_SERVICE_RESTART_SCRIPT",
    "/root/late-chat-service/scripts/deploy.sh",
)


def deploy_chat_service(repo_path: str, log: list[str]) -> int:
    log.append(f"[{now_iso()}] running late-chat-service deploy.sh")
    rc, out, err = run(["bash", CHAT_SERVICE_RESTART_SCRIPT])
    log.append(out.rstrip())
    if err:
        log.append(f"stderr: {err.rstrip()}")
    if rc != 0:
        log.append(f"late-chat-service deploy failed: {rc}")
    return rc


def deploy_auth_service(repo_path: str, log: list[str]) -> int:
    # ponytail: late-auth-service is pure Python. The repo on
    # disk is what the venv is bound to, so a git pull picks up
    # the new code on the next uvicorn start. No build, no
    # dependency install. Restart and probe /api/auth/healthz.
    log.append(f"[{now_iso()}] restarting late-auth.service")
    rc, out, err = run(["systemctl", "restart", "late-auth"])
    log.append(out.rstrip())
    if err:
        log.append(f"stderr: {err.rstrip()}")
    if rc != 0:
        log.append(f"late-auth restart failed: {rc}")
        return rc
    log.append(f"[{now_iso()}] healthchecking late-auth /api/auth/healthz")
    rc, out, err = run(
        [
            "bash",
            "-c",
            "for i in {1..30}; do "
            "  curl -fsS http://127.0.0.1:9300/api/auth/healthz >/dev/null && exit 0; "
            "  sleep 1; "
            "done; exit 1",
        ]
    )
    if rc != 0:
        log.append(f"late-auth healthcheck failed: {err.rstrip()}")
    else:
        log.append("late-auth healthcheck passed")
    return rc


def healthcheck_chat_service(log: list[str]) -> int:
    """Verify the late-chat-service /healthz endpoint is reachable."""
    log.append(f"[{now_iso()}] healthchecking late-chat-service /healthz")
    rc, out, err = run(
        [
            "bash",
            "-c",
            "for i in {1..30}; do "
            "  curl -fsS http://127.0.0.1:9100/healthz >/dev/null && exit 0; "
            "  sleep 1; "
            "done; exit 1",
        ]
    )
    if rc != 0:
        log.append(f"late-chat-service healthcheck failed: {err.rstrip()}")
    else:
        log.append("late-chat-service healthcheck passed")
    return rc


def deploy_shell_only(repo_path: str, log: list[str]) -> int:
    # ponytail: late-chat-service owns its own restart and
    # healthcheck. The shell deploy only rebuilds + copies the
    # React bundle and reloads nginx. Pushing chat code to the
    # shell repo used to be a way to bounce the chat; the new
    # shape is: chat lives at kodingvibes/late-chat-service
    # with its own webhook.
    if extract_vendor(log) != 0:
        return 1
    if build_shell(log) != 0:
        return 1
    if copy_shell_to_www(log) != 0:
        return 1
    if reload_nginx(log) != 0:
        return 1

    if deployd_changed(repo_path):
        log.append(f"[{now_iso()}] deployd code changed; scheduling self-restart")
        run(["systemctl", "restart", "late-deployd"])

    return 0


def deploy_micro(micro_name: str, repo_path: str, build_script: str, log: list[str]) -> int:
    log.append(f"[{now_iso()}] build micro {micro_name}")
    rc, out, err = run(["bash", build_script])
    log.append(out.rstrip())
    if err:
        log.append(f"stderr: {err.rstrip()}")
    if rc != 0:
        log.append(f"micro {micro_name} build failed: {rc}")
        return rc

    # Micro is ready; rebuild shell so index.html gets new hashed assets.
    # The shell's vite.config.ts points at /micro/{radio,chat}/latest, which is
    # already updated by the build script above. Rebuilding the shell emits a
    # fresh index.html with new asset hashes, busting browser caches.
    log.append(f"[{now_iso()}] micro {micro_name} ready; rebuilding shell")
    if extract_vendor(log) != 0:
        return 1
    if build_shell(log) != 0:
        return 1
    if copy_shell_to_www(log) != 0:
        return 1
    if reload_nginx(log) != 0:
        return 1

    return 0


def deploy_micro_radio(repo_path: str, log: list[str]) -> int:
    return deploy_micro(
        "radio",
        repo_path,
        "/root/late.kodingvibes.com/scripts/build-micro-radio.sh",
        log,
    )


def deploy_micro_chat(repo_path: str, log: list[str]) -> int:
    return deploy_micro(
        "chat",
        repo_path,
        "/root/late.kodingvibes.com/scripts/build-micro-chat.sh",
        log,
    )


DEPLOYERS = {
    "shell_only": deploy_shell_only,
    "micro_radio": deploy_micro_radio,
    "micro_chat": deploy_micro_chat,
    "chat_service": deploy_chat_service,
    "auth_service": deploy_auth_service,
}


def run_deploy(repo_name: str, config: dict, after: str, delivery: Optional[str]) -> None:
    with LOCKS[repo_name]:
        logger.info("[%s] start deploy for %s @ %s", delivery, repo_name, after)
        rc, log = git_pull(config["path"])
        if rc != 0:
            log.append(f"[{now_iso()}] git pull failed, aborting")
            write_deploy_log(repo_name, log)
            logger.error("[%s] git pull failed for %s", delivery, repo_name)
            return

        # Any operation that touches /var/www/html/ must hold the global lock.
        with WWW_LOCK:
            rc = DEPLOYERS[config["deploy"]](config["path"], log)

        log.append(f"[{now_iso()}] deploy finished with code {rc}")
        write_deploy_log(repo_name, log)
        if rc == 0:
            logger.info("[%s] deploy succeeded for %s", delivery, repo_name)
        else:
            logger.error("[%s] deploy failed for %s", delivery, repo_name)


# ---------------------------------------------------------------------------
# HTTP handlers
# ---------------------------------------------------------------------------
@APP.get("/health")
async def health() -> dict:
    return {"ok": True, "time": now_iso(), "repos": list(REPOS.keys())}


@APP.get("/logs")
async def logs(limit: int = 10) -> list:
    files = sorted(LOG_DIR.glob("*.log"), key=lambda p: p.stat().st_mtime, reverse=True)[:limit]
    return [
        {
            "name": f.name,
            "mtime": datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc).isoformat(),
            "size": f.stat().st_size,
        }
        for f in files
    ]


@APP.post("/deploy-webhook")
async def deploy_webhook(
    request: Request,
    background: bool = True,
    x_hub_signature_256: Optional[str] = Header(default=None),
    x_github_event: Optional[str] = Header(default=None),
    x_github_delivery: Optional[str] = Header(default=None),
) -> dict:
    body = await request.body()

    if not verify_signature(body, x_hub_signature_256):
        logger.warning("invalid or missing signature; delivery=%s", x_github_delivery)
        raise HTTPException(status_code=401, detail="invalid signature")

    if x_github_event != "push":
        logger.info("ignored event: %s", x_github_event)
        return {"ok": True, "ignored": True, "event": x_github_event}

    payload = json.loads(body.decode("utf-8"))
    repo_full = payload.get("repository", {}).get("full_name", "")
    ref = payload.get("ref", "")
    after = payload.get("after", "")[:12]

    repo_name = repo_full.split("/")[-1]
    config = REPOS.get(repo_name)
    if not config:
        logger.info("repo not managed: %s", repo_full)
        return {"ok": True, "ignored": True, "repo": repo_full}

    expected_ref = f"refs/heads/{config['branch']}"
    if ref != expected_ref:
        logger.info("ignored ref for %s: %s", repo_name, ref)
        return {"ok": True, "ignored": True, "ref": ref}

    logger.info("accepted deploy %s @ %s (%s)", repo_name, after, x_github_delivery)

    thread = threading.Thread(
        target=run_deploy,
        args=(repo_name, config, after, x_github_delivery),
        daemon=True,
    )
    thread.start()

    return {
        "ok": True,
        "accepted": True,
        "repo": repo_name,
        "ref": ref,
        "after": after,
    }
