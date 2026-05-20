from __future__ import annotations

from pathlib import Path
from typing import Tuple

import pandas as pd

from features import FEATURE_ORDER

REQUIRED = {"query_id", "institution_id", "label", *FEATURE_ORDER}


def load_dataset(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(str(path))
    if path.suffix == ".parquet":
        frame = pd.read_parquet(path)
    else:
        frame = pd.read_csv(path)
    missing = REQUIRED - set(frame.columns)
    if missing:
        raise ValueError(f"Missing columns: {sorted(missing)}")
    return frame


def split_by_query(frame: pd.DataFrame, valid_fraction: float = 0.2) -> Tuple[pd.DataFrame, pd.DataFrame]:
    query_ids = frame["query_id"].drop_duplicates().tolist()
    cutoff = max(1, int(len(query_ids) * (1 - valid_fraction)))
    train_queries = set(query_ids[:cutoff])
    train = frame[frame["query_id"].isin(train_queries)].copy()
    valid = frame[~frame["query_id"].isin(train_queries)].copy()
    if valid.empty:
        valid = train.tail(max(1, len(train) // 5)).copy()
        train = train.iloc[:-len(valid)] if len(train) > len(valid) else train
    return train, valid
