# SAT/ACT Column Fix

## The Error

```
SqliteError: no such column: ass.sat_avg
```

## Root Cause

The SQL query in `College.findAll()` was looking for:
- `ass.sat_avg`
- `ass.act_avg`

But the actual column names in the database schema (migration 011) are:
- `sat_50` (50th percentile SAT score)
- `act_50` (50th percentile ACT score)

## Why _50 Instead of _avg?

The schema uses `_50` suffix because these represent the **50th percentile** (median) scores, not averages:

- `sat_50` = Median SAT score of admitted students
- `act_50` = Median ACT score of admitted students

This is more accurate than "average" - it represents the middle score, meaning 50% of admitted students scored above this and 50% scored below.

## The Fix

Changed the query in `backend/src/models/College.js` (lines 533-534):

```diff
- ass.sat_avg,
- ass.act_avg,
+ ass.sat_50 as sat_avg,
+ ass.act_50 as act_avg,
```

This:
- ✅ Queries the correct column names from the schema
- ✅ Aliases them to maintain backward compatibility
- ✅ formatCollege() receives expected field names
- ✅ No migration needed (schema was correct)

## User Action

```bash
git pull origin copilot/remove-duplicate-data-files
# Restart backend
```

**Works immediately!** ✅

## Technical Details

**Table:** `admitted_student_stats`  
**Correct columns:** `sat_50`, `act_50`  
**Wrong query:** `sat_avg`, `act_avg`  
**Fix:** Use correct names + aliases  

**Schema location:** `backend/migrations/011_comprehensive_college_schema.sql` (lines 94-101)

## Part of Complete Fix

This is one of 3 column name fixes in College.findAll():
1. ✅ `tuition_out_state` (was: `tuition_out_of_state`)
2. ✅ `sat_50` (was: `sat_avg`)
3. ✅ `act_50` (was: `act_avg`)

See `ALL_COLUMN_FIXES_COMPLETE.md` for complete summary.

**Problem solved!** 🎉
