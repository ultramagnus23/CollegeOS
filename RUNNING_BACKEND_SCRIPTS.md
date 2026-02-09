# Running Backend Scripts from Root Directory

The scraping and monitoring scripts are in the backend, but can be run from the root directory using these commands:

## ⚠️ IMPORTANT: First-Time Setup

**Before running any scraping commands, you MUST complete these setup steps in order:**

```bash
# Step 1: Install backend dependencies
cd backend
npm install

# Step 2: Run database migrations (REQUIRED!)
npm run migrate
# Or from root: npm run backend:migrate

# Step 3: Seed database with college data
npm run seed
# Or from root: npm run backend:seed

# Step 4: Return to root directory
cd ..
```

**Common Error:** If you see `SqliteError: no such table: scrape_queue`, you forgot to run migrations (Step 2).

## Scraping Commands

**After completing setup above**, you can use these commands:

```bash
# Initialize the scraping queue with all colleges
npm run scrape:init

# Get today's batch of colleges to scrape
npm run scrape:batch

# Record daily scraping statistics
npm run scrape:stats

# View queue and freshness metrics
npm run scrape:metrics
```

## Monitoring Commands

```bash
# Generate comprehensive monitoring report
npm run monitor:report

# Export ML training dataset
npm run monitor:ml-export
```

## Backend Commands

```bash
# Start backend server in development mode
npm run backend:dev

# Start backend server in production mode
npm run backend:start

# Run database migrations (creates tables)
npm run backend:migrate

# Seed database with college data
npm run backend:seed
```

## Important Notes

1. **Working Directory**: All these commands automatically switch to the `backend` directory before running.

2. **Migration 029**: The scraping system requires migration 029, which creates:
   - `scrape_queue` - Priority-based scheduling
   - `scrape_audit_log` - Change tracking
   - `field_metadata` - Data quality metrics
   - `scrape_statistics` - Daily aggregated stats

3. **Setup Order Matters**: Always run migrations before seeding, and seed before initializing scraping.

4. **Direct Backend Access**: You can also run commands directly from the backend directory:
   ```bash
   cd backend
   npm run migrate
   npm run seed
   npm run scrape:init
   ```

## Troubleshooting

### Error: Missing script
If you see "Missing script" error, make sure you're running commands from the root directory or have updated to the latest version.

### Error: Cannot find module 'better-sqlite3'
Install backend dependencies:
```bash
cd backend
npm install
```

### Error: SqliteError: no such table: scrape_queue
**This is the most common error!** It means you haven't run migrations yet.

**Solution:**
```bash
# From root directory:
npm run backend:migrate

# Or from backend directory:
cd backend
npm run migrate
```

Then try your scraping command again:
```bash
npm run scrape:init
```

### Error: SqliteError: no such table: colleges
You need to seed the database first:
```bash
npm run backend:seed
```

### Database Errors
For other database errors, try running migrations again:
```bash
npm run backend:migrate
```

## Quick Reference: Complete Setup Flow

```bash
# 1. Clone repository (already done)
# 2. Install dependencies
cd backend && npm install && cd ..
npm install

# 3. Setup database
npm run backend:migrate    # Create tables
npm run backend:seed       # Load college data

# 4. Initialize scraping system
npm run scrape:init        # Setup scraping queue

# 5. Start using the system
npm run backend:dev        # Start backend server
npm run dev                # Start frontend (in another terminal)
```
