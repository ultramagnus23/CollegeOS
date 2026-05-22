from __future__ import annotations

import random
import time
from typing import List

import requests

from .base_source_adapter import BaseSourceAdapter, SourceFetchResult


class HttpSourceAdapter(BaseSourceAdapter):
    def __init__(self, timeout_seconds: int = 25, retries: int = 3, min_delay_seconds: float = 0.25):
        self.timeout_seconds = timeout_seconds
        self.retries = retries
        self.min_delay_seconds = min_delay_seconds
        self.user_agents: List[str] = [
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        ]

    def fetch(self, url: str) -> SourceFetchResult:
        for attempt in range(1, self.retries + 1):
            try:
                response = requests.get(
                    url,
                    timeout=self.timeout_seconds,
                    headers={"User-Agent": random.choice(self.user_agents)},
                )
                if response.status_code == 429:
                    retry_after = response.headers.get("Retry-After")
                    wait = min(15, int(retry_after)) if str(retry_after or "").isdigit() else min(8, attempt * 1.5)
                    if attempt < self.retries:
                        time.sleep(wait)
                        continue
                    return SourceFetchResult(
                        success=False,
                        url=url,
                        status_code=response.status_code,
                        html="",
                        error="rate limited",
                        retryable=True,
                        error_type="RateLimitError",
                        retries_attempted=attempt - 1,
                        headers=dict(response.headers),
                    )

                if response.status_code >= 500:
                    if attempt < self.retries:
                        time.sleep(min(5, attempt * 1.2))
                        continue
                    return SourceFetchResult(
                        success=False,
                        url=url,
                        status_code=response.status_code,
                        html="",
                        error=f"http {response.status_code}",
                        retryable=True,
                        error_type="NetworkError",
                        retries_attempted=attempt - 1,
                        headers=dict(response.headers),
                    )

                if response.status_code >= 400:
                    return SourceFetchResult(
                        success=False,
                        url=url,
                        status_code=response.status_code,
                        html="",
                        error=f"http {response.status_code}",
                        retryable=False,
                        error_type="HttpError",
                        retries_attempted=attempt - 1,
                        headers=dict(response.headers),
                    )

                time.sleep(self.min_delay_seconds)
                return SourceFetchResult(
                    success=True,
                    url=url,
                    status_code=response.status_code,
                    html=response.text,
                    retries_attempted=attempt - 1,
                    headers=dict(response.headers),
                )
            except (requests.Timeout, requests.ConnectionError) as exc:
                if attempt < self.retries:
                    time.sleep(min(5, attempt * 1.2))
                    continue
                return SourceFetchResult(
                    success=False,
                    url=url,
                    status_code=None,
                    html="",
                    error=str(exc),
                    retryable=True,
                    error_type="NetworkError",
                    retries_attempted=attempt - 1,
                )
            except requests.RequestException as exc:
                return SourceFetchResult(
                    success=False,
                    url=url,
                    status_code=None,
                    html="",
                    error=str(exc),
                    retryable=False,
                    error_type="HttpError",
                    retries_attempted=attempt - 1,
                )

        return SourceFetchResult(
            success=False,
            url=url,
            status_code=None,
            html="",
            error="unknown fetch failure",
            retryable=True,
            error_type="UnknownError",
            retries_attempted=max(0, self.retries - 1),
        )
