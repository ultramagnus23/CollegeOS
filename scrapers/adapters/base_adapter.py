from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional


@dataclass
class FetchResult:
    success: bool
    url: str
    status_code: Optional[int]
    html: str
    error: Optional[str] = None
    headers: Optional[Dict[str, str]] = None
    error_type: Optional[str] = None
    retryable: bool = False
    retries_attempted: int = 0


class BaseAdapter:
    def fetch(self, url: str) -> FetchResult:  # pragma: no cover - interface
        raise NotImplementedError
