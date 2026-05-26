# Remaining Schema Risk Report

- Canonical frontend relation: `canonical.mv_college_cards`
- Files with relation bypasses detected: 4
- High-risk drift vector: routes that combine canonical.mv_college_cards with canonical.institution_* joins.
- Mitigation: keep card/list endpoints pinned to canonical.mv_college_cards contract fields.
- Mitigation: run startup schema contract check and this diagnostics script in CI/runtime-check.
