# Quick Fix: Zero Colleges Issue

## The Problem
You seeded data but see **zero colleges** in the application.

---

## The Solution

### 🚀 One Command Fix

```bash
npm run db:setup
```

**This will:**
1. Create database directory
2. Run migrations
3. Seed 6322 colleges
4. Verify everything works

**Takes:** ~2-3 minutes  
**Safe:** Can run multiple times

---

## Alternative: Diagnose First

```bash
npm run db:check
```

Shows exactly what's wrong and how to fix it.

---

## Common Causes

| Issue | Symptom | Fix |
|-------|---------|-----|
| **Database dir missing** | `ENOENT` error | `npm run db:setup` |
| **Wrong seed script** | Empty database | Use `seedFromUnifiedData.js` |
| **Migrations not run** | `no such table` | `npm run migrate` then `seed` |
| **Dependencies missing** | `Cannot find module` | `npm install` |

---

## Verify It Worked

```bash
npm run db:check
```

**Expected:**
```
✅ Database has 6322 colleges
📝 Sample: Harvard, Stanford, MIT...
```

---

## Start Your App

```bash
# Terminal 1: Backend
npm run backend:dev

# Terminal 2: Frontend  
npm run dev
```

Open: http://localhost:5173

---

## Still Not Working?

Read the full guide:
```
backend/TROUBLESHOOTING_ZERO_COLLEGES.md
```

Or get detailed diagnostic:
```bash
npm run db:diagnose
```

---

## Prevention

Always use the correct seed script:

```bash
cd backend
node scripts/seedFromUnifiedData.js --force
```

**NOT** `seedVerifiedData.js` or other scripts.

---

## Quick Commands

| Command | What It Does |
|---------|--------------|
| `npm run db:setup` | Complete automated setup ⭐ |
| `npm run db:check` | Quick health check |
| `npm run db:diagnose` | Detailed diagnostic |
| `npm run backend:migrate` | Create tables |
| `npm run backend:seed` | Seed database |

---

**TL;DR: Run `npm run db:setup` and you're done!** ✅
