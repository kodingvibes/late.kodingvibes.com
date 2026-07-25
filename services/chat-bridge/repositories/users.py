import time
from core.db import db

# ponytail: the full column set of the users table. Single source of
# truth so the explicit SELECTs below stay in sync with migrations
# (global_role was added later, display_name + last_seen are the
# original create columns, etc.).
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
                "INSERT INTO users (supabase_sub, email, name, display_name, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)",
                (sub, email, name, display, now, now),
            )
            user_id = conn.execute("SELECT id FROM users WHERE supabase_sub = ?", (sub,)).fetchone()["id"]
        else:
            user_id = user["id"]
            conn.execute("UPDATE users SET last_seen = ? WHERE id = ?", (now, user_id))
        # ponytail: every user belongs to every channel. Joining only the
        # seeded ones left new channels invisible until the startup
        # cross-join ran, which the user could see if the service had
        # been up a while. The cross-join runs here too so a brand-new
        # user shows up in every existing channel the moment their
        # session is created, no matter when the service last restarted.
        # Single INSERT…SELECT instead of N round-trips.
        conn.execute(
            "INSERT OR IGNORE INTO channel_members (channel_id, user_id, joined_at) "
            "SELECT c.id, ?, ? FROM channels c",
            (user_id, now),
        )
        user = conn.execute(
            f"SELECT {_USER_COLUMNS} FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    return dict(user)


def get_user_by_id(user_id: int) -> dict | None:
    with db() as conn:
        row = conn.execute("SELECT id, email, name, display_name FROM users WHERE id = ?", (user_id,)).fetchone()
    return dict(row) if row else None


def update_user(user_id: int, updates: dict) -> dict | None:
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
            conn.execute(f"UPDATE users SET {', '.join(set_clauses)}, last_seen = ? WHERE id = ?", params)
        user = conn.execute("SELECT id, email, name, display_name FROM users WHERE id = ?", (user_id,)).fetchone()
    return dict(user) if user else None


def search_users(q: str) -> list[dict]:
    like = f"%{q.lower()}%"
    with db() as conn:
        rows = conn.execute(
            "SELECT id, display_name, email FROM users "
            "WHERE display_name LIKE ? OR email LIKE ? ORDER BY display_name LIMIT 10",
            (like, like),
        ).fetchall()
    return [dict(r) for r in rows]


def touch_last_seen(user_id: int):
    with db() as conn:
        conn.execute("UPDATE users SET last_seen = ? WHERE id = ?", (int(time.time()), user_id))
