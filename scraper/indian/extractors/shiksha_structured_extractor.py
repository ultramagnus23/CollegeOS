from __future__ import annotations

from typing import Dict, List

from bs4 import BeautifulSoup

from .base_extractor import BaseExtractor


class ShikshaStructuredExtractor(BaseExtractor):
    @staticmethod
    def _extract_many(soup: BeautifulSoup, selectors: List[str]) -> List[str]:
        values: List[str] = []
        for selector in selectors:
            for node in soup.select(selector):
                text = node.get_text(" ", strip=True)
                if text:
                    values.append(text)
        deduped = []
        seen = set()
        for value in values:
            key = value.lower()
            if key in seen:
                continue
            seen.add(key)
            deduped.append(value)
        return deduped

    def extract(self, soup: BeautifulSoup, selectors: Dict) -> Dict:
        return {
            "admissions": {
                "entrance_exams": self._extract_many(soup, selectors.get("entrance_exams", [])),
                "cutoff_ranges": self._extract_many(soup, selectors.get("cutoff_ranges", [])),
                "eligibility_criteria": self._extract_many(soup, selectors.get("eligibility_criteria", [])),
                "application_timelines": self._extract_many(soup, selectors.get("application_timelines", [])),
            },
            "fees": {
                "tuition": self._extract_many(soup, selectors.get("tuition", [])),
                "hostel_fees": self._extract_many(soup, selectors.get("hostel_fees", [])),
                "mess_fees": self._extract_many(soup, selectors.get("mess_fees", [])),
                "scholarships": self._extract_many(soup, selectors.get("scholarships", [])),
            },
            "placements": {
                "median_package": self._extract_many(soup, selectors.get("median_package", [])),
                "average_package": self._extract_many(soup, selectors.get("average_package", [])),
                "highest_package": self._extract_many(soup, selectors.get("highest_package", [])),
                "placement_rate": self._extract_many(soup, selectors.get("placement_rate", [])),
                "top_recruiters": self._extract_many(soup, selectors.get("top_recruiters", [])),
            },
            "academics": {
                "degrees_offered": self._extract_many(soup, selectors.get("degrees_offered", [])),
                "programs": self._extract_many(soup, selectors.get("programs", [])),
                "duration": self._extract_many(soup, selectors.get("duration", [])),
            },
            "rankings": {
                "nirf": self._extract_many(soup, selectors.get("nirf", [])),
                "qs_india": self._extract_many(soup, selectors.get("qs_india", [])),
                "times_india": self._extract_many(soup, selectors.get("times_india", [])),
                "outlook": self._extract_many(soup, selectors.get("outlook", [])),
                "india_today": self._extract_many(soup, selectors.get("india_today", [])),
            },
            "deadlines": {
                "application_opens": self._extract_many(soup, selectors.get("application_opens", [])),
                "application_closes": self._extract_many(soup, selectors.get("application_closes", [])),
                "scholarship_deadlines": self._extract_many(soup, selectors.get("scholarship_deadlines", [])),
            },
            "international": {
                "sat_acceptance": self._extract_many(soup, selectors.get("sat_acceptance", [])),
                "act_acceptance": self._extract_many(soup, selectors.get("act_acceptance", [])),
                "ap_acceptance": self._extract_many(soup, selectors.get("ap_acceptance", [])),
                "ib_acceptance": self._extract_many(soup, selectors.get("ib_acceptance", [])),
                "a_level_acceptance": self._extract_many(soup, selectors.get("a_level_acceptance", [])),
                "english_proficiency": self._extract_many(soup, selectors.get("english_proficiency", [])),
            },
        }
