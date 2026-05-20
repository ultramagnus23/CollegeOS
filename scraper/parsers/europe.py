"""
CollegeOS Scraper — Europe Parser
Covers:
  • UK: UCAS equal consideration deadline, late applications,
        clearing, scholarship deadlines per institution
  • Germany: uni-assist portals, Hochschulstart (NC programmes),
             WS / SS intake deadlines, APS certificate requirement
  • Netherlands: Studielink (binding + non-binding deadlines)
  • France: Parcoursup phase 1/2/3 + grandes écoles direct
  • Other Europe: direct college portals
"""

from __future__ import annotations

import re
import traceback
from datetime import date

import structlog
from bs4 import BeautifulSoup

from config import settings
from parsers.base import BaseParser, ParsedDeadline, ParsedRequirement

log = structlog.get_logger(__name__)

# ── Source URLs ───────────────────────────────────────────────────────────────
UCAS_SEARCH = "https://www.ucas.com/explore/search/results?query={name}&type=course"
UCAS_DEADLINES = "https://www.ucas.com/undergraduate/applying-university/when-apply/ucas-undergraduate-deadlines"

UNI_ASSIST_PORTAL = "https://my.uni-assist.de"
HOCHSCHULSTART_PORTAL = "https://hochschulstart.de"

STUDIELINK_INFO = "https://www.studielink.nl/en/"
PARCOURSUP_CALENDRIER = "https://www.parcoursup.gouv.fr/index.php?desc=calendrier"

# ── UCAS key deadlines (scraped but also hard-coded as fallback) ──────────────
# These change each cycle, so we always scrape first.
UCAS_FALLBACK_DEADLINES = {
    "oxford_cambridge": {"month": 10, "day": 15},
    "equal_consideration": {"month": 1, "day": 31},
    "extra": {"month": 5, "day": 6},
    "clearing": {"month": 9, "day": 30},
}

# ── Country helpers ───────────────────────────────────────────────────────────
COUNTRY_TO_REGION = {
    "GB": "uk",
    "DE": "germany",
    "NL": "netherlands",
    "FR": "france",
    "SE": "scandinavia",
    "NO": "scandinavia",
    "DK": "scandinavia",
    "FI": "scandinavia",
    "AT": "austria",
    "CH": "switzerland",
    "IT": "italy",
    "ES": "spain",
    "BE": "belgium",
    "IE": "ireland",
}

GERMAN_INTAKE = {
    "ws": {"intake_term": "fall", "label": "Wintersemester"},
    "ss": {"intake_term": "spring", "label": "Sommersemester"},
}


class EuropeParser(BaseParser):
    PARSER_NAME = "europe_parser"

    async def parse(
        self, institution: dict
    ) -> tuple[list[ParsedDeadline], ParsedRequirement | None]:
        inst_id = str(institution["id"])
        name = institution["name"]
        website = (institution.get("website_url") or "").rstrip("/")
        country_code = institution.get("country_code", "")
        ucas_id = institution.get("ucas_id")

        region = COUNTRY_TO_REGION.get(country_code, "other_europe")
        deadlines: list[ParsedDeadline] = []
        req: ParsedRequirement | None = None

        if region == "uk":
            try:
                dl, req = await self._parse_uk(inst_id, name, website, ucas_id)
                deadlines.extend(dl)
            except Exception:
                log.warning("uk_parse_failed", institution=name, tb=traceback.format_exc())

        elif region == "germany":
            try:
                dl, req = await self._parse_germany(inst_id, name, website)
                deadlines.extend(dl)
            except Exception:
                log.warning("de_parse_failed", institution=name, tb=traceback.format_exc())

        elif region == "netherlands":
            try:
                dl, req = await self._parse_netherlands(inst_id, name, website)
                deadlines.extend(dl)
            except Exception:
                log.warning("nl_parse_failed", institution=name, tb=traceback.format_exc())

        elif region == "france":
            try:
                dl, req = await self._parse_france(inst_id, name, website)
                deadlines.extend(dl)
            except Exception:
                log.warning("fr_parse_failed", institution=name, tb=traceback.format_exc())

        # Always try the direct admissions page as a supplement / fallback
        if website and (not deadlines or req is None):
            try:
                dl2, req2 = await self._parse_direct_europe(
                    inst_id, name, website, country_code
                )
                existing_types = {d.deadline_type for d in deadlines}
                for d in dl2:
                    if d.deadline_type not in existing_types:
                        deadlines.append(d)
                if req is None:
                    req = req2
            except Exception:
                log.warning("eu_direct_failed", institution=name)

        if req is None:
            req = self._default_eu_requirements(inst_id, country_code, website)

        return deadlines, req

    # ── UK / UCAS ─────────────────────────────────────────────────────────────

    async def _parse_uk(
        self, inst_id: str, name: str, website: str, ucas_id: str | None
    ) -> tuple[list[ParsedDeadline], ParsedRequirement | None]:
        # Get the UCAS-wide deadline page (shared deadline dates for all UK colleges)
        html = await self.fetch_html(UCAS_DEADLINES)
        soup = BeautifulSoup(html, "lxml") if html else None
        text = soup.get_text(" ", strip=True) if soup else ""

        deadlines: list[ParsedDeadline] = []

        # UCAS Equal consideration deadline (Jan 31 for most colleges)
        equal_cons_date = self._extract_ucas_deadline(
            text, ["equal consideration", "main deadline", "january deadline"]
        )
        if equal_cons_date:
            deadlines.append(self._ucas_deadline(
                inst_id, "ucas_equal_consideration", equal_cons_date,
                is_binding=False, confidence=92.0,
            ))

        # Oxford/Cambridge Oct 15 deadline
        oxbridge_date = self._extract_ucas_deadline(
            text, ["oxford", "cambridge", "15 october", "october deadline"]
        )
        if oxbridge_date and any(n in name.lower() for n in ("oxford", "cambridge")):
            deadlines.append(self._ucas_deadline(
                inst_id, "early_action", oxbridge_date,
                is_binding=False, confidence=95.0,
            ))

        # Institution-specific scholarship deadlines
        if website:
            schol_dl = await self._parse_uk_scholarships(inst_id, website)
            deadlines.extend(schol_dl)

        # Requirements: institution's own admissions page
        req = None
        if website:
            req = await self._parse_uk_requirements(inst_id, website)

        return deadlines, req

    async def _parse_uk_scholarships(
        self, inst_id: str, website: str
    ) -> list[ParsedDeadline]:
        for path in ["/scholarships", "/finance/scholarships", "/student-finance/scholarships"]:
            html = await self.fetch_html(website + path)
            if not html:
                continue
            text = BeautifulSoup(html, "lxml").get_text(" ", strip=True)
            schol_date = self.parse_date(
                self._snippet_near(text, ["scholarship deadline", "apply for scholarship", "closing date"])
            )
            if schol_date:
                return [ParsedDeadline(
                    institution_id=inst_id,
                    deadline_type="scholarship",
                    deadline_date=schol_date,
                    notification_date=None,
                    is_binding=False,
                    is_rolling=False,
                    is_estimated=False,
                    applicant_type="international",
                    degree_level="undergraduate",
                    intake_term="fall",
                    source_url=website + path,
                    source_domain=self.domain_of(website),
                    source_type="official",
                    confidence_score=72.0,
                    raw_payload={"type": "uk_scholarship"},
                    parser_trace={"parser": self.PARSER_NAME},
                )]
        return []

    async def _parse_uk_requirements(
        self, inst_id: str, website: str
    ) -> ParsedRequirement | None:
        for path in ["/international/apply", "/international/entry-requirements",
                     "/study/undergraduate/international", "/admissions/international"]:
            html = await self.fetch_html(website + path)
            if html and len(html) > 1500:
                return self._build_eu_requirements(
                    inst_id, html, website + path, "GB", "ucas"
                )
        return None

    def _ucas_deadline(
        self, inst_id: str, dl_type: str, dl_date: date,
        is_binding: bool, confidence: float,
    ) -> ParsedDeadline:
        return ParsedDeadline(
            institution_id=inst_id,
            deadline_type=dl_type,
            deadline_date=dl_date,
            notification_date=None,
            is_binding=is_binding,
            is_rolling=False,
            is_estimated=False,
            applicant_type="international",
            degree_level="undergraduate",
            intake_term="fall",
            source_url=UCAS_DEADLINES,
            source_domain="ucas.com",
            source_type="ucas",
            confidence_score=confidence,
            raw_payload={},
            parser_trace={"parser": self.PARSER_NAME, "source": "ucas"},
        )

    def _extract_ucas_deadline(self, text: str, keywords: list[str]) -> date | None:
        for kw in keywords:
            m = re.search(re.escape(kw), text, re.IGNORECASE)
            if not m:
                continue
            snippet = text[m.start(): m.end() + 150]
            dt = self.parse_date(snippet)
            if dt:
                return dt
        return None

    # ── Germany ───────────────────────────────────────────────────────────────

    async def _parse_germany(
        self, inst_id: str, name: str, website: str
    ) -> tuple[list[ParsedDeadline], ParsedRequirement | None]:
        deadlines: list[ParsedDeadline] = []
        req = None

        for path in ["/en/admissions", "/en/international/admission",
                     "/international/bewerbung", "/bewerbung"]:
            html = await self.fetch_html(website + path)
            if not html or len(html) < 1500:
                continue

            soup = BeautifulSoup(html, "lxml")
            text = soup.get_text(" ", strip=True)
            text_lower = text.lower()

            # Wintersemester deadline (WS — usually July 15 for NC, Oct 15 non-NC)
            ws_date = self._find_german_semester_deadline(text, "wintersemester", "ws")
            if ws_date:
                deadlines.append(self._german_deadline(
                    inst_id, ws_date, "fall", website + path
                ))

            # Sommersemester deadline (SS — usually Jan 15)
            ss_date = self._find_german_semester_deadline(text, "sommersemester", "ss")
            if ss_date:
                deadlines.append(self._german_deadline(
                    inst_id, ss_date, "spring", website + path
                ))

            # Check if uni-assist is required
            uni_assist_req = bool(re.search(r"uni-assist|uniassist", text_lower))

            req = self._build_eu_requirements(
                inst_id, html, website + path, "DE",
                "ucas" if not uni_assist_req else "official",
                uni_assist_req=uni_assist_req,
            )
            break

        return deadlines, req

    def _find_german_semester_deadline(
        self, text: str, term_long: str, term_short: str
    ) -> date | None:
        pattern = re.compile(
            rf"({re.escape(term_long)}|{re.escape(term_short)})[^.]*?"
            rf"(\d{{1,2}}[./\-]\d{{1,2}}[./\-]\d{{2,4}})",
            re.IGNORECASE,
        )
        m = pattern.search(text)
        if m:
            return self.parse_date(m.group(2))
        return None

    def _german_deadline(
        self, inst_id: str, dl_date: date, intake_term: str, source_url: str
    ) -> ParsedDeadline:
        return ParsedDeadline(
            institution_id=inst_id,
            deadline_type="regular_decision",
            deadline_date=dl_date,
            notification_date=None,
            is_binding=False,
            is_rolling=False,
            is_estimated=False,
            applicant_type="international",
            degree_level="undergraduate",
            intake_term=intake_term,
            source_url=source_url,
            source_domain=self.domain_of(source_url),
            source_type="official",
            confidence_score=78.0,
            raw_payload={"intake": intake_term},
            parser_trace={"parser": self.PARSER_NAME, "country": "DE"},
        )

    # ── Netherlands ───────────────────────────────────────────────────────────

    async def _parse_netherlands(
        self, inst_id: str, name: str, website: str
    ) -> tuple[list[ParsedDeadline], ParsedRequirement | None]:
        # Dutch binding deadline: May 1 for selective programmes
        # Non-binding: July 1
        html = await self.fetch_html(STUDIELINK_INFO)
        text = BeautifulSoup(html, "lxml").get_text(" ", strip=True) if html else ""

        # Try institution-specific page first
        inst_html = None
        for path in ["/en/study/admission", "/en/admission", "/english/admission"]:
            h = await self.fetch_html(website + path)
            if h and len(h) > 1500:
                inst_html = h
                break

        deadlines: list[ParsedDeadline] = []
        source_url = website
        final_html = inst_html or html or ""
        final_text = BeautifulSoup(final_html, "lxml").get_text(" ", strip=True) if final_html else ""

        # Look for "1 May" or "1 April" (numerus fixus)
        binding_date = self.parse_date(
            self._snippet_near(final_text, ["numerus fixus", "binding deadline", "1 may", "1 april"])
        )
        if binding_date:
            deadlines.append(ParsedDeadline(
                institution_id=inst_id,
                deadline_type="early_decision_1",
                deadline_date=binding_date,
                notification_date=None,
                is_binding=True,
                is_rolling=False,
                is_estimated=False,
                applicant_type="international",
                degree_level="undergraduate",
                intake_term="fall",
                source_url=source_url,
                source_domain=self.domain_of(source_url),
                source_type="official",
                confidence_score=80.0,
                raw_payload={"type": "numerus_fixus"},
                parser_trace={"parser": self.PARSER_NAME, "country": "NL"},
            ))

        # Regular deadline July 1
        regular_date = self.parse_date(
            self._snippet_near(final_text, ["1 july", "1 augustus", "non-binding", "regular"])
        )
        if regular_date:
            deadlines.append(ParsedDeadline(
                institution_id=inst_id,
                deadline_type="regular_decision",
                deadline_date=regular_date,
                notification_date=None,
                is_binding=False,
                is_rolling=False,
                is_estimated=False,
                applicant_type="international",
                degree_level="undergraduate",
                intake_term="fall",
                source_url=source_url,
                source_domain=self.domain_of(source_url),
                source_type="official",
                confidence_score=75.0,
                raw_payload={},
                parser_trace={"parser": self.PARSER_NAME, "country": "NL"},
            ))

        req = self._build_eu_requirements(
            inst_id, final_html, source_url, "NL", "official"
        ) if final_html else None

        return deadlines, req

    # ── France ────────────────────────────────────────────────────────────────

    async def _parse_france(
        self, inst_id: str, name: str, website: str
    ) -> tuple[list[ParsedDeadline], ParsedRequirement | None]:
        # Parcoursup phase calendar (shared dates)
        html = await self.fetch_html(PARCOURSUP_CALENDRIER)
        text = BeautifulSoup(html, "lxml").get_text(" ", strip=True) if html else ""

        deadlines: list[ParsedDeadline] = []

        # Phase 1 (main application window — Jan/Feb)
        phase1 = self.parse_date(
            self._snippet_near(text, ["phase 1", "phase principale", "formulation des voeux"])
        )
        if phase1:
            deadlines.append(ParsedDeadline(
                institution_id=inst_id,
                deadline_type="regular_decision",
                deadline_date=phase1,
                notification_date=None,
                is_binding=False,
                is_rolling=False,
                is_estimated=False,
                applicant_type="domestic",
                degree_level="undergraduate",
                intake_term="fall",
                source_url=PARCOURSUP_CALENDRIER,
                source_domain="parcoursup.gouv.fr",
                source_type="government",
                confidence_score=85.0,
                raw_payload={"phase": 1},
                parser_trace={"parser": self.PARSER_NAME, "country": "FR"},
            ))

        # Phase complémentaire (Phase 2 — June)
        phase2 = self.parse_date(
            self._snippet_near(text, ["phase complémentaire", "phase 2", "complementaire"])
        )
        if phase2:
            deadlines.append(ParsedDeadline(
                institution_id=inst_id,
                deadline_type="rolling",
                deadline_date=phase2,
                notification_date=None,
                is_binding=False,
                is_rolling=True,
                is_estimated=False,
                applicant_type="domestic",
                degree_level="undergraduate",
                intake_term="fall",
                source_url=PARCOURSUP_CALENDRIER,
                source_domain="parcoursup.gouv.fr",
                source_type="government",
                confidence_score=82.0,
                raw_payload={"phase": 2},
                parser_trace={"parser": self.PARSER_NAME, "country": "FR"},
            ))

        # Grandes écoles / direct applications
        inst_html = None
        for path in ["/international/admissions", "/en/admissions", "/admissions"]:
            h = await self.fetch_html(website + path)
            if h and len(h) > 1500:
                inst_html = h
                break

        req = self._build_eu_requirements(
            inst_id, inst_html or "", website, "FR", "official"
        ) if (inst_html or website) else None

        return deadlines, req

    # ── Generic European direct page ──────────────────────────────────────────

    async def _parse_direct_europe(
        self, inst_id: str, name: str, website: str, country_code: str
    ) -> tuple[list[ParsedDeadline], ParsedRequirement | None]:
        candidate_paths = [
            "/en/admissions", "/en/apply", "/international/apply",
            "/study/international", "/admissions",
        ]
        html = None
        used_url = None
        for path in candidate_paths:
            h = await self.fetch_html(website + path)
            if h and len(h) > 1500:
                html = h
                used_url = website + path
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
        date_keywords = [
            "application deadline", "apply by", "closing date",
            "last date to apply", "submission deadline",
        ]
        for kw in date_keywords:
            dt = self.parse_date(self._snippet_near(text, [kw]))
            if dt:
                deadlines.append(ParsedDeadline(
                    institution_id=inst_id,
                    deadline_type="regular_decision",
                    deadline_date=dt,
                    notification_date=None,
                    is_binding=False,
                    is_rolling=False,
                    is_estimated=False,
                    applicant_type="international",
                    degree_level="undergraduate",
                    intake_term="fall",
                    source_url=source_url,
                    source_domain=self.domain_of(source_url),
                    source_type="official",
                    confidence_score=65.0,
                    raw_payload={"keyword": kw},
                    parser_trace={"parser": self.PARSER_NAME, "country": country_code},
                ))
                break  # one good date is enough from direct scrape

        req = self._build_eu_requirements(
            inst_id, html, source_url, country_code, "official"
        )
        return deadlines, req

    # ── Shared EU requirements builder ────────────────────────────────────────

    def _build_eu_requirements(
        self,
        inst_id: str,
        html: str,
        source_url: str,
        country_code: str,
        source_type: str,
        uni_assist_req: bool = False,
    ) -> ParsedRequirement:
        soup = BeautifulSoup(html, "lxml")
        text = soup.get_text(" ", strip=True)
        text_lower = text.lower()

        ielts = bool(re.search(r"ielts", text_lower))
        toefl = bool(re.search(r"toefl", text_lower))
        duolingo = bool(re.search(r"duolingo", text_lower))
        cambridge = bool(re.search(r"cambridge\s+english|c1\s+advanced|cae\b", text_lower))

        ielts_min = self.extract_score(text, r"ielts[^0-9]*(\d\.\d|\d{1,2})")
        toefl_min = self.extract_score(text, r"toefl[^0-9]*(\d{2,3})")
        duolingo_min = self.extract_score(text, r"duolingo[^0-9]*(\d{2,3})")

        cv_required = bool(re.search(r"\bcv\b|\bcurriculum vitae\b|\bresume\b", text_lower))
        sop = bool(re.search(r"statement\s+of\s+purpose|motivation\s+letter|letter\s+of\s+motivation|sop\b", text_lower))
        portfolio = bool(re.search(r"portfolio", text_lower))

        teacher_recs = 2 if re.search(r"two\s+references|2\s+references|zwei\s+empfehlungsschreiben", text_lower) else (
            1 if re.search(r"one\s+reference|1\s+reference|reference\s+letter", text_lower) else 0
        )

        interview_req = bool(re.search(r"interview\s+required|mandatory\s+interview", text_lower))
        interview_opt = bool(re.search(r"interview\s+optional|may\s+be\s+invited\s+for", text_lower))

        ucas_supported = country_code == "GB"
        direct_apply = True

        aps_required = (country_code == "DE") and bool(
            re.search(r"\baps\b|academic\s+evaluation\s+center|akademische\s+prüfstelle", text_lower)
        )

        fin_docs = bool(re.search(r"financial\s+(proof|statement|guarantee|blocked\s+account|sperrkonto)", text_lower))
        passport = bool(re.search(r"passport\s+copy|copy\s+of\s+passport", text_lower))
        visa = bool(re.search(r"visa|residence\s+permit|aufenthaltserlaubnis", text_lower))

        return ParsedRequirement(
            institution_id=inst_id,
            cycle_year=settings.current_cycle_year,
            degree_level="undergraduate",
            applicant_type="international",

            sat_policy="not_used",
            act_policy="not_used",
            test_blind=False,
            sat_optional=False,
            sat_required=False,
            act_required=False,

            toefl_required=toefl,
            ielts_required=ielts,
            duolingo_required=duolingo,
            cambridge_required=cambridge,
            toefl_min_score=toefl_min,
            ielts_min_score=ielts_min,
            duolingo_min_score=duolingo_min,

            transcript_required=True,
            predicted_grades_required=bool(re.search(r"predicted\s+grade|prognosezeugnis", text_lower)),
            cv_required=cv_required,
            resume_required=cv_required,
            essays_required=sop,
            supplemental_essays_required=False,
            supplemental_essay_count=0,
            portfolio_required=portfolio,

            teacher_recommendations_required=teacher_recs,
            counselor_recommendation_required=False,

            interview_required=interview_req,
            interview_optional=interview_opt,

            common_app_supported=False,
            ucas_supported=ucas_supported,
            direct_apply_supported=direct_apply,
            application_platform="ucas" if ucas_supported else ("uni-assist" if uni_assist_req else "direct"),

            financial_documents_required=fin_docs,
            passport_required=passport,
            visa_documents_required=visa,

            aps_required=aps_required,
            uni_assist_required=uni_assist_req,

            source_url=source_url,
            source_domain=self.domain_of(source_url),
            source_type=source_type,
            confidence_score=75.0,
            raw_requirements_text=text[:2500],
            raw_payload={
                "country": country_code,
                "aps": aps_required,
                "uni_assist": uni_assist_req,
            },
            parser_trace={"parser": self.PARSER_NAME, "country": country_code},
        )

    def _default_eu_requirements(
        self, inst_id: str, country_code: str, website: str
    ) -> ParsedRequirement:
        return ParsedRequirement(
            institution_id=inst_id,
            cycle_year=settings.current_cycle_year,
            degree_level="undergraduate",
            applicant_type="international",
            sat_policy="not_used",
            act_policy="not_used",
            test_blind=False,
            sat_optional=False,
            sat_required=False,
            act_required=False,
            toefl_required=True,
            ielts_required=True,
            duolingo_required=False,
            transcript_required=True,
            predicted_grades_required=False,
            cv_required=False,
            essays_required=False,
            supplemental_essays_required=False,
            supplemental_essay_count=0,
            portfolio_required=False,
            teacher_recommendations_required=0,
            counselor_recommendation_required=False,
            interview_required=False,
            interview_optional=False,
            common_app_supported=False,
            ucas_supported=(country_code == "GB"),
            direct_apply_supported=True,
            financial_documents_required=True,
            passport_required=True,
            visa_documents_required=True,
            aps_required=(country_code == "DE"),
            uni_assist_required=(country_code == "DE"),
            source_url=website,
            source_domain=self.domain_of(website) if website else "",
            source_type="official",
            confidence_score=35.0,
            raw_requirements_text=None,
            raw_payload={"default": True, "country": country_code},
            parser_trace={"parser": self.PARSER_NAME, "note": "default"},
        )

    # ── Utility ───────────────────────────────────────────────────────────────

    def _snippet_near(self, text: str, keywords: list[str], window: int = 150) -> str:
        for kw in keywords:
            m = re.search(re.escape(kw), text, re.IGNORECASE)
            if m:
                return text[m.start(): m.end() + window]
        return ""
