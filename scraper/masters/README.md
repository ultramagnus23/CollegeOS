# Masters per-program scraper (Phase 2)

Builds CT's own program-level dataset by visiting each university's graduate-program
pages and working out **how each program actually admits** — not "find an API."
Mirrors the `scraper/indian/*` adapter → extractor → normalizer → pipeline pattern.
See `docs/MASTERS_TRACK_PLAN.md` (Phase 2).

## Layout

| Module | Role | State |
|---|---|---|
| `adapters/base_program_adapter.py` | program-list page → `ProgramRef`s | base + protocol (per-university subclasses TODO) |
| `extractors/program_requirements_extractor.py` | program page text → structured requirements + evaluation text | **runnable, pure** |
| `normalizers/pathway_taxonomy.py` | evaluation text → `masters_program_pathways` rows | **runnable, pure, tested** |
| `normalizers/program_normalizer.py` | assemble write-ready `masters_programs` record | **runnable, pure** |
| `pipelines/masters_ingestion_pipeline.py` | orchestrate adapter→extractor→normalizer | **runnable** (inject a fetcher) |
| `targets.py` | starter target list (US/UK/CA/DE/NL/AU/SG) | starter — CT to confirm/expand |

## What is runnable today vs needs live wiring

- **Runnable now (no network, no DB):** the extractor, both normalizers, and the
  pipeline orchestration — all pure functions. Unit-tested:
  ```
  python -m pytest scraper/masters/tests/test_pathway_taxonomy.py
  ```
- **Needs live wiring (not in this PR):** concrete per-university adapters, the HTTP
  fetcher (reuse the existing throttle/robots handling), and the Supabase/Postgres
  writer into `canonical.masters_programs` + child tables. These are integration
  points so the logic above stays testable and side-effect-free.

## Secondary / tertiary sources (Phase 2, later)

- **GradCafe** cross-check → `canonical.masters_admission_datapoints` (`source='gradcafe'`),
  always labelled "self-reported, N=X", never "acceptance rate". Needs caching +
  rate-limiting + ToS-aware fetch.
- **IPEDS / Scorecard Field-of-Study** by CIP × credential → program ROI + STEM
  derivation. Institution/field level only; never stands in for program chancing.
