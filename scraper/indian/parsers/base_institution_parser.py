from __future__ import annotations

from typing import Dict


class BaseInstitutionParser:
    def parse(self, html: str, source_config: Dict) -> Dict:  # pragma: no cover - interface
        raise NotImplementedError
