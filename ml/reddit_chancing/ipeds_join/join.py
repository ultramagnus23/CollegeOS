"""Join applicant_outcomes.csv (from ../run.py) onto university_features
(from ipeds.py + cds.py), producing the model-ready training table.

    python join.py applicant_outcomes.csv hd2023.csv adm2023.csv \
        --cycle-year 2023 --aliases aliases.csv --cds-manual cds_manual.csv \
        --out training_rows.csv
"""
from __future__ import annotations
import argparse
import numpy as np
import pandas as pd

from crosswalk import load_crosswalk
from ipeds import build_university_features


def resolve_university_ids(outcomes: pd.DataFrame, cw) -> pd.DataFrame:
    resolved = outcomes["university_raw"].apply(cw.resolve)
    outcomes = outcomes.copy()
    outcomes["unitid"] = resolved.apply(lambda r: r[0])
    outcomes["resolution_method"] = resolved.apply(lambda r: r[1])
    return outcomes


def add_calibration_features(rows: pd.DataFrame) -> pd.DataFrame:
    """Per-school context the LR can use even when Reddit N for that school is thin."""
    rows = rows.copy()
    # log-odds of the published admit rate -- the calibration anchor
    p = rows["admit_rate"].clip(lower=1e-3, upper=1 - 1e-3)
    rows["admit_rate_logodds"] = np.log(p / (1 - p))
    # standardized "fit gap": applicant SAT vs this school's SAT midpoint
    sat_mid = rows["sat_erw_50"].fillna(0) + rows["sat_math_50"].fillna(0)
    rows["sat_fit_gap"] = rows["sat_total"] - sat_mid.where(sat_mid > 0)
    # waitlist-to-admit prior, for resolving WAITLIST rows to a final outcome
    # (only present when --cds-manual was supplied; otherwise leave it unset)
    if "cds_waitlist_admitted" in rows.columns and "cds_waitlist_offered" in rows.columns:
        rows["waitlist_admit_prior"] = (
            rows["cds_waitlist_admitted"] / rows["cds_waitlist_offered"]
        ).where(rows["cds_waitlist_offered"] > 0)
    else:
        rows["waitlist_admit_prior"] = np.nan
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("outcomes_csv")
    ap.add_argument("hd_csv")
    ap.add_argument("adm_csv")
    ap.add_argument("--cycle-year", type=int, required=True)
    ap.add_argument("--aliases", default=None)
    ap.add_argument("--cds-manual", default=None)
    ap.add_argument("--out", default="training_rows.csv")
    ap.add_argument("--fuzzy-threshold", type=int, default=90)
    args = ap.parse_args()

    outcomes = pd.read_csv(args.outcomes_csv)
    cw = load_crosswalk(args.hd_csv, args.aliases)
    outcomes = resolve_university_ids(outcomes, cw)

    unresolved = outcomes[outcomes["unitid"].isna()]
    if len(unresolved):
        print(f"WARNING: {len(unresolved)} rows unresolved -- add aliases for: "
              f"{sorted(unresolved['university_raw'].unique())[:20]}")

    features = build_university_features(args.hd_csv, args.adm_csv, args.cycle_year)
    if args.cds_manual:
        from cds import load_manual_overrides
        cds = load_manual_overrides(args.cds_manual)
        features = features.merge(cds, on=["unitid", "cycle_year"], how="left")

    rows = outcomes.merge(features, on="unitid", how="left", suffixes=("", "_school"))
    rows = add_calibration_features(rows)

    rows.to_csv(args.out, index=False)
    print(f"{len(rows)} training rows -> {args.out} "
          f"({rows['admit_rate'].notna().sum()} joined to IPEDS features)")


if __name__ == "__main__":
    main()
