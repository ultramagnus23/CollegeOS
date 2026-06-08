from __future__ import annotations

from typing import Dict, List

from bs4 import BeautifulSoup

from ..extractors.shiksha_structured_extractor import ShikshaStructuredExtractor
from .base_institution_parser import BaseInstitutionParser


class ConfigInstitutionParser(BaseInstitutionParser):
    def __init__(self):
        self.extractor = ShikshaStructuredExtractor()

    @staticmethod
    def _extract_text(soup: BeautifulSoup, selectors: List[str]) -> str | None:
        for selector in selectors:
            node = soup.select_one(selector)
            if node:
                text = node.get_text(" ", strip=True)
                if text:
                    return text
        return None

    def parse(self, html: str, source_config: Dict) -> Dict:
        soup = BeautifulSoup(html or "", "html.parser")
        selectors = source_config.get("selectors", {})

        identity = {
            "name": self._extract_text(soup, selectors.get("college_name", [])),
            "website": self._extract_text(soup, selectors.get("website", [])),
            "city": self._extract_text(soup, selectors.get("city", [])),
            "state": self._extract_text(soup, selectors.get("state", [])),
            "ownership_type": self._extract_text(soup, selectors.get("ownership_type", [])),
            "institution_category": self._extract_text(soup, selectors.get("institution_category", [])),
            "accreditation": self._extract_text(soup, selectors.get("accreditation", [])),
            "establishment_year": self._extract_text(soup, selectors.get("establishment_year", [])),
        }

        extracted = self.extractor.extract(soup, selectors)
        return {
            "identity": identity,
            **extracted,
        }
