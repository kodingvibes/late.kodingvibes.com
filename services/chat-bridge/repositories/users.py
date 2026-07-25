"""Local users mirror for chat-bridge.

The actual identity lives in late-auth-service. chat-bridge keeps a
local cache here so message and @mention queries can JOIN against
it without a network round-trip per row. Rows are populated lazily
when a session first interacts with the chat (see
`core/auth.py::get_session_user` — that path inserts a mirror row
the first time a Bearer token is validated).

Direct callers in this repo: tests (to seed fixtures) and the
seed paths in `core/db.py`. The chat API itself no longer mutates
this table; updates flow in through late-auth and would require a
fan-out channel (out of scope today — the cache is best-effort and
self-heals on the next session validation).
"""
import time
from typing import List, Optional

from core.db import db

# ponytail: single source of truth for SELECT column lists. Keep in
# sync with _run_migrations() in core/db.py.
_USER_COLUMNS = (
    "id, supabase_sub, email, name, display_name, "
    "created_at, last_seen, global_role"
)


def upsert_user(sub: str, email: str, name: str) -> dict:
    with db() as conn:
        now = int(time.time())
        user = conn.execute(
            f"SELECT {_USER_COLUMNS} FROM users WHERE supabase_sub = ?",
            (sub,),
        ).fetchone()
        if not user:
            from core.auth import display_name_from_email
            display = display_name_from_email(email) or f"user{sub[:8]}"
            for i in range(10):
                existing = conn.execute(
                    "SELECT 1 FROM users WHERE display_name = ? COLLATE NOCASE",
                    (display,),
                ).fetchone()
                if not existing:
                    break
                display = f"{display_name_from_email(email)}{i+1}"[:32]
            conn.execute(
                "INSERT INTO users (supabase_sub, email, name, display_name, created_at, last_seen) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (sub, email, name, display, now, now),
            )
            user_id = conn.execute(
                "SELECT id FROM users WHERE supabase_sub = ?", (sub,)
            ).fetchone()["id"]
        else:
            user_id = user["id"]
            conn.execute("UPDATE users SET last_seen = ? WHERE id = ?", (now, user_id))
        user = conn.execute(
            f"SELECT {_USER_COLUMNS} FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    return dict(user)


def get_user_by_id(user_id: int) -> Optional[dict]:
    with db() as conn:
        row = conn.execute(
            f"SELECT {_USER_COLUMNS} FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    return dict(row) if row else None


def update_user(user_id: int, updates: dict) -> Optional[dict]:
    with db() as conn:
        now = int(time.time())
        set_clauses = []
        params = []
        if "display_name" in updates:
            set_clauses.append("display_name = ?")
            params.append(updates["display_name"])
        if "name" in updates:
            set_clauses.append("name = ?")
            params.append(updates["name"])
        if set_clauses:
            params.append(now)
            params.append(user_id)
            conn.execute(
                f"UPDATE users SET {', '.join(set_clauses)}, last_seen = ? WHERE id = ?",
                params,
            )
        user = conn.execute(
            f"SELECT {_USER_COLUMNS} FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    return dict(user) if user else None


def search_users(q: str, limit: int = 10) -> List[dict]:
    like = f"%{q.lower()}%"
    with db() as conn:
        rows = conn.execute(
            "SELECT id, display_name, email FROM users "
            "WHERE display_name LIKE ? OR email LIKE ? ORDER BY display_name LIMIT ?",
            (like, like, limit),
        ).fetchall()
    return [dict(r) for r in rows]


def touch_last_seen(user_id: int) -> None:
    with db() as conn:
        conn.execute(
            "UPDATE users SET last_seen = ? WHERE id = ?",
            (int(time.time()), user_id),
        )
