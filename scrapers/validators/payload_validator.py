from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Tuple


def _is_valid_date(date_value: str) -> bool:
    try:
        datetime.strptime(date_value, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def validate_deadlines(rows: List[Dict]) -> Tuple[List[Dict], List[str]]:
    errors: List[str] = []
    valid: List[Dict] = []
    for idx, row in enumerate(rows):
        if not row.get("deadline_type"):
            errors.append(f"row {idx}: deadline_type missing")
            continue
        if not row.get("deadline_date") or not _is_valid_date(row["deadline_date"]):
            errors.append(f"row {idx}: invalid deadline_date")
            continue
        valid.append(row)
    return valid, errors


def validate_requirements(rows: List[Dict]) -> Tuple[List[Dict], List[str]]:
    errors: List[str] = []
    valid: List[Dict] = []
    for idx, row in enumerate(rows):
        if not row.get("requirement_type"):
            errors.append(f"row {idx}: requirement_type missing")
            continue
        if not row.get("requirement_text"):
            errors.append(f"row {idx}: requirement_text missing")
            continue
        valid.append(row)
    return valid, errors

