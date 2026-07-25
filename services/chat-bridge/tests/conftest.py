import os
import sys
import json
import time
import sqlite3
import pytest
import respx
import jwt
import httpx
from pathlib import Path
from httpx import AsyncClient, ASGITransport

os.environ["SSO_BRIDGE_SECRET"] = "test-secret-key-for-testing"
os.environ["SQLITE_PATH"] = ":memory:"
os.environ["KV_WEBHOOK_URL"] = ""
os.environ["KV_WEBHOOK_SECRET"] = ""
os.environ["SHARED_INTERNAL_SECRET"] = "test-secret-key-for-testing"
os.environ["ATTACHMENT_DIR"] = "/tmp/late-test-attachments"
os.environ["MAX_ATTACHMENT_BYTES"] = str(5 * 1024 * 1024)
os.environ["ATTACHMENT_TTL_DAYS"] = "7"
os.environ["MAX_VOICE_NOTE_BYTES"] = str(10 * 1024 * 1024)

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.config import SSO_SECRET
from core.db import db, get_db
from app import app


@pytest.fixture(autouse=True)
def tmp_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    db_path = str(tmp_path / "test.db")
    monkeypatch.setenv("SQLITE_PATH", db_path)
    monkeypatch.setenv("ATTACHMENT_DIR", str(tmp_path / "attachments"))
    os.makedirs(str(tmp_path / "attachments"), exist_ok=True)
    from core import config
    monkeypatch.setattr(config, "SQLITE_PATH", db_path)
    monkeypatch.setattr(config, "ATTACHMENT_DIR", str(tmp_path / "attachments"))
    import core.db as db_module
    monkeypatch.setattr(db_module, "SQLITE_PATH", db_path)
    with get_db() as conn:
        from notes_store import init_table
        init_table(conn)
    yield
    for p in Path(tmp_path / "attachments").iterdir():
        p.unlink(missing_ok=True)


@pytest.fixture
async def client() -> AsyncClient:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def consume_admin_slot(tmp_db):
    """Create a dummy user first so user_id=1 gets admin from migration.
    Subsequent users (id>=2) will NOT have admin role by default."""
    from repositories.users import upsert_user
    upsert_user("__admin_consumer__", "admin-consumer@example.com", "Admin Consumer")


@pytest.fixture(autouse=True)
def mock_late_auth():
    """Mock the call to late-auth /api/auth/validate.

    The mock is dynamic: any session_id is accepted, and the user
    returned comes from a test-managed dict keyed by session_id.
    Tests should call `mock_late_auth.register(session_id, user)` to
    enroll a session, or rely on the auto-register helper from
    `make_session`.
    """
    import respx
    from core.config import LATE_AUTH_URL

    state = {"sessions": {}}

    with respx.mock(assert_all_called=False) as respx_mock:
        def handler(request):
            sid = request.headers.get("X-Session-Id")
            user = state["sessions"].get(sid)
            if not user:
                return httpx.Response(401, json={"detail": "Invalid or expired session"})
            # late-auth returns `id`; chat-bridge reads `user_id` from
            # its session. Mirror the production alias here too.
            return httpx.Response(200, json={
                "valid": True,
                "user": {**user, "user_id": user.get("id")},
            })

        respx_mock.get(f"{LATE_AUTH_URL}/api/auth/validate").mock(side_effect=handler)

        class _Mock:
            def register(self, session_id: str, user: dict):
                state["sessions"][session_id] = user

        yield _Mock()


@pytest.fixture
def make_session(mock_late_auth, tmp_db):
    created = []

    def _make(sub="test-sub", email="test@example.com", name="Test User"):
        from repositories.users import upsert_user
        from core.auth import generate_session_id
        user = upsert_user(sub, email, name)
        session_id = generate_session_id()
        # chat-bridge still keeps a local users mirror so the rest of
        # the code can read display_name without a round-trip. Session
        # validation, however, now goes through late-auth — the mock
        # above returns the user when chat-bridge calls /api/auth/validate.
        mock_late_auth.register(session_id, user)
        created.append(user)
        return session_id, user

    yield _make
    with db() as conn:
        for u in created:
            for tbl in ("voice_notes", "reactions", "messages", "attachments", "channel_members", "sessions"):
                try:
                    conn.execute(f"DELETE FROM {tbl} WHERE user_id = ?", (u["id"],))
                except sqlite3.OperationalError:
                    pass
            conn.execute("DELETE FROM channels WHERE created_by = ?", (u["id"],))
            conn.execute("DELETE FROM users WHERE id = ?", (u["id"],))


@pytest.fixture
def auth_headers(make_session):
    session_id, user = make_session()
    return {"Authorization": f"Bearer {session_id}"}, user


@pytest.fixture
def make_jwt():
    def _make(sub="test-sub", email="test@example.com", name="Test User", **extra):
        payload = {
            "sub": sub,
            "email": email,
            "name": name,
            "aud": "late.sh",
            "iss": "kodingvibes.com",
            "exp": int(time.time()) + 3600,
            "iat": int(time.time()),
            **extra,
        }
        return jwt.encode(payload, SSO_SECRET, algorithm="HS256")

    return _make


@pytest.fixture
def mock_kv_webhook():
    with respx.mock(assert_all_called=False) as respx_mock:
        yield respx_mock


@pytest.fixture
def mock_httpx_og():
    with respx.mock(assert_all_called=False) as respx_mock:
        respx_mock.get("https://example.com").respond(
            status_code=200,
            headers={"content-type": "text/html"},
            content=b"<html><head><title>Test</title><meta property='og:title' content='OG Title'></head></html>",
        )
        respx_mock.get("https://notfound.example.com").respond(status_code=404)
        respx_mock.get("https://binary.example.com").respond(
            status_code=200,
            headers={"content-type": "application/octet-stream"},
            content=b"\x00\x01\x02",
        )
        yield respx_mock


@pytest.fixture(autouse=True)
def mock_subprocess(monkeypatch: pytest.MonkeyPatch):
    import subprocess

    class MockCompletedProcess:
        returncode = 0
        stdout = b""
        stderr = b""

    def mock_run(*args, **kwargs):
        return MockCompletedProcess()

    monkeypatch.setattr(subprocess, "run", mock_run)


@pytest.fixture
def mock_ffmpeg_fail(monkeypatch: pytest.MonkeyPatch):
    import subprocess

    def mock_run(*args, **kwargs):
        raise FileNotFoundError("ffmpeg not found")

    monkeypatch.setattr(subprocess, "run", mock_run)
