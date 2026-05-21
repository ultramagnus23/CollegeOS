from __future__ import annotations

import random
import time
from typing import List, Tuple

import requests

from .base_adapter import BaseAdapter, FetchResult


RETRYABLE_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}


def classify_http_status(status_code: int) -> Tuple[str, bool]:
    if status_code == 429:
        return "RateLimitError", True
    if status_code in RETRYABLE_STATUS_CODES:
        return "NetworkError", True
    if 500 <= status_code <= 599:
        return "NetworkError", True
    return "HttpError", False


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
        last_error_type = "NetworkError"
        retryable = True
        retries_used = 0
        for attempt in range(1, self.retries + 1):
            try:
                headers = {"User-Agent": random.choice(self.user_agents)}
                response = requests.get(url, timeout=self.timeout_seconds, headers=headers)
                if response.ok:
                    return FetchResult(
                        success=True,
                        url=url,
                        status_code=response.status_code,
                        html=response.text,
                        error=None,
                        headers=dict(response.headers),
                        error_type=None,
                        retryable=False,
                        retry_count=retries_used,
                    )

                error_type, retryable = classify_http_status(response.status_code)
                last_error_type = error_type
                last_error = f"http {response.status_code}"
                if not retryable:
                    break
            except requests.exceptions.RequestException as exc:  # pragma: no cover
                last_error = str(exc)
                last_error_type = "NetworkError"
                retryable = True
            if attempt < self.retries and retryable:
                retries_used += 1
                time.sleep(min(6, 1.2 * attempt))

        return FetchResult(
            success=False,
            url=url,
            status_code=None,
            html="",
            error=last_error,
            error_type=last_error_type,
            retryable=retryable,
            retry_count=retries_used,
        )
