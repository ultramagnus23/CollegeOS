from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Dict, List

import pandas as pd

OUTCOME_PATTERNS = {
    "accept": re.compile(r"\b(accepted|admitted|got in|offer)\b", re.IGNORECASE),
    "reject": re.compile(r"\b(rejected|denied|didn't get in|waitlisted?)\b", re.IGNORECASE),
}


def infer_outcome(text: str) -> str:
    if OUTCOME_PATTERNS["accept"].search(text):
        return "accepted"
    if OUTCOME_PATTERNS["reject"].search(text):
        return "rejected"
    return "unknown"


def parse_post(row: Dict) -> Dict:
    content = f"{row.get('title', '')} {row.get('body', '')}"
    return {
        "source": row.get("subreddit", "reddit"),
        "post_id": row.get("id") or row.get("post_id"),
        "institution_raw": row.get("institution") or row.get("college"),
        "profile_text": content,
        "outcome": infer_outcome(content),
        "gpa": row.get("gpa"),
        "sat": row.get("sat"),
        "act": row.get("act"),
        "intended_major": row.get("major"),
        "budget_usd": row.get("budget_usd"),
    }


def ingest_reddit(input_files: List[Path], out_file: Path):
    rows = []
    for path in input_files:
      payload = json.loads(path.read_text(encoding="utf-8"))
      if isinstance(payload, dict):
          payload = payload.get("posts", [])
      for post in payload:
          rows.append(parse_post(post))
    frame = pd.DataFrame(rows)
    out_file.parent.mkdir(parents=True, exist_ok=True)
    frame.to_parquet(out_file, index=False)
    return frame


if __name__ == "__main__":
    src = list(Path("ml/data_pipeline/raw").glob("reddit*.json"))
    ingest_reddit(src, Path("ml/data_pipeline/staging/reddit_ingested.parquet"))
