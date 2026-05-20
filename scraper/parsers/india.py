"""
CollegeOS Scraper — India Parser
Covers:
  • JEE-based colleges (IITs, NITs, IIITs) via JoSAA counseling
    — Round 1, 2, 3, 4, 5 seat allotment + reporting deadlines
  • Deemed universities + private colleges — direct portals
  • Scholarship deadlines (merit + need-based)
  • DU, BHU, AMU, BITS Pilani application rounds
"""

from __future__ import annotations

import re
import traceback
from datetime import date
from typing import Any

import structlog
from bs4 import BeautifulSoup

from config import settings
from parsers.base import BaseParser, ParsedDeadline, ParsedRequirement

log = structlog.get_logger(__name__)

# JoSAA official URL (changes every cycle — we scrape it fresh each run)
JOSAA_SCHEDULE_URL = "https://josaa.admissions.nic.in/applicant/seatmatrix/Openingclosing.aspx"
JOSAA_HOMEPAGE = "https://josaa.admissions.nic.in"

# CSAB for NIT laterals
CSAB_URL = "https://csab.nic.in"

# Round labels for JoSAA → maps to our deadline_type
JOSAA_ROUNDS = {
    "round 1": "priority",       # we re-map rounds to our closest deadline_type
    "round 2": "rolling",        #  — see _josaa_round_to_dl_type()
    "round 3": "rolling",
    "round 4": "rolling",
    "round 5": "rolling",
    "mock round 1": "priority",
    "mock round 2": "priority",
}

# Indian scholarship portals
NSP_SCHEDULE = "https://scholarships.gov.in/public/schemeGuidelines/NSP_guidelines.pdf"
AICTE_SCHOLARSHIP = "https://www.aicte-india.org/sites/default/files/important_notice"

# IIT-specific scholarship pages (sampling — we'll use institution website_url in practice)
IIT_SCHOLARSHIP_PATTERN = "{website}/academics/scholarships"

# BITS Pilani — has its own direct admission system
BITS_PILANI_ADMISSIONS = "https://www.bitsadmission.com"

# DU admission portal
DU_ADMISSION = "https://admission.uod.ac.in"

# BITS admission schedule URL
BITS_SCHEDULE_URL = "https://www.bitsadmission.com/bitsatSchedule.aspx"

_ROUND_RE = re.compile(
    r"(round|allotment)\s*[–\-:]\s*(\d+|[ivxIVX]+)|"
    r"(first|second|third|fourth|fifth)\s+(round|allotment)",
    re.IGNORECASE,
)

_DATE_RE = re.compile(
    r"\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b"  # DD/MM/YYYY
    r"|"
    r"(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may"
    r"|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?"
    r"|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})",
    re.IGNORECASE,
)

_SCHOLARSHIP_KEYWORDS = [
    "scholarship", "merit award", "need-based", "financial assistance",
    "stipend", "fellowship", "free ship", "fee waiver",
]


def _josaa_round_to_dl_type(round_num: int) -> str:
    # We store JoSAA rounds as 'priority' (round 1) or 'rolling' (subsequent)
    if round_num == 1:
        return "priority"
    return "rolling"


def _ordinal_to_int(word: str) -> int:
    return {"first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5}.get(word.lower(), 1)


class IndiaParser(BaseParser):
    PARSER_NAME = "india_parser"

    async def parse(
        self, institution: dict
    ) -> tuple[list[ParsedDeadline], ParsedRequirement | None]:
        inst_id = str(institution["id"])
        name = institution["name"]
        website = (institution.get("website_url") or "").rstrip("/")

        deadlines: list[ParsedDeadline] = []
        req: ParsedRequirement | None = None

        name_lower = name.lower()
        is_jee_college = any(
            kw in name_lower for kw in ("iit", "nit", "iiit", "gfti", "iiser")
        )
        is_bits = "bits" in name_lower and "pilani" in name_lower

        # ── JoSAA colleges ────────────────────────────────────────────────────
        if is_jee_college:
            try:
                josaa_dl = await self._parse_josaa(inst_id, name)
                deadlines.extend(josaa_dl)
            except Exception:
                log.warning("josaa_failed", institution=name, tb=traceback.format_exc())

        # ── BITS Pilani ───────────────────────────────────────────────────────
        elif is_bits:
            try:
                bits_dl = await self._parse_bits(inst_id)
                deadlines.extend(bits_dl)
            except Exception:
                log.warning("bits_failed", institution=name, tb=traceback.format_exc())

        # ── DU / BHU / AMU / Generic Indian college ───────────────────────────
        if website:
            try:
                direct_dl, direct_req = await self._parse_direct_india(inst_id, name, website)
                existing_types = {d.deadline_type for d in deadlines}
                for d in direct_dl:
                    if d.deadline_type not in existing_types:
                        deadlines.append(d)
                if req is None:
                    req = direct_req
            except Exception:
                log.warning("india_direct_failed", institution=name, tb=traceback.format_exc())

        # ── Scholarship deadlines ─────────────────────────────────────────────
        if website:
            try:
                schol_dl = await self._parse_scholarships(inst_id, website)
                deadlines.extend(schol_dl)
            except Exception:
                log.warning("scholarship_scrape_failed", institution=name)

        # ── Default requirements for Indian colleges ───────────────────────────
        if req is None:
            req = self._default_india_requirements(inst_id, is_jee_college, website)

        return deadlines, req

    # ── JoSAA ─────────────────────────────────────────────────────────────────

    async def _parse_josaa(self, inst_id: str, inst_name: str) -> list[ParsedDeadline]:
        """
        Scrape the JoSAA schedule page for round-wise seat allotment dates.
        """
        html = await self.fetch_playwright(JOSAA_HOMEPAGE)
        if not html:
            return []

        soup = BeautifulSoup(html, "lxml")
        text = soup.get_text(" ", strip=True)
        deadlines: list[ParsedDeadline] = []

        # Find schedule section
        schedule_section = None
        for tag in soup.find_all(["table", "div", "section"]):
            tag_text = tag.get_text(" ", strip=True).lower()
            if "round" in tag_text and ("allotment" in tag_text or "reporting" in tag_text):
                schedule_section = tag
                break

        if not schedule_section:
            return []

        rows = schedule_section.find_all("tr")
        for row in rows:
            cells = [c.get_text(" ", strip=True) for c in row.find_all(["td", "th"])]
            if len(cells) < 2:
                continue

            row_text = " ".join(cells).lower()
            round_match = re.search(r"round\s*(\d+)", row_text)
            if not round_match:
                continue
            round_num = int(round_match.group(1))
            dl_type = _josaa_round_to_dl_type(round_num)

            # Find date in cells
            for cell in cells[1:]:
                dt = self._parse_india_date(cell)
                if dt:
                    # One deadline per round per institution
                    deadlines.append(ParsedDeadline(
                        institution_id=inst_id,
                        deadline_type=dl_type,
                        deadline_date=dt,
                        notification_date=None,
                        is_binding=True,  # JoSAA is binding
                        is_rolling=False,
                        is_estimated=False,
                        applicant_type="domestic",
                        degree_level="undergraduate",
                        intake_term="fall",
                        source_url=JOSAA_HOMEPAGE,
                        source_domain="josaa.admissions.nic.in",
                        source_type="government",
                        confidence_score=92.0,
                        raw_payload={
                            "round": round_num,
                            "raw_row": cells,
                        },
                        parser_trace={
                            "parser": self.PARSER_NAME,
                            "source": "josaa",
                        },
                    ))
                    break

        return deadlines

    # ── BITS Pilani ───────────────────────────────────────────────────────────

    async def _parse_bits(self, inst_id: str) -> list[ParsedDeadline]:
        html = await self.fetch_html(BITS_SCHEDULE_URL)
        if not html:
            html = await self.fetch_html(BITS_PILANI_ADMISSIONS)
        if not html:
            return []

        soup = BeautifulSoup(html, "lxml")
        text = soup.get_text(" ", strip=True)
        deadlines: list[ParsedDeadline] = []

        # BITSAT application window
        app_open = self._find_date_near_keyword(text, ["application open", "form available", "registration open"])
        app_close = self._find_date_near_keyword(text, ["application close", "last date", "registration close"])

        if app_open:
            deadlines.append(ParsedDeadline(
                institution_id=inst_id,
                deadline_type="priority",
                deadline_date=app_open,
                notification_date=app_close,
                is_binding=False,
                is_rolling=False,
                is_estimated=False,
                applicant_type="domestic",
                degree_level="undergraduate",
                intake_term="fall",
                source_url=BITS_SCHEDULE_URL,
                source_domain="bitsadmission.com",
                source_type="official",
                confidence_score=88.0,
                raw_payload={"type": "bitsat_application_window"},
                parser_trace={"parser": self.PARSER_NAME, "source": "bits"},
            ))

        if app_close:
            deadlines.append(ParsedDeadline(
                institution_id=inst_id,
                deadline_type="regular_decision",
                deadline_date=app_close,
                notification_date=None,
                is_binding=False,
                is_rolling=False,
                is_estimated=False,
                applicant_type="domestic",
                degree_level="undergraduate",
                intake_term="fall",
                source_url=BITS_SCHEDULE_URL,
                source_domain="bitsadmission.com",
                source_type="official",
                confidence_score=88.0,
                raw_payload={"type": "bitsat_close"},
                parser_trace={"parser": self.PARSER_NAME, "source": "bits"},
            ))

        return deadlines

    # ── Direct Indian college page ─────────────────────────────────────────────

    async def _parse_direct_india(
        self, inst_id: str, name: str, website: str
    ) -> tuple[list[ParsedDeadline], ParsedRequirement | None]:
        candidate_paths = [
            "/admissions",
            "/admission",
            "/admissions/dates",
            "/admission-schedule",
            "/how-to-apply",
        ]
        html = None
        used_url = None
        for path in candidate_paths:
            url = website + path
            html = await self.fetch_html(url)
            if html and len(html) > 1500:
                used_url = url
                break

        if not html:
            html = await self.fetch_html(website)
            used_url = website

        if not html:
            return [], None

        soup = BeautifulSoup(html, "lxml")
        text = soup.get_text(" ", strip=True)
        source_url = used_url or website

        deadlines: list[ParsedDeadline] = []

        # Look for "Round 1", "Round 2" etc.
        for match in re.finditer(r"(round\s*[1-5]|phase\s*[1-4])", text, re.IGNORECASE):
            round_text = match.group(0)
            round_num = re.search(r"\d+", round_text)
            if not round_num:
                continue
            n = int(round_num.group())
            context_start = max(0, match.start() - 50)
            context_end = min(len(text), match.end() + 100)
            context = text[context_start:context_end]
            dt = self._parse_india_date(context)
            if dt:
                deadlines.append(ParsedDeadline(
                    institution_id=inst_id,
                    deadline_type=_josaa_round_to_dl_type(n),
                    deadline_date=dt,
                    notification_date=None,
                    is_binding=False,
                    is_rolling=(n > 1),
                    is_estimated=False,
                    applicant_type="domestic",
                    degree_level="undergraduate",
                    intake_term="fall",
                    source_url=source_url,
                    source_domain=self.domain_of(source_url),
                    source_type="official",
                    confidence_score=72.0,
                    raw_payload={"round": n, "context": context[:200]},
                    parser_trace={"parser": self.PARSER_NAME},
                ))

        # Fallback: regular_decision from "last date to apply"
        if not deadlines:
            last_date = self._find_date_near_keyword(
                text, ["last date", "closing date", "apply before", "deadline"]
            )
            if last_date:
                deadlines.append(ParsedDeadline(
                    institution_id=inst_id,
                    deadline_type="regular_decision",
                    deadline_date=last_date,
                    notification_date=None,
                    is_binding=False,
                    is_rolling=False,
                    is_estimated=False,
                    applicant_type="domestic",
                    degree_level="undergraduate",
                    intake_term="fall",
                    source_url=source_url,
                    source_domain=self.domain_of(source_url),
                    source_type="official",
                    confidence_score=65.0,
                    raw_payload={},
                    parser_trace={"parser": self.PARSER_NAME},
                ))

        req = self._extract_india_requirements(inst_id, soup, text, source_url)
        return deadlines, req

    # ── Scholarship deadlines ──────────────────────────────────────────────────

    async def _parse_scholarships(self, inst_id: str, website: str) -> list[ParsedDeadline]:
        schol_paths = ["/scholarships", "/financial-aid", "/scholarship", "/fee-structure"]
        html = None
        used_url = None
        for path in schol_paths:
            url = website + path
            h = await self.fetch_html(url)
            if h and len(h) > 1500:
                html = h
                used_url = url
                break

        if not html:
            return []

        text = BeautifulSoup(html, "lxml").get_text(" ", strip=True)
        deadlines: list[ParsedDeadline] = []

        for kw in _SCHOLARSHIP_KEYWORDS:
            for m in re.finditer(re.escape(kw), text, re.IGNORECASE):
                context_start = max(0, m.start() - 30)
                context_end = min(len(text), m.end() + 150)
                snippet = text[context_start:context_end]
                dt = self._parse_india_date(snippet) or self.parse_date(snippet)
                if dt:
                    deadlines.append(ParsedDeadline(
                        institution_id=inst_id,
                        deadline_type="scholarship",
                        deadline_date=dt,
                        notification_date=None,
                        is_binding=False,
                        is_rolling=False,
                        is_estimated=False,
                        applicant_type="domestic",
                        degree_level="undergraduate",
                        intake_term="fall",
                        source_url=used_url,
                        source_domain=self.domain_of(used_url),
                        source_type="official",
                        confidence_score=60.0,
                        raw_payload={"keyword": kw, "snippet": snippet[:200]},
                        parser_trace={"parser": self.PARSER_NAME},
                    ))
                    break  # one scholarship deadline per keyword scan

        return deadlines[:5]  # cap at 5 scholarship entries per institution

    # ── Requirements ──────────────────────────────────────────────────────────

    def _extract_india_requirements(
        self, inst_id: str, soup: BeautifulSoup, text: str, source_url: str
    ) -> ParsedRequirement | None:
        text_lower = text.lower()

        ielts = bool(re.search(r"ielts", text_lower))
        toefl = bool(re.search(r"toefl", text_lower))
        ielts_min = self.extract_score(text, r"ielts[^0-9]*(\d\.\d|\d{1,2})")
        toefl_min = self.extract_score(text, r"toefl[^0-9]*(\d{2,3})")

        return ParsedRequirement(
            institution_id=inst_id,
            cycle_year=settings.current_cycle_year,
            degree_level="undergraduate",
            applicant_type="domestic",

            # Indian colleges don't use SAT/ACT for domestic
            sat_policy="not_used",
            act_policy="not_used",
            test_blind=False,
            sat_optional=False,
            sat_required=False,
            act_required=False,

            toefl_required=toefl,
            ielts_required=ielts,
            toefl_min_score=toefl_min,
            ielts_min_score=ielts_min,
            duolingo_required=False,

            transcript_required=True,
            predicted_grades_required=False,
            essays_required=bool(re.search(r"statement\s+of\s+purpose|sop|essay", text_lower)),
            supplemental_essays_required=False,
            supplemental_essay_count=0,

            teacher_recommendations_required=0,
            counselor_recommendation_required=False,

            interview_required=bool(re.search(r"interview\s+required|personal\s+interview", text_lower)),
            interview_optional=bool(re.search(r"interview\s+optional", text_lower)),

            common_app_supported=False,
            ucas_supported=False,
            direct_apply_supported=True,

            financial_documents_required=True,  # always for Indian admissions
            passport_required=bool(re.search(r"nri|international", text_lower)),
            visa_documents_required=False,

            source_url=source_url,
            source_domain=self.domain_of(source_url),
            source_type="official",
            confidence_score=70.0,
            raw_requirements_text=text[:2000],
            raw_payload={},
            parser_trace={"parser": self.PARSER_NAME},
        )

    def _default_india_requirements(
        self, inst_id: str, is_jee: bool, website: str
    ) -> ParsedRequirement:
        return ParsedRequirement(
            institution_id=inst_id,
            cycle_year=settings.current_cycle_year,
            degree_level="undergraduate",
            applicant_type="domestic",
            sat_policy="not_used",
            act_policy="not_used",
            test_blind=False,
            sat_optional=False,
            sat_required=False,
            act_required=False,
            toefl_required=False,
            ielts_required=False,
            transcript_required=True,
            essays_required=not is_jee,
            supplemental_essays_required=False,
            supplemental_essay_count=0,
            teacher_recommendations_required=0,
            counselor_recommendation_required=False,
            interview_required=False,
            interview_optional=False,
            common_app_supported=False,
            ucas_supported=False,
            direct_apply_supported=True,
            financial_documents_required=True,
            passport_required=False,
            visa_documents_required=False,
            source_url=website,
            source_domain=self.domain_of(website) if website else "",
            source_type="official",
            confidence_score=40.0,  # low — it's a default
            raw_requirements_text=None,
            raw_payload={"is_jee_college": is_jee, "default": True},
            parser_trace={"parser": self.PARSER_NAME, "note": "default_values"},
        )

    # ── Date helpers ──────────────────────────────────────────────────────────

    def _parse_india_date(self, text: str) -> date | None:
        """DD/MM/YYYY, DD-MM-YYYY, DD Month YYYY patterns common in India."""
        # DD/MM/YYYY or DD-MM-YYYY
        m = re.search(r"\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b", text)
        if m:
            try:
                from datetime import date as d
                return d(int(m.group(3)), int(m.group(2)), int(m.group(1)))
            except ValueError:
                pass
        # Fall back to standard parser
        return self.parse_date(text)

    def _find_date_near_keyword(self, text: str, keywords: list[str]) -> date | None:
        for kw in keywords:
            m = re.search(re.escape(kw), text, re.IGNORECASE)
            if not m:
                continue
            snippet = text[m.end(): m.end() + 120]
            dt = self._parse_india_date(snippet)
            if dt:
                return dt
        return None
