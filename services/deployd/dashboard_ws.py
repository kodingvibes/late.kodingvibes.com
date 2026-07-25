"""
WS + REST endpoints for the /dashboard microfrontend.

Public surface:
- GET  /api/dashboard/state          — full snapshot (same shape as snapshot())
- GET  /api/dashboard/history        — time-range samples for one metric
- WS   /api/dashboard/ws              — push of {state, history} every
                                         BROADCAST_INTERVAL_S, with a one-shot
                                         backfill of the 1h range on connect.

Auth: every endpoint validates the session against
late-auth and requires global_role == 'super_admin'. The
WS upgrade carries the bearer as a `?token=` query
parameter because browsers can't set custom headers on
WebSocket requests.
"""
from __future__ import annotations

import asyncio
import json
import time
from typing import Any

from fastapi import HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

import dashboard_history
import dashboard_state


# ---------------------------------------------------------------------------
# REST: snapshot
# ---------------------------------------------------------------------------
async def _auth_or_redirect(request: Request):
    """Same helper as dashboard_state, scoped to the request."""
    return await dashboard_state.require_super_admin_response(request)


async def api_dashboard_state(request: Request) -> JSONResponse:
    await _auth_or_redirect(request)
    snap = await dashboard_state.snapshot()
    return JSONResponse(snap)


# ---------------------------------------------------------------------------
# REST: history
# ---------------------------------------------------------------------------
async def api_dashboard_history(
    request: Request,
    metric: str = Query("cpu"),
    range: str = Query("1h"),
) -> JSONResponse:
    await _auth_or_redirect(request)
    range_seconds = dashboard_history.RANGES.get(range)
    if range_seconds is None:
        raise HTTPException(400, f"unknown range: {range}")
    if metric not in ("cpu", "memory", "swap", "listeners", "latency_ms", "load_1m"):
        raise HTTPException(400, f"unknown metric: {metric}")
    return JSONResponse({
        "metric": metric,
        "range": range,
        "range_seconds": range_seconds,
        "samples": dashboard_state.history(metric, range_seconds),
        "fetched_at": time.time(),
    })


# ---------------------------------------------------------------------------
# WS: live feed
# ---------------------------------------------------------------------------
class _Hub:
    """Tracks active WS clients; the broadcast loop pushes to all."""

    def __init__(self) -> None:
        self.clients: set[WebSocket] = set()
        self.last_broadcast: float = 0.0
        self.lock = asyncio.Lock()

    async def add(self, ws: WebSocket) -> None:
        async with self.lock:
            self.clients.add(ws)

    async def remove(self, ws: WebSocket) -> None:
        async with self.lock:
            self.clients.discard(ws)

    async def broadcast(self, payload: dict) -> None:
        # Send-and-prune: any client whose send raises gets
        # dropped, so a dead tab can't keep the loop slow.
        async with self.lock:
            stale: list[WebSocket] = []
            for ws in list(self.clients):
                try:
                    await ws.send_json(payload)
                except Exception:
                    stale.append(ws)
            for ws in stale:
                self.clients.discard(ws)


HUB = _Hub()


async def _broadcast_loop() -> None:
    """Background task: snapshot every BROADCAST_INTERVAL_S,
    push to every connected WS client. Appends to history
    as a side-effect (snapshot() does that)."""
    while True:
        try:
            snap = await dashboard_state.snapshot()
            payload = {
                "type": "state",
                "t": time.time(),
                "state": snap,
                # ponytail: send a small history backfill on
                # every tick so the chart can render without
                # an extra /api/dashboard/history call on
                # connect. 1h covers the default range. A
                # user who picks 7d or 30d issues an extra
                # history fetch.
                "history": {
                    "1h": {
                        "cpu": dashboard_state.history("cpu", 3600),
                        "memory": dashboard_state.history("memory", 3600),
                        "swap": dashboard_state.history("swap", 3600),
                        "listeners": dashboard_state.history("listeners", 3600),
                        "latency_ms": dashboard_state.history("latency_ms", 3600),
                        "load_1m": dashboard_state.history("load_1m", 3600),
                    },
                },
            }
            HUB.last_broadcast = time.time()
            await HUB.broadcast(payload)
        except asyncio.CancelledError:
            return
        except Exception:
            # ponytail: never let a single bad tick kill
            # the loop. Sleep and continue.
            pass
        await asyncio.sleep(dashboard_state.BROADCAST_INTERVAL_S)


_BROADCAST_TASK: asyncio.Task | None = None


async def api_dashboard_ws(websocket: WebSocket, token: str = Query("")) -> None:
    """Authenticated WebSocket feed.

    Browsers can't set Authorization on a WebSocket, so the
    bearer comes in as `?token=`. The endpoint opens the WS,
    then validates synchronously, then drops the connection
    if the bearer is bad.
    """
    if not token or not dashboard_state.LATE_AUTH_SECRET:
        await websocket.close(code=4401)
        return
    import httpx
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(
                f"{dashboard_state.LATE_AUTH_URL}/api/auth/validate",
                headers={
                    "Authorization": f"Bearer {dashboard_state.LATE_AUTH_SECRET}",
                    "X-Session-Id": token,
                },
            )
    except Exception:
        await websocket.close(code=4403)
        return
    if r.status_code != 200:
        await websocket.close(code=4401)
        return
    body = r.json()
    user = body.get("user", body) if isinstance(body, dict) else body
    if user.get("global_role") != "super_admin":
        await websocket.close(code=4403)
        return

    await websocket.accept()
    await HUB.add(websocket)
    try:
        # Keep the connection alive. We don't expect any
        # inbound messages; if the client sends one, treat
        # it as a ping and ignore.
        while True:
            try:
                msg = await asyncio.wait_for(websocket.receive_text(), timeout=60)
                if msg == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                # No inbound for 60s. Send a keepalive so
                # intermediate proxies don't close us.
                try:
                    await websocket.send_text("ping")
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    finally:
        await HUB.remove(websocket)


# ---------------------------------------------------------------------------
# Mount
# ---------------------------------------------------------------------------
def register(app) -> None:
    global _BROADCAST_TASK
    app.add_api_route("/api/dashboard/state", api_dashboard_state, methods=["GET"])
    app.add_api_route("/api/dashboard/history", api_dashboard_history, methods=["GET"])
    app.add_api_websocket_route("/api/dashboard/ws", api_dashboard_ws)

    @app.on_event("startup")
    async def _start_broadcast() -> None:
        global _BROADCAST_TASK
        if _BROADCAST_TASK is None or _BROADCAST_TASK.done():
            _BROADCAST_TASK = asyncio.create_task(_broadcast_loop())

    @app.on_event("shutdown")
    async def _stop_broadcast() -> None:
        global _BROADCAST_TASK
        if _BROADCAST_TASK and not _BROADCAST_TASK.done():
            _BROADCAST_TASK.cancel()
            try:
                await _BROADCAST_TASK
            except (asyncio.CancelledError, Exception):
                pass
