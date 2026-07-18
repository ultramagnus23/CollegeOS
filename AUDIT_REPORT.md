# CollegeOS Full-System Audit — Report & Remediation Plan

Branch: `audit/full-system-2026-07` · Date: 2026-07-18 · Scope: Phases 0–5 (READ-ONLY). No schema, file, or code changes were made. Every figure traces to a command in `audit/01_repo.md`–`audit/04_redundancy.md`.

> **Prompt premises that turned out to be wrong** (verified against the live repo/DB, per "verify, don't assume"): the stack is **Vite/React + Node/Express**, not Next.js/FastAPI; **pgvector is not used** (embeddings stored as data, cosine in app — matches the constraint); tables number **123**, not ~179; and **enrichment workflows are green**, not failing on Supabase connectivity.

---

## 1. Executive summary (10 findings, each with its number)

1. **The college detail page is broken by contract drift** — backend `/api/colleges/:id` returns the canonical **nested** shape `{institution:{canonical_name…}, admissions, deadlines, rankings…}` but `src/pages/CollegeDetails.tsx` still reads a **legacy flat** shape (`name`, `location`, `acceptance_rate`, `ranking`). Result: every detail page shows "Unknown"/blank for **all** colleges regardless of data. Confirmed live in-browser + by `curl … | keys`. *(Broken code — highest user impact.)*
2. **Detail open fires a 404 then retries** — card `slug` (`<name>-<uuid>`) ≠ the detail endpoint's slug resolver (canonical `<name>-<country>`); `GET /api/colleges/harvard-university-<uuid>` → 404, then UUID retry → 200. Wasted round-trip on every open.
3. **No live connectivity blocker.** Data workflows run **green on schedule** (Canonical Refresh ✅×6, Scorecard ✅×6, etc. via `gh run list`). The local `DATABASE_URL` already uses the **IPv4 pooler `:6543`**. The one red run (`global-data-refresh`) failed on `ERROR No QS rows; aborting` (`pipefail`) — **scraper source brittleness, not the database.**
4. **Deadline coverage = 2.7%** (262 / 9,848 institutions; GB 14.7%, US 2.0%, IE 0%). Root cause: the scalable **CDS PDF parser (`cdsDeadlines`, 241 targets) is coded and registered but wired into no workflow** — only the hand-curated ~31-institution HTML tier is scheduled. Common App tier unbuilt; UCAS tier is a frozen one-shot.
5. **Two parallel data models.** `public.college*` (legacy, ~16 tables) duplicates `canonical.institution*`; **`public.colleges` is still queried at runtime** by `College.js`, `Application.js`, `deadlines.js`, `mlService.js`, schedulers. The frontend reads `canonical`; the backend still reads `public`. This is the core sprawl driver.
6. **49 of 123 tables are completely empty** (18 canonical scaffolding + 31 public), and **21 have zero code references** — but 4 zero-ref tables are populated + RPC-consumed (`institution_search_index`, `institution_aliases`) and must not be blind-dropped.
7. **~397 duplicate institution groups** in `canonical.institutions` by normalized name+country (some legitimate shared-name campuses — needs triage against `institution_identity_map`).
8. **RLS gaps:** 29/74 public tables have RLS disabled; `public.chancing_audit_log` is RLS-enabled with **zero policies** (silently blocks the anon client).
9. **Branch sprawl:** 134 remote branches, ~90 abandoned `copilot/*` (1,200–1,500 commits behind); `origin/master` is a diverged legacy default. Only `feat/undergrad-masters-followups` (21 ahead) carries clear unmerged work.
10. **Code redundancy is minor:** duplication **2.78%** (jscpd), ~180 genuine unused TS exports, 36 Python unused imports, 0 unused frontend deps. The redundancy is **structural (data model), not code volume.** *(Also: rec pipeline logs a check for `OPENAI_API_KEY`/`EMBEDDING_MODEL` — verify it's vestigial and can't trigger a paid call, per the zero-LLM constraint; and `scholarships` vs `scholarships_new` probing still lingers.)*

---

## 2. Table disposition matrix
Full per-table matrix in **[`audit/table_disposition.md`](audit/table_disposition.md)**. Tally: **KEEP ≈ 49** (22 canonical core + 27 live public app), **ARCHIVE ≈ 52** (empty scaffolding + legacy-dead + merge residue), **MERGE 11** (legacy `public.college*` → canonical, gated on backend migration), **INVESTIGATE ≈ 11**. The <50 KEEP target **is reachable** — immediately for the ~42 empty tables; the 11 MERGE tables only after backend readers move to canonical.

---

## 3. Ranked fix list (impact ÷ effort)

| # | Fix | Files/tables | Impact | Effort | Risk | Rollback |
|---|---|---|---|---|---|---|
| **1** | **Repair the detail-page contract** — map `CollegeDetails.tsx` to the canonical nested response (or add a compatibility adapter in the API/service layer). Restores name, location, acceptance, rankings, **and deadlines** on every college page. | `src/pages/CollegeDetails.tsx`, `src/services/api.ts`, maybe `backend/src/routes/colleges.js` | **Very high** (fixes the primary broken flow for all colleges) | Medium | Low | Revert commit; page already broken |
| **2** | **Fix slug resolution** — make the detail endpoint resolve the card's `<name>-<uuid>` slug (or have cards link by UUID). Removes the 404 retry. | `backend/src/routes/colleges.js`, card link builder | High | Low | Low | Revert |
| **3** | **Schedule the CDS deadline parser** — add `node scripts/runScraper.js cdsDeadlines` step to `deadlines-requirements-refresh.yml` (dry-run first to confirm yield). Activates 241-target coverage. | `.github/workflows/deadlines-requirements-refresh.yml` | High (deadline coverage is the headline data gap) | Low | Low (adapter exists) | Remove the step |
| **4** | **Harden scraper source steps** — replace `pipefail`-abort-on-0-rows with warn+skip so one dead source (QS) doesn't fail the whole workflow. | `global-data-refresh.yml`, source scripts | Medium | Low | Low | Revert |
| **5** | **Archive the ~42 empty + 5 legacy-dead tables** — `alter table … set schema archive` (reversible). Reclaims ~47 MB incl. `college_majors` (35 MB dead). | 47 tables | Medium (count 123→~76, cleaner schema) | Low | Low | `set schema public` |
| **6** | **Migrate backend readers off `public.colleges` → canonical**, then MERGE/archive the 11 legacy `college*` tables. | `College.js`, `Application.js`, `deadlines.js`, `signals.js`, `mlService.js`, schedulers | High (retires the dual model; count →~50) | **High** | **Medium** (hidden consumers) | Per-batch migration rollback + code revert |
| **7** | **RLS hygiene** — add/inspect policy on `chancing_audit_log`; review 29 RLS-off public tables holding any user data. | policies | Medium (security) | Low | Low | Drop policy |
| **8** | **Branch cleanup** — delete merged/ancient `copilot/*`, retire `origin/master`; review `feat/undergrad-masters-followups`. | git remote | Low (hygiene) | Low | Low | Branches recoverable by SHA |
| **9** | **Code cleanup** — `ruff --fix` (36 imports), prune confirmed dead TS exports, remove `scholarships_new` probe, dedup scraper base class. | scattered | Low | Low | Low | Revert |
| **10** | **Dedup institutions** — triage 397 name+country groups vs identity_map; merge true dups. | `canonical.institutions` | Medium | Medium | Medium | Merge-history archive |

Note: the prompt expected the connectivity fix to be #1; **evidence says connectivity isn't broken**, so #1 is the detail-page contract repair — the actual thing blocking users.

---

## 4. Proposed migration sequence (batched, each independently reversible)

Precondition: `pg_dump` schema + full dumps of every MERGE/ARCHIVE table; commit the dump **manifest** to this branch. Create `archive` schema.

- **Batch A — Empty scaffolding (zero-risk):** `set schema archive` for the ~42 tables with 0 rows and no populated dependents (canonical `*_admissions_profile`, `*_financial_*`, `stg_*`, public empty ML/contribution/scraped tables). Rollback: `set schema public`. Re-run core flows.
- **Batch B — Legacy-dead data:** archive `colleges_legacy`, `college_majors`, `college_programs`, `career_outcomes_detail`, `academic_outcomes` (0 live rows or 0 refs). Reclaims ~47 MB. Rollback: `set schema public`.
- **Batch C — Merge residue:** archive `canonical.*_merge_archive` + `institution_merge_history`. Rollback trivial.
- **Batch D — Backend cutover (code + data, gated):** migrate each `public.colleges*` reader to canonical **one module at a time**, verify, then archive that legacy table. This is where "hidden consumer" surprises live — stop the batch and ask if one appears.
- **Batch E — INVESTIGATE resolution:** confirm RPC/view consumers of `institution_search_index`/`institution_aliases` before any action; decide masters/history scaffolding per feature roadmap.

Each batch = one migration file in `backend/migrations/` (the live migration dir — **not** `supabase/migrations/`, which is near-empty) with an explicit `-- ROLLBACK` block. Re-run search→detail→chancing after each.

---

## STOP — awaiting approval

Phases 0–5 complete and read-only. **I have not proceeded to Phase 6 (implementation).** Nothing in the DB, schema, or code was changed; the audit branch holds only the five `audit/*.md` artifacts + this report + a `.claude/launch.json` used to run the app.

Please review and tell me: (a) approve the plan as-is, (b) approve a subset (e.g. fixes #1–#5 only), or (c) revise. I recommend starting with fixes **#1, #2, #3** — they are high-impact, low-risk, and don't touch the schema.
