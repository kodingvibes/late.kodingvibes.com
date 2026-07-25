import time
from core.db import db
from services.broadcaster import ws_manager


def list_channels(user_id: int) -> list[dict]:
    with db() as conn:
        conn.execute("UPDATE users SET last_seen = ? WHERE id = ?", (int(time.time()), user_id))
        # Ponytail: every user belongs to every channel. The previous
        # version filtered by membership OR is_public, which left users
        # unable to see channels they hadn't been invited to and, when
        # the frontend auto-selected one, getting 403 on /messages. Now
        # we return every channel as joined=True.
        # Global super_admin / admin still get admin on every channel.
        # Column list spelled out: SELECT c.* would silently widen
        # whenever a migration adds a column, which has burned this
        # codebase before (last_message_*, channel_type, position...).
        # Explicit columns force this query to keep up with the schema
        # on purpose, not by accident.
        global_admin = conn.execute(
            "SELECT 1 AS is_global_admin FROM users WHERE id = ? AND global_role IN ('super_admin', 'admin')",
            (user_id,),
        ).fetchone()
        rows = conn.execute("""
            SELECT c.id, c.name, c.description, c.is_public, c.created_by, c.created_at,
                   c.channel_type, c.category_id, c.position,
                (SELECT COUNT(*) FROM channel_members WHERE channel_id = c.id) AS member_count,
                (SELECT id FROM messages WHERE channel_id = c.id ORDER BY id DESC LIMIT 1) AS last_message_id,
                (SELECT content FROM messages WHERE channel_id = c.id ORDER BY id DESC LIMIT 1) AS last_message_content,
                (SELECT created_at FROM messages WHERE channel_id = c.id ORDER BY id DESC LIMIT 1) AS last_message_at
            FROM channels c
            ORDER BY c.name
        """).fetchall()
        channels = []
        for r in rows:
            member_uids = [
                m["user_id"] for m in conn.execute(
                    "SELECT user_id FROM channel_members WHERE channel_id = ?", (r["id"],)
                ).fetchall()
            ]
            active_count = sum(1 for uid in member_uids if ws_manager.is_online(uid))
            read_id = conn.execute(
                "SELECT last_read_message_id FROM channel_members WHERE channel_id = ? AND user_id = ?",
                (r["id"], user_id),
            ).fetchone()
            read_id = read_id["last_read_message_id"] if read_id else 0
            unread = 0
            if r["last_message_id"] and r["last_message_id"] > read_id:
                unread = conn.execute(
                    "SELECT COUNT(*) AS c FROM messages WHERE channel_id = ? AND id > ?",
                    (r["id"], read_id),
                ).fetchone()["c"]
            my_role_row = conn.execute(
                "SELECT role FROM channel_members WHERE channel_id = ? AND user_id = ?",
                (r["id"], user_id),
            ).fetchone()
            ch_type = dict(r).get("channel_type", "text")
            channels.append({
                "id": r["id"],
                "name": r["name"],
                "description": r["description"],
                "is_public": bool(r["is_public"]),
                "channel_type": ch_type,
                "category_id": r["category_id"],
                "position": r["position"],
                "member_count": r["member_count"],
                "active_count": active_count,
                "voice_participants": 0,
                "unread": unread,
                # Global admins see admin on every channel, even ones
                # where their per-channel role (if any) is just 'user'.
                "my_role": "admin" if global_admin else (my_role_row["role"] if my_role_row else None),
                "last_message": {
                    "id": r["last_message_id"],
                    "content": r["last_message_content"],
                    "created_at": r["last_message_at"],
                } if r["last_message_id"] else None,
                "joined": True,
            })
    return channels


def get_channel(channel_id: int) -> dict | None:
    with db() as conn:
        # ponytail: explicit columns. Migrations have added channel_type,
        # category_id, position after the original CREATE TABLE; SELECT *
        # silently widens on every migration and tends to leak internal
        # bookkeeping (created_by) into API responses.
        row = conn.execute(
            "SELECT id, name, description, is_public, created_by, created_at, "
            "channel_type, category_id, position "
            "FROM channels WHERE id = ?",
            (channel_id,),
        ).fetchone()
    return dict(row) if row else None


def create_channel(name: str, description: str | None, is_public: bool, created_by: int, channel_type: str = "text") -> dict:
    with db() as conn:
        now = int(time.time())
        cur = conn.execute(
            "INSERT INTO channels (name, description, is_public, created_by, created_at, channel_type) VALUES (?, ?, ?, ?, ?, ?)",
            (name, description, 1 if is_public else 0, created_by, now, channel_type),
        )
        channel_id = cur.lastrowid
        # ponytail: every user belongs to every channel. The creator
        # gets admin on this one (still the only way to mint admin
        # roles); everyone else gets a plain row so they can read
        # and write immediately without a join step.
        all_users = conn.execute("SELECT id FROM users").fetchall()
        for u in all_users:
            role = "admin" if u["id"] == created_by else None
            conn.execute(
                "INSERT OR IGNORE INTO channel_members (channel_id, user_id, joined_at, role) VALUES (?, ?, ?, ?)",
                (channel_id, u["id"], now, role),
            )
    return {"id": channel_id, "name": name}


def update_channel(channel_id: int, patch: dict):
    with db() as conn:
        updates = []
        params = []
        if "category_id" in patch:
            updates.append("category_id = ?")
            params.append(patch["category_id"])
        if "position" in patch:
            updates.append("position = ?")
            params.append(patch["position"])
        if updates:
            params.append(channel_id)
            conn.execute(f"UPDATE channels SET {', '.join(updates)} WHERE id = ?", params)


# ponytail: join/leave used to toggle membership. Now that every
# user is in every channel they're no-ops kept for backwards
# compatibility with the frontend (the UI hides the buttons, but
# an old bundle or a stray call still gets a 200 instead of a 404).
def join_channel(channel_id: int, user_id: int):
    with db() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO channel_members (channel_id, user_id, joined_at) VALUES (?, ?, ?)",
            (channel_id, user_id, int(time.time())),
        )


def leave_channel(channel_id: int, user_id: int):
    # Intentionally does nothing: leaving a channel is not a thing
    # anymore. Callers that used to rely on the row disappearing
    # (mutes, unread counts) still work because the row stays.
    return None


# ponytail: every user belongs to every channel, so the membership
# check is always true. The function is kept as a back-compat shim
# for the few routers that still import it.
def is_member(channel_id: int, user_id: int) -> bool:
    return True
