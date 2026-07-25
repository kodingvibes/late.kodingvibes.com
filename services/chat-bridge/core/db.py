import sqlite3
import time
from contextlib import contextmanager
from core.config import SQLITE_PATH

# ponytail: chat-bridge keeps a local users + sessions table. The
# actual source of truth is late-auth-service
# (kodingvibes/late-auth-service), which validates every Bearer
# token. chat-bridge trusts the user_id it gets from late-auth and
# joins against its local cache to render `display_name` and `email`
# on messages. The `users` table here is just a cache, populated
# lazily when a user first interacts with the chat.

def get_db():
    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    _run_migrations(conn)
    return conn


def _run_migrations(conn):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            supabase_sub TEXT UNIQUE NOT NULL,
            email TEXT NOT NULL,
            name TEXT,
            display_name TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            last_seen INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS channels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            is_public INTEGER NOT NULL DEFAULT 1,
            created_by INTEGER,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS channel_members (
            channel_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            joined_at INTEGER NOT NULL,
            last_read_message_id INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (channel_id, user_id),
            FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            is_action INTEGER NOT NULL DEFAULT 0,
            og_data TEXT,
            created_at INTEGER NOT NULL,
            edited_at INTEGER,
            FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, id);
        CREATE TABLE IF NOT EXISTS reactions (
            message_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            emoji TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (message_id, user_id, emoji),
            FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_reactions_message ON reactions(message_id);
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS attachments (
            id TEXT PRIMARY KEY,
            channel_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            kind TEXT NOT NULL,
            filename TEXT NOT NULL,
            mime TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            storage_path TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_attachments_expires ON attachments(expires_at);
        CREATE TABLE IF NOT EXISTS channel_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_id TEXT NOT NULL DEFAULT 'default',
            name TEXT NOT NULL,
            position INTEGER NOT NULL DEFAULT 0,
            is_collapsed INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS link_previews (
            url TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            fetched_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS message_delivered (
            message_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            delivered_at INTEGER NOT NULL,
            PRIMARY KEY (message_id, user_id),
            FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_message_delivered_msg ON message_delivered(message_id);
        CREATE TABLE IF NOT EXISTS message_reads (
            message_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            read_at INTEGER NOT NULL,
            PRIMARY KEY (message_id, user_id),
            FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_message_reads_msg ON message_reads(message_id);
        CREATE TABLE IF NOT EXISTS voice_notes (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            channel_id INTEGER NOT NULL,
            duration_ms INTEGER NOT NULL,
            amount INTEGER NOT NULL DEFAULT 50,
            size_bytes INTEGER NOT NULL,
            storage_path TEXT NOT NULL,
            mime TEXT NOT NULL DEFAULT 'audio/webm',
            created_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
        );
    """)
    _run_idempotent_alter(conn, "channel_members", "role", "TEXT")
    _run_idempotent_alter(conn, "messages", "reply_to", "INTEGER REFERENCES messages(id) ON DELETE SET NULL")
    _run_idempotent_alter(conn, "messages", "hidden", "INTEGER NOT NULL DEFAULT 0")
    _run_idempotent_alter(conn, "channel_members", "muted", "INTEGER NOT NULL DEFAULT 0")
    # ponytail: image dimensions on attachments so the chat
    # client can reserve a placeholder of the exact size before
    # the bytes load. NULL when the file is not an image, when
    # ffprobe can't read the stream, or when the row predates
    # the migration. The client falls back to max-h-72 when the
    # field is missing.
    _run_idempotent_alter(conn, "attachments", "width", "INTEGER")
    _run_idempotent_alter(conn, "attachments", "height", "INTEGER")
    for col, col_type in [
        ("forwarded_from_message_id", "INTEGER REFERENCES messages(id) ON DELETE SET NULL"),
        ("forwarded_from_channel_id", "INTEGER REFERENCES channels(id) ON DELETE SET NULL"),
        ("forwarded_from_user_id", "INTEGER REFERENCES users(id) ON DELETE SET NULL"),
        ("forwarded_from_channel_name", "TEXT"),
        ("forwarded_from_display_name", "TEXT"),
    ]:
        _run_idempotent_alter(conn, "messages", col, col_type)
    _run_idempotent_alter(conn, "channels", "channel_type", "TEXT NOT NULL DEFAULT 'text'")
    _run_idempotent_alter(conn, "channels", "category_id", "INTEGER REFERENCES channel_categories(id) ON DELETE SET NULL")
    _run_idempotent_alter(conn, "channels", "position", "INTEGER NOT NULL DEFAULT 0")
    _run_idempotent_alter(conn, "users", "global_role", "TEXT NOT NULL DEFAULT 'user'")
    # Ponytail: one-time bootstrap — the original creator of the chat
    # (user_id=1 in every existing DB) becomes super_admin. Safe to run
    # on every startup: only flips the bit when the column was just
    # added and the user is still on the default 'user' value.
    conn.execute("UPDATE users SET global_role = 'super_admin' WHERE id = 1 AND global_role = 'user'")
    conn.execute("UPDATE channel_members SET role = 'admin' WHERE user_id = 1 AND role IS NULL")
    _seed_categories(conn)
    _seed_channels(conn)
    # ponytail: every user belongs to every channel. Run the cross-join
    # once at startup so existing DBs catch up. INSERT OR IGNORE is
    # idempotent — re-runs are no-ops once everyone is in everything.
    # New users / new channels get the same treatment in upsert_user and
    # create_channel so the invariant holds on every write path.
    conn.execute(
        "INSERT OR IGNORE INTO channel_members (channel_id, user_id, joined_at) "
        "SELECT c.id, u.id, ? FROM channels c, users u",
        (int(time.time()),),
    )


def _run_idempotent_alter(conn, table, column, col_type):
    try:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")
    except sqlite3.OperationalError:
        pass


def _seed_categories(conn):
    now = int(time.time())
    for name, pos in [("TEXTO", 0), ("VOZ", 1)]:
        row = conn.execute("SELECT id FROM channel_categories WHERE name = ?", (name,)).fetchone()
        if not row:
            cur = conn.execute("INSERT INTO channel_categories (name, position, created_at) VALUES (?, ?, ?)", (name, pos, now))
            cat_id = cur.lastrowid
        else:
            cat_id = row["id"]
        ch_type = "text" if name == "TEXTO" else "voice"
        conn.execute(
            "UPDATE channels SET category_id = ?, position = id WHERE category_id IS NULL AND (channel_type IS NULL OR channel_type = ?)",
            (cat_id, ch_type),
        )


def _seed_channels(conn):
    now = int(time.time())
    for name, desc, ch_type in [
        ("#lobby", "General chat", "text"),
        ("#random", "Off topic", "text"),
        ("#dev", "Development talk", "text"),
        ("#infra", "Infrastructure", "text"),
    ]:
        conn.execute(
            "INSERT OR IGNORE INTO channels (name, description, is_public, created_at, channel_type) VALUES (?, ?, 1, ?, ?)",
            (name, desc, now, ch_type),
        )
    voice_ch_ids = []
    for name, desc in [("🔊 General", "Voice chat"), ("🔊 Music", "Music & chill")]:
        conn.execute(
            "INSERT OR IGNORE INTO channels (name, description, is_public, created_at, channel_type) VALUES (?, ?, 1, ?, 'voice')",
            (name, desc, now),
        )
        row = conn.execute("SELECT id FROM channels WHERE name = ?", (name,)).fetchone()
        if row:
            voice_ch_ids.append(row["id"])
    for vch_id in voice_ch_ids:
        all_users = conn.execute("SELECT id FROM users").fetchall()
        for u in all_users:
            conn.execute(
                "INSERT OR IGNORE INTO channel_members (channel_id, user_id, joined_at) VALUES (?, ?, ?)",
                (vch_id, u["id"], now),
            )
    conn.commit()


@contextmanager
def db():
    conn = get_db()
    try:
        yield conn
        conn.commit()
    except:
        conn.rollback()
        raise
    finally:
        conn.close()
