# Database Corruption Fix Guide

## Error: "database disk image is malformed" (SQLITE_CORRUPT)

This error indicates the SQLite database file has become corrupted. This can happen due to:
- Improper shutdown of the application
- System crashes while database is being written
- File system issues
- Multiple processes accessing database simultaneously

## Quick Fix

### Option 1: Use Fresh Start Script (Recommended)

```bash
cd backend
./fresh-start.sh
```

This will:
1. Delete the corrupted database
2. Create a fresh database from scratch
3. Run all migrations
4. Seed with 1100 colleges

**This is the fastest and most reliable solution.**

---

### Option 2: Manual Database Rebuild

If you want to manually fix it:

```bash
cd backend

# Step 1: Stop the backend server if it's running
# Press Ctrl+C in the terminal running npm start

# Step 2: Delete corrupted database files
rm -f database/college_app.db
rm -f database/college_app.db-shm
rm -f database/college_app.db-wal

# Step 3: Run migrations to create fresh database
node scripts/runMigrations.js

# Step 4: Seed the database
node scripts/seedCollegesNew.js

# Step 5: Start the backend
npm start
```

---

### Option 3: Repair with SQLite (If you want to try recovery)

**Warning:** This rarely works with SQLITE_CORRUPT errors, but you can try:

```bash
cd backend

# Create a dump (might fail if too corrupted)
sqlite3 database/college_app.db ".dump" > backup.sql

# Remove corrupted database
rm database/college_app.db database/college_app.db-shm database/college_app.db-wal

# Restore from dump
sqlite3 database/college_app.db < backup.sql

# If this works, restart the server
npm start
```

If the dump command fails with errors, use Option 1 or 2 instead.

---

## Prevention

To prevent database corruption in the future:

### 1. Properly Stop the Backend

Always use **Ctrl+C** to stop the server gracefully. Don't force kill the process or shut down your computer while the app is running.

### 2. Ensure Clean Shutdowns

Before shutting down your computer:
1. Stop the backend server (Ctrl+C)
2. Wait for the server to fully exit
3. Then shut down your computer

### 3. Use WAL Mode Properly (Already Configured)

The database is configured to use WAL (Write-Ahead Logging) mode, which is more resilient to corruption. However, it requires proper shutdowns.

### 4. Regular Backups

Periodically back up your database:

```bash
cd backend
cp database/college_app.db database/college_app.db.backup
```

Or use SQLite's backup command:

```bash
sqlite3 database/college_app.db ".backup database/college_app.db.backup"
```

---

## Understanding the Error

**What happened:**
- The database file structure became invalid
- SQLite cannot read the internal data structures
- This is usually due to incomplete write operations

**Why WAL files exist:**
- `-shm`: Shared memory file for WAL mode
- `-wal`: Write-Ahead Log file containing recent changes
- These files are created automatically by SQLite in WAL mode

**When corruption occurs:**
- System crash during database write
- Improper process termination
- File system issues
- Power loss

---

## After Fix: Verification

After rebuilding the database, verify everything works:

```bash
# Check database exists and has data
cd backend
sqlite3 database/college_app.db "SELECT COUNT(*) FROM colleges;"
# Should show: 1100

# Check users table exists
sqlite3 database/college_app.db "SELECT COUNT(*) FROM users;"
# Should show: 0 (or number of registered users)

# Start backend and test
npm start
# Should start without errors

# In another terminal, test endpoints
curl http://localhost:5000/health
# Should return: {"success":true,"message":"College App Backend is running"}

curl http://localhost:5000/api/colleges?limit=3
# Should return array of 3 colleges
```

---

## Still Having Issues?

If the corruption persists after trying these fixes:

1. **Check disk space:**
   ```bash
   df -h
   ```
   Ensure you have adequate free space.

2. **Check file permissions:**
   ```bash
   ls -la backend/database/
   ```
   Ensure you have write permissions.

3. **Check for multiple processes:**
   ```bash
   lsof backend/database/college_app.db 2>/dev/null || echo "No processes found"
   ```
   Only one process should access the database at a time.

4. **Check file system:**
   If on Windows, run disk check:
   ```cmd
   chkdsk C: /F
   ```

5. **Use fresh-start.sh:**
   It's the most reliable solution and takes less than a minute.

---

## Summary

**Immediate Solution:**
```bash
cd backend
./fresh-start.sh
npm start
```

**Future Prevention:**
- Always use Ctrl+C to stop the server
- Don't force kill processes
- Shut down properly
- Consider periodic backups

**Why This Happened:**
The database file was corrupted, likely due to improper shutdown or system issue. SQLite is robust but requires clean shutdowns when using WAL mode.
