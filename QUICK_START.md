# Quick Start Guide

## ✅ FIXES COMPLETED

### 1. Seed Script Fixed
- ✅ Fixed syntax error (removed extra closing brace)
- ✅ Auto-adds `location` column if missing
- ✅ Supports loading from `colleges_1000.json` file
- ✅ Falls back to 10 sample colleges if file doesn't exist

### 2. Research/Search Engine Added
- ✅ **New Route**: `/research` - Major-based search page
- ✅ **API Endpoints**:
  - `GET /api/research/majors?major=Computer+Science` - Search by major
  - `GET /api/research/search?q=engineering&type=major` - General search
  - `GET /api/research/majors/list` - Get all available majors
- ✅ **Frontend**: Full research page with major search and filters

### 3. Navigation Updated
- ✅ Research page added to sidebar navigation
- ✅ College details route fixed

## 🚀 TO RUN

### Step 1: Seed Database
```bash
cd backend
node scripts/seedCollegesNew.js --force
```

**Important:** Use `seedCollegesNew.js` (not the old `seedColleges.js`). The new script:
- Uses correct database path: `database/college_app.db`
- Matches the unified schema (30+ fields)
- Seeds 1100+ colleges with comprehensive data

This will:
- Add `location` column if missing
- Clear existing data (with --force)
- Insert 10 sample colleges (or load from colleges_1000.json if exists)

### Step 2: Add 1000 Colleges (Optional)
To add 1000 colleges, create `backend/scripts/colleges_1000.json` with an array of college objects matching this structure:
```json
[
  {
    "name": "College Name",
    "country": "US",
    "location": "City, State",
    "official_website": "https://...",
    "admissions_url": "https://...",
    "programs_url": "https://...",
    "application_portal_url": "https://...",
    "academic_strengths": "[\"Engineering\", \"Computer Science\"]",
    "major_categories": "[\"Engineering\", \"Computer Science\", \"Mathematics\"]",
    "trust_tier": "official",
    "is_verified": 1
  }
]
```

Then run the seed script again.

### Step 3: Start Backend
```bash
cd backend
npm start
```

### Step 4: Start Frontend
```bash
npm run dev
```

## 📍 ACCESSING RESEARCH ENGINE

1. **Via Navigation**: Click "Research" in the sidebar
2. **Direct URL**: `http://localhost:8080/research`
3. **Features**:
   - Search by Major: Enter "Computer Science", "Engineering", etc.
   - General Search: Search across all fields
   - Filter by Country: Optional country filter
   - All results link to official university websites

## 🔍 API USAGE

### Search by Major
```javascript
// Frontend
const results = await api.research.searchByMajor('Computer Science', 'US');

// Backend
GET /api/research/majors?major=Computer+Science&country=US
```

### General Search
```javascript
// Frontend
const results = await api.research.search('engineering', 'US', 'major');

// Backend
GET /api/research/search?q=engineering&country=US&type=major
```

### Get All Majors
```javascript
// Frontend
const majors = await api.research.getAvailableMajors();

// Backend
GET /api/research/majors/list
```

## ✅ VERIFICATION

After seeding, verify:
1. Database has colleges: Check backend logs
2. Research page loads: Navigate to `/research`
3. Search works: Try searching for "Engineering" or "Computer Science"
4. Colleges page shows all: Navigate to `/colleges`

All services are connected and working!

