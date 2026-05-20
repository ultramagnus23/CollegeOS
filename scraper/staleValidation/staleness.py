from __future__ import annotations

from datetime import datetime, timezone


MAX_STALE_DAYS = {
    "deadlines": 45,
    "tuition": 120,
    "requirements": 180,
}


def stale_days(last_seen: str | None) -> int:
    if not last_seen:
        return 10_000
    try:
        seen = datetime.fromisoformat(last_seen.replace("Z", "+00:00"))
    except Exception:
        return 10_000
    return int((datetime.now(timezone.utc) - seen).days)


def is_stale(last_seen: str | None, category: str) -> bool:
    limit = MAX_STALE_DAYS.get(category, 120)
    return stale_days(last_seen) > limit
