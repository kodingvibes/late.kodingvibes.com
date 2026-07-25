#!/usr/bin/env python3
"""Drop chat-bridge's `users` and `sessions` tables.

The actual identity is in late-auth-service. This script rebuilds
every chat-side table that referenced `users` (channels,
channel_members, messages, reactions, attachments, voice_notes,
message_delivered, message_reads, notes) without the FK, copies
the rows, and drops `users` and `sessions` (which now have no
inbound FKs).

The whole thing runs in a single transaction; on failure the DB is
restored from the automatic backup that lives next to the chat.db.

Usage:
  python3 scripts/drop-users-and-sessions.py /data/chat-bridge/chat.db
"""
from __future__ import annotations

import argparse
import os
import shutil
import sqlite3
import sys
import time
from typing import Iterable


# ponytail: every chat-side table that had FOREIGN KEY ... REFERENCES users.
# (voice_notes joins via the same FK chain so it's part of the same wave.)
TABLES_REFERRING_USERS = (
    "channels",
    "channel_members",
    "messages",
    "reactions",
    "attachments",
    "message_delivered",
    "message_reads",
    "voice_notes",
    "notes",
)


def list_columns(conn: sqlite3.Connection, table: str) -> list[tuple]:
    """Return PRAGMA table_info rows: (cid, name, type, notnull, dflt, pk)."""
    return list(conn.execute(f"PRAGMA table_info({table})"))


def list_indexes(conn: sqlite3.Connection, table: str) -> list[tuple]:
    """Return (name, unique, [cols]) for indexes on the table."""
    rows = conn.execute(f"PRAGMA index_list({table})").fetchall()
    out = []
    for r in rows:
        name = r[1]
        if name.startswith("sqlite_autoindex_"):
            continue
        src = conn.execute(f"PRAGMA index_info({name})").fetchall()
        cols = [c[2] for c in src]
        out.append((name, bool(r[2]), cols))
    return out


def create_index_ddl(table: str, name: str, unique: bool, cols: Iterable[str]) -> str:
    quoted_cols = ", ".join(f'"{c}"' for c in cols)
    quoted_name = f'"{name}"'
    quoted_table = f'"{table}"'
    kw = "UNIQUE INDEX" if unique else "INDEX"
    return f"CREATE {kw} {quoted_name} ON {quoted_table} ({quoted_cols})"


def recreate_table_without_users_fk(conn: sqlite3.Connection, table: str) -> None:
    raw_cols = list_columns(conn, table)
    keep_cols = [r for r in raw_cols if "REFERENCES users" not in (r[2] or "").upper()]
    pk_rows = sorted([r for r in keep_cols if r[5]], key=lambda r: r[5])
    pk_cols = [r[1] for r in pk_rows]

    if not keep_cols:
        print(f"  {table}: nothing to keep, dropping directly")
        conn.execute(f'DROP TABLE "{table}"')
        return

    # ponytail: the chat-bridge schema only used AUTOINCREMENT on
    # single-column INTEGER primary keys. PRAGMA table_info doesn't
    # tell us whether the original column had the keyword, so we
    # infer it here: a single-column PK whose original type is
    # INTEGER (and not on a table that already had a composite PK
    # before) was almost certainly AUTOINCREMENT. Composite PKs
    # (channel_members, reactions, etc.) never had it, and TEXT PKs
    # (attachments, voice_notes) never had it either.
    single_pk_autoinc = len(pk_cols) == 1 and bool(pk_rows) and (pk_rows[0][2] or "").upper().startswith("INTEGER")

    col_defs = []
    col_names = []
    for _cid, name, ctype, notnull, dflt, pk in keep_cols:
        if pk and single_pk_autoinc:
            col_defs.append(f'"{name}" INTEGER PRIMARY KEY AUTOINCREMENT')
        else:
            parts = [f'"{name}"', ctype or ""]
            if notnull:
                parts.append("NOT NULL")
            if dflt is not None:
                parts.append(f"DEFAULT {dflt}")
            col_defs.append(" ".join(parts))
        col_names.append(f'"{name}"')

    if pk_cols and not single_pk_autoinc:
        pk_clause = f"PRIMARY KEY ({', '.join(f'\"{c}\"' for c in pk_cols)})"
    else:
        pk_clause = None

    rename = f"{table}__pre_drop_users"
    conn.execute(f'ALTER TABLE "{table}" RENAME TO "{rename}"')

    body = ",\n  ".join(col_defs)
    if pk_clause:
        body = f"{body},\n  {pk_clause}" if body else pk_clause
    ddl = f'CREATE TABLE "{table}" (\n  {body}\n)'
    conn.execute(ddl)

    cols_csv = ", ".join(col_names)
    conn.execute(f'INSERT INTO "{table}" ({cols_csv}) SELECT {cols_csv} FROM "{rename}"')
    print(f"  {table}: {len(col_names)} columns, copied rows")
    conn.execute(f'DROP TABLE "{rename}"')

    for name, unique, idx_cols in list_indexes(conn, table):
        conn.execute(create_index_ddl(table, name, unique, idx_cols))


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("db", help="path to chat.db")
    p.add_argument("--no-backup", action="store_true", help="skip making a backup next to the DB")
    args = p.parse_args()

    db_path = args.db
    if not os.path.exists(db_path):
        print(f"db not found: {db_path}", file=sys.stderr)
        return 1

    backup = db_path + f".pre-drop-users-{int(time.time())}.bak"
    if not args.no_backup:
        shutil.copy2(db_path, backup)
        for ext in ("-wal", "-shm"):
            src = db_path + ext
            if os.path.exists(src):
                shutil.copy2(src, backup + ext)
        print(f"backup: {backup}")

    conn = sqlite3.connect(db_path)
    try:
        conn.execute("PRAGMA foreign_keys=OFF")
        cur_tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if "users" not in cur_tables and "sessions" not in cur_tables:
            print("nothing to do; users and sessions are already gone")
            return 0

        for t in TABLES_REFERRING_USERS:
            if t in cur_tables:
                print(f"recreating {t} without FK to users")
                recreate_table_without_users_fk(conn, t)
            else:
                print(f"  {t}: not present, skipping")

        for t in ("users", "sessions"):
            if t in cur_tables:
                conn.execute(f'DROP TABLE "{t}"')
                print(f"dropped {t}")

        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f"migration failed: {e}", file=sys.stderr)
        if not args.no_backup:
            print("restoring from backup", file=sys.stderr)
            shutil.copy2(backup, db_path)
            for ext in ("-wal", "-shm"):
                src = backup + ext
                if os.path.exists(src):
                    shutil.copy2(src, db_path + ext)
        return 1
    finally:
        conn.close()

    conn = sqlite3.connect(db_path)
    try:
        cur = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if "users" in cur or "sessions" in cur:
            print("post-migration: users or sessions still present!", file=sys.stderr)
            return 1
        for t in TABLES_REFERRING_USERS:
            if t in cur:
                n = conn.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
                print(f"  {t}: {n} rows")
        print("migration done")
    finally:
        conn.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
