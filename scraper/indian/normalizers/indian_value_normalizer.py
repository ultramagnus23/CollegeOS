from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from .base_normalizer import BaseNormalizer
from .exam_taxonomy import normalize_exam_name


class IndianValueNormalizer(BaseNormalizer):
    _money_pattern = re.compile(r"([0-9]+(?:\.[0-9]+)?)\s*(lakh|lakhs|lac|lacs|crore|crores)?", re.IGNORECASE)
    _percent_pattern = re.compile(r"([0-9]+(?:\.[0-9]+)?)\s*%")

    @classmethod
    def normalize_money_to_inr(cls, raw: str | None) -> int | None:
        if not raw:
            return None
        match = cls._money_pattern.search(raw.replace(",", ""))
        if not match:
            return None
        value = float(match.group(1))
        unit = (match.group(2) or "").lower()
        if unit in {"lakh", "lakhs", "lac", "lacs"}:
            return int(value * 100000)
        if unit in {"crore", "crores"}:
            return int(value * 10000000)
        return int(value)

    @classmethod
    def normalize_percent(cls, raw: str | None) -> float | None:
        if not raw:
            return None
        match = cls._percent_pattern.search(raw)
        if match:
            return float(match.group(1))
        try:
            value = float(raw)
            return value if value <= 100 else None
        except ValueError:
            return None

    @staticmethod
    def normalize_date(raw: str | None) -> str | None:
        if not raw:
            return None
        for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%b %d, %Y", "%B %d, %Y"):
            try:
                return datetime.strptime(raw.strip(), fmt).date().isoformat()
            except ValueError:
                continue
        return None

    def normalize(self, payload: dict) -> dict:
        admissions = payload.get("admissions", {})
        exams = admissions.get("entrance_exams", [])
        admissions["entrance_exams"] = [normalize_exam_name(exam) for exam in exams if exam]
        payload["admissions"] = admissions

        fees = payload.get("fees", {})
        if isinstance(fees.get("tuition"), list):
            fees["tuition_inr"] = [self.normalize_money_to_inr(v) for v in fees["tuition"]]
        payload["fees"] = fees

        placements = payload.get("placements", {})
        for key in ("median_package", "average_package", "highest_package"):
            values = placements.get(key)
            if isinstance(values, list):
                placements[f"{key}_inr"] = [self.normalize_money_to_inr(v) for v in values]
        if isinstance(placements.get("placement_rate"), list):
            placements["placement_rate_percent"] = [self.normalize_percent(v) for v in placements["placement_rate"]]
        payload["placements"] = placements

        deadlines = payload.get("deadlines", {})
        for key in ("application_opens", "application_closes", "scholarship_deadlines"):
            values = deadlines.get(key)
            if isinstance(values, list):
                deadlines[f"{key}_iso"] = [self.normalize_date(v) for v in values]
        payload["deadlines"] = deadlines

        return payload
