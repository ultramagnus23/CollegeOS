"""
scraper/sources — individual data-source modules for the CollegeOS pipeline.

Each module exposes a single public function:
    fetch() -> list[dict]

Each returned dict uses the canonical field names expected by pipeline.py:
    name                str   — institution name (used for DB matching)
    acceptance_rate     float — decimal 0.01–0.99
    total_enrollment    int
    applications_received int
    median_sat_25       int   — SAT 25th percentile composite (400–1600)
    median_sat_75       int   — SAT 75th percentile composite (400–1600)
    median_act_25       int   — ACT 25th percentile (1–36)
    median_act_75       int   — ACT 75th percentile (1–36)
    tuition_in_state    int
    tuition_out_of_state int
    completion_rate     float — 0.0–1.0
    median_earnings_post_grad int
    data_source         str   — which source this record came from
"""
