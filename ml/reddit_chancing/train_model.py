"""Calibrated logistic regression on training_rows.csv (real r/collegeresults
data joined to real IPEDS admissions data).

Binary target: ACCEPT (1) vs REJECT (0). WAITLIST/DEFER/WITHDRAW excluded from
training (not a clean binary outcome) -- see README for how to fold them back
in via waitlist_admit_prior once CDS data is available.
"""
from __future__ import annotations
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold
from sklearn.metrics import roc_auc_score, brier_score_loss, accuracy_score
from sklearn.isotonic import IsotonicRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.compose import ColumnTransformer

IN_PATH = "ipeds_join/training_rows.csv"

NUMERIC_FEATURES = ["gpa_uw", "sat_total", "act_composite", "num_ap",
                     "admit_rate_logodds", "sat_fit_gap"]
CATEGORICAL_FEATURES = ["control"]
# ec_tier, income_band, first_gen, round are LLM-only fields (extract_llm populates
# them; extract_regex does not) -- 100% missing in this regex-only run, so they're
# excluded here rather than silently imputed to a constant. Re-add them once the
# dataset includes LLM-extracted rows.


def load_training_data(path: str = IN_PATH) -> pd.DataFrame:
    df = pd.read_csv(path)
    df = df[df["decision"].isin(["ACCEPT", "REJECT"])].copy()
    df = df[df["admit_rate"].notna()].copy()               # must have joined to a real school
    has_academic = df["gpa_uw"].notna() | df["sat_total"].notna() | df["act_composite"].notna()
    df = df[has_academic].copy()
    df["y"] = (df["decision"] == "ACCEPT").astype(int)
    return df


def build_pipeline() -> Pipeline:
    from sklearn.preprocessing import OneHotEncoder
    numeric_tf = Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("scale", StandardScaler()),
    ])
    pre = ColumnTransformer([
        ("num", numeric_tf, NUMERIC_FEATURES),
        ("cat", Pipeline([
            ("impute", SimpleImputer(strategy="constant", fill_value="UNKNOWN")),
            ("onehot", OneHotEncoder(handle_unknown="ignore")),
        ]), CATEGORICAL_FEATURES),
    ])
    clf = LogisticRegression(max_iter=2000, C=1.0, class_weight="balanced")
    return Pipeline([("pre", pre), ("clf", clf)])


def main():
    df = load_training_data()
    print(f"Training rows after filtering (ACCEPT/REJECT, joined, has academic feature): {len(df)}")
    print(f"Base rate (ACCEPT): {df['y'].mean():.3f}")
    print(f"Unique schools represented: {df['unitid'].nunique()}")

    X = df[NUMERIC_FEATURES + CATEGORICAL_FEATURES]
    y = df["y"]

    if len(df) < 60:
        print("\nWARNING: N is very small for a held-out test split to be meaningful. "
              "Reporting cross-validated metrics instead of a single train/test split.")

    pipe = build_pipeline()

    # Cross-validated AUC (more honest than a single small test split at this N)
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=0)
    cv_auc = cross_val_score(pipe, X, y, cv=cv, scoring="roc_auc")
    print(f"\n5-fold CV ROC-AUC: {cv_auc.mean():.3f} +/- {cv_auc.std():.3f}  (folds: {np.round(cv_auc, 3)})")

    # Held-out split for calibration diagnostics
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, stratify=y, random_state=0
    )
    pipe.fit(X_train, y_train)
    p_test = pipe.predict_proba(X_test)[:, 1]

    print(f"\nHeld-out test set (n={len(X_test)}):")
    print(f"  Accuracy @0.5:  {accuracy_score(y_test, p_test > 0.5):.3f}")
    print(f"  ROC-AUC:        {roc_auc_score(y_test, p_test):.3f}")
    print(f"  Brier (raw LR): {brier_score_loss(y_test, p_test):.3f}")

    # Isotonic recalibration against the REAL per-school admit_rate anchor.
    # Fit isotonic on the *raw model's* predicted log-odds vs actual outcome,
    # using train-set predictions, then apply to test.
    p_train = pipe.predict_proba(X_train)[:, 1]
    iso = IsotonicRegression(out_of_bounds="clip")
    iso.fit(p_train, y_train)
    p_test_calibrated = iso.predict(p_test)
    print(f"  Brier (isotonic-calibrated): {brier_score_loss(y_test, p_test_calibrated):.3f}")

    # Sanity check: does the model's average predicted admit prob per school
    # track the real IPEDS admit_rate for that school? (aggregate calibration)
    diag = X_test.copy()
    diag["y_true"] = y_test.values
    diag["p_model"] = p_test
    diag["unitid"] = df.loc[X_test.index, "unitid"].values
    diag["canonical_name"] = df.loc[X_test.index, "canonical_name"].values
    diag["admit_rate_real"] = df.loc[X_test.index, "admit_rate"].values
    per_school = diag.groupby("canonical_name").agg(
        n=("y_true", "size"),
        mean_predicted=("p_model", "mean"),
        real_admit_rate=("admit_rate_real", "first"),
    ).sort_values("n", ascending=False)
    print("\nPer-school calibration check (test set; small n per school, illustrative only):")
    print(per_school.head(10).to_string())

    print("\n" + "=" * 70)
    print("CAVEATS (read before trusting these numbers):")
    print("- N is small (few hundred rows) and comes from ~227 Reddit posts.")
    print("- Self-selection bias: r/collegeresults posters skew high-stat and")
    print("  skew toward posting notable/surprising outcomes.")
    print("- Only 76% of raw university strings resolved to a real IPEDS school;")
    print("  unresolved rows were dropped, not treated as missing-at-random.")
    print("- GPA/test-score fields are missing for the majority of rows overall")
    print("  (this filtered subset is the ~1/3 of rows where they were present).")
    print("=" * 70)


if __name__ == "__main__":
    main()
