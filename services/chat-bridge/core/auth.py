import secrets
import re
import time
from fastapi import Header, HTTPException
from core.db import db

async def get_session_user(authorization: str = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization[7:]
    with db() as conn:
        session = conn.execute(
            "SELECT s.id, s.user_id, s.expires_at, u.supabase_sub, u.email, u.display_name, u.global_role "
            "FROM sessions s JOIN users u ON u.id = s.user_id "
            "WHERE s.id = ? AND s.expires_at > ?",
            (token, int(time.time())),
        ).fetchone()
        if not session:
            raise HTTPException(401, "Invalid or expired session")
        conn.execute("UPDATE users SET last_seen = ? WHERE id = ?", (int(time.time()), session["user_id"]))
    return dict(session)

def generate_session_id() -> str:
    return secrets.token_urlsafe(32)

def display_name_from_email(email: str) -> str:
    return email.split("@")[0][:32].lower()

def is_member(conn, channel_id: int, user_id: int) -> bool:
    # ponytail: every user belongs to every channel. Membership checks
    # collapsed to True so the chat can drop the "not a member" path
    # entirely. Per-channel moderation still lives on the same row
    # (role, muted), so the rest of the auth helpers keep working.
    return True

def is_global_admin(session: dict) -> bool:
    return session.get("global_role") in ("super_admin", "admin")

def require_admin_or_mod(channel_id: int, user_id: int, conn) -> bool:
    row = conn.execute(
        "SELECT role FROM channel_members WHERE channel_id = ? AND user_id = ?",
        (channel_id, user_id),
    ).fetchone()
    return row is not None and row["role"] in ("admin", "mod")

def get_channel_role(channel_id: int, user_id: int) -> str | None:
    with db() as conn:
        row = conn.execute(
            "SELECT role FROM channel_members WHERE channel_id = ? AND user_id = ?",
            (channel_id, user_id),
        ).fetchone()
    return row["role"] if row else None

def validate_display_name(name: str) -> str | None:
    if not re.match(r"^[a-zA-Z0-9_\-\[\]\\`^{}|]{2,32}$", name):
        return "display_name has invalid characters or length"
    return None
