# PRD — CollegeOS v2: From College Database to Application Copilot

**Date:** 2026-07-08 · **Status:** Draft for sign-off · **Companion:** [SCOPE_OF_WORK_2026-07.md](SCOPE_OF_WORK_2026-07.md)

## 1. Problem

CollegeOS today performs every function at a basic level and none at a differentiated one.
The live audit shows why users feel it "doesn't add value":

- **It answers "what colleges exist" but not "what should I do today."** The dashboard shows
  counts; the deadlines table is empty for most colleges (228/8,236 institutions covered), so
  users maintain their own deadline lists — the exact chore the product exists to remove.
- **The masters track is a UI shell over an empty warehouse.** Chancing says
  "insufficient data" for MIT; the deadlines page is permanently blank; funding shows names
  without numbers. A masters user gets nothing they couldn't get from one Google search.
- **Scholarships were literally broken** (empty list for every user — fixed 2026-07-08) and
  the data is a stale 2024 cycle.
- **"AI/ML" is a hand-tuned model dressed as intelligence**, trained on simulated labels.

## 2. Product thesis

**CollegeOS wins when it is the single place where a student's next action is always obvious
and always backed by verified primary-source data.** Not a search engine, not a rankings
mirror — a copilot for the application year. Every screen must answer one of:
1. *Where do I stand?* (honest chancing, readiness)
2. *What do I do next?* (deadlines, tasks, essays — auto-generated, never hand-entered)
3. *What am I missing?* (money, requirements, documents)

Data honesty is the brand: every fact carries provenance; no fabricated numbers, ever.
When we don't know, the UI says "not published" — and offers the official link.

## 3. Users

- **P1 — Undergrad applicant (India → US/UK/abroad + India):** class 11–12, juggling 8–15
  applications, parents watching budget. Needs deadline autopilot + honest chances + money.
- **P2 — Masters aspirant (India → global MS/MBA):** final-year or working, GRE/IELTS,
  funding-sensitive, deadline-driven (rounds/priority/final). Needs program discovery with
  real acceptance/funding data + SOP/LOR execution tracking.
- **P3 (later) — Counselor/parent** read-only views.

## 4. What v2 ships

### 4.1 Dashboard = Mission Control (revamp, both tracks)
One screen, three zones, zero vanity metrics:
- **"This week" hero:** the 1–3 highest-priority actions (deadline in ≤14d, essay stalled,
  missing LOR), each one-click actionable. Powered by existing `nextAction` engine, extended
  to rank across deadlines/essays/docs/tests.
- **Portfolio health:** reach/target/safety balance with a one-line verdict ("You have no
  safeties in budget") instead of raw counts.
- **Money strip:** total estimated cost of current list vs budget + top 3 scholarship
  matches with days-to-deadline.
- Kill: static tips, empty-section placeholders, any card that renders the same for every
  user. An empty state must either self-populate or tell the user the one action that fills it.
- Masters dashboard reaches parity: readiness %, round-aware deadline rail, funding gap.

### 4.2 Deadline autopilot (the retention feature)
- Adding a college **always** yields its deadline set: canonical data when scraped, else
  cycle-standard template clearly labeled "typical — verify", with the official link.
  Manual entry becomes the exception, and every manual entry is a data-acquisition signal
  (queue that college for scraping).
- Unified timeline across apps, tests, scholarships, and masters rounds; ICS export +
  email/push nudges at T-14/7/2.
- North-star metric: **% of user deadlines that were auto-created** (today ~0%, target >80%).

### 4.3 Masters track with real substance
- 648 → 1,500+ verified programs; every program row must have: deadline(s) with round type,
  tuition, GRE/GMAT policy, funding availability — or explicit "not published".
- GradCafe-backed admission datapoints power chancing bands: "In the last 2 cycles,
  applicants like you (GPA 8.2/10, GRE 320) were admitted 9 of 21 times" — datapoint-backed,
  provenance-shown, never a fake percentage.
- Funding & scholarships: structured extraction of the 449 program-scholarship texts +
  a curated masters scholarship set (Fulbright/DAAD/Chevening/Erasmus+ etc., current cycle)
  with eligibility matching on the masters profile.
- Application execution: SOP/LOR/CV/transcript checklist per application with status,
  already half-modeled in readiness — surface it per-application, not just globally.

### 4.4 Scholarships that pay
- One consolidated table, current-cycle deadlines, amounts, `degree_levels`; matching uses
  citizenship + degree level + field + need; every card shows *why you match* and *what you'd
  get in ₹ and local currency*. Track → deadline lands in the timeline.

### 4.5 Honest intelligence (ML)
- Ship the **outcome-capture loop now** (decision prompt on application status change) — the
  label flywheel.
- Masters: rules-bands → calibrated model once GradCafe datapoints reach volume (per-field).
- Undergrad: keep simulated-calibrated model, relabel UI copy from "AI prediction" to
  "estimate from published admissions data", retrain on real labels when they exist.
- Every probability shows its basis: data source, cohort size, confidence.

### 4.6 UI/UX overhaul principles
- One design system (existing shadcn/Tailwind base), dark-mode first-class, mobile usable
  end-to-end (Indian users are mobile-heavy).
- Speed: sub-2s first dashboard paint (warmup + lazy routes exist; finish by splitting the
  107 KB Onboarding page and pruning dead pages).
- Onboarding: 7 steps → 4 (profile depth moves to progressive prompts in-product); track
  choice (UG/Masters) is the first question; each step previews the value it unlocks
  ("add SAT → instant chances at your list").
- Empty states are the product: every empty screen names the single action that fills it.
- Provenance chips ("College Scorecard · Mar 2026", "Official page · verified Jun 2026") on
  every data-bearing card.

## 5. Non-goals (v2)
PhD track, counselor marketplace, essay-writing AI, commercial rankings ingestion (legal),
native mobile apps, transfer track (enum stays reserved).

## 6. Success metrics
| Metric | Now | v2 target |
|---|---|---|
| Auto-created share of user deadlines | ~0% | >80% |
| Masters programs with deadline+cost+funding complete | <5% | >70% |
| Chancing calls returning a usable band (masters) | ~0% | >60% |
| Scholarship matches shown with live (future) deadline | 0 | 100% of shown |
| Real outcome labels collected | 0 | ≥500 in first cycle |
| WAU returning ≥2×/week during application season | — | 40% |

## 7. Sequencing
Per scope doc: WS1 quick fixes → WS2 scholarships → WS3 masters data (+WS4 deadline coverage
in background) → WS5 dead-code purge → WS6 dashboard/UX revamp → WS7 ML v2.
Rationale: revamped UI on empty tables would be lipstick; data first, then the face.

## 8. Open decisions
1. GradCafe ToS review vs primary-sources rule (scraper is built; needs your legal call).
2. Which Python scraper tree survives (`scraper/` recommended).
3. Scholarship refresh: manual curation of top ~100 (fast, verifiable) vs scraper-first.
4. Masters program expansion: deepen the 36 Excel fields or broaden institution coverage first.
