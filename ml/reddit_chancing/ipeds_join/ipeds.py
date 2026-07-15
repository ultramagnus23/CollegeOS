"""Load IPEDS Complete Data Files (CSV) into the university_features table.

Download source (public domain, no auth): NCES IPEDS Data Center ->
"Complete Data Files" -> pick survey year -> download CSVs for:
  HD####       Institutional Characteristics (name, control, region, size)
  ADM####      Admissions component (applicants/admits/enrolled, SAT/ACT pctiles)
https://nces.ed.gov/ipeds/use-the-data/download-access-database

Column names below match the IPEDS "Complete Data Files" CSV dictionaries as
published for the 2022-23+ collection years. If NCES renames a column in a
later release, adjust the *_COLS maps below -- the join logic doesn't change.
"""
from __future__ import annotations
import pandas as pd

HD_COLS = {
    "UNITID": "unitid",
    "INSTNM": "canonical_name",
    "CONTROL": "control",       # 1 public, 2 private nonprofit, 3 private for-profit
    "OBEREG": "region",
    "C21BASIC": "carnegie_class",
}

ADM_COLS = {
    "UNITID": "unitid",
    "APPLCN": "applicants_total",
    "ADMSSN": "admits_total",
    "ENRLT": "enrolled_total",
    "SATVR25": "sat_erw_25", "SATVR50": "sat_erw_50", "SATVR75": "sat_erw_75",
    "SATMT25": "sat_math_25", "SATMT50": "sat_math_50", "SATMT75": "sat_math_75",
    "ACTCM25": "act_comp_25", "ACTCM50": "act_comp_50", "ACTCM75": "act_comp_75",
    "ADMCON1": "test_policy_raw",   # IPEDS code: importance of secondary school GPA etc.
}

_CONTROL_MAP = {1: "PUBLIC", 2: "PRIVATE_NP", 3: "PRIVATE_FP"}


def load_hd(path: str) -> pd.DataFrame:
    df = pd.read_csv(path, encoding="utf-8-sig", usecols=lambda c: c in HD_COLS)
    df = df.rename(columns=HD_COLS)
    df["control"] = df["control"].map(_CONTROL_MAP)
    return df


def load_adm(path: str, cycle_year: int) -> pd.DataFrame:
    df = pd.read_csv(path, encoding="utf-8-sig", usecols=lambda c: c in ADM_COLS)
    df = df.rename(columns=ADM_COLS)
    df["cycle_year"] = cycle_year
    # negative values in IPEDS mark suppressed/missing cells -- treat as NaN
    numeric_cols = [c for c in df.columns if c not in ("unitid", "cycle_year")]
    df[numeric_cols] = df[numeric_cols].apply(pd.to_numeric, errors="coerce")
    df.loc[:, numeric_cols] = df[numeric_cols].mask(df[numeric_cols] < 0)
    df["admit_rate"] = df["admits_total"] / df["applicants_total"]
    df["yield_rate"] = df["enrolled_total"] / df["admits_total"]
    return df


def build_university_features(hd_path: str, adm_path: str, cycle_year: int) -> pd.DataFrame:
    hd = load_hd(hd_path)
    adm = load_adm(adm_path, cycle_year)
    features = adm.merge(hd, on="unitid", how="left")
    return features[[
        "unitid", "cycle_year", "canonical_name", "control", "region", "carnegie_class",
        "applicants_total", "admits_total", "enrolled_total", "admit_rate", "yield_rate",
        "sat_erw_25", "sat_erw_50", "sat_erw_75",
        "sat_math_25", "sat_math_50", "sat_math_75",
        "act_comp_25", "act_comp_50", "act_comp_75",
    ]]
