from __future__ import annotations

import random
from typing import Dict

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "Mozilla/5.0 (X11; Linux x86_64)",
]


def anti_bot_headers(seed: int | None = None) -> Dict[str, str]:
    if seed is not None:
        random.seed(seed)
    return {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
    }


def backoff_seconds(attempt: int) -> float:
    return min(60.0, (2 ** max(0, attempt - 1)) + random.uniform(0.1, 1.5))
