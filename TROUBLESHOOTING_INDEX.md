# CollegeOS Troubleshooting Index

Quick reference guide to all troubleshooting documentation.

## 🚀 Start Here

**New to CollegeOS?** → Read `START_HERE.md`

**Want clean setup?** → Run `cd backend && ./fresh-start.sh`

---

## 📚 Issue-Specific Guides

### Database Issues

| Error | Guide | Quick Fix |
|-------|-------|-----------|
| "database disk image is malformed" | `DATABASE_CORRUPT_FIX.md` | `cd backend && ./fresh-start.sh` |
| "table colleges has no column named type" | `SCHEMA_ERROR_FIX.md` | `cd backend && ./fresh-start.sh` |
| Wrong database path (database.sqlite) | `DATABASE_PATH_FIX.md` | `cd backend && ./fresh-start.sh` |
| Migration errors (004, grade_level) | `backend/MIGRATION_TROUBLESHOOTING.md` | `cd backend && ./fresh-start.sh` |

### Authentication Issues

| Error | Guide | Quick Fix |
|-------|-------|-----------|
| "Internal server error" during login/registration | `ONBOARDING_ERROR_FIX.md` | Check `backend/.env` exists |
| "secretOrPrivateKey must have a value" | `ONBOARDING_ERROR_FIX.md` | Copy from `backend/.env.example` |

### Frontend Issues

| Error | Guide | Quick Fix |
|-------|-------|-----------|
| Blank app, no colleges showing | `APP_BLANK_TROUBLESHOOTING.md` | Start backend first: `cd backend && npm start` |
| Search not working | `APP_BLANK_TROUBLESHOOTING.md` | Verify backend on port 5000 |

### Setup Issues

| Error | Guide | Quick Fix |
|-------|-------|-----------|
| "Cannot find module 'better-sqlite3'" | `START_HERE.md` | `cd backend && npm install` |
| Any setup confusion | `START_HERE.md` | Follow step-by-step guide |

---

## 🔧 Universal Fix

**If you're unsure what's wrong or tried multiple things:**

```bash
cd backend
./fresh-start.sh
```

This script fixes:
- ✅ Database corruption
- ✅ Schema mismatches
- ✅ Migration errors
- ✅ Wrong database paths
- ✅ .env path issues

Then start servers:
```bash
# Terminal 1
cd backend
npm start

# Terminal 2
npm run dev
```

---

## 📖 Complete Documentation

### Quick Guides
- `START_HERE.md` - Main setup guide (READ THIS FIRST)
- `FINAL_SUMMARY.md` - Complete implementation overview

### Database Troubleshooting
- `DATABASE_CORRUPT_FIX.md` - Corruption recovery (SQLITE_CORRUPT)
- `DATABASE_PATH_FIX.md` - .env path issues
- `SCHEMA_ERROR_FIX.md` - Schema mismatch errors
- `backend/MIGRATION_TROUBLESHOOTING.md` - Migration problems

### Application Troubleshooting
- `ONBOARDING_ERROR_FIX.md` - Authentication/JWT errors
- `APP_BLANK_TROUBLESHOOTING.md` - Frontend connection issues
- `BACKEND_FRONTEND_CONNECTION.md` - Technical setup details

### Reference Documentation
- `OVERHAUL_COMPLETE.md` - Complete implementation details
- `backend/scripts/README.md` - Scripts documentation
- `backend/.env.example` - Configuration template

### Automated Tools
- `backend/fresh-start.sh` - One-command database setup
- `check-setup.sh` - Pre-flight verification
- `backend/test-backend.sh` - Endpoint testing

---

## 🎯 Common Scenarios

### Scenario 1: First Time Setup

1. `cd backend && npm install`
2. `cd .. && npm install`
3. `cd backend && ./fresh-start.sh`
4. `npm start` (in backend)
5. `npm run dev` (in root)

### Scenario 2: Pulled Latest Changes

1. `cd backend && npm install` (in case of new dependencies)
2. `cd backend && ./fresh-start.sh` (if database schema changed)
3. `npm start` (in backend)
4. `npm run dev` (in root)

### Scenario 3: Database Corruption

1. Stop backend (Ctrl+C)
2. `cd backend && ./fresh-start.sh`
3. `npm start`

### Scenario 4: Authentication Errors

1. Check `backend/.env` exists
2. If not: `cp backend/.env.example backend/.env`
3. Restart backend: `cd backend && npm start`

### Scenario 5: Blank App

1. Ensure backend running: `curl http://localhost:5000/health`
2. If not running: `cd backend && npm start`
3. Ensure database seeded: `cd backend && ./fresh-start.sh`
4. Start frontend: `npm run dev`

---

## 🆘 Still Stuck?

1. **Read the error message carefully** - It often tells you exactly what's wrong
2. **Check which guide applies** - Use the table above
3. **Try fresh-start.sh** - Solves 90% of database issues
4. **Verify both servers running** - Backend on 5000, frontend on 8080
5. **Check the specific guide** - Each error has detailed documentation

---

## ✅ How to Verify Everything Works

```bash
# Backend health check
curl http://localhost:5000/health
# Should return: {"success":true,"message":"College App Backend is running"}

# Check database has colleges
cd backend
sqlite3 database/college_app.db "SELECT COUNT(*) FROM colleges;"
# Should show: 1100

# Check colleges endpoint
curl http://localhost:5000/api/colleges?limit=3
# Should return array of 3 colleges

# Open frontend
# Visit http://localhost:8080 in browser
# Should see colleges list
```

---

## 📞 Need More Help?

All error messages in the application are designed to be clear and actionable. They will:
- Tell you exactly what's wrong
- Suggest the specific fix
- Reference the appropriate documentation

Follow the suggested fix, and if it doesn't work, check the referenced documentation for detailed troubleshooting.
