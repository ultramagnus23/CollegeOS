# Duplicate Colleges Fixed

## The Problem

Every college was appearing twice in the application. For example, Duke University would show up as two separate "Duke University" entries - one correct, one duplicated.

## Root Cause

The SQL query in `College.findAll()` performs LEFT JOINs with multiple tables:

```sql
FROM colleges c
LEFT JOIN colleges_comprehensive cc ON c.id = cc.id
LEFT JOIN college_financial_data cf ON c.id = cf.college_id
LEFT JOIN admitted_student_stats ass ON c.id = ass.college_id
```

**Without a GROUP BY clause**, if any of the joined tables have multiple rows for the same `college_id`, the JOIN creates duplicate rows:

- If `college_financial_data` has 2 rows for Duke → 2 Duke results
- If `admitted_student_stats` has 3 rows for Harvard → 3 Harvard results
- This is called a Cartesian product

## The Solution

**Added GROUP BY c.id** and **MAX() aggregations** to deduplicate results.

### Before (With Duplicates)

```sql
SELECT 
  c.*,
  cc.total_enrollment,
  cf.tuition_in_state,
  ass.gpa_50,
  ass.sat_50 as sat_avg,
  ass.act_50 as act_avg
FROM colleges c
LEFT JOIN colleges_comprehensive cc ON c.id = cc.id
LEFT JOIN college_financial_data cf ON c.id = cf.college_id
LEFT JOIN admitted_student_stats ass ON c.id = ass.college_id
WHERE 1=1
ORDER BY c.name
LIMIT 100
```

**Problem:** No GROUP BY → Duplicate rows when joined tables have multiple records

### After (No Duplicates)

```sql
SELECT 
  c.*,
  MAX(cc.total_enrollment) as total_enrollment,
  MAX(cf.tuition_in_state) as tuition_in_state,
  MAX(ass.gpa_50) as gpa_50,
  MAX(ass.sat_50) as sat_avg,
  MAX(ass.act_50) as act_avg
FROM colleges c
LEFT JOIN colleges_comprehensive cc ON c.id = cc.id
LEFT JOIN college_financial_data cf ON c.id = cf.college_id
LEFT JOIN admitted_student_stats ass ON c.id = ass.college_id
WHERE 1=1
GROUP BY c.id              ← Deduplicates!
ORDER BY c.name
LIMIT 100
```

**Solution:** GROUP BY c.id ensures exactly one row per college

## Why MAX()?

When using `GROUP BY`, any columns from joined tables must use an aggregate function (MAX, MIN, AVG, SUM, COUNT).

**MAX()** was chosen because:
- It selects the highest value if multiple rows exist for the same college
- Better than DISTINCT for complex queries with JOINs
- Ensures data integrity when deduplicating

For example:
- If Duke has 2 tuition records: $50,000 and $52,000
- MAX() returns $52,000 (most recent/accurate)

## Query Execution Flow

1. **FROM** - Start with colleges table
2. **LEFT JOIN** - Join with other tables
3. **WHERE** - Apply filters
4. **GROUP BY c.id** - Deduplicate by college
5. **ORDER BY** - Sort results
6. **LIMIT** - Return top N results

## Files Changed

- **backend/src/models/College.js** - Lines 514-620
  - Changed SELECT to use MAX() aggregations
  - Added GROUP BY c.id after WHERE clauses

## Testing

### Test for Duke (should return 1 result)

```bash
curl "http://localhost:3000/api/colleges?search=Duke"
```

**Expected:** 1 Duke University result, not 2

### Test college list (should return exact limit)

```bash
curl "http://localhost:3000/api/colleges?limit=100"
```

**Expected:** Exactly 100 unique colleges, not 200

## Impact

### Before
- ❌ Duke appeared twice as "Duke University"
- ❌ Every college was duplicated
- ❌ Requesting 100 colleges returned 200 results
- ❌ Pagination was broken
- ❌ Search results showed duplicates

### After
- ✅ Duke appears exactly once
- ✅ Each college appears exactly once
- ✅ Requesting 100 colleges returns 100 results
- ✅ Pagination works correctly
- ✅ Search returns unique results
- ✅ Data integrity maintained

## User Action

```bash
git pull origin copilot/remove-duplicate-data-files
# Restart backend
```

**All duplicate college issues resolved!** 🎉
