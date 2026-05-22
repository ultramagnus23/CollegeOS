# Indian Intelligence Ingestion Framework

This module ingests structured Indian college metadata and explicitly excludes review/editorial/user-generated longform content.

## Components

- `adapters/` source adapters with retry + rate control
- `parsers/` config-driven institution parser
- `extractors/` structured field extractors
- `normalizers/` Indian money/date/percent/exam normalization and institution alias resolution
- `validators/` legal/compliance + payload validation
- `pipelines/` queue-based ingestion, stale detection, dead-letter handling, and Supabase batch upserts
- `sources/*.yaml` source policy, selectors, extraction/rate/retry/confidence config
- `tests/` parser/schema/retry/malformed payload coverage

## Execution

Set:
- `SUPABASE_DB_URL`
- `SCRAPE_MODE` (`weekly` or `monthly`)
- `SCRAPER_DIAGNOSTICS_DIR`

Run:

```bash
python -m scraper.indian.pipelines.run_india_refresh
```
