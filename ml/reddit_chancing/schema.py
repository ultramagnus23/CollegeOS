"""Pydantic schema = the JSON contract for extraction and the training-row grain."""
from __future__ import annotations
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, field_validator


class Decision(str, Enum):
    ACCEPT = "ACCEPT"
    REJECT = "REJECT"
    WAITLIST = "WAITLIST"
    DEFER = "DEFER"
    WITHDRAW = "WITHDRAW"
    UNKNOWN = "UNKNOWN"


class Round(str, Enum):
    ED = "ED"; ED2 = "ED2"; EA = "EA"; REA = "REA"; RD = "RD"
    ROLLING = "ROLLING"; TRANSFER = "TRANSFER"; UNKNOWN = "UNKNOWN"


class CollegeOutcome(BaseModel):
    university_raw: str                      # verbatim string as posted
    decision: Decision = Decision.UNKNOWN
    round: Round = Round.UNKNOWN
    major_applied: Optional[str] = None
    scholarship_flag: bool = False


class Applicant(BaseModel):
    # academics
    gpa_uw: Optional[float] = None
    gpa_w: Optional[float] = None
    gpa_w_scale: Optional[float] = None
    class_rank_pct: Optional[float] = None
    sat_total: Optional[int] = None
    sat_super_flag: bool = False
    act_composite: Optional[int] = None
    num_ap: Optional[int] = None
    test_optional_flag: bool = False
    # narrative (LLM-assigned; NO verbatim text)
    ec_tier: Optional[int] = Field(None, ge=1, le=4)
    ec_summary: Optional[str] = None
    num_national_awards: Optional[int] = None
    has_research: bool = False
    has_leadership: bool = False
    hooks: list[str] = []
    # demographics (coarse, self-reported)
    gender: Optional[str] = None
    race_ethnicity: list[str] = []
    first_gen: Optional[bool] = None
    income_band: Optional[str] = None       # <60k | 60-120k | 120-250k | >250k
    geography_region: Optional[str] = None  # census region / country, NOT city
    international_flag: bool = False
    # outcomes
    colleges: list[CollegeOutcome] = []

    @field_validator("gpa_uw")
    @classmethod
    def _gpa_range(cls, v):
        if v is not None and not (0 <= v <= 5):
            raise ValueError("gpa out of range")
        return v

    @field_validator("sat_total")
    @classmethod
    def _sat_range(cls, v):
        if v is not None and not (400 <= v <= 1600):
            raise ValueError("sat out of range")
        return v

    @field_validator("act_composite")
    @classmethod
    def _act_range(cls, v):
        if v is not None and not (1 <= v <= 36):
            raise ValueError("act out of range")
        return v
