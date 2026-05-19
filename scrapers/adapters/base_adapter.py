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


class BaseAdapter:
    def fetch(self, url: str) -> FetchResult:  # pragma: no cover - interface
        raise NotImplementedError

