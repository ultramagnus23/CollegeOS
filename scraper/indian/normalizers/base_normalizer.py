from __future__ import annotations


class BaseNormalizer:
    def normalize(self, payload: dict) -> dict:  # pragma: no cover - interface
        raise NotImplementedError
