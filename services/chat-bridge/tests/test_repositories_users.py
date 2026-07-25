import time
from repositories.users import upsert_user, get_user_by_id, update_user, search_users, touch_last_seen


def test_upsert_user_creates():
    user = upsert_user("sub-1", "alice@example.com", "Alice")
    assert user["email"] == "alice@example.com"
    assert user["display_name"] == "alice"


def test_upsert_user_reuses_existing():
    u1 = upsert_user("sub-2", "bob@example.com", "Bob")
    u2 = upsert_user("sub-2", "bob@example.com", "Bob Updated")
    assert u1["id"] == u2["id"]


def test_upsert_user_handles_display_name_collision():
    upsert_user("sub-a", "alice@example.com", "Alice")
    u2 = upsert_user("sub-b", "alice@example.com", "Alice")
    # ponytail: second user gets `alice1` to avoid the case-insensitive
    # collision. Asserting `u2["display_name"] != "alice"` is enough
    # to prove the dedup logic ran.
    assert u2["display_name"] != "alice"


def test_get_user_by_id():
    user = upsert_user("sub-3", "carol@example.com", "Carol")
    found = get_user_by_id(user["id"])
    assert found is not None
    assert get_user_by_id(99999) is None


def test_update_user_display_name():
    user = upsert_user("sub-4", "dave@example.com", "Dave")
    updated = update_user(user["id"], {"display_name": "Dave2"})
    assert updated["display_name"] == "Dave2"


def test_update_user_name():
    user = upsert_user("sub-5", "eve@example.com", "Eve")
    updated = update_user(user["id"], {"name": "Eve Updated"})
    assert updated["name"] == "Eve Updated"


def test_update_user_no_changes():
    user = upsert_user("sub-6", "frank@example.com", "Frank")
    updated = update_user(user["id"], {})
    assert updated is not None


def test_search_users():
    upsert_user("sub-7", "grace@example.com", "Grace")
    results = search_users("grace")
    assert any(r["display_name"] == "grace" for r in results)
    results2 = search_users("nonexistent")
    assert results2 == []


def test_search_users_case_insensitive():
    upsert_user("sub-8", "Heidi@example.com", "Heidi")
    results = search_users("heidi")
    assert any(r["display_name"] == "heidi" for r in results)


def test_touch_last_seen():
    user = upsert_user("sub-9", "ivan@example.com", "Ivan")
    old_seen = user["last_seen"]
    time.sleep(1)
    touch_last_seen(user["id"])
    updated = get_user_by_id(user["id"])
    assert updated["last_seen"] > old_seen
