# CollegeOS Architecture Analysis & Execution Plan

## TASK 0: Repository Orientation - COMPLETE ✅

### Entry Points
- **Primary Entry**: `backend/src/app.js` (Express app initialization)
- **Database Init**: `dbManager.initialize()` → `dbManager.runMigrations()` (line 28-29)
- **Server Start**: Port 5000 (from env config)

### Database Initialization Flow
```
app.js:28 → dbManager.initialize() 
         → SQLite connection to database/college_app.db
         → dbManager.runMigrations()
         → Schema creation/updates
```

### College Creation Flow
```
POST /api/colleges
  ↓
colleges.js (routes)
  ↓
validation.js middleware → validators.createCollege
  ↓
collegeController.createCollege()
  ↓
CollegeService.createCollege() or College.create()
  ↓
SQLite INSERT INTO colleges
```

### Validation Middleware Flow
```
validation.js exports validate(schema)
  ↓
Joi validation on req.body
  ↓
Sets req.validatedData
  ↓
Passes to controller or returns 400
```

### Layer 1/2/3 Search Responsibilities

**Layer 1 - Database Search**
- Location: `College.search()` in models/College.js
- Direct SQL queries on local database
- Returns colleges from SQLite

**Layer 2 - Web Scraping** 
- Location: `webScraper.js`, `scrappingService.js`
- Scrapes official university websites
- Stores in `college_data` table
- Trust tier: official/secondary/forum

**Layer 3 - External Web Search**
- Location: `layer3Search.js` (NEW - added in commits)
- DuckDuckGo HTML parsing / Bing Search API
- Triggered when Layer 1 returns 0 results
- Trust tier: web_search

### Data Flow: Request → DB → Response
```
1. Request arrives at route (e.g., /api/colleges)
2. Middleware chain: rateLimiter → auth → validation
3. Controller receives validated data (req.validatedData)
4. Controller calls Service/Model
5. Model executes SQL via dbManager.getDatabase()
6. Results returned through controller
7. Response sent as JSON
```

### Active vs Dead Code

**ACTIVE Files:**
- ✅ app.js - Entry point
- ✅ routes/*.js - All route files
- ✅ controllers/*.js - All controllers
- ✅ models/College.js, User.js, Application.js
- ✅ services/intelligentSearch.js, layer3Search.js
- ✅ middleware/validation.js, auth.js
- ✅ utils/validators.js

**POTENTIALLY UNUSED:**
- ❓ services/dataAggregator.js - Need to check if called
- ❓ jobs/* - Background job status unclear
- ❓ seeds/* - May be old seed files

**MISLEADING/PROBLEMATIC:**
- ⚠️ Seed data may contain fabricated colleges
- ⚠️ URL construction via string manipulation exists
- ⚠️ Duplicate college entries in database

---

## TASK 1: Database Schema & Validation Alignment - FINDINGS

### Issue Root Cause: collegeId Validation

**Problem**: Validation expects `collegeId` but frontend sends `college_id`

**Current State** (validators.js):
```javascript
createApplication: Joi.object({
  collegeId: Joi.number().integer().positive().optional(),
  college_id: Joi.number().integer().positive().optional(),
}).or('collegeId', 'college_id')
```

**Controller Normalization** (applicationController.js:29-31):
```javascript
if (data.college_id && !data.collegeId) {
  data.collegeId = data.college_id;
}
```

**Status**: PARTIALLY FIXED ✅
- Validator now accepts both formats
- Controller normalizes to collegeId
- BUT: College creation doesn't need collegeId (auto-generated)

### Who Generates collegeId?
- **Database**: SQLite AUTOINCREMENT on colleges.id
- **Never passed in**: collegeId is PRIMARY KEY, auto-generated
- **Issue**: Validation shouldn't require it for CREATE operations

### Foreign Key Propagation
- Applications table: `college_id` FK to colleges.id ✅
- College_data table: `college_id` FK to colleges.id ✅
- Research_cache table: `college_id` FK to colleges.id ✅

**Recommendation**: 
- College CREATE: Don't validate collegeId (it's generated)
- Application CREATE: Validate collegeId (references existing college)
- Current fix works but could be cleaner

---

## TASK 2: Fabricated Seeding Logic - FINDINGS

### Problematic Patterns Found

**String-based URL Construction**:
```javascript
// UNSAFE: Concatenating .edu domains
website: `https://www.${collegeName.toLowerCase().replace(/\s/g, '')}.edu`
```

**Duplicate Generation**:
- Database shows: University of Jaipur × 10
- University of Newcastle × 24
- Many "State University" variants

**Seed Files to Review**:
- backend/seeds/* - May contain fake generators
- backend/scripts/seed_real_colleges.js - NEW, uses real APIs ✅

**Recommendation**:
1. Audit existing seed files
2. Remove fabrication logic
3. Use only seed_real_colleges.js going forward

---

## TASK 3-4: US & International College Seeding - STATUS

### Already Implemented ✅ (commit d4a3314)

**File**: `backend/scripts/seed_real_colleges.js`

**US Colleges**:
- Source: US Dept of Education College Scorecard API
- Fetches 100+ colleges (expandable to 500+)
- Real data: names, URLs, acceptance rates, majors
- Trust tier: official

**International Colleges**:
- UK: 10 universities (Oxford, Cambridge, Imperial, etc.)
- India: 10 universities (IITs, IISc, JNU, etc.)
- Singapore: NUS, NTU
- Australia: 4 universities
- Netherlands: 4 universities (TU Delft, etc.)
- Germany: 4 universities

**Features**:
- Removes ALL existing colleges before seeding
- No fabricated URLs
- Source attribution
- Correct official websites

**Usage**:
```bash
cd backend
node scripts/seed_real_colleges.js
```

---

## TASK 5: Deduplication - PARTIAL

**Status**: Seeding script removes duplicates ✅
**Missing**: 
- Canonical name normalization
- Alias table for "UVA" → "University of Virginia"
- Source precedence rules

**Recommendation**: Add alias resolution system

---

## TASK 6: Layer 3 Architecture - IMPLEMENTED

**Status**: Layer 3 exists (layer3Search.js) ✅

**Current Features**:
- DuckDuckGo HTML search
- Bing Search API support (optional)
- Result extraction and formatting
- Trust tier: web_search

**Missing**:
- Intent detection (admissions vs requirements vs programs)
- Entity resolution before search
- Semantic query expansion
- Trust-based ranking

**Recommendation**: Enhance with NLP and entity resolution

---

## TASK 7: Frontend ↔ Backend Wiring - NEEDS VERIFICATION

**Backend Returns** (intelligentSearch.js):
```javascript
{
  layer: 3,
  colleges: [],
  webResults: [{name, description, url, source}],
  totalResults: N,
  suggestion: "...",
  note: "..."
}
```

**Frontend Expects** (Research.tsx):
- Handles `res.colleges`, `res.webResults`, `res.layer`
- Displays purple badges for Layer 3
- Shows layer information

**Status**: IMPLEMENTED ✅ (commit 559017a)

---

## TASK 8: Trust & Confidence Model - PARTIAL

**Trust Tiers Defined**:
- official (government/university)
- secondary (rankings sites)
- forum (student forums)
- web_search (Layer 3)

**Current Implementation**:
- Trust tier stored in colleges table ✅
- Used in scraping priority ✅
- NOT used in search ranking ❌
- NOT visible in UI prominently ❌

**Recommendation**: Add trust-based ranking and UI labels

---

## TASK 9: End-to-End Test - TO BE EXECUTED

**Test Query**: "how to apply to University of Virginia"

**Expected Flow**:
1. Intelligent search detects "application process" query
2. Resolves "University of Virginia" entity
3. Returns official admissions page
4. Caches requirements + deadlines
5. Frontend renders structured data

**Status**: NOT TESTED
**Recommendation**: Create automated E2E test suite

---

## Summary of Current State

### ✅ COMPLETED
- Layer 3 web search implementation
- Real college data seeding script
- collegeId validation fix
- URL corrections for major colleges
- Search keyword expansion
- User.getAcademicProfile method

### ⚠️ PARTIAL
- Trust model (defined but not fully utilized)
- Deduplication (works in seeding, no alias system)
- Entity resolution (basic, needs enhancement)

### ❌ TODO
- Remove fabricated seed logic
- Add alias/canonical name system
- Enhance Layer 3 with intent detection
- Trust-based search ranking
- Comprehensive E2E tests

---

## Recommended Immediate Actions

1. **Run seed_real_colleges.js** to replace fake data
2. **Add alias table** for college name normalization
3. **Enhance intelligentSearch.js** with entity resolution
4. **Add trust-based ranking** to search results
5. **Create E2E test** for "UVA application" query
6. **Audit and remove** old seed files with fabrication logic
