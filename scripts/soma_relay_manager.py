#!/usr/bin/env python3
"""Monitor Icecast listeners and start/stop ffmpeg relays on demand.

- If a mount has 0 listeners and its ffmpeg is running → kill it.
- If a mount has >0 listeners and its ffmpeg is NOT running → start it.
- Uses -c copy (no re-encode) for minimal CPU.
"""
import asyncio
import json
import logging
import os
import signal
import subprocess
import time
import urllib.request

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("relay-manager")

ICECAST_STATUS = "http://127.0.0.1:8000/status-json.xsl"
RELAY_SCRIPT = os.path.join(os.path.dirname(__file__), "soma_relay_one.sh")
POLL_INTERVAL = 30
GRACE_PERIOD = 60  # keep relay alive this long after last listener leaves

MOUNTS = [
    "groovesalad", "dronezone", "fluid", "indiepop", "u80s",
    "vaporwaves", "metal", "dubstep", "7soul", "beatblender",
    "bootliquor", "doomed", "illstreet", "lush", "poptron",
    "secretagent", "suburbsofgoa", "thetrip",
]


def get_listeners() -> dict[str, int]:
    try:
        resp = urllib.request.urlopen(ICECAST_STATUS, timeout=5)
        data = json.loads(resp.read())
        sources = data.get("icestats", {}).get("source", [])
        if not isinstance(sources, list):
            sources = [sources]
        result = {}
        for s in sources:
            mount = s.get("listenurl", "").rsplit("/", 1)[-1]
            result[mount] = int(s.get("listeners", 0))
        return result
    except Exception as e:
        log.warning("status fetch failed: %s", e)
        return {}


def find_ffmpeg_pid(mount: str) -> int | None:
    try:
        out = subprocess.check_output(
            ["pgrep", "-f", f"ffmpeg.*{mount}"], timeout=3, text=True
        ).strip()
        return int(out.split("\n")[0]) if out else None
    except (subprocess.CalledProcessError, ValueError):
        return None


def start_relay(mount: str):
    log.info("starting relay for %s", mount)
    subprocess.Popen(
        ["setsid", "bash", RELAY_SCRIPT, mount, mount],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )


def stop_relay(mount: str):
    pid = find_ffmpeg_pid(mount)
    if pid:
        log.info("stopping relay for %s (pid %d)", mount, pid)
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass


async def main():
    # last time each mount had >0 listeners
    last_active: dict[str, float] = {}
    for m in MOUNTS:
        last_active[m] = time.time()

    while True:
        listeners = get_listeners()
        now = time.time()

        for mount in MOUNTS:
            lc = listeners.get(mount, 0)
            running = find_ffmpeg_pid(mount) is not None

            if lc > 0:
                last_active[mount] = now
                if not running:
                    start_relay(mount)
            else:
                # no listeners
                if running and (now - last_active[mount] > GRACE_PERIOD):
                    stop_relay(mount)

        await asyncio.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    asyncio.run(main())
