from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Iterable


@dataclass
class ParserCandidate:
    name: str
    parse_fn: Callable[[str], dict]
    confidence_fn: Callable[[dict], float]


def choose_best_parser(html: str, parsers: Iterable[ParserCandidate]) -> tuple[str, dict, float]:
    best_name = "none"
    best_payload: dict = {}
    best_conf = -1.0
    for parser in parsers:
        payload = parser.parse_fn(html)
        conf = float(parser.confidence_fn(payload))
        if conf > best_conf:
            best_name = parser.name
            best_payload = payload
            best_conf = conf
    return best_name, best_payload, max(0.0, min(1.0, best_conf))
