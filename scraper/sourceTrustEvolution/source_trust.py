from __future__ import annotations


def evolve_trust(current: float, extraction_accuracy: float, freshness: float, conflict_rate: float) -> float:
    current = max(0.0, min(1.0, float(current)))
    extraction_accuracy = max(0.0, min(1.0, float(extraction_accuracy)))
    freshness = max(0.0, min(1.0, float(freshness)))
    conflict_rate = max(0.0, min(1.0, float(conflict_rate)))

    updated = (
        current * 0.45
        + extraction_accuracy * 0.3
        + freshness * 0.2
        + (1 - conflict_rate) * 0.05
    )
    return max(0.0, min(1.0, updated))
