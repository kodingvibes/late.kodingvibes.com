import json
import time
import re
from core.db import db
from repositories import receipts as receipts_repo
from repositories.attachments import get_attachments_meta_bulk


# ponytail: single source of truth for the message columns. Migrations
# keep adding forwarded_from_*, reply_to, hidden, etc. Spelling them
# out here means a new column is one place to add (and one place
# review sees), not five. All SELECTs of m.* below use this constant.
_MESSAGE_COLUMNS = (
    "m.id, m.channel_id, m.user_id, m.content, m.is_action, m.og_data, "
    "m.created_at, m.edited_at, m.reply_to, m.hidden, "
    "m.forwarded_from_message_id, m.forwarded_from_channel_id, "
    "m.forwarded_from_user_id, m.forwarded_from_channel_name, "
    "m.forwarded_from_display_name"
)


# ponytail: single source of truth for the attachment marker
# prefixes the chat client uses. Mirrors the parsers in
# late-micro-chat/src/lib/chat/domain/parsers.ts. Keep them in
# lockstep or message → attachment joins go silent.
_ATTACHMENT_MARKERS = (
    "__late_image__:",
    "__late_images__:",
    "__late_audio__:",
    "__late_video__:",
    "__late_document__:",
    "__late_file__:",
    "__late_voicenote__:",
)


def _extract_attachment_id(content: str) -> str | None:
    """Ponytail: return the first attachment id referenced by a
    message's content marker, or None if the message doesn't carry
    one. For `__late_images__` (multi-image gallery) we return
    just the first id — the chat client only needs a single
    placeholder for the bubble, and the client-side parser walks
    the gallery separately. Returning the first id keeps the
    placeholder code path identical for single and multi image
    messages. The remainder of the marker payload (the JSON list)
    is ignored. """
    if not content:
        return None
    idx = content.find("__late_images__:")
    if idx >= 0:
        rest = content[idx + len("__late_images__:"):].strip()
        try:
            ids = json.loads(rest)
        except Exception:
            return None
        if isinstance(ids, list) and ids:
            first = ids[0]
            if isinstance(first, str) and first:
                return first
        return None
    for prefix in _ATTACHMENT_MARKERS:
        idx = content.find(prefix)
        if idx >= 0:
            rest = content[idx + len(prefix):].strip()
            # Stop at the next whitespace or end of string.
            for i, ch in enumerate(rest):
                if ch.isspace():
                    rest = rest[:i]
                    break
            return rest or None
    return None


def _attach_attachment_meta(msgs: list[dict]) -> None:
    """Ponytail: in-place, for each message that references an
    attachment (via its content marker), set `m['attachment']` to
    the attachment's metadata. Messages without an attachment
    marker, with a marker that doesn't resolve, or whose
    attachment is missing/expired, are left as-is (the field stays
    absent). The chat client uses this to pre-allocate a row of
    the exact image size before the bytes load. One bulk query for
    the whole list — no N+1. """
    if not msgs:
        return
    wanted: list[str] = []
    msg_to_id: dict[int, str] = {}
    for m in msgs:
        aid = _extract_attachment_id(m.get("content", ""))
        if not aid:
            continue
        msg_to_id[m["id"]] = aid
        wanted.append(aid)
    if not wanted:
        return
    metas = get_attachments_meta_bulk(wanted)
    now = int(time.time())
    for m in msgs:
        aid = msg_to_id.get(m["id"])
        if not aid:
            continue
        meta = metas.get(aid)
        if not meta:
            continue
        if meta.get("expires_at") and meta["expires_at"] < now:
            continue
        m["attachment"] = {
            "id": meta["id"],
            "kind": meta["kind"],
            "filename": meta["filename"],
            "mime": meta["mime"],
            "size_bytes": meta["size_bytes"],
            "width": meta.get("width"),
            "height": meta.get("height"),
        }


def _attach_receipts(msgs: list[dict]) -> None:
    """In-place: for each message, set `delivered_count`, `read_count`,
    and `member_count` (denominator for "all read"). The sender is
    excluded from the denominator — they never count toward their own
    message's read/delivered tally. """
    if not msgs:
        return
    msg_ids = [m["id"] for m in msgs]
    channel_ids = list({m["channel_id"] for m in msgs})
    counts = receipts_repo.receipt_counts(msg_ids)
    members = receipts_repo.member_count_for_channels(channel_ids)
    for m in msgs:
        c = counts.get(m["id"], {"delivered": 0, "read": 0})
        m["delivered_count"] = c["delivered"]
        m["read_count"] = c["read"]
        # Denominator: total members in the channel minus the sender
        # (whose own message obviously doesn't count toward its own
        # "read by all" tally). min(..., 0) guards channels with one
        # member, where the bubble just shows a single check forever.
        denom = max(0, members.get(m["channel_id"], 0) - 1)
        m["member_count"] = denom


def send_message(channel_id: int, user_id: int, content: str, is_action: bool = False, reply_to: int | None = None) -> dict:
    with db() as conn:
        now = int(time.time())
        reply_to_val = reply_to
        if reply_to_val is not None:
            reply_target = conn.execute(
                "SELECT id FROM messages WHERE id = ? AND channel_id = ?",
                (reply_to_val, channel_id),
            ).fetchone()
            if not reply_target:
                reply_to_val = None
        cur = conn.execute(
            "INSERT INTO messages (channel_id, user_id, content, is_action, created_at, reply_to) VALUES (?, ?, ?, ?, ?, ?)",
            (channel_id, user_id, content, 1 if is_action else 0, now, reply_to_val),
        )
        msg_id = cur.lastrowid
        msg = dict(conn.execute(
            f"SELECT {_MESSAGE_COLUMNS}, u.display_name, u.email "
            "FROM messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?",
            (msg_id,),
        ).fetchone())
        reply_to_content = None
        reply_to_author = None
        reply_to_user_id = None
        if reply_to_val is not None:
            rt = conn.execute(
                "SELECT m.content, u.display_name, u.id FROM messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?",
                (reply_to_val,),
            ).fetchone()
            if rt:
                rt_content = rt["content"]
                if "__late_image__:" in rt_content or "__late_images__:" in rt_content:
                    reply_to_content = rt_content
                else:
                    reply_to_content = rt_content[:200]
                reply_to_author = rt["display_name"]
                reply_to_user_id = rt["id"]
        members = conn.execute(
            "SELECT u.id, u.display_name, u.email FROM channel_members cm JOIN users u ON u.id = cm.user_id WHERE cm.channel_id = ?",
            (channel_id,),
        ).fetchall()
        mentioned_user_ids = []
        mentioned_user_emails = []
        is_mass_mention = False
        content_lower = msg["content"].lower()
        for m in members:
            nick = m["display_name"].lower()
            if re.search(r"(^|\s|@)" + re.escape(nick) + r"(\s|$|[.,!?])", content_lower):
                if m["id"] != msg["user_id"]:
                    mentioned_user_ids.append(m["id"])
                    mentioned_user_emails.append(m["email"])
        MASS_MENTION_PATTERN = re.compile(r"@(todos|all|here|aqui|channel|everyone)\b", re.IGNORECASE)
        if MASS_MENTION_PATTERN.search(content_lower):
            caller_role = conn.execute(
                "SELECT role FROM channel_members WHERE channel_id = ? AND user_id = ?",
                (channel_id, user_id),
            ).fetchone()
            if caller_role and caller_role["role"] in ("admin", "mod"):
                is_mass_mention = True
                is_here = bool(re.search(r"@(here|aqui)\b", content_lower, re.IGNORECASE))
                if is_here:
                    extra = conn.execute(
                        "SELECT u.id, u.email FROM channel_members cm "
                        "JOIN users u ON u.id = cm.user_id "
                        "WHERE cm.channel_id = ? AND u.last_seen > ?",
                        (channel_id, int(time.time()) - 300),
                    ).fetchall()
                else:
                    extra = conn.execute(
                        "SELECT u.id, u.email FROM channel_members cm "
                        "JOIN users u ON u.id = cm.user_id "
                        "WHERE cm.channel_id = ?",
                        (channel_id,),
                    ).fetchall()
                for u in extra:
                    if u["id"] not in mentioned_user_ids and u["id"] != user_id:
                        mentioned_user_ids.append(u["id"])
                        mentioned_user_emails.append(u["email"])
        msg["mentioned_user_ids"] = mentioned_user_ids
        msg["mentioned_user_emails"] = mentioned_user_emails
        msg["is_mass_mention"] = is_mass_mention
        msg["reply_to"] = reply_to_val
        msg["reply_to_content"] = reply_to_content
        msg["reply_to_author"] = reply_to_author
        msg["reply_to_user_id"] = reply_to_user_id
        msg["reactions"] = []
        msg["hidden"] = False
        msg["forwarded_from"] = None
    _attach_attachment_meta([msg])
    _attach_receipts([msg])
    return msg


def list_messages(channel_id: int, before: int | None = None, limit: int = 50) -> list[dict]:
    with db() as conn:
        if before:
            rows = conn.execute(
                f"SELECT {_MESSAGE_COLUMNS}, u.display_name, u.email "
                "FROM messages m JOIN users u ON u.id = m.user_id "
                "WHERE m.channel_id = ? AND m.id < ? ORDER BY m.id DESC LIMIT ?",
                (channel_id, before, min(limit, 100)),
            ).fetchall()
        else:
            rows = conn.execute(
                f"SELECT {_MESSAGE_COLUMNS}, u.display_name, u.email "
                "FROM messages m JOIN users u ON u.id = m.user_id "
                "WHERE m.channel_id = ? ORDER BY m.id DESC LIMIT ?",
                (channel_id, min(limit, 100)),
            ).fetchall()
        msgs = [dict(r) for r in rows]
        msgs.reverse()
        if msgs:
            ids = [m["id"] for m in msgs]
            placeholders = ",".join("?" * len(ids))
            rx_rows = conn.execute(
                f"SELECT message_id, user_id, emoji, created_at FROM reactions "
                f"WHERE message_id IN ({placeholders}) ORDER BY created_at",
                ids,
            ).fetchall()
            reactions_by_msg = {mid: [] for mid in ids}
            for r in rx_rows:
                reactions_by_msg[r["message_id"]].append(dict(r))
            # ponytail: batch the reply_to lookups. Old code did one
            # SELECT per message that had a reply_to, which turned
            # "load 20 messages" into 1 + 20 + N (reactions) queries.
            # The new shape pulls every referenced reply_to at once
            # with a single IN (...) and stitches the result back in
            # Python. Same wall-clock for an empty reply graph,
            # collapses N+1 when it isn't.
            reply_to_ids = {m["reply_to"] for m in msgs if m.get("reply_to")}
            replies_by_id: dict[int, dict] = {}
            if reply_to_ids:
                reply_placeholders = ",".join("?" * len(reply_to_ids))
                reply_rows = conn.execute(
                    f"SELECT m.id, m.content, u.display_name, u.id AS user_id "
                    f"FROM messages m JOIN users u ON u.id = m.user_id "
                    f"WHERE m.id IN ({reply_placeholders})",
                    list(reply_to_ids),
                ).fetchall()
                for r in reply_rows:
                    replies_by_id[r["id"]] = dict(r)
            for m in msgs:
                raw = m.get("og_data")
                if raw:
                    try:
                        m["og_data"] = json.loads(raw)
                    except Exception:
                        m["og_data"] = None
                m["reactions"] = reactions_by_msg.get(m["id"], [])
                m["hidden"] = bool(m.get("hidden"))
                if m.get("forwarded_from_message_id"):
                    m["forwarded_from"] = {
                        "message_id": m["forwarded_from_message_id"],
                        "channel_id": m["forwarded_from_channel_id"],
                        "channel_name": m["forwarded_from_channel_name"],
                        "user_id": m["forwarded_from_user_id"],
                        "display_name": m["forwarded_from_display_name"],
                    }
                else:
                    m["forwarded_from"] = None
                for _k in ("forwarded_from_message_id", "forwarded_from_channel_id", "forwarded_from_user_id", "forwarded_from_channel_name", "forwarded_from_display_name"):
                    m.pop(_k, None)
                reply_to_id = m.get("reply_to")
                if reply_to_id:
                    rt = replies_by_id.get(reply_to_id)
                    if rt:
                        rt_content = rt["content"]
                        if "__late_image__:" in rt_content or "__late_images__:" in rt_content:
                            m["reply_to_content"] = rt_content
                        else:
                            m["reply_to_content"] = rt_content[:200]
                        m["reply_to_author"] = rt["display_name"]
                        m["reply_to_user_id"] = rt["user_id"]
    _attach_attachment_meta(msgs)
    _attach_receipts(msgs)
    return msgs


def hide_message(message_id: int):
    with db() as conn:
        conn.execute("UPDATE messages SET hidden = 1, og_data = NULL WHERE id = ?", (message_id,))


def delete_message(message_id: int):
    with db() as conn:
        conn.execute("UPDATE messages SET content = ?, hidden = 1, og_data = NULL WHERE id = ?", ("[eliminado]", message_id))


def edit_message(message_id: int, content: str) -> int:
    """Rewrite a message's content and stamp `edited_at`. Returns the
    timestamp so the caller can put it in the broadcast without a re-read.
    Authorization and the edit window are enforced by the caller."""
    now = int(time.time())
    with db() as conn:
        conn.execute(
            "UPDATE messages SET content = ?, edited_at = ? WHERE id = ?",
            (content, now, message_id),
        )
    return now


def clear_og_data(message_id: int):
    with db() as conn:
        conn.execute("UPDATE messages SET og_data = NULL WHERE id = ?", (message_id,))


def get_message(message_id: int) -> dict | None:
    with db() as conn:
        row = conn.execute(
            f"SELECT {_MESSAGE_COLUMNS}, u.display_name, u.email "
            "FROM messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?",
            (message_id,),
        ).fetchone()
    if not row:
        return None
    msg = dict(row)
    _attach_attachment_meta([msg])
    return msg


def forward_message(orig_id: int, target_channel_id: int, user_id: int) -> dict:
    with db() as conn:
        orig = conn.execute(
            f"SELECT {_MESSAGE_COLUMNS}, u.display_name, u.email, c.name as ch_name "
            "FROM messages m "
            "JOIN users u ON u.id = m.user_id "
            "JOIN channels c ON c.id = m.channel_id "
            "WHERE m.id = ?",
            (orig_id,),
        ).fetchone()
        if not orig:
            raise ValueError("Original message not found")
        if orig["hidden"]:
            raise ValueError("Cannot forward a hidden or deleted message")
        target_ch = conn.execute(
            "SELECT name FROM channels WHERE id = ?",
            (target_channel_id,),
        ).fetchone()
        if not target_ch:
            raise ValueError("Target channel not found")
        # ponytail: every user is in every channel, so the target row
        # is always present. The check now only enforces mute / role,
        # not membership.
        target_member = conn.execute(
            "SELECT muted, role FROM channel_members WHERE channel_id = ? AND user_id = ?",
            (target_channel_id, user_id),
        ).fetchone()
        if target_member and target_member["muted"] and target_member["role"] not in ("admin", "mod"):
            raise ValueError("Estás silenciado en el canal destino")
        content = orig["content"]
        if len(content) > 2_000_000:
            raise ValueError("Message too long to forward")
        # ponytail: pull every attachment expiry in one query instead
        # of N round-trips. We collect the ids referenced by the
        # marker payload up front, then do a single SELECT against
        # attachments. Same logic, no per-id fan-out.
        attachment_ids: list[str] = []
        for marker_prefix in ("__late_image__:", "__late_images__:", "__late_audio__:",
                              "__late_video__:", "__late_document__:", "__late_file__:"):
            idx = content.find(marker_prefix)
            if idx < 0:
                continue
            rest = content[idx + len(marker_prefix):].strip()
            if marker_prefix == "__late_images__":
                try:
                    parsed = json.loads(rest)
                except Exception:
                    continue
                if isinstance(parsed, list):
                    attachment_ids.extend(aid for aid in parsed if isinstance(aid, str) and aid)
            else:
                # Stop at the next whitespace or end of string, same as
                # the per-message _extract_attachment_id.
                for i, ch in enumerate(rest):
                    if ch.isspace():
                        rest = rest[:i]
                        break
                if rest:
                    attachment_ids.append(rest)
            break
        if attachment_ids:
            placeholders = ",".join("?" * len(attachment_ids))
            exp_rows = conn.execute(
                f"SELECT id, expires_at FROM attachments WHERE id IN ({placeholders})",
                attachment_ids,
            ).fetchall()
            exp_by_id = {r["id"]: r["expires_at"] for r in exp_rows}
            now_ts = int(time.time())
            for aid in attachment_ids:
                exp = exp_by_id.get(aid)
                if exp is None or exp < now_ts:
                    raise ValueError(f"Attachment {aid} has expired, cannot forward")
        now = int(time.time())
        is_action = bool(orig["is_action"])
        cur = conn.execute(
            "INSERT INTO messages (channel_id, user_id, content, is_action, created_at, "
            "  reply_to, forwarded_from_message_id, forwarded_from_channel_id, "
            "  forwarded_from_user_id, forwarded_from_channel_name, forwarded_from_display_name) "
            "VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)",
            (
                target_channel_id, user_id, content, 1 if is_action else 0, now,
                orig["id"], orig["channel_id"], orig["user_id"],
                orig["ch_name"], orig["display_name"],
            ),
        )
        new_id = cur.lastrowid
        new_msg = dict(conn.execute(
            f"SELECT {_MESSAGE_COLUMNS}, u.display_name, u.email "
            "FROM messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?",
            (new_id,),
        ).fetchone())
        members = conn.execute(
            "SELECT u.id, u.display_name, u.email FROM channel_members cm "
            "JOIN users u ON u.id = cm.user_id WHERE cm.channel_id = ?",
            (target_channel_id,),
        ).fetchall()
        mentioned_user_ids = []
        mentioned_user_emails = []
        is_mass_mention = False
        content_lower = content.lower()
        for m in members:
            nick = m["display_name"].lower()
            if re.search(r"(^|\s|@)" + re.escape(nick) + r"(\s|$|[.,!?])", content_lower):
                if m["id"] != user_id:
                    mentioned_user_ids.append(m["id"])
                    mentioned_user_emails.append(m["email"])
        MASS_MENTION_PATTERN = re.compile(r"@(todos|all|here|aqui|channel|everyone)\b", re.IGNORECASE)
        if MASS_MENTION_PATTERN.search(content_lower):
            caller_role = target_member["role"]
            if caller_role in ("admin", "mod"):
                is_mass_mention = True
                is_here = bool(re.search(r"@(here|aqui)\b", content_lower, re.IGNORECASE))
                if is_here:
                    extra = conn.execute(
                        "SELECT u.id, u.email FROM channel_members cm "
                        "JOIN users u ON u.id = cm.user_id "
                        "WHERE cm.channel_id = ? AND u.last_seen > ?",
                        (target_channel_id, int(time.time()) - 300),
                    ).fetchall()
                else:
                    extra = conn.execute(
                        "SELECT u.id, u.email FROM channel_members cm "
                        "JOIN users u ON u.id = cm.user_id "
                        "WHERE cm.channel_id = ?",
                        (target_channel_id,),
                    ).fetchall()
                for u in extra:
                    if u["id"] not in mentioned_user_ids and u["id"] != user_id:
                        mentioned_user_ids.append(u["id"])
                        mentioned_user_emails.append(u["email"])
        new_msg["mentioned_user_ids"] = mentioned_user_ids
        new_msg["mentioned_user_emails"] = mentioned_user_emails
        new_msg["is_mass_mention"] = is_mass_mention
        new_msg["reactions"] = []
        new_msg["reply_to"] = None
        new_msg["reply_to_content"] = None
        new_msg["reply_to_author"] = None
        new_msg["reply_to_user_id"] = None
        new_msg["hidden"] = False
        new_msg["forwarded_from"] = {
            "message_id": orig["id"],
            "channel_id": orig["channel_id"],
            "channel_name": orig["ch_name"],
            "user_id": orig["user_id"],
            "display_name": orig["display_name"],
        }
    _attach_attachment_meta([new_msg])
    _attach_receipts([new_msg])
    return new_msg
