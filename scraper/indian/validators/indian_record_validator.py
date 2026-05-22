from __future__ import annotations

from typing import List, Tuple

from .base_validator import BaseValidator


class IndianRecordValidator(BaseValidator):
    def validate(self, payload: dict) -> Tuple[bool, List[str]]:
        errors: List[str] = []

        identity = payload.get("identity", {})
        if not identity.get("name"):
            errors.append("identity.name is required")

        for section in ("admissions", "fees", "placements", "academics", "rankings", "deadlines", "international"):
            if section not in payload:
                errors.append(f"{section} section is missing")

        if payload.get("compliance", {}).get("contains_editorial"):
            errors.append("editorial content ingestion is blocked")
        if payload.get("compliance", {}).get("contains_reviews"):
            errors.append("review content ingestion is blocked")

        return (len(errors) == 0), errors
