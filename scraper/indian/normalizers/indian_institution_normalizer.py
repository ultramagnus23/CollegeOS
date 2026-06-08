from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import Dict, List


class IndianInstitutionNormalizer:
    def __init__(self):
        self._aliases: Dict[str, str] = {}

    @staticmethod
    def _canonicalize_name(name: str) -> str:
        token = (name or "").strip().lower()
        token = token.replace("indian institute of technology", "iit")
        token = token.replace("national institute of technology", "nit")
        token = token.replace("indian institute of information technology", "iiit")
        token = re.sub(r"[^a-z0-9 ]+", " ", token)
        token = re.sub(r"\s+", " ", token).strip()
        return token

    @staticmethod
    def _acronym(name: str) -> str:
        letters = [part[0] for part in re.split(r"\s+", name or "") if part and part[0].isalpha()]
        return "".join(letters).upper()

    def register_aliases(self, canonical_name: str, aliases: List[str]):
        canonical_token = self._canonicalize_name(canonical_name)
        self._aliases[canonical_token] = canonical_name
        for alias in aliases:
            self._aliases[self._canonicalize_name(alias)] = canonical_name
            self._aliases[self._acronym(alias).lower()] = canonical_name
        self._aliases[self._acronym(canonical_name).lower()] = canonical_name

    def resolve(self, name: str, city: str | None = None, state: str | None = None) -> str:
        _ = city, state
        token = self._canonicalize_name(name)
        acronym = self._acronym(name).lower()

        if token in self._aliases:
            return self._aliases[token]
        if acronym in self._aliases:
            return self._aliases[acronym]

        best_score = 0.0
        best_name = name
        for alias_token, canonical in self._aliases.items():
            score = SequenceMatcher(None, token, alias_token).ratio()
            if score > best_score:
                best_score = score
                best_name = canonical

        return best_name if best_score >= 0.8 else name
