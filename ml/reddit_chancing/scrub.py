"""PII scrubbing + salted hashing. Runs BEFORE anything touches disk."""
from __future__ import annotations
import hashlib
import hmac
import os
import re

# Keep the salt OUT of source control. Set CR_SALT in your environment.
_SALT = os.environ.get("CR_SALT", "").encode()
if not _SALT:
    raise SystemExit("Set CR_SALT env var (a random secret) before running.")

# crude but effective quasi-identifier scrubbers ------------------------------
_URL = re.compile(r"https?://\S+")
_HANDLE = re.compile(r"(?:\b|/)(?:u/|@)\w+")
# common patterns that leak a specific school/city; extend as you see fit
_HS = re.compile(r"\b([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*)\s+(?:High School|HS)\b")


def hash_id(post_id: str) -> str:
    """Stable, non-reversible applicant id. Lets you dedupe without storing source id."""
    return hmac.new(_SALT, post_id.encode(), hashlib.sha256).hexdigest()[:24]


def scrub_text(text: str) -> str:
    """Strip direct identifiers before the text ever reaches the extractor/LLM."""
    text = _URL.sub("[URL]", text)
    text = _HANDLE.sub(" [USER]", text)
    text = _HS.sub("[SCHOOL]", text)
    return text


def coarsen_income(raw: str | None) -> str | None:
    """Map any stated dollar figure to a 4-band bucket (drops exact numbers)."""
    if not raw:
        return None
    nums = [int(n.replace(",", "")) for n in re.findall(r"\$?([\d,]{3,})k?", raw)]
    if not nums:
        return raw if raw in {"<60k", "60-120k", "120-250k", ">250k"} else None
    v = max(nums)
    v = v * 1000 if v < 1000 else v          # "150k" style
    if v < 60_000:  return "<60k"
    if v < 120_000: return "60-120k"
    if v < 250_000: return "120-250k"
    return ">250k"
