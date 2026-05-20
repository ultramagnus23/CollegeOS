from __future__ import annotations

import random
import time
from typing import List

import requests

from .base_adapter import BaseAdapter, FetchResult


class HttpAdapter(BaseAdapter):
    def __init__(self, timeout_seconds: int = 25, retries: int = 3, user_agents: List[str] | None = None):
        self.timeout_seconds = timeout_seconds
        self.retries = retries
        self.user_agents = user_agents or [
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
        ]

    def fetch(self, url: str) -> FetchResult:
        last_error = None
        for attempt in range(1, self.retries + 1):
            try:
                headers = {"User-Agent": random.choice(self.user_agents)}
                response = requests.get(url, timeout=self.timeout_seconds, headers=headers)
                if response.status_code >= 500:
                    last_error = f"server error {response.status_code}"
                else:
                    return FetchResult(
                        success=response.ok,
                        url=url,
                        status_code=response.status_code,
                        html=response.text if response.ok else "",
                        error=None if response.ok else f"http {response.status_code}",
                        headers=dict(response.headers),
                    )
            except Exception as exc:  # pragma: no cover - network errors are environment dependent
                last_error = str(exc)
            time.sleep(min(6, 1.2 * attempt))
        return FetchResult(success=False, url=url, status_code=None, html="", error=last_error)

