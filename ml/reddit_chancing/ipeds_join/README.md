# IPEDS + CDS join

Attaches a per-university difficulty vector to every row of `applicant_outcomes.csv`
(from `../run.py`), so the model has school context even when Reddit's per-school
N is thin, and so predictions can be recalibrated against real aggregate admit rates.

## Files
- `crosswalk.py` — `university_raw` string → IPEDS `UnitID` (exact / normalized / fuzzy)
- `ipeds.py`      — loads IPEDS HD (institutional) + ADM (admissions) CSVs
- `cds.py`        — best-effort Common Data Set section-C scraper + manual-override CSV
- `join.py`       — end-to-end: resolve IDs → join IPEDS/CDS → calibration features

## 1. Download IPEDS data (public domain, no auth)
https://nces.ed.gov/ipeds/use-the-data/download-access-database → "Complete Data Files"
→ pick a collection year → download the **HD** (Institutional Characteristics) and
**ADM** (Admissions) CSVs for that year.

## 2. Run the join
```bash
pip install pandas rapidfuzz
python join.py ../applicant_outcomes.csv hd2023.csv adm2023.csv \
    --cycle-year 2023 --aliases aliases.csv --out training_rows.csv
```

`join.py` will print how many `university_raw` values it couldn't resolve — add
those as rows to `aliases.csv` (`unitid,alias`) and rerun. Verified end-to-end on
synthetic fixtures: exact match, normalized-fuzzy match ("University of Michigan"
→ "University of Michigan-Ann Arbor"), and alias match ("MIT", "Umich Ann Arbor")
all resolve correctly; admit-rate, log-odds, and SAT-fit-gap features compute as
expected.

## 3. (Optional) Common Data Set enrichment
CDS has no feed — each school publishes its own PDF/HTML. `cds.py` regex-parses
GPA distribution, waitlist funnel, and ED admit rate out of a CDS document's text,
but layouts vary enough that you should spot-check a sample. For schools where the
regex misses, hand-fill `cds_manual.csv` (`unitid,cycle_year,<any cds_* column>`)
and pass `--cds-manual cds_manual.csv` to `join.py` — manual values merge in
automatically and unlock `waitlist_admit_prior`.

## Output columns worth knowing
- `admit_rate`, `admit_rate_logodds` — the calibration anchor. After fitting your
  LR, group predictions by `unitid` and isotonic-correct against `admit_rate` so
  predicted probabilities track published rates instead of Reddit's selection bias.
- `sat_fit_gap` — applicant SAT total minus the school's SAT midpoint; a
  standardized "how far above/below the middle 50%" feature.
- `waitlist_admit_prior` — only populated when CDS waitlist data was supplied;
  use it to resolve WAITLIST rows toward a final ACCEPT/REJECT probability.
- `resolution_method` — EXACT / FUZZY / UNRESOLVED; filter or down-weight FUZZY
  rows if you want stricter provenance.
