# Comprehensive Requirements Tracking System - Implementation Guide

## Overview

This document describes the complete implementation of the comprehensive requirements tracking system for CollegeOS. The system scrapes college-specific application requirements, stores them with program and applicant-type variations, and displays personalized checklists based on student profiles.

## System Architecture

### 1. Database Layer (Migration 035)

**Enhanced college_requirements Table (70+ fields):**

```sql
CREATE TABLE college_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  application_year INTEGER NOT NULL,
  applicant_type TEXT DEFAULT 'first_year', -- first_year, transfer, international, homeschool
  program_type TEXT DEFAULT 'general', -- general, engineering, arts, music, theater, nursing
  
  -- Testing Requirements (comprehensive)
  testing_policy TEXT CHECK(testing_policy IN ('required', 'optional', 'flexible', 'blind')),
  testing_policy_explanation TEXT,
  sat_accepted BOOLEAN DEFAULT 1,
  act_accepted BOOLEAN DEFAULT 1,
  sat_subject_tests_required BOOLEAN DEFAULT 0,
  alternative_tests_accepted TEXT, -- JSON array of AP/IB/other
  test_code_sat VARCHAR(10),
  test_code_act VARCHAR(10),
  superscoring_policy TEXT,
  test_optional_details TEXT,
  
  -- Academic Course Requirements (by subject)
  english_years_required REAL,
  english_years_recommended REAL,
  english_level_required TEXT,
  math_years_required REAL,
  math_years_recommended REAL,
  math_level_required TEXT, -- "through calculus", "pre-calculus recommended"
  science_years_required REAL,
  science_years_recommended REAL,
  science_level_required TEXT,
  lab_science_required BOOLEAN DEFAULT 0,
  lab_science_count INTEGER,
  specific_sciences_required TEXT, -- "chemistry, physics required"
  social_studies_years_required REAL,
  social_studies_years_recommended REAL,
  foreign_language_years_required REAL,
  foreign_language_years_recommended REAL,
  same_language_required BOOLEAN DEFAULT 1,
  proficiency_level_required TEXT,
  exemption_conditions TEXT,
  arts_years_required REAL,
  electives_years_required REAL,
  
  -- Recommendation Requirements
  teacher_recommendations_count INTEGER DEFAULT 2,
  teacher_recommendations_required_subjects TEXT,
  teacher_same_subject_allowed BOOLEAN DEFAULT 0,
  counselor_recommendation_required BOOLEAN DEFAULT 1,
  counselor_recommendation_details TEXT,
  peer_recommendation_required BOOLEAN DEFAULT 0,
  peer_recommendation_guidelines TEXT,
  additional_recommendations_allowed INTEGER DEFAULT 1,
  additional_recommendations_types TEXT,
  recommendation_submission_platform TEXT,
  
  -- Interview Requirements
  interview_policy TEXT, -- required, evaluative_recommended, informational_optional, not_offered
  interview_details TEXT,
  interview_how_to_request TEXT,
  interview_deadline DATE,
  interview_conducted_by TEXT,
  
  -- Portfolio and Audition Requirements
  portfolio_required BOOLEAN DEFAULT 0,
  portfolio_required_for_programs TEXT,
  portfolio_guidelines_url TEXT,
  portfolio_submission_platform TEXT,
  portfolio_deadline DATE,
  audition_required BOOLEAN DEFAULT 0,
  audition_required_for_programs TEXT,
  audition_type TEXT, -- live, recorded, either
  audition_details_url TEXT,
  pre_screening_required BOOLEAN DEFAULT 0,
  
  -- Application Components
  supplemental_essays_count INTEGER DEFAULT 0,
  supplemental_essays_list TEXT, -- JSON array
  activities_list_required BOOLEAN DEFAULT 1,
  activities_list_max_entries INTEGER,
  activities_list_character_limits TEXT, -- JSON
  resume_policy TEXT, -- required, accepted, not_accepted
  resume_details TEXT,
  graded_paper_required BOOLEAN DEFAULT 0,
  additional_materials_accepted TEXT,
  
  -- Transcript and Reporting
  self_reported_grades_accepted BOOLEAN DEFAULT 0,
  self_reported_grades_platform TEXT,
  official_transcript_timing TEXT, -- with_application, after_acceptance, either
  mid_year_report_required BOOLEAN DEFAULT 1,
  final_transcript_required BOOLEAN DEFAULT 1,
  transcript_submission_method TEXT,
  
  -- Demonstrated Interest
  demonstrated_interest_tracked BOOLEAN DEFAULT 0,
  demonstrated_interest_explanation TEXT,
  campus_visit_considered BOOLEAN DEFAULT 0,
  interview_considered_demonstrated_interest BOOLEAN DEFAULT 0,
  
  -- Academic Rigor Expectations
  rigor_expectation_level TEXT, -- most_rigorous, very_rigorous, rigorous, moderate
  rigor_explanation TEXT,
  ap_ib_expectation TEXT,
  honors_courses_expectation TEXT,
  
  -- Data Quality
  source_url TEXT,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  confidence_score REAL DEFAULT 0.5,
  verification_status TEXT DEFAULT 'scraped', -- scraped, manually_verified, user_reported
  
  FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE,
  UNIQUE(college_id, application_year, applicant_type, program_type)
);
```

**New Tables:**

```sql
-- Store variations by applicant type
CREATE TABLE college_requirements_variations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  base_requirement_id INTEGER NOT NULL,
  variation_type TEXT NOT NULL, -- international, transfer, homeschool, adult_learner
  variation_field VARCHAR(100) NOT NULL,
  variation_value TEXT,
  variation_explanation TEXT,
  FOREIGN KEY (base_requirement_id) REFERENCES college_requirements(id)
);

-- Track individual student progress
CREATE TABLE user_college_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  college_id INTEGER NOT NULL,
  requirement_type VARCHAR(100) NOT NULL, -- teacher_rec_1, counselor_rec, transcript, etc.
  requirement_status TEXT DEFAULT 'not_started', -- not_started, in_progress, completed, submitted, waived
  completion_date TIMESTAMP,
  notes TEXT,
  uploaded_document_id INTEGER,
  reminder_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (college_id) REFERENCES colleges(id)
);

-- Library of reusable requirement explanations
CREATE TABLE requirement_explanations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requirement_type VARCHAR(100) UNIQUE NOT NULL,
  title VARCHAR(200) NOT NULL,
  basic_description TEXT NOT NULL,
  contextual_explanation TEXT NOT NULL,
  practical_guidance TEXT NOT NULL,
  official_resources TEXT, -- JSON array of links
  category VARCHAR(50) NOT NULL
);
```

## 2. Requirements Extraction Service

The extraction service handles multiple content formats:

### Key Methods:

1. **extractTestingPolicy(content)** - Detects required/optional/flexible/blind policies
2. **extractCourseRequirements(content)** - Parses years by subject with regex patterns
3. **extractRecommendationRequirements(content)** - Counts recs, detects peer rec
4. **extractInterviewPolicy(content)** - Categorizes interview requirements
5. **extractPortfolioRequirements(content)** - Arts/music program requirements
6. **extractSupplementalEssays(content)** - Count and details
7. **extractApplicationComponents(content)** - Activities, resume, etc.
8. **extractTranscriptRequirements(content)** - Self-reported, mid-year, etc.
9. **extractDemonstratedInterest(content)** - Interest tracking policies
10. **extractAcademicRigor(content)** - Course rigor expectations

### Confidence Scoring:

- **1.0**: Manually verified, clear structure
- **0.9**: Well-structured automatic extraction
- **0.7**: Some ambiguity, most categories found
- **0.5**: Significant gaps, needs review
- **0.3**: Very limited data extracted

## 3. Requirements Scraping Orchestrator

**URL Discovery Strategy:**

1. Check stored `requirements_page_url` from database
2. Try 8 common URL patterns:
   - /admissions/requirements
   - /admissions/apply
   - /apply/first-year
   - /undergraduate-admissions/requirements
   - /admissions/how-to-apply
   - /admissions/application-requirements
   - /apply/requirements
   - /future-students/requirements
3. Navigate to main admissions page and search for links
4. Use site-specific search as fallback

**Change Detection:**

- Compare all requirement fields with existing database values
- Detect additions, deletions, modifications
- Trigger user notifications for significant changes
- Log all changes with timestamps

## 4. Scheduling System

**Two-Tier Approach:**

**Tier 1 (Weekly - Sunday 3 AM):**
- Top 100 ranked colleges
- Colleges with >10 users
- Colleges with deadlines <90 days
- Manually flagged high-priority

**Tier 2 (Monthly - 1st at 4 AM):**
- All other colleges
- Up to 500 per run
- Last scraped >30 days ago

**Priority Recalculation (Monday 2 AM):**
- Adjust tiers based on engagement
- Flag frequently changing colleges
- Lower difficult colleges to tier 2

## 5. API Endpoints

```javascript
// Get requirements for a college
GET /api/colleges/:id/requirements
Query params: ?applicantType=first_year&programType=engineering

// Get applicant-type variations
GET /api/colleges/:id/requirements/variations

// Get user's requirement progress
GET /api/user-requirements/:collegeId

// Create requirement tracking
POST /api/user-requirements
Body: { collegeId, requirementType, status }

// Update requirement status
PUT /api/user-requirements/:id
Body: { status, notes, completionDate }

// Get completion percentage
GET /api/user-requirements/:collegeId/completion
```

## 6. Frontend Components

### RequirementsChecklist Component

**Features:**
- Profile-based filtering (applicant type, program type, citizenship)
- Grouped by category (Testing, Courses, Recommendations, etc.)
- Completion tracking with visual indicators
- Progress percentage display
- Expandable detail sections
- Highlight missing required items

**Visual Indicators:**
- 🟥 Red: Missing required item
- 🟨 Yellow: In progress
- 🟩 Green: Complete
- 🟦 Blue: Submitted
- ⚪ Grey: Not started
- ⬜ Strikethrough: Waived/Not applicable

**Usage:**
```tsx
<RequirementsChecklist 
  collegeId={1234}
  studentProfile={{
    applicantType: 'first_year',
    programType: 'engineering',
    citizenship: 'international',
    intendedMajor: 'Computer Science'
  }}
  onRequirementUpdate={(req) => handleUpdate(req)}
/>
```

### RequirementDetail Component

**Three Levels of Information:**

1. **Basic (Always Visible)**
   - "2 teacher recommendations required"
   - Brief one-liner

2. **Contextual (Expandable)**
   - Full explanation with context
   - Who, what, when, why
   - Policy nuances

3. **Practical (Expandable)**
   - Actionable guidance
   - Timing recommendations
   - Tips and best practices
   - Examples

**Usage:**
```tsx
<RequirementDetail 
  requirement={requirement}
  college={college}
  level="full" // basic, contextual, full
/>
```

### RequirementsComparison Component

**Features:**
- Side-by-side comparison of 2-5 colleges
- Table format (requirements × colleges)
- Highlight differences in red
- Show commonalities in green
- Identify reuse opportunities
- Export to PDF/CSV

**Usage:**
```tsx
<RequirementsComparison 
  collegeIds={[1234, 5678, 9012]}
  studentProfile={profile}
  highlightDifferences={true}
/>
```

## 7. Requirement Explanations Library

Pre-written explanations for common requirements:

- Teacher Recommendations
- Counselor Recommendations
- Peer Recommendations (Dartmouth/Davidson specific)
- Official Transcripts
- Self-Reported Grades
- Mid-Year Reports
- SAT/ACT Testing Policies
- Test-Optional Strategies
- Demonstrated Interest
- Interviews (Evaluative vs Informational)
- Portfolios (Arts programs)
- Auditions (Music/Theater)
- Activities Lists
- Resume Requirements
- Course Selection Guidance

## 8. Testing & Deployment

### Test Scraping:

```bash
# Test single college
npm run scrape:test-requirements "Harvard University"

# Test default set (Harvard, Stanford, MIT, Duke, Dartmouth)
npm run scrape:test-requirements
```

### Run Scheduled Jobs:

```bash
# Weekly high-priority
npm run scrape:requirements-weekly

# Monthly all colleges
npm run scrape:requirements-monthly
```

### Setup Automatic Scheduling:

```javascript
// In backend/src/app.js
const requirementsScheduler = require('./src/jobs/requirementsScrapingScheduler');
requirementsScheduler.setupCronJobs();
```

## 9. Data Quality & Monitoring

### Confidence Score Distribution:

- **>0.9**: Excellent (target: 40%+ of colleges)
- **0.7-0.9**: Good (target: 40%+ of colleges)
- **0.5-0.7**: Fair, needs review (target: <15%)
- **<0.5**: Poor, manual entry needed (target: <5%)

### Manual Review Queue:

Flag colleges for admin review when:
- Confidence score <0.6
- Scraping failures ≥3 consecutive
- Ambiguous or contradictory data
- User reports incorrect information
- Page structure changed significantly

### Monitoring Queries:

```sql
-- Success rate last 7 days
SELECT 
  DATE(started_at) as date,
  COUNT(*) as attempts,
  SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
  ROUND(AVG(confidence_score), 2) as avg_confidence
FROM scraping_logs
WHERE scrape_type = 'requirements' 
  AND started_at >= DATE('now', '-7 days')
GROUP BY DATE(started_at);

-- Colleges needing review
SELECT c.name, cr.confidence_score, cr.last_updated
FROM college_requirements cr
JOIN colleges c ON c.id = cr.college_id
WHERE cr.confidence_score < 0.6
ORDER BY cr.confidence_score ASC
LIMIT 50;

-- Completion stats by college
SELECT 
  c.name,
  COUNT(*) as total_requirements,
  SUM(CASE WHEN ucr.requirement_status = 'completed' THEN 1 ELSE 0 END) as completed,
  ROUND(AVG(CASE WHEN ucr.requirement_status = 'completed' THEN 100 ELSE 0 END), 1) as completion_pct
FROM user_college_requirements ucr
JOIN colleges c ON c.id = ucr.college_id
WHERE ucr.user_id = ?
GROUP BY c.id;
```

## 10. Integration with Existing Systems

### With Deadline Scraping:

- Share same scheduling infrastructure
- Coordinate scraping to avoid overwhelming college servers
- Cross-reference deadline data with requirements

### With Essay Loading:

- Requirements include supplemental essay counts
- Link to essay_prompts table for full prompts
- Coordinate word count limits

### With Notification System:

- Trigger notifications when requirements change
- Alert users when new requirements added
- Remind users of incomplete requirements near deadlines

## 11. Common Patterns by College Type

### Ivy League (Harvard, Yale, Princeton, etc.):
- 2 teacher recommendations required
- Counselor recommendation required
- Test-optional (most adopted 2020-2023)
- Mid-year report required
- Interview offered but evaluative
- High rigor expectations

### Large State Universities (UC Berkeley, UMich, etc.):
- No teacher recommendations (UC system)
- Self-reported grades accepted
- Test-blind (UC) or test-optional
- Demonstrated interest not tracked
- Major-specific essay requirements

### Liberal Arts Colleges (Williams, Amherst, Swarthmore):
- 2-3 teacher recommendations
- Interview highly recommended
- Test-optional
- Small supplements (150-250 words)
- Demonstrated interest often tracked

### Engineering Programs:
- 4 years math through calculus required
- Physics and chemistry required
- Additional STEM teacher recommendation preferred
- Portfolio for some programs

### Arts Programs:
- Portfolio required (10-20 pieces typical)
- Art teacher recommendation
- Statement of artistic intent
- Earlier deadlines (often Dec 1)

### Music/Theater Programs:
- Audition required
- Pre-screening video (deadlines Nov 15)
- Live auditions (Jan-Feb)
- Repertoire requirements vary
- Resume of performances

## 12. Student Profile Filtering Logic

### Applicant Type Filtering:

```javascript
if (studentProfile.applicantType === 'international') {
  // Show: TOEFL/IELTS requirements
  // Show: Certified translation requirements
  // Show: Financial documentation requirements
  // Hide: Specific US course requirements (if not applicable)
}

if (studentProfile.applicantType === 'transfer') {
  // Show: College transcript requirements
  // Show: Minimum credit requirements
  // Show: Course equivalency evaluation
  // Hide: High school requirements (if >30 credits)
}

if (studentProfile.applicantType === 'homeschool') {
  // Show: Additional documentation requirements
  // Show: Subject test requirements (if applicable)
  // Show: Portfolio of work
  // Show: Detailed course descriptions
}
```

### Program Type Filtering:

```javascript
if (studentProfile.programType === 'engineering') {
  // Show: Math through calculus requirement
  // Show: Physics and chemistry requirements
  // Show: Additional STEM essay
  // Show: Engineering-specific deadlines
}

if (studentProfile.programType === 'arts') {
  // Show: Portfolio requirements
  // Show: Art teacher recommendation
  // Show: Statement of artistic intent
  // Show: Earlier portfolio deadline
}

if (studentProfile.programType === 'music') {
  // Show: Audition requirements
  // Show: Pre-screening requirements
  // Show: Repertoire specifications
  // Show: Resume of performances
}
```

### Test-Optional Filtering:

```javascript
if (requirement.testing_policy === 'optional' && student.testOptionalChoice === 'not_submitting') {
  // Hide: SAT/ACT score submission requirements
  // Hide: Test code information
  // Show: Note that scores not being submitted
}

if (requirement.testing_policy === 'blind') {
  // Hide: ALL test score related requirements
  // Show: Note that college doesn't consider scores
}
```

## 13. Performance Optimization

### Database Indexes:

```sql
CREATE INDEX idx_college_req_college_type ON college_requirements(college_id, applicant_type, program_type);
CREATE INDEX idx_college_req_year ON college_requirements(application_year);
CREATE INDEX idx_college_req_confidence ON college_requirements(confidence_score);
CREATE INDEX idx_user_req_user_college ON user_college_requirements(user_id, college_id);
CREATE INDEX idx_user_req_status ON user_college_requirements(requirement_status);
CREATE INDEX idx_req_variations_base ON college_requirements_variations(base_requirement_id);
```

### Caching Strategy:

- Cache requirements by college for 1 hour
- Cache explanations indefinitely (rarely change)
- Cache user progress for 5 minutes
- Invalidate cache on updates

### Query Optimization:

- Use prepared statements
- Batch inserts for scraping results
- Limit variation queries to relevant types
- Use joins efficiently

## 14. Error Handling

### Scraping Errors:

```javascript
try {
  const requirements = await scrapeRequirements(college);
  await saveRequirements(requirements);
} catch (error) {
  if (error.type === 'NETWORK_ERROR') {
    // Retry with exponential backoff
    await retryWithBackoff(scrapeRequirements, college);
  } else if (error.type === 'PAGE_STRUCTURE_CHANGED') {
    // Flag for manual review
    await flagForManualReview(college.id, error.message);
  } else if (error.type === 'NO_DATA_FOUND') {
    // Try alternative URLs
    await tryAlternativeUrls(college);
  } else {
    // Log and continue
    logger.error('Scraping failed:', error);
  }
}
```

### Data Validation:

```javascript
function validateRequirements(requirements) {
  const errors = [];
  
  // Validate year ranges
  if (requirements.math_years_required > 6 || requirements.math_years_required < 0) {
    errors.push('Invalid math years required');
  }
  
  // Validate confidence score
  if (requirements.confidence_score < 0 || requirements.confidence_score > 1) {
    errors.push('Invalid confidence score');
  }
  
  // Validate applicant type
  const validApplicantTypes = ['first_year', 'transfer', 'international', 'homeschool'];
  if (!validApplicantTypes.includes(requirements.applicant_type)) {
    errors.push('Invalid applicant type');
  }
  
  return errors;
}
```

## 15. Future Enhancements

### Phase 6+ (Post-MVP):

1. **AI-Powered Extraction**
   - Use GPT-4 for complex requirement parsing
   - Improve confidence scores with ML
   - Auto-categorize unusual requirements

2. **Predictive Analytics**
   - Predict requirement changes year-over-year
   - Suggest when to start requirements
   - Estimate completion time based on similar students

3. **Community Verification**
   - Allow students to confirm/correct requirements
   - Crowdsource data accuracy
   - Reputation system for contributors

4. **Mobile App**
   - Push notifications for requirement deadlines
   - Quick status updates
   - Offline checklist access

5. **Integration with Naviance/Common App**
   - Auto-import recommendation statuses
   - Sync transcript submissions
   - Real-time application status

## Conclusion

This comprehensive requirements tracking system provides:

✅ **Complete Coverage**: 70+ database fields covering all requirement types
✅ **Intelligent Scraping**: Multi-format extraction with confidence scoring
✅ **Personalization**: Profile-based filtering for each student
✅ **Progress Tracking**: Complete status management
✅ **Rich Context**: Three levels of information with guidance
✅ **Variations Support**: Program and applicant-type specific requirements
✅ **Production Ready**: Error handling, logging, monitoring
✅ **Scalable**: Handles thousands of colleges efficiently

The system is designed to scale from top 50 colleges to the entire database, providing accurate, personalized, and actionable requirement information to every student.
