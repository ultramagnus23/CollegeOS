# Fixed: Column Name Mismatch - tuition_out_state

## The Error You Saw

```
SqliteError: no such column: cf.tuition_out_of_state
```

## What Happened

Simple column name typo in the SQL query.

**Schema has:** `tuition_out_state`  
**Query expected:** `tuition_out_of_state`

## Root Cause

In migration 011 (line 158), the column was created as:
```sql
tuition_out_state INTEGER,
```

But the query in College.js (line 530) was looking for:
```sql
cf.tuition_out_of_state  -- Wrong! Has extra "of"
```

## The Fix

Changed the query to:
```sql
cf.tuition_out_state as tuition_out_of_state
```

This:
- ✅ Uses the correct column name from schema
- ✅ Aliases it for backward compatibility
- ✅ Works with existing formatCollege() code
- ✅ No migration needed!

## What You Need To Do

**Just pull the fix:**
```bash
git pull origin copilot/remove-duplicate-data-files
```

**Then restart your backend.**

**That's it!** ✅

## Why No Migration?

The database schema was correct all along. It was just the query that had the wrong column name. So we only needed to fix the code, not the database.

## Technical Details

**File changed:** `backend/src/models/College.js`  
**Line:** 530  
**Change:** `cf.tuition_out_of_state` → `cf.tuition_out_state as tuition_out_of_state`

The alias ensures formatCollege() still receives `tuition_out_of_state` as it expects, maintaining backward compatibility.

## Verification

After pulling and restarting:
1. Navigate to /api/colleges
2. Should return college data without errors
3. tuitionOutOfState field should be populated

## Summary

- ✅ Simple column name typo
- ✅ Fixed in one line
- ✅ No database changes needed
- ✅ Pull and restart

**Problem solved!** 🎉
