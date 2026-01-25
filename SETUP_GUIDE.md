# CollegeOS Setup Guide - See All Changes

## Quick Start (TL;DR)

```bash
# 1. Seed database with real colleges
cd backend && node scripts/seed_real_colleges.js

# 2. Start backend (Terminal 1)
cd backend && npm start

# 3. Start frontend (Terminal 2)
npm start

# 4. Open browser → http://localhost:8080
```

## Step 1: Pull Latest Changes

```bash
# Make sure you have the latest code
git checkout copilot/fix-layer-3-backend-logic
git pull origin copilot/fix-layer-3-backend-logic
```

## Step 2: Clear and Seed Database with Real Colleges

### Option A: Run the Seeding Script (Recommended)
```bash
cd backend

# This will:
# 1. Delete ALL existing colleges (removes duplicates/fakes)
# 2. Fetch 100+ real US colleges from Department of Education API
# 3. Add curated UK, India, Singapore, Australia, Netherlands, Germany universities
node scripts/seed_real_colleges.js
```

**Expected Output:**
```
Clearing existing colleges...
Deleted 1105 existing colleges

Fetching US colleges from Department of Education API...
Fetched 100 US colleges

Adding international colleges...
Added 10 UK universities
Added 10 Indian universities
Added 2 Singapore universities
Added 4 Australian universities
Added 4 Netherlands universities
Added 4 German universities

Database seeded successfully!
Total colleges: 134
```

### Option B: Manual Database Reset
```bash
cd backend

# Backup current database (optional)
cp database/college_app.db database/college_app.db.backup

# Clear colleges table
sqlite3 database/college_app.db "DELETE FROM colleges;"

# Run seeding script
node scripts/seed_real_colleges.js
```

### Option C: Start Fresh Database
```bash
cd backend

# Delete old database
rm database/college_app.db

# Restart backend - it will create new database
npm start

# In another terminal, seed with real data
node scripts/seed_real_colleges.js
```

## Step 3: Install Dependencies (If Needed)

### Backend
```bash
cd backend
npm install
```

### Frontend
```bash
cd ..  # back to root
npm install
```

## Step 4: Start the Application

### Terminal 1 - Start Backend
```bash
cd backend
npm start

# Backend should start on http://localhost:5000
# You should see: "College App Backend is running"
```

### Terminal 2 - Start Frontend
```bash
# From root directory
npm start

# Frontend should start on http://localhost:8080
# Browser should open automatically
```

## Step 5: See All New Features

### 1. College Search with Alias Resolution
**Navigate to:** `http://localhost:8080/research`

**Test queries:**
- Type: `MIT requirements` → Should resolve to "Massachusetts Institute of Technology"
- Type: `UVA admissions` → Should resolve to "University of Virginia"
- Type: `IIT` → Should find Indian Institute of Technology colleges
- Type: `obscure college name` → Should trigger Layer 3 web search with purple badges

**What you'll see:**
- 3 search modes: Intelligent Search, Search by Major, Browse All
- Purple "Web Result" badges for Layer 3 external search
- Layer indicator showing "Layer 1 (Database)" or "Layer 3 (Web Search)"
- Trust-based ranking (official sources first)

### 2. Add New College
**Navigate to:** `http://localhost:8080/colleges/add`

**What you'll see:**
- Form with fields: Name, Country, Website, Acceptance Rate
- Majors/Programs (comma-separated)
- Strengths/Features (comma-separated)
- Validation that works correctly (no more collegeId errors!)

### 3. Browse Colleges
**Navigate to:** `http://localhost:8080/colleges`

**What you'll see:**
- Real colleges with correct URLs (ASU = asu.edu, MIT = mit.edu)
- "Add College" button in top-right
- All college links now work correctly

### 4. Search with Expanded Keywords
**Try these searches:**
- "admission essays" → Now works (previously returned nothing)
- "SOP" → Finds statement of purpose information
- "personal statement" → Works correctly
- "entry requirements" → Finds admission requirements

## Step 6: Verify Database Has Real Data

```bash
cd backend

# Check total colleges
sqlite3 database/college_app.db "SELECT COUNT(*) FROM colleges;"

# List first 10 colleges
sqlite3 database/college_app.db "SELECT name, country FROM colleges LIMIT 10;"

# Check for duplicates (should return 0)
sqlite3 database/college_app.db "SELECT name, COUNT(*) as count FROM colleges GROUP BY name HAVING count > 1;"

# Verify correct URLs
sqlite3 database/college_app.db "SELECT name, website FROM colleges WHERE name LIKE '%MIT%' OR name LIKE '%Arizona State%';"
```

**Expected Results:**
- Total colleges: 130+ (depending on API response)
- No duplicates
- MIT URL: https://www.mit.edu
- ASU URL: https://www.asu.edu

## Step 7: Test All New Features

### Test Alias Resolution
```bash
# In browser console or via API test
curl -X POST http://localhost:5000/api/intelligent-search \
  -H "Content-Type: application/json" \
  -d '{"query": "MIT requirements"}'

# Should return results for "Massachusetts Institute of Technology"
```

### Test Layer 3 Web Search
1. Search for: "some random fake university name"
2. Database will return 0 results
3. Layer 3 will automatically trigger
4. You'll see purple "Web Result" badges
5. Results will show "Layer 3 (Web Search)" indicator

### Test Trust-Based Ranking
1. Search for: "stanford"
2. Results should be sorted by trust tier
3. Official sources appear first
4. Web search results appear last

### Test College Creation
1. Go to http://localhost:8080/colleges/add
2. Fill in form:
   - Name: "Test University"
   - Country: "United States"
   - Website: "https://test.edu"
   - Majors: "Computer Science, Engineering"
3. Click "Add College"
4. Should succeed without validation errors

## Troubleshooting

### Database File Locked
**On macOS/Linux:**
```bash
# Find Node processes
ps aux | grep node

# Note the PID number, then:
# kill <PID>  (replace <PID> with the actual number)
```

**On Windows:**
```bash
# Find process using port 5000
netstat -ano | findstr :5000

# Note the PID, then:
taskkill /F /PID <PID>
```

### Seeding Script Fails
```bash
# Check if you need API key for more US colleges
# Get free key from: https://api.data.gov/signup/

# Add to backend/.env
US_DOE_API_KEY=your_api_key_here

# Run script again
node scripts/seed_real_colleges.js
```

### Frontend Not Showing Changes
```bash
# Clear browser cache
# Or open in incognito/private window

# Rebuild frontend
npm run build
npm start
```

### Backend Not Starting
```bash
cd backend

# Check if .env file exists
ls -la .env

# If not, copy from example
cp .env.example .env

# Edit .env and add JWT_SECRET
echo "JWT_SECRET=your_secret_key_here" >> .env

# Restart
npm start
```

## Summary of What's New

✅ **11 New Files Created:**
- `backend/src/services/collegeAliasResolver.js` - 100+ abbreviation mappings
- `backend/src/services/layer3Search.js` - Web search integration
- `backend/scripts/seed_real_colleges.js` - Real college data seeding
- `src/pages/AddCollege.tsx` - College creation UI
- Plus 7 documentation files

✅ **9 Files Enhanced:**
- Search with alias resolution ("MIT" → full name)
- Trust-based ranking (official sources first)
- Layer 3 web search (automatic fallback)
- Fixed validation errors
- Correct college URLs

✅ **Features Working:**
- Alias resolution for 100+ colleges
- Trust-based search ranking
- Layer 3 web search with visual indicators
- Real college data (no duplicates)
- College creation UI
- Expanded search keywords

## Files to Check

```bash
# New backend services
ls -la backend/src/services/collegeAliasResolver.js
ls -la backend/src/services/layer3Search.js

# Seeding script
ls -la backend/scripts/seed_real_colleges.js

# New frontend page
ls -la src/pages/AddCollege.tsx

# Updated pages
ls -la src/pages/Research.tsx
ls -la backend/src/services/intelligentSearch.js
```

All changes are in your branch and ready to use!
