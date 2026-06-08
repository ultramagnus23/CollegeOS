from __future__ import annotations

from typing import List, Tuple


class BaseValidator:
    def validate(self, payload: dict) -> Tuple[bool, List[str]]:  # pragma: no cover - interface
        raise NotImplementedError
