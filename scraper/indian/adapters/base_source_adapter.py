from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional


@dataclass
class SourceFetchResult:
    success: bool
    url: str
    status_code: Optional[int]
    html: str
    error: Optional[str] = None
    retryable: bool = False
    error_type: Optional[str] = None
    retries_attempted: int = 0
    headers: Optional[Dict[str, str]] = None


class BaseSourceAdapter:
    def fetch(self, url: str) -> SourceFetchResult:  # pragma: no cover - interface
        raise NotImplementedError
