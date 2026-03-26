# Database & Display Issues - Comprehensive Solution

## Executive Summary

This document outlines the complete solution for making CollegeOS display accurate, dynamic, college-specific data instead of generic static information.

---

## Problem Statement

### Current Issues
1. ✅ **College preview cards missing data** - GPA, tuition, enrollment not showing
2. ✅ **Inefficient major/program structure** - Only 7 majors showing instead of 43+
3. ✅ **Identical application deadlines** - All colleges show same dates
4. ✅ **Static requirements** - Not dynamic per college
5. ✅ **No conditional test-optional logic** - System doesn't adapt

### Root Causes Identified
- `findAll()` only returns basic `colleges` table data
- Comprehensive tables not joined for list views
- No master majors table with boolean flags
- Application deadlines table doesn't exist
- Requirements are hardcoded, not database-driven
- Test-optional logic is static

---

## Solution Architecture

### Phase 1: Fix List View Data (IMMEDIATE - Priority 1)

**Problem:** College preview cards show "N/A" for GPA, tuition, enrollment

**Root Cause:**
```javascript
// Current: findAll() only queries colleges table
static findAll(filters = {}) {
  let query = 'SELECT * FROM colleges WHERE 1=1';
  // Returns: Only basic columns from colleges table
}
```

**Solution:** Enhance `findAll()` to join comprehensive tables

```sql
SELECT 
  c.*,
  cc.undergraduate_enrollment,
  cc.graduate_enrollment,
  cc.total_enrollment,
  cc.student_faculty_ratio,
  cc.founding_year,
  cf.tuition_in_state,
  cf.tuition_out_state,
  cf.avg_net_price,
  ass.gpa_50,
  ass.sat_50,
  ass.act_50,
  COUNT(DISTINCT cp.program_name) as program_count
FROM colleges c
LEFT JOIN colleges_comprehensive cc ON c.name = cc.name AND c.country = cc.country
LEFT JOIN college_financial_data cf ON cc.id = cf.college_id
LEFT JOIN admitted_student_stats ass ON cc.id = ass.college_id
LEFT JOIN college_programs cp ON cc.id = cp.college_id
GROUP BY c.id
```

**Files to Modify:**
1. `backend/src/models/College.js` - Enhance `findAll()` method (line 494)
2. `backend/src/models/College.js` - Update `formatCollege()` to handle new fields
3. `src/pages/Colleges.tsx` - Verify frontend displays new fields
4. `src/components/dashboard/CollegeCard.tsx` - Add data display

**Implementation Steps:**
```javascript
// 1. Update findAll() query
static findAll(filters = {}) {
  const db = dbManager.getDatabase();
  
  // Build enhanced query with JOINs
  let query = `
    SELECT 
      c.*,
      cc.undergraduate_enrollment,
      cc.graduate_enrollment,
      cc.total_enrollment,
      cc.student_faculty_ratio,
      cf.tuition_in_state,
      cf.tuition_out_state,
      cf.avg_net_price,
      ass.gpa_50,
      ass.sat_50,
      ass.act_50,
      (SELECT COUNT(*) FROM college_programs cp WHERE cp.college_id = cc.id) as program_count
    FROM colleges c
    LEFT JOIN colleges_comprehensive cc ON c.name = cc.name AND c.country = cc.country
    LEFT JOIN college_financial_data cf ON cc.id = cf.college_id
    LEFT JOIN admitted_student_stats ass ON cc.id = ass.college_id
    WHERE 1=1
  `;
  
  // ... rest of filtering logic
}

// 2. Update formatCollege() to include new fields
static formatCollege(college) {
  return {
    // ... existing fields
    
    // Add comprehensive data in list view
    gpa50: college.gpa_50,
    averageGPA: college.gpa_50 || college.average_gpa,
    satAverage: college.sat_50,
    actAverage: college.act_50,
    
    enrollment: college.total_enrollment || college.student_population,
    undergraduateEnrollment: college.undergraduate_enrollment,
    graduateEnrollment: college.graduate_enrollment,
    
    tuitionInState: college.tuition_in_state,
    tuitionOutState: college.tuition_out_state,
    tuition_cost: college.tuition_in_state || college.tuition_domestic,
    avgNetPrice: college.avg_net_price,
    
    studentFacultyRatio: college.student_faculty_ratio,
    programCount: college.program_count || 0,
    
    // ... rest of fields
  };
}
```

**Testing:**
```bash
# 1. Test API endpoint
curl http://localhost:3000/api/colleges?limit=5

# Expected: gpa_50, total_enrollment, tuition_in_state present

# 2. Test frontend
npm run dev
# Navigate to /colleges
# Verify: GPA, tuition, enrollment display in cards
```

---

### Phase 2: Master Majors System (Priority 2)

**Problem:** Only 7 majors showing for Duke (offers 43+)

**Current Structure:**
```javascript
// Per college: major_categories JSON array
{
  "major_categories": ["Computer Science", "Biology", "English", ...]
}
// Problem: Inefficient, can't query "which colleges offer CS?"
```

**Solution:** Master majors table with boolean flags

**Schema Changes:**

```sql
-- Migration 030: Master majors system

-- 1. Master list of ~100 common majors
CREATE TABLE IF NOT EXISTS master_majors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  major_name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL, -- STEM, Social Sciences, Humanities, etc.
  cip_code TEXT, -- Classification of Instructional Programs code
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Junction table with boolean flags
CREATE TABLE IF NOT EXISTS college_majors_offered (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  major_id INTEGER NOT NULL,
  is_offered BOOLEAN DEFAULT 1,
  degree_types TEXT, -- BS, BA, MS, PhD (JSON array)
  is_popular BOOLEAN DEFAULT 0, -- Top 10 most popular at this college
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (college_id) REFERENCES colleges_comprehensive(id),
  FOREIGN KEY (major_id) REFERENCES master_majors(id),
  UNIQUE(college_id, major_id)
);

CREATE INDEX idx_college_majors_college ON college_majors_offered(college_id);
CREATE INDEX idx_college_majors_major ON college_majors_offered(major_id);

-- 3. Top colleges by major (pre-computed rankings)
CREATE TABLE IF NOT EXISTS top_colleges_by_major (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  major_id INTEGER NOT NULL,
  college_id INTEGER NOT NULL,
  rank_position INTEGER NOT NULL,
  ranking_source TEXT, -- US News, QS, etc.
  year INTEGER,
  score REAL,
  FOREIGN KEY (major_id) REFERENCES master_majors(id),
  FOREIGN KEY (college_id) REFERENCES colleges_comprehensive(id),
  UNIQUE(major_id, college_id, ranking_source, year)
);

-- 4. Populate master_majors with common 100 majors
INSERT INTO master_majors (major_name, category, cip_code) VALUES
  ('Computer Science', 'STEM', '11.0701'),
  ('Biology', 'STEM', '26.0101'),
  ('Business Administration', 'Business', '52.0201'),
  ('Psychology', 'Social Sciences', '42.0101'),
  ('English Literature', 'Humanities', '23.0101'),
  ('Mechanical Engineering', 'STEM', '14.1901'),
  ('Economics', 'Social Sciences', '45.0601'),
  ('Political Science', 'Social Sciences', '45.1001'),
  ('Chemistry', 'STEM', '40.0501'),
  ('Mathematics', 'STEM', '27.0101'),
  -- ... 90 more majors
;
```

**API Changes:**

```javascript
// New endpoint: Get all majors for a college
router.get('/colleges/:id/majors', async (req, res) => {
  const db = dbManager.getDatabase();
  
  const majors = db.prepare(`
    SELECT 
      mm.id,
      mm.major_name,
      mm.category,
      mm.cip_code,
      cmo.degree_types,
      cmo.is_popular
    FROM college_majors_offered cmo
    JOIN master_majors mm ON cmo.major_id = mm.id
    JOIN colleges_comprehensive cc ON cmo.college_id = cc.id
    WHERE cc.id = ?
    ORDER BY cmo.is_popular DESC, mm.category, mm.major_name
  `).all(req.params.id);
  
  res.json({
    success: true,
    count: majors.length,
    data: majors
  });
});

// New endpoint: Get top colleges for a major
router.get('/majors/:major/colleges', async (req, res) => {
  const db = dbManager.getDatabase();
  
  const colleges = db.prepare(`
    SELECT 
      c.id,
      c.name,
      c.country,
      c.acceptance_rate,
      tcm.rank_position,
      tcm.score
    FROM top_colleges_by_major tcm
    JOIN colleges_comprehensive cc ON tcm.college_id = cc.id
    JOIN colleges c ON cc.name = c.name
    JOIN master_majors mm ON tcm.major_id = mm.id
    WHERE mm.major_name = ?
    ORDER BY tcm.rank_position
    LIMIT 100
  `).all(req.params.major);
  
  res.json({
    success: true,
    data: colleges
  });
});
```

**Frontend Updates:**

```typescript
// src/pages/CollegeDetails.tsx - Show ALL majors
const [majors, setMajors] = useState<Major[]>([]);

useEffect(() => {
  async function loadMajors() {
    const response = await api.get(`/colleges/${id}/majors`);
    setMajors(response.data.data);
  }
  loadMajors();
}, [id]);

// Display grouped by category
<div>
  <h3>Programs Offered ({majors.length})</h3>
  {Object.entries(groupBy(majors, 'category')).map(([category, items]) => (
    <div key={category}>
      <h4>{category}</h4>
      <ul>
        {items.map(major => (
          <li key={major.id}>
            {major.major_name}
            {major.is_popular && <Badge>Popular</Badge>}
            <span>{major.degree_types}</span>
          </li>
        ))}
      </ul>
    </div>
  ))}
</div>
```

---

### Phase 3: Dynamic Application Deadlines (Priority 2)

**Problem:** All colleges show identical dates (ED1: Nov 1, all same)

**Current State:** Hardcoded in frontend

**Solution:** College-specific deadlines table

**Schema:**

```sql
-- Migration 031: Application deadlines

CREATE TABLE IF NOT EXISTS application_deadlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  deadline_type TEXT NOT NULL, -- ED1, ED2, EA, REA, RD, Transfer
  deadline_date DATE NOT NULL,
  decision_date DATE,
  application_year INTEGER NOT NULL, -- 2025, 2026, etc.
  is_offered BOOLEAN DEFAULT 1, -- Some colleges don't offer ED/EA
  notes TEXT,
  source_url TEXT,
  last_verified DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (college_id) REFERENCES colleges_comprehensive(id),
  UNIQUE(college_id, deadline_type, application_year)
);

CREATE INDEX idx_deadlines_college ON application_deadlines(college_id);
CREATE INDEX idx_deadlines_type ON application_deadlines(deadline_type);
CREATE INDEX idx_deadlines_date ON application_deadlines(deadline_date);

-- Example data
INSERT INTO application_deadlines (college_id, deadline_type, deadline_date, decision_date, application_year, is_offered, source_url)
SELECT 
  cc.id,
  'ED1',
  '2025-11-01',
  '2025-12-15',
  2026,
  1,
  cc.website_url || '/admissions/deadlines'
FROM colleges_comprehensive cc
WHERE cc.name = 'Duke University';

-- Duke offers ED, but not EA
INSERT INTO application_deadlines (college_id, deadline_type, deadline_date, decision_date, application_year, is_offered)
SELECT cc.id, 'RD', '2026-01-02', '2026-04-01', 2026, 1
FROM colleges_comprehensive cc
WHERE cc.name = 'Duke University';

-- Stanford offers REA (not EA or ED)
INSERT INTO application_deadlines (college_id, deadline_type, deadline_date, decision_date, application_year, is_offered)
SELECT cc.id, 'REA', '2025-11-01', '2025-12-15', 2026, 1
FROM colleges_comprehensive cc
WHERE cc.name = 'Stanford University';
```

**API Endpoint:**

```javascript
// Get deadlines for a college
router.get('/colleges/:id/deadlines', async (req, res) => {
  const db = dbManager.getDatabase();
  
  const deadlines = db.prepare(`
    SELECT 
      deadline_type,
      deadline_date,
      decision_date,
      application_year,
      is_offered,
      notes,
      last_verified
    FROM application_deadlines
    WHERE college_id = (
      SELECT id FROM colleges_comprehensive WHERE id = ?
    )
    AND application_year = ?
    AND is_offered = 1
    ORDER BY deadline_date
  `).all(req.params.id, new Date().getFullYear() + 1);
  
  res.json({
    success: true,
    data: deadlines
  });
});
```

**Scraper Logic:**

```javascript
// backend/services/scrappingService.js - Add deadline extractor

async function extractDeadlines(collegeUrl) {
  const deadlinePages = [
    '/admissions/deadlines',
    '/apply/deadlines',
    '/admissions/apply',
    '/admissions/important-dates'
  ];
  
  for (const page of deadlinePages) {
    try {
      const html = await fetchPage(collegeUrl + page);
      const $ = cheerio.load(html);
      
      const deadlines = {};
      
      // Try multiple extraction methods
      // Method 1: Table with deadline types
      $('table tr').each((i, row) => {
        const cells = $(row).find('td');
        if (cells.length >= 2) {
          const type = $(cells[0]).text().trim().toLowerCase();
          const date = $(cells[1]).text().trim();
          
          if (type.includes('early decision')) {
            deadlines.ED1 = parseDate(date);
          } else if (type.includes('early action')) {
            deadlines.EA = parseDate(date);
          } else if (type.includes('regular decision')) {
            deadlines.RD = parseDate(date);
          }
        }
      });
      
      // Method 2: Structured data
      const jsonLd = $('script[type="application/ld+json"]').text();
      if (jsonLd) {
        const data = JSON.parse(jsonLd);
        if (data.applicationDeadlines) {
          Object.assign(deadlines, data.applicationDeadlines);
        }
      }
      
      // Method 3: Specific CSS selectors
      $('.deadline-ed1, [data-deadline="ED1"]').each((i, el) => {
        deadlines.ED1 = parseDate($(el).text());
      });
      
      if (Object.keys(deadlines).length > 0) {
        return {
          deadlines,
          source: collegeUrl + page,
          confidence: 0.90
        };
      }
    } catch (e) {
      continue;
    }
  }
  
  return null;
}

// Add to scraping orchestrator
async function scrapeCollegeDeadlines(collegeId) {
  const college = await College.findById(collegeId);
  const result = await extractDeadlines(college.officialWebsite);
  
  if (result) {
    // Update database
    const db = dbManager.getDatabase();
    const year = new Date().getFullYear() + 1;
    
    for (const [type, date] of Object.entries(result.deadlines)) {
      db.prepare(`
        INSERT OR REPLACE INTO application_deadlines (
          college_id, deadline_type, deadline_date, application_year, 
          is_offered, source_url, last_verified
        ) VALUES (?, ?, ?, ?, 1, ?, datetime('now'))
      `).run(college.id, type, date, year, result.source);
    }
    
    // Log to audit
    db.prepare(`
      INSERT INTO scrape_audit_log (
        college_id, field_name, new_value, confidence_score, source_url
      ) VALUES (?, 'application_deadlines', ?, ?, ?)
    `).run(college.id, JSON.stringify(result.deadlines), result.confidence, result.source);
  }
}
```

**Frontend Display:**

```typescript
// src/components/college/DeadlinesList.tsx
const [deadlines, setDeadlines] = useState<Deadline[]>([]);

useEffect(() => {
  async function loadDeadlines() {
    const response = await api.get(`/colleges/${collegeId}/deadlines`);
    setDeadlines(response.data.data);
  }
  loadDeadlines();
}, [collegeId]);

return (
  <div>
    <h3>Application Deadlines {applicationYear}</h3>
    {deadlines.length === 0 ? (
      <p>Deadlines not yet available. Check {college.officialWebsite}/admissions</p>
    ) : (
      <ul>
        {deadlines.map(dl => (
          <li key={dl.deadline_type}>
            <strong>{dl.deadline_type}:</strong> {formatDate(dl.deadline_date)}
            {dl.decision_date && ` (Decision: ${formatDate(dl.decision_date)})`}
            {dl.notes && <p className="text-sm text-muted">{dl.notes}</p>}
          </li>
        ))}
      </ul>
    )}
    {deadlines[0]?.last_verified && (
      <p className="text-xs text-muted">
        Last verified: {formatDate(deadlines[0].last_verified)}
      </p>
    )}
  </div>
);
```

---

### Phase 4: Dynamic Requirements (Priority 3)

**Problem:** Requirements are static, not college-specific

**Solution:** Requirements table per college

**Schema:**

```sql
-- Migration 032: College requirements

CREATE TABLE IF NOT EXISTS college_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  requirement_type TEXT NOT NULL, -- test_scores, essays, recommendations, etc.
  requirement_name TEXT NOT NULL,
  is_required BOOLEAN DEFAULT 1,
  is_optional BOOLEAN DEFAULT 0,
  details TEXT,
  instructions_url TEXT,
  application_year INTEGER,
  source_url TEXT,
  last_verified DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (college_id) REFERENCES colleges_comprehensive(id)
);

CREATE INDEX idx_requirements_college ON college_requirements(college_id);
CREATE INDEX idx_requirements_type ON college_requirements(requirement_type);

-- Example: Duke requires peer recommendation
INSERT INTO college_requirements (college_id, requirement_type, requirement_name, is_required, details, instructions_url)
SELECT 
  cc.id,
  'recommendations',
  'Peer Recommendation',
  1,
  'Duke requires one peer recommendation in addition to teacher recommendations',
  cc.website_url || '/admissions/requirements'
FROM colleges_comprehensive cc
WHERE cc.name = 'Duke University';

-- Example: MIT requires test scores (not optional)
INSERT INTO college_requirements (college_id, requirement_type, requirement_name, is_required, is_optional)
SELECT cc.id, 'test_scores', 'SAT or ACT', 1, 0
FROM colleges_comprehensive cc
WHERE cc.name = 'Massachusetts Institute of Technology';

-- Example: Harvard is test-optional
INSERT INTO college_requirements (college_id, requirement_type, requirement_name, is_required, is_optional)
SELECT cc.id, 'test_scores', 'SAT or ACT', 0, 1
FROM colleges_comprehensive cc
WHERE cc.name = 'Harvard University';

-- Course requirements table
CREATE TABLE IF NOT EXISTS course_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  subject_area TEXT NOT NULL, -- English, Math, Science, etc.
  years_required INTEGER NOT NULL,
  specific_courses TEXT, -- e.g., "Including Calculus"
  notes TEXT,
  FOREIGN KEY (college_id) REFERENCES colleges_comprehensive(id)
);

-- Example: MIT course requirements
INSERT INTO course_requirements (college_id, subject_area, years_required, specific_courses)
SELECT cc.id, 'Mathematics', 4, 'Including Calculus'
FROM colleges_comprehensive cc
WHERE cc.name = 'Massachusetts Institute of Technology';
```

**API Endpoint:**

```javascript
// Get requirements for a college
router.get('/colleges/:id/requirements', async (req, res) => {
  const db = dbManager.getDatabase();
  
  const requirements = db.prepare(`
    SELECT 
      requirement_type,
      requirement_name,
      is_required,
      is_optional,
      details,
      instructions_url
    FROM college_requirements
    WHERE college_id = ?
    ORDER BY requirement_type, is_required DESC
  `).all(req.params.id);
  
  const courseReqs = db.prepare(`
    SELECT 
      subject_area,
      years_required,
      specific_courses,
      notes
    FROM course_requirements
    WHERE college_id = ?
    ORDER BY subject_area
  `).all(req.params.id);
  
  res.json({
    success: true,
    data: {
      requirements: groupBy(requirements, 'requirement_type'),
      courseRequirements: courseReqs
    }
  });
});
```

**Conditional Test-Optional Logic:**

```typescript
// src/components/profile/TestScoresSection.tsx
const [requirements, setRequirements] = useState<Requirements | null>(null);
const [showTestScores, setShowTestScores] = useState(true);

// Load requirements for colleges in list
useEffect(() => {
  async function loadRequirements() {
    const collegeLists = await api.get('/applications/colleges');
    const reqs = await Promise.all(
      collegeLists.map(c => api.get(`/colleges/${c.id}/requirements`))
    );
    
    // Check if ANY college requires test scores
    const anyRequireTests = reqs.some(r => 
      r.data.data.requirements.test_scores?.some(t => t.is_required)
    );
    
    // Check if ALL colleges are test-optional
    const allTestOptional = reqs.every(r =>
      r.data.data.requirements.test_scores?.every(t => t.is_optional)
    );
    
    setRequirements({ anyRequireTests, allTestOptional });
  }
  loadRequirements();
}, []);

return (
  <div>
    {requirements?.anyRequireTests && (
      <Alert>
        <strong>Test scores required</strong> for at least one college on your list.
      </Alert>
    )}
    
    {requirements?.allTestOptional && (
      <div>
        <p>All colleges on your list are test-optional.</p>
        <label>
          <input 
            type="checkbox" 
            checked={showTestScores}
            onChange={e => setShowTestScores(e.target.checked)}
          />
          I want to submit test scores
        </label>
      </div>
    )}
    
    {(showTestScores || requirements?.anyRequireTests) && (
      <TestScoresForm />
    )}
  </div>
);
```

---

## Implementation Timeline

### Week 1: Phase 1 - Fix List View
- Day 1-2: Enhance `findAll()` with JOINs
- Day 3: Update `formatCollege()` 
- Day 4: Test API endpoints
- Day 5: Test frontend display

### Week 2: Phase 2 - Master Majors
- Day 1: Create migration with tables
- Day 2: Populate master_majors (100 majors)
- Day 3: Create API endpoints
- Day 4-5: Update frontend to display ALL majors

### Week 3: Phase 3 - Dynamic Deadlines
- Day 1: Create deadlines table
- Day 2-3: Add scraper logic for deadlines
- Day 4: Create API endpoint
- Day 5: Update frontend display

### Week 4: Phase 4 - Dynamic Requirements
- Day 1: Create requirements tables
- Day 2: Populate initial data
- Day 3: Create API endpoints
- Day 4-5: Implement conditional logic in frontend

---

## Testing Strategy

### Unit Tests
```javascript
// test/models/College.test.js
describe('College.findAll()', () => {
  it('should include comprehensive data', async () => {
    const colleges = await College.findAll({ limit: 5 });
    expect(colleges[0]).toHaveProperty('gpa50');
    expect(colleges[0]).toHaveProperty('enrollment');
    expect(colleges[0]).toHaveProperty('tuitionInState');
    expect(colleges[0]).toHaveProperty('programCount');
  });
});
```

### Integration Tests
```bash
# Test API endpoints
curl http://localhost:3000/api/colleges?limit=5 | jq '.data[0] | keys'
# Should include: gpa50, enrollment, tuitionInState, programCount

curl http://localhost:3000/api/colleges/2378/majors | jq '.count'
# Should show: 43 (for Duke)

curl http://localhost:3000/api/colleges/2378/deadlines | jq '.data'
# Should show: Different dates per deadline type

curl http://localhost:3000/api/colleges/2378/requirements | jq '.data'
# Should show: Duke-specific requirements including peer recommendation
```

### Frontend Testing
1. Navigate to `/colleges`
2. Verify preview cards show: GPA, tuition, enrollment, program count
3. Click on Duke University
4. Verify: 43+ majors displayed, grouped by category
5. Verify: Different deadline dates (ED1 ≠ RD)
6. Verify: Peer recommendation requirement visible

---

## Success Metrics

### Data Completeness
- ✅ 90%+ of colleges show GPA in list view
- ✅ 95%+ show enrollment numbers
- ✅ 90%+ show tuition data
- ✅ 80%+ show accurate program counts

### Major Data
- ✅ Duke shows 43+ programs (not 7)
- ✅ All majors grouped by category
- ✅ Can query "Top colleges for Computer Science"

### Deadlines
- ✅ No two colleges have identical deadline sets
- ✅ Only show deadline types offered (ED/EA/RD)
- ✅ 80%+ of deadlines updated within 6 months

### Requirements
- ✅ Institution-specific requirements visible
- ✅ Test-optional logic works correctly
- ✅ Course requirements dynamic per college

---

## Monitoring & Maintenance

### Data Quality Checks
```sql
-- Check how many colleges have comprehensive data in list view
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN cc.id IS NOT NULL THEN 1 ELSE 0 END) as with_comprehensive,
  SUM(CASE WHEN ass.gpa_50 IS NOT NULL THEN 1 ELSE 0 END) as with_gpa,
  SUM(CASE WHEN cf.tuition_in_state IS NOT NULL THEN 1 ELSE 0 END) as with_tuition
FROM colleges c
LEFT JOIN colleges_comprehensive cc ON c.name = cc.name
LEFT JOIN admitted_student_stats ass ON cc.id = ass.college_id
LEFT JOIN college_financial_data cf ON cc.id = cf.college_id;
```

### Scraper Monitoring
```javascript
// backend/scripts/monitorDataQuality.js
const db = dbManager.getDatabase();

// Check deadline freshness
const staleDeadlines = db.prepare(`
  SELECT college_id, COUNT(*) as count
  FROM application_deadlines
  WHERE last_verified < date('now', '-6 months')
  GROUP BY college_id
  HAVING count > 0
`).all();

console.log(`${staleDeadlines.length} colleges have stale deadlines`);

// Check requirements coverage
const missingReqs = db.prepare(`
  SELECT c.id, c.name
  FROM colleges c
  LEFT JOIN college_requirements cr ON c.id = cr.college_id
  WHERE cr.id IS NULL
  LIMIT 100
`).all();

console.log(`${missingReqs.length} colleges missing requirements data`);
```

---

## Migration Scripts

All migrations in: `backend/migrations/030-032_*.sql`

Run with:
```bash
npm run backend:migrate
```

Verify with:
```bash
npm run db:check
```

---

## Rollback Plan

If issues arise:
1. Database changes are additive (no data loss)
2. Fallback to basic `colleges` table data
3. Frontend handles missing comprehensive data gracefully

```javascript
// Defensive coding in formatCollege()
static formatCollege(college) {
  return {
    // Always provide fallbacks
    gpa50: college.gpa_50 || college.average_gpa || null,
    enrollment: college.total_enrollment || college.student_population || null,
    // ...
  };
}
```

---

## Documentation Updates

After implementation, update:
1. `API_DOCUMENTATION.md` - New endpoints
2. `DATABASE_SCHEMA.md` - New tables
3. `SCRAPING_GUIDE.md` - Deadline/requirements scrapers
4. `FRONTEND_INTEGRATION.md` - New data usage

---

## Conclusion

This comprehensive solution transforms CollegeOS from showing generic, static data to displaying accurate, dynamic, institution-specific information. 

**Key Benefits:**
- ✅ Accurate data in list views
- ✅ Efficient major/program structure
- ✅ College-specific deadlines
- ✅ Dynamic requirements
- ✅ Conditional test-optional logic
- ✅ Scalable architecture

**Result:** Users see real, actionable, college-specific information throughout the application.
