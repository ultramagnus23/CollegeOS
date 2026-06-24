"""Per-university program-list adapter (base).

An adapter turns a university's graduate-program LISTING page into a list of
individual program page URLs + minimal identity (program name, degree type,
department). Concrete adapters subclass this — one per target university — and
implement ``list_programs``. Mirrors scraper/indian/adapters/base_source_adapter.

This base is intentionally transport-agnostic; an HTTP adapter would fetch with
the shared throttle/robots handling already used by the existing scrapers.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Protocol


@dataclass(frozen=True)
class ProgramRef:
    """Minimal identity for one program before its page is extracted."""

    institution_name: str
    institution_country: str
    program_name: str
    degree_type: str  # 'MS' | 'MA' | 'MBA'
    program_url: str
    department: str | None = None
    canonical_institution_id: str | None = None


class ProgramListAdapter(Protocol):
    """Contract every per-university adapter implements."""

    institution_name: str
    institution_country: str

    def list_programs(self) -> List[ProgramRef]:
        """Return the in-scope MS/MA/MBA programs for this university."""
        ...


class BaseProgramAdapter:
    """Convenience base with the shared identity fields."""

    institution_name: str = ""
    institution_country: str = ""
    canonical_institution_id: str | None = None

    def list_programs(self) -> List[ProgramRef]:  # pragma: no cover - scaffold
        raise NotImplementedError(
            "Concrete per-university adapters implement list_programs(). "
            "See scraper/masters/README.md for the target list."
        )
