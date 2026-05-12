"""
ml/hf_app/app.py
─────────────────
Gradio Space application for CollegeOS's ML chancing model.

This file is designed to run standalone inside a HuggingFace Space.
It does NOT import from the CollegeOS repo — copy the following files
into the Space root alongside this app.py before deploying:
    - predict.py
    - chancing_model.ubj
    - features.txt

The Gradio interface exposes an API endpoint at /api/predict that the
CollegeOS Express backend calls.  The visual UI is minimal (the app is
primarily a REST backend).

Required Space secrets:
    SUPABASE_DB_URL  — Supabase transaction pooler connection string (port 6543)

To test locally:
    cd ml/hf_app
    HF_SPACE=1 python app.py
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

import gradio as gr
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

# ── Bootstrap ─────────────────────────────────────────────────────────────────

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger("hf_app")

# ── Resolve predict.py location ───────────────────────────────────────────────
# In the Space, predict.py is at the repo root.
# Locally (during development), it lives in ml/predict.py.
_HERE = Path(__file__).resolve().parent
_PREDICT_SEARCH = [_HERE, _HERE.parent, Path("/app")]

for _search_dir in _PREDICT_SEARCH:
    if (_search_dir / "predict.py").exists():
        import sys
        if str(_search_dir) not in sys.path:
            sys.path.insert(0, str(_search_dir))
        break

from predict import predict_chances, PROB_MIN, PROB_MAX  # noqa: E402

# ── Startup: verify model loads once ─────────────────────────────────────────

log.info("Loading ML model at startup…")
try:
    # Force model loading on startup rather than per-request
    from predict import _load_model, _load_features
    _load_model()
    _load_features()
    log.info("✓ Model and features loaded")
except Exception as exc:
    log.error(f"Model load failed: {exc}")
    # Continue — Gradio will still start, errors returned per-request

# ── DB helpers ────────────────────────────────────────────────────────────────

_DB_URL = os.environ.get("SUPABASE_DB_URL") or os.environ.get("DATABASE_URL", "")
_COLLEGE_CACHE: list[dict] | None = None


def _get_colleges() -> list[dict]:
    """
    Fetch the top 200 colleges by US News ranking that have real acceptance_rate
    and SAT data.  Caches the result in memory (colleges change infrequently).
    """
    global _COLLEGE_CACHE
    if _COLLEGE_CACHE is not None:
        return _COLLEGE_CACHE

    if not _DB_URL:
        log.warning("SUPABASE_DB_URL not set — returning empty college list")
        return []

    try:
        conn = psycopg2.connect(_DB_URL, connect_timeout=10)
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT
                    id,
                    name,
                    acceptance_rate,
                    median_sat_25   AS sat_25,
                    median_sat_75   AS sat_75,
                    median_act_25   AS act_25,
                    median_act_75   AS act_75,
                    total_enrollment,
                    ranking_us_news
                FROM colleges_comprehensive
                WHERE acceptance_rate IS NOT NULL
                  AND acceptance_rate BETWEEN 0.01 AND 0.99
                  AND median_sat_25 IS NOT NULL
                ORDER BY ranking_us_news ASC NULLS LAST
                LIMIT 200
            """)
            rows = cur.fetchall()
        conn.close()
        _COLLEGE_CACHE = [dict(r) for r in rows]
        log.info(f"Loaded {len(_COLLEGE_CACHE)} colleges from DB")
        return _COLLEGE_CACHE
    except Exception as exc:
        log.error(f"DB error fetching colleges: {exc}")
        return []


# ── Input validation ──────────────────────────────────────────────────────────


def validate_student(profile: dict) -> str | None:
    """
    Validate student profile fields.
    Returns an error string if validation fails, None if OK.
    """
    sat = profile.get("sat_score")
    act = profile.get("act_score")
    gpa = profile.get("gpa_unweighted")

    if sat is not None:
        try:
            sat_v = float(sat)
            if not (400 <= sat_v <= 1600):
                return f"sat_score {sat_v} is outside [400, 1600]"
        except (TypeError, ValueError):
            return "sat_score must be a number"

    if act is not None:
        try:
            act_v = float(act)
            if not (1 <= act_v <= 36):
                return f"act_score {act_v} is outside [1, 36]"
        except (TypeError, ValueError):
            return "act_score must be a number"

    if gpa is not None:
        try:
            gpa_v = float(gpa)
            if not (1.0 <= gpa_v <= 4.0):
                return f"gpa_unweighted {gpa_v} is outside [1.0, 4.0]"
        except (TypeError, ValueError):
            return "gpa_unweighted must be a number"

    return None


# ── Core prediction logic ─────────────────────────────────────────────────────


def run_prediction(student_json: str) -> str:
    """
    Main prediction handler called by the Gradio interface.

    Input  : JSON string with student profile fields.
    Output : JSON string — either {"results": [...]} or {"error": "..."}.
    """
    try:
        profile = json.loads(student_json)
    except (json.JSONDecodeError, TypeError) as exc:
        return json.dumps({"error": f"Invalid JSON input: {exc}"})

    # Validate
    err = validate_student(profile)
    if err:
        return json.dumps({"error": err})

    # Fetch colleges
    colleges = _get_colleges()
    if not colleges:
        return json.dumps({"error": "No college data available — check SUPABASE_DB_URL"})

    # Predict
    try:
        results = predict_chances(profile, colleges)
    except FileNotFoundError as exc:
        return json.dumps({"error": str(exc)})
    except Exception as exc:
        log.error(f"Prediction error: {exc}", exc_info=True)
        return json.dumps({"error": f"Prediction failed: {exc}"})

    # Return top 10
    top10 = results[:10]
    return json.dumps({"results": top10})


# ── Gradio Interface ──────────────────────────────────────────────────────────

_EXAMPLE_INPUT = json.dumps({
    "sat_score": 1350,
    "act_score": 30,
    "gpa_unweighted": 3.8,
    "gpa_weighted": 4.2,
    "extracurriculars": 8,
    "leadership_positions": 3,
    "essays_quality": 4,
    "first_gen": False,
    "legacy": False,
    "recruited_athlete": False,
    "income_bracket": 3,
}, indent=2)

_DESCRIPTION = """
## CollegeOS ML Chancing Model

POST a student profile as JSON to `/api/predict`.  
Returns the top 10 college matches with admission probabilities.

**Field reference:**
- `sat_score` (400–1600)
- `act_score` (1–36)  
- `gpa_unweighted` (1.0–4.0)  
- `gpa_weighted` (1.0–4.5)  
- `extracurriculars` (1–15)  
- `leadership_positions` (0–extracurriculars)  
- `essays_quality` (1–5)  
- `first_gen` (bool)  
- `legacy` (bool)  
- `recruited_athlete` (bool)  
- `income_bracket` (1=<30k, 2=30-60k, 3=60-100k, 4=100k+)
"""

demo = gr.Interface(
    fn=run_prediction,
    inputs=gr.Textbox(
        label="Student Profile (JSON)",
        placeholder=_EXAMPLE_INPUT,
        lines=15,
        value=_EXAMPLE_INPUT,
    ),
    outputs=gr.Textbox(
        label="Prediction Results (JSON)",
        lines=20,
    ),
    title="CollegeOS Chancing Model",
    description=_DESCRIPTION,
    allow_flagging="never",
    # API endpoint is exposed automatically by Gradio at /api/predict
    api_name="predict",
)

if __name__ == "__main__":
    demo.launch(
        server_name="0.0.0.0",
        server_port=int(os.environ.get("PORT", 7860)),
        show_error=True,
    )
