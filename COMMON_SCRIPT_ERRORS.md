# Common npm Script Errors & Solutions

## Error: "Missing script: db:setup"

### Cause
Running the command from the wrong directory.

### Solution
Make sure you're in the **root directory** of the project:

```bash
# Check where you are
pwd

# Should show: /path/to/CollegeOS
# If not, navigate to root:
cd /path/to/CollegeOS

# Then run:
npm run db:setup
```

### Why This Happens
The `db:setup` script is defined in the root `package.json` and delegates to the backend:
```json
"db:setup": "cd backend && npm run db:setup"
```

If you're already in the `backend/` directory, the script won't be found.

---

## Error: "Missing script: seed" or Wrong Data Seeded

### Fixed! ✅
As of February 11, 2026, the seed script now correctly points to `seedFromUnifiedData.js`.

### Verify It's Fixed
```bash
cd backend
npm run seed
```

Should show:
```
Seeding database from unified_colleges.json...
✅ Seeded 6322 colleges
```

### If You Need Old Behavior
Use the alias script:
```bash
npm run seed:verified  # Seeds 10 colleges from verified data
```

---

## Quick Reference: Where to Run Commands

### From Root Directory (`/CollegeOS`)
```bash
npm run dev                # Start frontend
npm run build              # Build frontend
npm run backend:dev        # Start backend
npm run backend:seed       # Seed database
npm run db:setup          # Complete database setup
npm run db:check          # Check database status
```

### From Backend Directory (`/CollegeOS/backend`)
```bash
npm run dev               # Start backend
npm run migrate           # Run migrations
npm run seed              # Seed database
npm run db:setup          # Complete database setup
npm run scrape            # Start scraping
```

---

## Complete Setup Commands

### Option 1: One Command (Recommended) ⭐
```bash
# From root directory
npm run db:setup
```

This automatically:
1. Creates database directory
2. Runs migrations
3. Seeds 6,322 colleges
4. Verifies success

### Option 2: Manual Steps
```bash
# From root directory
npm run backend:migrate   # Step 1: Create tables
npm run backend:seed      # Step 2: Load colleges
npm run db:check         # Step 3: Verify
```

---

## Troubleshooting

### "Cannot find module 'better-sqlite3'"
```bash
cd backend
npm install
```

### "no such table: colleges"
```bash
npm run backend:migrate
```

### "Database file doesn't exist"
```bash
npm run db:setup  # Creates everything
```

### "Seeing zero colleges"
```bash
# Check database status
npm run db:check

# If empty, run complete setup
npm run db:setup
```

---

## All Available Scripts

### Root Directory Scripts
| Script | Description |
|--------|-------------|
| `npm run dev` | Start frontend dev server |
| `npm run build` | Build frontend for production |
| `npm run backend:dev` | Start backend dev server |
| `npm run backend:start` | Start backend production |
| `npm run backend:migrate` | Run database migrations |
| `npm run backend:seed` | Seed database (6,322 colleges) |
| `npm run db:setup` | Complete database setup |
| `npm run db:check` | Check database status |
| `npm run db:diagnose` | Detailed diagnostic |
| `npm run scrape:init` | Initialize scraping queue |
| `npm run scrape:batch` | Get scraping batch |
| `npm run monitor:report` | Scraping report |

### Backend Directory Scripts
| Script | Description |
|--------|-------------|
| `npm start` | Start backend production |
| `npm run dev` | Start backend dev server |
| `npm run migrate` | Run database migrations |
| `npm run seed` | Seed database (6,322 colleges) |
| `npm run seed:verified` | Seed verified data (10 colleges) |
| `npm run seed:comprehensive` | Seed comprehensive data |
| `npm run seed:majors` | Seed normalized majors |
| `npm run db:setup` | Complete database setup |
| `npm run db:check` | Check database status |
| `npm run scrape` | Start scraping |
| `npm run scrape:reset` | Reset and start scraping |

---

## Best Practices

1. **Always run `db:setup` for initial setup**
   ```bash
   npm run db:setup
   ```

2. **Check status before assuming errors**
   ```bash
   npm run db:check
   ```

3. **Run from correct directory**
   - Root directory for most commands
   - Backend directory only when necessary

4. **Use the comprehensive seed script**
   - `npm run seed` now uses `seedFromUnifiedData.js` (6,322 colleges)
   - Old scripts available as `seed:verified`, `seed:legacy`, etc.

---

## Quick Fixes

| Problem | Solution |
|---------|----------|
| Missing script error | Check your current directory (`pwd`) |
| Zero colleges | Run `npm run db:setup` |
| No database file | Run `npm run db:setup` |
| Wrong data seeded | Run `npm run db:setup` (now uses correct file) |
| Migrations not run | Run `npm run backend:migrate` |
| Dependencies missing | Run `npm install` in both root and backend |

---

## Need Help?

Check these files:
- `QUICK_FIX_ZERO_COLLEGES.md` - Zero colleges issue
- `backend/TROUBLESHOOTING_ZERO_COLLEGES.md` - Complete troubleshooting
- `backend/HOW_TO_START_SCRAPING.md` - Scraping guide
- `backend/DATA_FLOW_EXPLAINED.md` - Data architecture

Or run diagnostic:
```bash
npm run db:diagnose
```
