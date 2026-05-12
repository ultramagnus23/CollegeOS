#!/usr/bin/env python3
"""
ml/generate_training_data.py
─────────────────────────────
Generates 100 000 synthetic (student, college) admission pairs and saves them
to ml/data/training_data.parquet for use by ml/train.py.

Strategy
────────
1. Connect to Supabase / PostgreSQL and fetch colleges with non-null
   acceptance_rate and SAT data (colleges without these values cannot produce
   meaningful training signal).
2. Sample 100 000 student profiles from realistic distributions.
3. For each student, pair with 15 randomly chosen colleges.
4. Compute a monotonic admission probability that is:
     • Above base rate when the student's SAT is above the college median.
     • Below base rate when the student's SAT is below the college median.
5. Sample the binary outcome (admitted 1 / denied 0) from that probability.
6. Write to Parquet (faster and smaller than CSV).

Required env vars:
    SUPABASE_DB_URL  (or DATABASE_URL)

Output:
    ml/data/training_data.parquet
"""

import os
import sys
import logging
from pathlib import Path

import numpy as np
import pandas as pd
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("generate_training_data")

# ── Paths ─────────────────────────────────────────────────────────────────────

ML_DIR = Path(__file__).resolve().parent
DATA_DIR = ML_DIR / "data"
OUTPUT_PATH = DATA_DIR / "training_data.parquet"

# ── Config ────────────────────────────────────────────────────────────────────

N_PAIRS = int(os.environ.get("N_TRAINING_PAIRS", "100000"))
COLLEGES_PER_STUDENT = 15
RANDOM_SEED = 42

# Student SAT/ACT/GPA distributions (national approximations)
SAT_MEAN, SAT_STD = 1050, 200
ACT_MEAN, ACT_STD = 22, 5
GPA_MEAN, GPA_STD = 3.4, 0.5

# ── DB helpers ────────────────────────────────────────────────────────────────


def load_colleges() -> pd.DataFrame:
    """
    Fetch colleges from the DB that have the fields needed for training signal.
    Falls back to a small synthetic college set if the DB is unavailable.
    """
    db_url = os.environ.get("SUPABASE_DB_URL") or os.environ.get("DATABASE_URL", "")
    if not db_url:
        log.warning("No DATABASE_URL — using synthetic college set for local testing")
        return _synthetic_colleges()

    try:
        import psycopg2
        import psycopg2.extras

        conn = psycopg2.connect(db_url)
        conn.set_session(autocommit=True)
        query = """
            SELECT
                id,
                name,
                acceptance_rate,
                COALESCE(median_sat_25, sat_25) AS sat_25,
                COALESCE(median_sat_75, sat_75) AS sat_75,
                COALESCE(median_act_25, act_25) AS act_25,
                COALESCE(median_act_75, act_75) AS act_75,
                total_enrollment,
                ranking_us_news
            FROM colleges_comprehensive
            WHERE acceptance_rate IS NOT NULL
              AND acceptance_rate BETWEEN 0.01 AND 0.99
              AND (median_sat_25 IS NOT NULL OR sat_25 IS NOT NULL)
            ORDER BY id
        """
        df = pd.read_sql(query, conn)
        conn.close()
        log.info(f"Loaded {len(df)} colleges from DB")
        if len(df) < 10:
            log.warning("Fewer than 10 colleges found — supplementing with synthetic set")
            df = pd.concat([df, _synthetic_colleges()], ignore_index=True)
        return df
    except Exception as exc:
        log.error(f"DB load failed: {exc} — using synthetic college set")
        return _synthetic_colleges()


def _synthetic_colleges() -> pd.DataFrame:
    """
    Return a small representative set of synthetic colleges for offline testing.
    Covers the full selectivity spectrum.
    """
    rng = np.random.default_rng(RANDOM_SEED)
    n = 200
    acceptance_rates = np.clip(rng.beta(2, 5, n), 0.03, 0.97)
    sat_mid = np.clip(800 + acceptance_rates * -500 + rng.normal(0, 80, n), 800, 1580).astype(int)
    return pd.DataFrame({
        "id": range(1, n + 1),
        "name": [f"Synthetic College {i}" for i in range(1, n + 1)],
        "acceptance_rate": acceptance_rates.round(4),
        "sat_25": (sat_mid - 60).clip(400, 1540),
        "sat_75": (sat_mid + 60).clip(460, 1600),
        "act_25": np.clip(sat_mid // 50 - 2, 14, 34).astype(int),
        "act_75": np.clip(sat_mid // 50 + 2, 16, 36).astype(int),
        "total_enrollment": rng.integers(1000, 50000, n),
        "ranking_us_news": np.where(rng.random(n) < 0.3, np.nan, rng.integers(1, 400, n).astype(float)),
    })


# ── Admission probability model ───────────────────────────────────────────────


def compute_admission_prob(
    student_sat: float,
    student_gpa: float,
    college_acceptance_rate: float,
    college_sat_mid: float,
) -> float:
    """
    Compute a synthetic admission probability that is:
      - Monotonically increasing in student SAT and GPA.
      - Centred on the college's acceptance rate.
      - Bounded in (0.01, 0.99) to avoid degenerate training labels.

    The formula uses a logistic adjustment around the base acceptance rate.
    Positive sat_delta and gpa_delta push the probability above the base rate;
    negative values push it below.
    """
    # SAT advantage: normalised to ±1 at ±200 points from median
    sat_delta = (student_sat - college_sat_mid) / 200.0
    # GPA advantage: normalised to ±1 at ±0.5 points from 3.4
    gpa_delta = (student_gpa - 3.4) / 0.5

    # Combined strength signal (weighted: SAT is stronger signal for US admissions)
    strength = 0.65 * sat_delta + 0.35 * gpa_delta

    # Convert base acceptance rate to log-odds, shift by strength
    base_rate = float(college_acceptance_rate)
    base_rate = max(0.02, min(0.98, base_rate))
    log_odds = np.log(base_rate / (1.0 - base_rate))
    adjusted_log_odds = log_odds + 1.2 * strength

    prob = 1.0 / (1.0 + np.exp(-adjusted_log_odds))
    return float(np.clip(prob, 0.01, 0.99))


# ── Sampling ──────────────────────────────────────────────────────────────────


def sample_students(n_students: int, rng: np.random.Generator) -> pd.DataFrame:
    """
    Sample n_students synthetic student profiles from realistic distributions.
    """
    sat = np.clip(rng.normal(SAT_MEAN, SAT_STD, n_students), 400, 1600).round().astype(int)
    act = np.clip(rng.normal(ACT_MEAN, ACT_STD, n_students), 1, 36).round().astype(int)
    gpa_uw = np.clip(rng.normal(GPA_MEAN, GPA_STD, n_students), 1.5, 4.0).round(2)
    gpa_w = np.clip(gpa_uw + rng.uniform(0, 0.6, n_students), 1.5, 4.5).round(2)

    extracurriculars = rng.integers(1, 16, n_students)  # 1–15
    leadership = np.minimum(extracurriculars, rng.integers(0, 6, n_students))
    essays_quality = rng.integers(1, 6, n_students)  # 1–5

    first_gen = rng.binomial(1, 0.30, n_students).astype(bool)
    legacy = rng.binomial(1, 0.08, n_students).astype(bool)
    recruited_athlete = rng.binomial(1, 0.04, n_students).astype(bool)
    income_bracket = rng.integers(1, 5, n_students)  # 1–4

    return pd.DataFrame({
        "sat_score": sat,
        "act_score": act,
        "gpa_unweighted": gpa_uw,
        "gpa_weighted": gpa_w,
        "extracurriculars": extracurriculars,
        "leadership_positions": leadership,
        "essays_quality": essays_quality,
        "first_gen": first_gen.astype(int),
        "legacy": legacy.astype(int),
        "recruited_athlete": recruited_athlete.astype(int),
        "income_bracket": income_bracket,
    })


# ── Feature engineering ───────────────────────────────────────────────────────


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add engineered features to a merged (student, college) DataFrame.
    The same logic must be applied identically in ml/train.py and ml/predict.py.
    """
    # SAT midpoint of the college's band
    df["median_sat_midpoint"] = ((df["sat_25"].fillna(0) + df["sat_75"].fillna(0)) / 2.0).where(
        df["sat_25"].notna() | df["sat_75"].notna(), other=1000.0
    )
    df["median_act_midpoint"] = ((df["act_25"].fillna(0) + df["act_75"].fillna(0)) / 2.0).where(
        df["act_25"].notna() | df["act_75"].notna(), other=22.0
    )

    # Null-fill ranking with 999 (unknown schools treated as unranked)
    df["ranking_us_news"] = df["ranking_us_news"].fillna(999).astype(int)

    # Engineered features
    df["sat_ratio"] = df["sat_score"] / df["median_sat_midpoint"].clip(lower=1)
    df["gpa_quality"] = df["gpa_unweighted"] * (1 + (df["gpa_weighted"] - df["gpa_unweighted"]).clip(lower=0))
    df["leadership_ratio"] = df["leadership_positions"] / df["extracurriculars"].clip(lower=1)
    df["is_highly_selective"] = (df["acceptance_rate"] < 0.15).astype(int)

    return df


# ── Main ──────────────────────────────────────────────────────────────────────


def main() -> int:
    """Generate synthetic training data and save to parquet."""
    log.info("generate_training_data.py started")
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    rng = np.random.default_rng(RANDOM_SEED)

    # 1. Load colleges
    colleges_df = load_colleges()
    n_colleges = len(colleges_df)
    log.info(f"Working with {n_colleges} colleges")

    # 2. Determine number of unique students needed
    n_students = int(np.ceil(N_PAIRS / COLLEGES_PER_STUDENT))
    log.info(f"Sampling {n_students} synthetic students × {COLLEGES_PER_STUDENT} colleges = {n_students * COLLEGES_PER_STUDENT} pairs")

    students_df = sample_students(n_students, rng)

    # 3. Build (student, college) pair rows
    rows = []
    college_records = colleges_df.to_dict("records")

    for student_idx, student in students_df.iterrows():
        # Sample COLLEGES_PER_STUDENT colleges without replacement (or with if fewer)
        replace = n_colleges < COLLEGES_PER_STUDENT
        chosen_indices = rng.choice(n_colleges, size=COLLEGES_PER_STUDENT, replace=replace)

        for col_idx in chosen_indices:
            college = college_records[col_idx]

            sat_25 = college.get("sat_25") or college.get("median_sat_25")
            sat_75 = college.get("sat_75") or college.get("median_sat_75")
            sat_mid = ((sat_25 or 0) + (sat_75 or 0)) / 2.0 if (sat_25 or sat_75) else 1000.0

            prob = compute_admission_prob(
                student_sat=float(student["sat_score"]),
                student_gpa=float(student["gpa_unweighted"]),
                college_acceptance_rate=float(college["acceptance_rate"]),
                college_sat_mid=sat_mid,
            )

            admitted = int(rng.binomial(1, prob))

            row = {
                # Student fields
                "sat_score": int(student["sat_score"]),
                "act_score": int(student["act_score"]),
                "gpa_unweighted": float(student["gpa_unweighted"]),
                "gpa_weighted": float(student["gpa_weighted"]),
                "extracurriculars": int(student["extracurriculars"]),
                "leadership_positions": int(student["leadership_positions"]),
                "essays_quality": int(student["essays_quality"]),
                "first_gen": int(student["first_gen"]),
                "legacy": int(student["legacy"]),
                "recruited_athlete": int(student["recruited_athlete"]),
                "income_bracket": int(student["income_bracket"]),
                # College fields
                "college_id": int(college.get("id", 0)),
                "college_name": str(college.get("name", "")),
                "acceptance_rate": float(college["acceptance_rate"]),
                "sat_25": float(sat_25) if sat_25 else None,
                "sat_75": float(sat_75) if sat_75 else None,
                "act_25": float(college.get("act_25") or college.get("median_act_25") or 0) or None,
                "act_75": float(college.get("act_75") or college.get("median_act_75") or 0) or None,
                "total_enrollment": int(college.get("total_enrollment") or 0) or None,
                "ranking_us_news": college.get("ranking_us_news"),
                # Label
                "admitted": admitted,
            }
            rows.append(row)

    df = pd.DataFrame(rows)
    log.info(f"Built {len(df)} rows, {df['admitted'].mean():.3f} admission rate")

    # 4. Engineer features
    df = engineer_features(df)

    # 5. Save
    df.to_parquet(OUTPUT_PATH, index=False)
    log.info(f"✓ Saved to {OUTPUT_PATH} ({OUTPUT_PATH.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
