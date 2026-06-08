from __future__ import annotations

from bs4 import BeautifulSoup


class BaseExtractor:
    def extract(self, soup: BeautifulSoup, selectors: dict) -> dict:  # pragma: no cover - interface
        raise NotImplementedError
