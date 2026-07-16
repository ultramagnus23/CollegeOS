# r/collegeresults extraction pipeline

Fetch → scrub PII → hash → extract (regex + LLM) → validate → CSV of
`(applicant × college → decision)` rows. Collection runs under **your** Reddit
API credentials, within official rate limits. It is not a full-history harvester.

## Files
- `schema.py`  — Pydantic contract / training-row grain
- `scrub.py`   — PII scrub + salted HMAC id + income coarsening
- `extract.py` — regex (templated posts) + LLM stub (prose posts)
- `run.py`     — end-to-end runner (PRAW fetch → CSV)
- `demo.py`    — offline proof on a synthetic post (no Reddit, no API key)

## Quick start (offline demo)
```bash
pip install pydantic
export CR_SALT="$(openssl rand -hex 16)"
python demo.py
```

## Real collection
1. Create a Reddit "script" app: https://www.reddit.com/prefs/apps → note client id/secret.
2. Set env vars:
   ```bash
   export CR_SALT="$(openssl rand -hex 16)"          # keep secret, stable across runs
   export REDDIT_CLIENT_ID=...   REDDIT_CLIENT_SECRET=...
   export REDDIT_USER_AGENT="cr-research/0.1 by u/yourname"
   pip install praw pydantic
   ```
3. Run: `python run.py`  (add `--llm` once the LLM path is wired).

## Realistic volume (be honest with yourself)
The official API caps each listing (`top`/`new`/`hot`) near **1,000 items**.
Sweeping several listings + dedupe → **~1–3k recent structured posts**, which
explode to **~10–25k decision rows** (avg ~8 colleges/post). To go deeper into
history you'd need Arctic Shift full dumps — that is the ToS-gray path; decide
deliberately, don't drift into it.

## LLM path (implemented — extract.py → extract_llm)
Prose posts (the majority) go through the Anthropic SDK's structured-output path:
`client.messages.parse(..., output_format=Applicant)` — the Pydantic schema IS the
contract, so the response is validated against your table automatically.
- `claude-opus-4-8` for hard prose posts (default); `claude-haiku-4-5` for cheap bulk
- No sampling params (removed on Opus 4.8/Haiku 4.5); rules live in the system prompt:
  output `null` when not stated (never guess), never copy verbatim text, strip
  school/org/personal names, assign `ec_tier` by `extract.EC_TIER_RUBRIC`.
- Client is lazily constructed, so the regex/demo path still runs with no SDK/API key.
- Refusals or empty parses return an empty `Applicant()` rather than crashing the batch.

Enable it: `python run.py --llm` (add `--bulk` to route prose posts through Haiku).
Auth: `export ANTHROPIC_API_KEY=...` or `ant auth login` (the SDK resolves either).

## Ethics guardrails (already enforced in code, don't remove)
- `scrub_text` runs before the extractor/LLM ever sees text.
- Only a salted hash of the post id is stored — no username, no raw id.
- Income coarsened to 4 bands; geography kept at region/country, never city.
- No verbatim essay/EC text persisted — only LLM abstractive summaries.
- Add a periodic re-crawl that drops rows whose source post was deleted.

## Known bias (document it in your paper/model card)
Self-selected, high-stat, outcome-interesting posters → labels over-represent
strong profiles and surprising results. Recalibrate predicted per-school admit
rates against IPEDS/CDS aggregates (isotonic/Platt) before trusting probabilities.
