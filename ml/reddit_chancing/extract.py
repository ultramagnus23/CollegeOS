"""Hybrid extraction: regex first (cheap, templated posts), LLM fallback for prose."""
from __future__ import annotations
import re
from schema import Applicant, CollegeOutcome, Decision, Round

# ---- Stage A: regex for templated posts ------------------------------------
# Two GPA phrasings seen in the wild: "UW GPA: 3.9" and the r/collegeresults
# template's "GPA (UW/W): 3.69/4.05" combined form. Try the combined one first.
_GPA_COMBINED = re.compile(
    r"GPA\s*\(?\s*UW\s*/\s*W\)?\s*[:\s]*([0-4]\.\d{1,2})\s*/\s*(\d\.\d{1,2}|\d{2,3})", re.I
)
_PATTERNS = {
    "gpa_uw": re.compile(r"(?:UW|unweighted)\s*GPA[:\s]*([0-4]\.\d{1,2})", re.I),
    "gpa_w":  re.compile(r"(?<![A-Za-z])(?:W|weighted)\s*GPA[:\s]*(\d\.\d{1,2}|\d{2,3})", re.I),
    "sat":    re.compile(r"\bSAT[:\s]*(?:\(.*?\)\s*)?(1[0-5]\d{2}|1600)\b", re.I),
    "act":    re.compile(r"\bACT[:\s]*(?:\(.*?\)\s*)?([1-9]|[12]\d|3[0-6])\b", re.I),
    "num_ap": re.compile(r"(\d{1,2})\s*AP'?s?\b", re.I),
}
_DECISION_LINE = re.compile(
    r"(?P<school>[A-Za-z .&'\-]+?)\s*[:\-–]\s*"
    r"(?:WL\s*(?:->|→)\s*)?"                       # optional "WL -> " status-change prefix
    r"(?P<decision>accepted|admit(?:ted)?|rejected|denied|waitlist(?:ed)?|"
    r"deferred|withdrawn)",
    re.I,
)
_DECISION_MAP = {
    "accepted": Decision.ACCEPT, "admit": Decision.ACCEPT, "admitted": Decision.ACCEPT,
    "rejected": Decision.REJECT, "denied": Decision.REJECT,
    "waitlist": Decision.WAITLIST, "waitlisted": Decision.WAITLIST,
    "deferred": Decision.DEFER, "withdrawn": Decision.WITHDRAW,
}
# Tokens the decision-line regex mistakes for a school name -- section headers,
# status words, and bare abbreviations that aren't institutions.
_SCHOOL_BLOCKLIST = {
    "decisions", "decision", "results", "result", "schools", "school", "wl",
    "update", "updates", "final", "summary", "outcomes", "colleges", "college",
    "ed", "ea", "rd", "list",
}


def looks_templated(text: str) -> bool:
    """Route: templated posts have >=3 recognizable 'School - decision' lines."""
    return len(_DECISION_LINE.findall(text)) >= 3


def extract_regex(text: str) -> Applicant:
    a = Applicant()
    if m := _GPA_COMBINED.search(text):
        a.gpa_uw, a.gpa_w = float(m.group(1)), float(m.group(2))
    else:
        if m := _PATTERNS["gpa_uw"].search(text): a.gpa_uw = float(m.group(1))
        if m := _PATTERNS["gpa_w"].search(text):  a.gpa_w = float(m.group(1))
    if m := _PATTERNS["sat"].search(text):    a.sat_total = int(m.group(1))
    if m := _PATTERNS["act"].search(text):    a.act_composite = int(m.group(1))
    if m := _PATTERNS["num_ap"].search(text): a.num_ap = int(m.group(1))
    for m in _DECISION_LINE.finditer(text):
        school = m.group("school").strip()
        if school.lower() in _SCHOOL_BLOCKLIST or len(school) < 2:
            continue
        verb = m.group("decision").lower()
        a.colleges.append(CollegeOutcome(
            university_raw=school,
            decision=_DECISION_MAP.get(verb, Decision.UNKNOWN),
        ))
    return a


# ---- Stage B: LLM extraction for prose posts -------------------------------
EC_TIER_RUBRIC = """\
Tier 1: national/international distinction (USAMO, ISEF finalist, published research, recruited D1)
Tier 2: state-level leadership / sustained significant impact
Tier 3: solid school-level leadership (club president, varsity captain)
Tier 4: participation-level involvement"""

_SYSTEM = f"""You extract structured data from an anonymized r/collegeresults post.
Rules, in priority order:
1. Output null / empty for any field NOT explicitly stated. Never guess or infer.
2. Never copy verbatim text. ec_summary must be your own 1-sentence abstraction.
3. Strip any school, organization, or personal names that survived scrubbing
   (replace with a generic word). Do not emit them in any field.
4. Assign ec_tier by this rubric (single integer, the applicant's strongest EC):
{EC_TIER_RUBRIC}
5. income_band must be one of: <60k, 60-120k, 120-250k, >250k, or null.
6. One colleges[] entry per school the applicant reported a decision for."""

# Opus for hard prose posts; Haiku for cheap high-volume passes.
_MODEL_DEFAULT = "claude-opus-4-8"
_MODEL_BULK = "claude-haiku-4-5"

_client = None  # lazily constructed so the regex path needs no SDK / API key


def _get_client():
    global _client
    if _client is None:
        import anthropic  # lazy: only needed on the LLM path
        _client = anthropic.Anthropic()  # resolves ANTHROPIC_API_KEY / ant profile
    return _client


def extract_llm(scrubbed_text: str, *, model: str = _MODEL_DEFAULT) -> Applicant:
    """Constrained extraction via structured outputs. The schema IS the contract:
    messages.parse validates the response against Applicant for us."""
    resp = _get_client().messages.parse(
        model=model,
        max_tokens=4096,
        system=_SYSTEM,
        messages=[{"role": "user", "content": scrubbed_text}],
        output_format=Applicant,
    )
    # Refusal or empty parse -> return an empty Applicant rather than crashing the batch.
    return resp.parsed_output or Applicant()


def extract(text: str, *, allow_llm: bool = False,
            model: str = _MODEL_DEFAULT) -> tuple[Applicant, str]:
    """Returns (applicant, method). Regex when templated, else LLM if enabled."""
    if looks_templated(text):
        return extract_regex(text), "REGEX"
    if allow_llm:
        return extract_llm(text, model=model), "LLM"
    return extract_regex(text), "REGEX_PARTIAL"   # best-effort without LLM
