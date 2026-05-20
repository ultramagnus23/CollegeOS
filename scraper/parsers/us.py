"""
CollegeOS Scraper — US Parser
Covers:
  • Common App member colleges (via Common App search API)
  • Direct admissions pages for all US institutions
  • Deadline types: EA, ED1, ED2, RD, Rolling, Priority, Scholarship
  • Requirements: SAT/ACT policy, essays, recommendations, interviews
"""

from __future__ import annotations

import json
import re
import traceback
from datetime import date
from typing import Any
from urllib.parse import urljoin, urlparse

import structlog
from bs4 import BeautifulSoup

from config import settings
from parsers.base import BaseParser, ParsedDeadline, ParsedRequirement

log = structlog.get_logger(__name__)

# ─── Common App API ───────────────────────────────────────────────────────────
COMMON_APP_SEARCH = (
    "https://www.commonapp.org/api/v1/college-search"
    "?name={name}&pageSize=5&pageNumber=1"
)

COMMON_APP_COLLEGE = (
    "https://www.commonapp.org/explore/college-detail/{slug}"
)

# ─── Deadline keyword patterns ────────────────────────────────────────────────
_DL_PATTERNS: list[tuple[str, str]] = [
    (r"early\s*decision\s*(i{1,2}|1|2|ii)\b", ""),   # handled below
    (r"early\s*action", "early_action"),
    (r"regular\s*decision", "regular_decision"),
    (r"rolling\s*admission", "rolling"),
    (r"priority\s*deadline", "priority"),
    (r"scholarship\s*deadline", "scholarship"),
    (r"transfer\s*deadline", "transfer"),
]

_SCORE_PATTERNS = {
    "toefl": r"toefl[^0-9]*(\d{2,3})",
    "ielts": r"ielts[^0-9]*(\d\.\d|\d{1,2})",
    "duolingo": r"duolingo[^0-9]*(\d{2,3})",
    "sat": r"sat[^0-9]*(\d{3,4})",
    "act": r"act[^0-9]*(\d{1,2})",
}


def _classify_deadline_type(text: str) -> str:
    text_lower = text.lower()
    if re.search(r"early\s*decision\s*(ii|2)\b", text_lower):
        return "early_decision_2"
    if re.search(r"early\s*decision", text_lower):
        return "early_decision_1"
    for pattern, label in _DL_PATTERNS[1:]:
        if re.search(pattern, text_lower):
            return label
    return "regular_decision"


class USParser(BaseParser):
    PARSER_NAME = "us_parser"

    # ── Public entry point ────────────────────────────────────────────────────

    async def parse(
        self, institution: dict
    ) -> tuple[list[ParsedDeadline], ParsedRequirement | None]:
        inst_id = str(institution["id"])
        name = institution["name"]
        website = institution.get("website_url") or ""
        common_app_id = institution.get("common_app_id")

        deadlines: list[ParsedDeadline] = []
        req: ParsedRequirement | None = None

        # Strategy 1: Common App (highest confidence)
        if common_app_id:
            try:
                ca_deadlines, ca_req = await self._parse_common_app(
                    inst_id, name, common_app_id, website
                )
                deadlines.extend(ca_deadlines)
                if ca_req:
                    req = ca_req
            except Exception:
                log.warning("common_app_failed", institution=name, tb=traceback.format_exc())

        # Strategy 2: Direct admissions page
        if website:
            try:
                direct_dl, direct_req = await self._parse_direct(
                    inst_id, name, website
                )
                # Only fill gaps — don't overwrite Common App data
                existing_types = {d.deadline_type for d in deadlines}
                for d in direct_dl:
                    if d.deadline_type not in existing_types:
                        deadlines.append(d)
                if req is None and direct_req:
                    req = direct_req
            except Exception:
                log.warning("direct_parse_failed", institution=name, tb=traceback.format_exc())

        return deadlines, req

    # ── Common App ────────────────────────────────────────────────────────────

    async def _parse_common_app(
        self, inst_id: str, name: str, common_app_id: str, website: str
    ) -> tuple[list[ParsedDeadline], ParsedRequirement | None]:
        """
        Hit the Common App search API to get the college profile page URL,
        then scrape the deadline table from it.
        """
        search_url = COMMON_APP_SEARCH.format(name=name.replace(" ", "+"))
        html = await self.fetch_html(search_url)
        if not html:
            return [], None

        # Common App returns JSON embedded in the page
        soup = BeautifulSoup(html, "lxml")
        deadlines: list[ParsedDeadline] = []
        req: ParsedRequirement | None = None

        # Try to find the college detail page via the slug
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if "college-detail" in href and common_app_id in href:
                detail_url = urljoin("https://www.commonapp.org", href)
                deadlines, req = await self._scrape_common_app_detail(
                    inst_id, detail_url, website
                )
                break

        # If slug not found, fall back to known URL format
        if not deadlines:
            slug = common_app_id
            detail_url = COMMON_APP_COLLEGE.format(slug=slug)
            deadlines, req = await self._scrape_common_app_detail(
                inst_id, detail_url, website
            )

        return deadlines, req

    async def _scrape_common_app_detail(
        self, inst_id: str, url: str, fallback_website: str
    ) -> tuple[list[ParsedDeadline], ParsedRequirement | None]:
        html = await self.fetch_playwright(url)
        if not html:
            return [], None

        soup = BeautifulSoup(html, "lxml")
        text = soup.get_text(" ", strip=True)
        deadlines = self._extract_deadline_rows(soup, text, inst_id, url, "common_app", 95.0)
        req = self._extract_requirements(soup, text, inst_id, url, "common_app", 95.0)
        return deadlines, req

    # ── Direct page ───────────────────────────────────────────────────────────

    async def _parse_direct(
        self, inst_id: str, name: str, website: str
    ) -> tuple[list[ParsedDeadline], ParsedRequirement | None]:
        """
        Find the admissions page from the college's own website.
        We try several common URL patterns.
        """
        candidate_paths = [
            "/admissions/dates-deadlines",
            "/admissions/deadlines",
            "/admissions/apply/deadlines",
            "/undergraduate-admissions/deadlines",
            "/apply/deadlines",
            "/admissions/apply",
            "/admissions",
        ]
        base = website.rstrip("/")
        html = None
        used_url = None

        for path in candidate_paths:
            try_url = base + path
            html = await self.fetch_html(try_url)
            if html and len(html) > 2000:
                used_url = try_url
                break

        # If none worked, try homepage and look for admissions link
        if not html:
            home_html = await self.fetch_html(base)
            if home_html:
                admissions_url = self._find_admissions_link(home_html, base)
                if admissions_url:
                    html = await self.fetch_html(admissions_url)
                    used_url = admissions_url

        if not html:
            return [], None

        soup = BeautifulSoup(html, "lxml")
        text = soup.get_text(" ", strip=True)
        source_url = used_url or website

        deadlines = self._extract_deadline_rows(soup, text, inst_id, source_url, "official", 70.0)
        req = self._extract_requirements(soup, text, inst_id, source_url, "official", 70.0)
        return deadlines, req

    # ── Deadline extraction ───────────────────────────────────────────────────

    def _extract_deadline_rows(
        self,
        soup: BeautifulSoup,
        text: str,
        inst_id: str,
        source_url: str,
        source_type: str,
        confidence: float,
    ) -> list[ParsedDeadline]:
        results: list[ParsedDeadline] = []
        seen_types: set[str] = set()

        # Strategy A: look for tables
        for table in soup.find_all("table"):
            rows = table.find_all("tr")
            for row in rows:
                cells = [td.get_text(" ", strip=True) for td in row.find_all(["td", "th"])]
                if len(cells) < 2:
                    continue
                label = cells[0]
                value = cells[1] if len(cells) > 1 else ""
                dl_type = _classify_deadline_type(label)
                dt = self.parse_date(value)
                if dt and dl_type not in seen_types:
                    seen_types.add(dl_type)
                    results.append(self._make_deadline(
                        inst_id, dl_type, dt, source_url, source_type, confidence, label
                    ))

        # Strategy B: scan all text lines for date patterns near deadline keywords
        if not results:
            date_pattern = re.compile(
                r"(january|february|march|april|may|june|july|august|september"
                r"|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?"
                r"(?:[,\s]+20\d\d)?",
                re.IGNORECASE,
            )
            lines = [l.strip() for l in text.split("\n") if l.strip()]
            for i, line in enumerate(lines):
                context = " ".join(lines[max(0, i-2): i+3])
                dates_found = date_pattern.findall(context)
                if not dates_found:
                    continue
                dl_type = _classify_deadline_type(context)
                dt = self.parse_date(dates_found[0])
                if dt and dl_type not in seen_types:
                    seen_types.add(dl_type)
                    results.append(self._make_deadline(
                        inst_id, dl_type, dt, source_url, source_type,
                        confidence * 0.85,  # lower confidence for text match
                        context[:200],
                    ))

        return results

    def _make_deadline(
        self,
        inst_id: str,
        dl_type: str,
        dl_date: date,
        source_url: str,
        source_type: str,
        confidence: float,
        raw_label: str = "",
    ) -> ParsedDeadline:
        return ParsedDeadline(
            institution_id=inst_id,
            deadline_type=dl_type,
            deadline_date=dl_date,
            notification_date=None,
            is_binding=(dl_type in ("early_decision_1", "early_decision_2")),
            is_rolling=(dl_type == "rolling"),
            is_estimated=False,
            applicant_type="domestic",
            degree_level="undergraduate",
            intake_term="fall",
            source_url=source_url,
            source_domain=self.domain_of(source_url),
            source_type=source_type,
            confidence_score=confidence,
            raw_payload={"raw_label": raw_label, "raw_date": str(dl_date)},
            parser_trace={"parser": self.PARSER_NAME, "version": settings.scraper_version},
        )

    # ── Requirements extraction ───────────────────────────────────────────────

    def _extract_requirements(
        self,
        soup: BeautifulSoup,
        text: str,
        inst_id: str,
        source_url: str,
        source_type: str,
        confidence: float,
    ) -> ParsedRequirement | None:
        text_lower = text.lower()

        # ── Testing policy ────────────────────────────────────────────────────
        test_blind = bool(re.search(r"test[- ]blind|no[t]?\s+consider\s+test", text_lower))
        test_optional = bool(re.search(r"test[- ]optional|testing\s+optional", text_lower))
        test_required = not test_blind and not test_optional

        if test_blind:
            sat_policy = act_policy = "blind"
        elif test_optional:
            sat_policy = act_policy = "optional"
        else:
            sat_policy = "required" if re.search(r"\bsat\b", text_lower) else "optional"
            act_policy = "required" if re.search(r"\bact\b", text_lower) else "optional"

        # ── Essays ────────────────────────────────────────────────────────────
        essays_required = bool(re.search(r"essay|personal\s+statement|writing\s+sample", text_lower))
        supp_count_match = re.search(r"(\d+)\s+supplemental\s+essay", text_lower)
        supp_count = int(supp_count_match.group(1)) if supp_count_match else 0

        # ── Recommendations ───────────────────────────────────────────────────
        rec_match = re.search(r"(\d+)\s+(teacher|academic)\s+recommendation", text_lower)
        teacher_recs = int(rec_match.group(1)) if rec_match else 0
        counselor_rec = bool(re.search(r"counselor\s+recommendation|school\s+report", text_lower))

        # ── Interviews ────────────────────────────────────────────────────────
        interview_req = bool(re.search(r"interview\s+required|required\s+interview", text_lower))
        interview_opt = bool(re.search(r"interview\s+(optional|recommended)", text_lower))

        # ── English proficiency ───────────────────────────────────────────────
        toefl_required = bool(re.search(r"toefl", text_lower))
        ielts_required = bool(re.search(r"ielts", text_lower))
        duolingo_required = bool(re.search(r"duolingo", text_lower))

        toefl_min = self.extract_score(text, _SCORE_PATTERNS["toefl"])
        ielts_min = self.extract_score(text, _SCORE_PATTERNS["ielts"])
        duolingo_min = self.extract_score(text, _SCORE_PATTERNS["duolingo"])

        # ── Application platforms ─────────────────────────────────────────────
        common_app = bool(re.search(r"common\s+app", text_lower))
        coalition = bool(re.search(r"coalition\s+app", text_lower))

        # ── International docs ────────────────────────────────────────────────
        fin_docs = bool(re.search(r"financial\s+(certification|statement|guarantee)", text_lower))
        visa_docs = bool(re.search(r"i-20|visa|sevis", text_lower))

        return ParsedRequirement(
            institution_id=inst_id,
            cycle_year=settings.current_cycle_year,
            degree_level="undergraduate",
            applicant_type="international",

            sat_policy=sat_policy,
            act_policy=act_policy,
            sat_required=test_required,
            act_required=test_required,
            sat_optional=test_optional,
            test_blind=test_blind,

            toefl_required=toefl_required,
            ielts_required=ielts_required,
            duolingo_required=duolingo_required,
            toefl_min_score=toefl_min,
            ielts_min_score=ielts_min,
            duolingo_min_score=duolingo_min,

            transcript_required=True,
            essays_required=essays_required,
            supplemental_essays_required=(supp_count > 0),
            supplemental_essay_count=supp_count,

            teacher_recommendations_required=teacher_recs,
            counselor_recommendation_required=counselor_rec,

            interview_required=interview_req,
            interview_optional=interview_opt,

            common_app_supported=common_app,
            coalition_app_supported=coalition,
            direct_apply_supported=True,

            financial_documents_required=fin_docs,
            visa_documents_required=visa_docs,

            source_url=source_url,
            source_domain=self.domain_of(source_url),
            source_type=source_type,
            confidence_score=confidence,
            raw_requirements_text=text[:3000],
            raw_payload={
                "test_blind": test_blind,
                "test_optional": test_optional,
                "essays": essays_required,
                "teacher_recs": teacher_recs,
            },
            parser_trace={"parser": self.PARSER_NAME},
        )

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _find_admissions_link(html: str, base: str) -> str | None:
        soup = BeautifulSoup(html, "lxml")
        for a in soup.find_all("a", href=True):
            href = a["href"]
            text = a.get_text(strip=True).lower()
            if any(kw in text for kw in ("admissions", "apply", "deadlines")):
                return urljoin(base, href)
        return None
