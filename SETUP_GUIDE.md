# CollegeOS Complete Setup Guide

This guide walks you through initializing CollegeOS from scratch, including the new comprehensive university data (470+ universities) and the rule-based recommendation system.

## Prerequisites

- **Node.js** v18+ (recommended: v20+)
- **npm** v9+ or **yarn**
- Internet connection (for College Scorecard API - optional)

## Quick Start

```bash
# 1. Install all dependencies
npm install
cd backend && npm install && cd ..

# 2. Initialize the database with migrations
cd backend && npm run migrate && cd ..

# 3. Seed comprehensive university data (470+ universities)
node backend/scripts/seed_comprehensive.js --force

# 4. Start the backend server
cd backend && npm run dev &

# 5. Start the frontend
npm run dev
```

Open http://localhost:8080 in your browser.

---

## Detailed Setup Instructions

### Step 1: Install Dependencies

**Root (Frontend):**
```bash
npm install
```

**Backend:**
```bash
cd backend
npm install
cd ..
```

### Step 2: Configure Environment

Copy the example environment file:
```bash
cd backend
cp .env.example .env
```

Edit `.env` with your settings:
```env
# Server
PORT=5000
NODE_ENV=development

# Database (auto-created)
DATABASE_PATH=./database/college_app.db

# JWT Secret (generate a secure random string)
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# Optional: College Scorecard API Key
# Get one at: https://api.data.gov/signup/
SCORECARD_API_KEY=your-api-key-here
```

### Step 3: Initialize Database

The database migrations create all necessary tables:

```bash
cd backend
npm run migrate
```

This runs migrations:
- `001_create_colleges.sql` - Base colleges table
- `002_recommendations.sql` - Recommendations system
- `003_timeline.sql` - Timeline features
- `004_user_profile.sql` - User profiles
- `005_unified_colleges_schema.sql` - Comprehensive college schema
- `006_fix_users_schema.sql` - User schema fixes
- `007_user_interactions.sql` - Interaction logging for future ML

### Step 4: Seed University Data

Seed the database with verified university data from official sources:

```bash
# Basic seeding (uses static data for all regions)
node backend/scripts/seed_comprehensive.js --force

# With College Scorecard API (fetches ALL US colleges - 6000+)
# This takes several minutes but provides comprehensive US data
node backend/scripts/seed_comprehensive.js --force --api

# Verbose mode (shows each university as it's inserted)
node backend/scripts/seed_comprehensive.js --force --verbose
```

**Data Sources:**
- 🇺🇸 **US**: College Scorecard API (Department of Education) - **6,000+ colleges when using --api**
- 🇬🇧 **UK**: HESA (Higher Education Statistics Agency) - 138 universities
- 🇮🇳 **India**: UGC/AICTE/NIRF - 121 institutions
- 🇪🇺 **Europe**: Official registries - 184 universities (20+ countries)

**Expected Output (with --api flag):**
```
🌱 CollegeOS Comprehensive University Seeding

📂 Database path: /path/to/database/college_app.db
✅ Connected to database

📋 Options:
   --force: YES
   --api:   YES
   --verbose: NO

🧹 Cleaning existing college data...
   ✅ Existing colleges removed
🇬🇧 Loading UK universities from HESA data...
   ✅ Loaded 138 UK universities
🇮🇳 Loading Indian institutions from UGC/NIRF data...
   ✅ Loaded 121 Indian institutions
🇪🇺 Loading European universities...
   ✅ Loaded 184 European universities
🇺🇸 Fetching US colleges from College Scorecard API...
   📡 Connecting to College Scorecard API (US Dept of Education)...
   📥 Fetched 100 US colleges...
   📥 Fetched 500 US colleges...
   📥 Fetched 1000 US colleges...
   ...
   ✅ Fetched 6000+ US colleges from College Scorecard

📚 Inserting 6443+ universities...

📊 Summary:
   Inserted: 6443+
   Failed: 0
   Total in database: 6443+

📍 By Country:
   🇺🇸 US: 6000+
   🇪🇺 EU: 184
   🇬🇧 UK: 138
   🇮🇳 IN: 121

🎉 Seeding completed!
```

### Step 5: Start the Application

**Option A: Development Mode (recommended)**

Terminal 1 - Backend:
```bash
cd backend
npm run dev
```

Terminal 2 - Frontend:
```bash
npm run dev
```

**Option B: Single Command**

```bash
# From project root
cd backend && npm run dev &
npm run dev
```

### Step 6: Verify Everything Works

1. **Health Check:**
   ```bash
   curl http://localhost:5000/health
   ```
   Expected: `{"success":true,"message":"College App Backend is running",...}`

2. **List Colleges:**
   ```bash
   curl http://localhost:5000/api/colleges
   ```
   Expected: Array of 470+ colleges

3. **Get Recommendations (requires login):**
   ```bash
   # First register/login to get a token, then:
   curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:5000/api/recommendations
   ```

4. **Profile Comparison:**
   ```bash
   curl http://localhost:5000/api/profile-comparison/health
   ```
   Expected: `{"status":"operational",...}`

---

## New Features in This Release

### 1. Rule-Based Recommendation Engine

The recommendation engine uses explicit, deterministic scoring:

| Signal | Weight | Description |
|--------|--------|-------------|
| Major Alignment | 0.25 | Match between user's intended major and college programs |
| Academic Fit | 0.20 | User's academic strength vs college selectivity |
| Test Compatibility | 0.15 | SAT/ACT/IB score requirements |
| Country Preference | 0.15 | Matches user's target countries |
| Cost Alignment | 0.15 | Budget sensitivity vs tuition |
| Admission Probability | 0.10 | Acceptance rate proxy |

**Endpoints:**
- `GET /api/recommendations` - Get categorized recommendations (Reach/Match/Safety)
- `GET /api/recommendations/explain/:collegeId` - Detailed scoring breakdown
- `POST /api/recommendations/interactions` - Log user actions

### 2. Profile Comparison Service

Compare user's academic profile against typical admitted students:

**Constraints:**
- ❌ No ML or probability predictions
- ❌ No fabricated data
- ✅ Dimension-by-dimension comparison
- ✅ Status labels: "Above average", "About average", "Below average"

**Endpoints:**
- `GET /api/profile-comparison/college/:id` - Compare with specific college
- `POST /api/profile-comparison/search` - Search and compare
- `GET /api/profile-comparison/scorecard/:name` - Raw Scorecard data

### 3. Comprehensive University Data

**470+ universities from official sources:**

| Region | Count | Data Source |
|--------|-------|-------------|
| UK | 150 | HESA |
| India | 120 | UGC/NIRF |
| Europe | 200 | Official Registries |
| US | 40+ | College Scorecard |

**European Countries:**
- Germany (35), France (25), Netherlands (13), Italy (15), Spain (15)
- Switzerland (8), Sweden (5), Denmark (5), Norway (5), Finland (5)
- Austria (5), Poland (5), Czech Republic (5), Belgium (5)
- Ireland (5), Portugal (5)

### 4. Interaction Logging

Logs user actions for future ML training:

```javascript
// Example: Log a college view
POST /api/recommendations/interactions
{
  "action": "view",
  "collegeId": 123
}

// Supported actions: view, save, click, apply, dismiss
```

---

## Frontend Components

### CollegeProfileComparison.tsx

Shows dimension-by-dimension academic comparison:
- GPA comparison with typical admitted range
- SAT/ACT score ranges
- Visual status indicators (Above/About/Below average)
- Data source attribution

### UserProfileSummary.tsx

Displays user's academic profile:
- GPA, SAT, ACT, IB scores
- Subjects and intended majors
- Extracurriculars and awards
- Compact and full view modes

---

## Troubleshooting

### Database Issues

**"no such table: colleges"**
```bash
cd backend && npm run migrate
```

**"database is locked"**
```bash
# Stop all node processes
pkill node
# Then restart
```

**Corrupt database**
```bash
# Remove and recreate
rm backend/database/college_app.db
cd backend && npm run migrate
node scripts/seed_comprehensive.js --force
```

### API Connection Issues

**CORS errors**
Ensure backend is running on port 5000 and frontend on 8080.

**401 Unauthorized**
Check that your JWT token is valid and not expired.

### Seeding Issues

**"SCORECARD_API_KEY not set"**
This is a warning, not an error. The script will use static US data.

**"Failed to load UK/India/EU data"**
Ensure the data files exist in `backend/data/`:
- `uk_universities.json`
- `india_universities.json`
- `eu_universities.json`

---

## Architecture Overview

```
CollegeOS/
├── src/                          # Frontend (React + TypeScript)
│   ├── components/
│   │   ├── CollegeProfileComparison.tsx  # NEW: Profile comparison UI
│   │   └── UserProfileSummary.tsx        # NEW: User profile display
│   ├── pages/
│   │   ├── Colleges.tsx          # College search/browse
│   │   └── CollegeDetails.tsx    # College detail view
│   ├── services/
│   │   └── api.ts                # API client
│   └── types/
│       └── api.types.ts          # NEW: Recommendation types
│
├── backend/
│   ├── src/
│   │   ├── app.js                # Express app setup
│   │   ├── routes/
│   │   │   ├── colleges.js       # College CRUD
│   │   │   ├── recommendations.js # NEW: Recommendations API
│   │   │   └── profileComparison.js # NEW: Profile comparison API
│   │   └── models/
│   │       ├── College.js        # College model
│   │       └── User.js           # User model (with getAcademicProfile)
│   ├── services/
│   │   ├── collegeRecommendationService.js  # NEW: Recommendation engine
│   │   ├── profileComparisonService.js      # NEW: Profile comparison
│   │   ├── collegeScorecardService.js       # NEW: Scorecard API
│   │   └── interactionLogService.js         # NEW: Interaction logging
│   ├── data/
│   │   ├── uk_universities.json      # NEW: 150 UK universities
│   │   ├── india_universities.json   # NEW: 120 Indian institutions
│   │   └── eu_universities.json      # NEW: 200 European universities
│   ├── scripts/
│   │   └── seed_comprehensive.js     # NEW: Comprehensive seeder
│   └── migrations/
│       └── 007_user_interactions.sql # NEW: Interaction table
```

---

## Next Steps

After setup, you can:

1. **Register an account** at http://localhost:8080/auth
2. **Complete onboarding** with your academic profile
3. **Browse colleges** at /colleges (470+ available)
4. **View recommendations** at /recommendations
5. **Compare your profile** against specific colleges

---

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review logs: `backend/logs/` (if Winston file transport is enabled)
3. Check console output in both terminals

---

**Happy college hunting! 🎓**
