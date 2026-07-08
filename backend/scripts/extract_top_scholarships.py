"""
Extracts + cleans "Top Scholarships (Global) + Timeline.xlsx" -> JSON for
importTopScholarshipsExcel.js. See that file's header comment for the
no-fabrication data-integrity stance (deadlines/amounts are prose/month-names
in the source, not real dates/numbers -- kept as text in `description`, never
invented as structured fields).

Usage: python extract_top_scholarships.py <path.xlsx> <out.json>
"""
import json
import re
import sys

import openpyxl

URL_RE = re.compile(r'^https?://\S+$', re.IGNORECASE)


def clean(v):
    if v is None:
        return None
    s = re.sub(r'\s+', ' ', str(v)).strip()
    return s if s and s.lower() != 'n/a' else None


def is_url(v):
    s = clean(v)
    return s if s and URL_RE.match(s) else None


def build_record(name, institution, eligibility, courses, app_open, deadline, duration, amount, details):
    elig_url = is_url(eligibility)
    course_url = is_url(courses)
    application_url = elig_url or course_url or is_url(app_open)

    eligibility_summary = None if elig_url else clean(eligibility)
    # major_requirements on `scholarships` is JSONB (a clean array), but this sheet's
    # Courses column is prose/semicolon-lists/exclusion-lists of mixed shape -- fold it
    # into description as text instead of mis-structuring it into JSONB.
    courses_text = None if course_url else clean(courses)

    parts = []
    d = clean(details)
    if d:
        parts.append(d)
    if courses_text:
        parts.append(f'Eligible fields: {courses_text}')
    du = clean(duration)
    if du:
        parts.append(f'Duration: {du}')
    am = clean(amount)
    if am and not is_url(amount):
        parts.append(f'Amount: {am}')
    ao = clean(app_open)
    if ao and not is_url(app_open):
        parts.append(f'Applications open: {ao}')
    dl = clean(deadline)
    if dl:
        parts.append(f'Deadline: {dl}')

    # `provider` is NOT NULL on the live table. Prefer the cleaned institution text
    # (truncated, not discarded, if long); only fall back to an explicit placeholder
    # when the source genuinely has nothing -- never silently omit real text.
    raw_provider = clean(institution)
    if raw_provider and is_url(institution):
        provider = 'Not specified in source'
    elif raw_provider:
        provider = raw_provider[:250]
    else:
        provider = 'Not specified in source'

    return {
        'name': re.sub(r'\s+', ' ', str(name).replace('\n', ' ')).strip(),
        'provider': provider,
        'description': ' | '.join(parts) or None,
        'eligibility_summary': eligibility_summary,
        'application_url': application_url,
        'status': 'active',
    }


def main():
    src, out = sys.argv[1], sys.argv[2]
    wb = openpyxl.load_workbook(src, data_only=True)
    ws = wb['Top Scholarships']
    records = []
    for row in ws.iter_rows(min_row=3, values_only=True):
        name = clean(row[1])
        if not name:
            continue
        records.append(build_record(name, row[4], row[5], row[6], row[7], row[8], row[9], row[10], row[11]))
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False, indent=1)
    print(f'Wrote {len(records)} records to {out}')


if __name__ == '__main__':
    main()
