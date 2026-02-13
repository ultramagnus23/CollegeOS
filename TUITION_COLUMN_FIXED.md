# FIXED: Just Pull and Restart

## The Error

```
SqliteError: no such column: cf.tuition_out_of_state
```

## The Fix

Column name typo. Fixed in one line.

## What You Do

```bash
git pull origin copilot/remove-duplicate-data-files
```

Restart your backend.

**Done!** ✅

---

## Details (if you care)

Schema has: `tuition_out_state`  
Query had: `tuition_out_of_state` (wrong)

Fixed query to use correct column name.

No database changes needed.

**For full explanation:** See COLUMN_NAME_FIX.md
