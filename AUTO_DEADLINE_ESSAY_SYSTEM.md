# Automatic Deadline and Essay System - Implementation Guide

## Overview

This document describes the automatic deadline and essay population system implemented for CollegeOS. The system automatically populates application deadlines and essay requirements when a student adds a college to their list, reducing manual data entry and ensuring students don't miss critical requirements.

## Implemented Features

### 1. Auto-Populate Deadlines (TASK 1) ✅

**File:** `backend/src/services/deadlineAutoPopulationService.js`

**What it does:**
- Automatically creates deadline entries when a college is added
- Queries the `application_deadlines` table for college-specific dates
- Only creates deadlines for types the college actually offers
- Falls back to previous year data with disclaimer if current year unavailable
- Filters based on confidence_score (must be >= 0.7)

**Flow:**
```
Student adds college → Application.create() → 
deadlineAutoPopulationService.populateDeadlinesForApplication() →
Query application_deadlines table →
Check confidence_score >= 0.7 →
If no data or low confidence: try previous year →
Extract offered deadlines (ED1, ED2, EA, REA, RD, Rolling) →
Insert into user's deadlines table with status='not_started'
```

**Example:**
```javascript
// When Duke University is added:
const result = DeadlineAutoPopulationService.populateDeadlinesForApplication(
  userId: 123,
  applicationId: 456,
  collegeId: 1686  // Duke
);

// Creates deadlines for:
// - Early Decision I: November 1, 2026
// - Regular Decision: January 2, 2026
// (Does NOT create ED2 or EA because Duke doesn't offer them)
```

**Key Features:**
- ✅ Only offered deadline types (queries `offers_early_decision`, `offers_early_action`, etc.)
- ✅ Historical data fallback with warning message
- ✅ Transaction-based insertion for data integrity
- ✅ Detailed logging for debugging

### 2. Data Freshness Indicators (TASK 3) ✅

**File:** `src/components/DataFreshnessIndicator.tsx`

**What it does:**
- Displays color-coded timestamp showing when data was last verified
- Shows source URL with external link
- Provides "Verify Now" button for outdated data

**Color Coding:**
- **Green** (≤7 days): "✓ Information last verified: [date] - Data is current"
- **Yellow** (8-30 days): "⚠ Information last verified: [date] - May need verification"
- **Red** (>30 days): "⚠ Information last verified: [date] - Please verify on college website"

**Usage:**
```tsx
import { DataFreshnessIndicator } from '@/components/DataFreshnessIndicator';

<DataFreshnessIndicator 
  lastUpdated="2026-01-15"
  sourceUrl="https://admissions.duke.edu/apply"
  collegeName="Duke University"
/>
```

**Visual Design:**
```
┌─────────────────────────────────────────────────────┐
│ ✓  Information last verified: Jan 15, 2026         │
│    Data is current                                  │
│                                                     │
│    Source: Duke University Official Page ↗         │
└─────────────────────────────────────────────────────┘
```

### 3. Auto-Load Essay Templates (TASK 4) ✅

**File:** `backend/src/services/essayAutoLoadingService.js`

**What it does:**
- Automatically loads essay requirements when college is added
- Detects application platform (Common App, Coalition, UC, etc.)
- Loads main platform essay only once per user
- Loads college-specific supplements from database

**Supported Platforms:**

**Common Application:**
- 1 personal statement (650 words, 7 prompts)
- College-specific supplements from `essay_prompts` table
- Shared across all Common App colleges

**Coalition Application:**
- 1 essay (500-650 words, 5 prompts)
- College-specific supplements
- Shared across all Coalition colleges

**UC Application:**
- 8 Personal Insight Questions (350 words each)
- Students choose 4 of 8
- Shared across all UC schools

**Example:**
```javascript
// When Stanford (Common App school) is added:
const result = EssayAutoLoadingService.loadEssaysForApplication(
  userId: 123,
  applicationId: 456,
  collegeId: 2567  // Stanford
);

// Creates:
// 1. Common App Main Essay (if not exists) - shared_across_colleges=true
// 2. Stanford Supplement 1: "What matters to you and why?" (250 words)
// 3. Stanford Supplement 2: "Why Stanford?" (150 words)
// 4. Stanford Supplement 3: Short answers (50 words each)
```

**Key Features:**
- ✅ Platform detection from `colleges.application_platforms` field
- ✅ One main essay per platform per user (prevents duplicates)
- ✅ Shared essay flag for Common App/Coalition/UC
- ✅ Historical data fallback with disclaimer
- ✅ Proper essay numbering for UC PIQs

### 4. Real-Time Word Count (TASK 7) ✅

**File:** `src/components/WordCountTracker.tsx`

**What it does:**
- Live word/character counting as user types
- Visual progress bar showing percentage of limit
- Color-coded warnings
- Supports both word limits and character limits

**Color Coding:**
- **Green** (<90%): On track
- **Yellow** (90-100%): Approaching limit
- **Red** (>100%): Over limit with warning message

**Usage:**
```tsx
import { WordCountTracker, useWordCount } from '@/components/WordCountTracker';

function EssayEditor() {
  const { text, setText, isOverLimit, handleLimitExceeded } = useWordCount();
  
  return (
    <>
      <Textarea 
        value={text} 
        onChange={(e) => setText(e.target.value)}
        disabled={isOverLimit}  // Can disable when over limit
      />
      <WordCountTracker 
        text={text}
        wordLimit={650}
        limitType="words"
        onLimitExceeded={handleLimitExceeded}
      />
    </>
  );
}
```

**Visual Display:**
```
532/650 words (82%)  [████████░░] 

245/250 words (98%)  [█████████▓]  ⚠️

678/650 words (104%) [██████████] 🚫
⚠️ You have exceeded the word limit. Please reduce your text to 650 words or less.

425 characters (392 without spaces)
```

### 5. Terms and Conditions (TASK 8) ✅

**File:** `src/pages/Terms.tsx`

**What it does:**
- Full terms and conditions page with data collection notice
- Onboarding flow integration
- Records consent in database
- Highlights data collection section

**Data Collection Notice:**
```
┌─────────────────────────────────────────────────┐
│ ⚠️ IMPORTANT - DATA COLLECTION NOTICE:         │
│                                                 │
│ By using this platform, you agree to allow us  │
│ to collect and analyze your application data   │
│ including:                                      │
│                                                 │
│ • Colleges applied to and application dates    │
│ • Application deadlines and completion status  │
│ • Essay drafts and writing progress            │
│ • Application outcomes                          │
│ • Academic profile information                  │
│                                                 │
│ This data is anonymized and used to improve    │
│ our services and help future students.         │
│                                                 │
│ We never sell your data to third parties.      │
└─────────────────────────────────────────────────┘
```

**Onboarding Flow:**
```
Registration → Email Verification → Terms Page (?onboarding=true) → 
Accept Checkbox → Continue → Dashboard
```

**Database Recording:**
```sql
INSERT INTO user_consents (
  user_id, 
  consent_type, 
  timestamp, 
  ip_address
) VALUES (
  123, 
  'terms_and_data_collection', 
  '2026-02-14T08:30:00Z',
  '192.168.1.1'
);

UPDATE users 
SET terms_accepted = 1, terms_accepted_date = CURRENT_TIMESTAMP 
WHERE id = 123;
```

## Database Schema

### New Migration: 033_auto_deadline_essay_system.sql

**New Tables:**

1. **user_consents** - Terms acceptance tracking
```sql
CREATE TABLE user_consents (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  consent_type TEXT NOT NULL,  -- 'terms_and_data_collection'
  granted INTEGER DEFAULT 1,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  ip_address TEXT,
  user_agent TEXT
);
```

2. **notifications** - In-app notifications
```sql
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,  -- 'deadline_change', 'essay_prompt_change'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

3. **notification_preferences** - Email settings
```sql
CREATE TABLE notification_preferences (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  deadline_changes_email INTEGER DEFAULT 1,
  essay_changes_email INTEGER DEFAULT 1,
  decision_dates_email INTEGER DEFAULT 1,
  weekly_digest_email INTEGER DEFAULT 1
);
```

4. **essay_drafts** - Version control for essays
```sql
CREATE TABLE essay_drafts (
  id INTEGER PRIMARY KEY,
  essay_id INTEGER NOT NULL,
  draft_text TEXT,
  word_count INTEGER,
  version_number INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**New Fields:**

**essays table:**
- `platform` TEXT - "Common Application", "Coalition", "UC", etc.
- `shared_across_colleges` INTEGER - 1 if shared (Common App main essay)
- `historical_data` INTEGER - 1 if from previous year
- `essay_number` INTEGER - For UC PIQs (1-8) and supplement ordering

**application_deadlines table:**
- `confidence_score` REAL (0-1) - Data reliability
- `last_updated` DATETIME - For freshness calculation
- `source_url` TEXT - College official source
- `verification_status` TEXT - 'unverified', 'auto_verified', 'manually_verified'

**colleges table:**
- `application_platforms` TEXT - "Common Application, Coalition Application"

**deadlines table:**
- `recently_changed` INTEGER - Flag for "Recently Updated" badge
- `change_date` DATETIME - When deadline was last changed

**users table:**
- `terms_accepted` INTEGER - 0 or 1
- `terms_accepted_date` DATETIME

## Integration Examples

### Adding to Deadlines Page

```tsx
// src/pages/Deadlines.tsx
import { DataFreshnessIndicator } from '@/components/DataFreshnessIndicator';

// In the deadline display section:
<div className="mb-4">
  <DataFreshnessIndicator 
    lastUpdated={collegeDeadlines.last_updated}
    sourceUrl={collegeDeadlines.source_url}
    collegeName={college.name}
  />
</div>

{deadlines.map(deadline => (
  <div key={deadline.id}>
    {deadline.recently_changed && (
      <span className="badge badge-warning">Recently Updated</span>
    )}
    {/* deadline details */}
  </div>
))}
```

### Adding to Essays Page

```tsx
// src/pages/Essays.tsx
import { WordCountTracker } from '@/components/WordCountTracker';

function EssayCard({ essay }) {
  const [draftText, setDraftText] = useState(essay.draft_text || '');
  const [isOverLimit, setIsOverLimit] = useState(false);
  
  return (
    <div>
      {essay.historical_data && (
        <div className="alert alert-warning">
          ⚠ Based on 2025 prompts. 2026 not yet released. Will auto-update.
        </div>
      )}
      
      <Textarea 
        value={draftText}
        onChange={(e) => setDraftText(e.target.value)}
      />
      
      <WordCountTracker 
        text={draftText}
        wordLimit={essay.word_limit}
        limitType="words"
        onLimitExceeded={setIsOverLimit}
      />
      
      <Button disabled={isOverLimit}>
        Save Draft
      </Button>
    </div>
  );
}
```

### Adding to Onboarding Flow

```tsx
// src/pages/Onboarding.tsx
import { useNavigate } from 'react-router-dom';

function OnboardingFlow() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  
  const handleComplete = () => {
    if (step === 2) {
      // After account creation, go to terms
      navigate('/terms?onboarding=true');
    }
  };
  
  return (
    <div>
      {step === 1 && <WelcomeScreen onNext={() => setStep(2)} />}
      {step === 2 && <AccountCreation onNext={handleComplete} />}
      {/* Terms page handles step 3 and redirects to dashboard */}
    </div>
  );
}
```

## Testing

### 1. Test Auto-Deadline Population

```bash
# Start backend
cd backend && npm run migrate && node src/app.js

# Register/login user
TOKEN="<your_token>"

# Add a college (triggers auto-population)
curl -X POST http://localhost:5000/api/applications \
  -H "Authorization: ******" \
  -H "Content-Type: application/json" \
  -d '{
    "collegeId": 1686
  }'

# Verify deadlines were created
curl http://localhost:5000/api/deadlines \
  -H "Authorization: ******" | jq

# Should see deadlines like:
# {
#   "deadline_type": "early_decision_1",
#   "deadline_date": "2026-11-01",
#   "description": "Early Decision I deadline",
#   "status": "not_started"
# }
```

### 2. Test Auto-Essay Loading

```bash
# Check if essays were created
curl http://localhost:5000/api/essays \
  -H "Authorization: ******" | jq

# Should see:
# - Common App main essay (if Common App school)
# - College-specific supplements
# - shared_across_colleges flag on main essay
```

### 3. Test Word Count Component

```tsx
// Create test component
function TestWordCount() {
  const [text, setText] = useState('');
  
  return (
    <div>
      <textarea 
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        style={{ width: '100%' }}
      />
      <WordCountTracker 
        text={text}
        wordLimit={100}
        limitType="words"
      />
    </div>
  );
}

// Type text and verify:
// - Count updates in real-time
// - Color changes at 90%, 100%, 101%
// - Progress bar animates
// - Warning appears when over limit
```

### 4. Test Data Freshness

```tsx
// Test with different timestamps
<DataFreshnessIndicator lastUpdated="2026-02-13" />  // Green
<DataFreshnessIndicator lastUpdated="2026-01-20" />  // Yellow
<DataFreshnessIndicator lastUpdated="2025-12-01" />  // Red with button
```

## Future Enhancements

### TASK 2: Weekly Deadline Scraping (Not Implemented)

**Approach:**
1. Set up cron job running every Sunday at 2:00 AM
2. Use Playwright/Puppeteer for JavaScript-rendered pages
3. Navigate to `college.edu/admissions/deadlines`
4. Extract dates using patterns:
   - "Early Decision" + "November" or "ED1"
   - Regular expressions for date formats
5. Compare extracted vs database
6. If changed: update database, notify users, send emails
7. Log results: success timestamp or error details

**Technology Stack:**
- node-cron or cron package for scheduling
- Playwright for browser automation
- Natural language date parser (chrono-node)
- SendGrid or Nodemailer for email notifications

### TASK 5: Essay Scraping (Not Implemented)

**Approach:**
1. Cron job every 2 weeks (Aug 1 - Nov 30)
2. For Common App: scrape commonapp.org prompt page
3. For each college: find supplement page
4. Extract questions, word limits, required/optional
5. Compare to database and flag changes
6. Notify users if their essays affected

### TASK 6: Historical Pattern Analysis (Not Implemented)

**Approach:**
1. Query 3 years of essay prompt history
2. Calculate consistency score (0-1)
3. If prompt appears 3+ years: high confidence
4. Display: "This prompt has appeared 3+ consecutive years"
5. If word limits consistent: use with confidence
6. If varying: "Word limit may change"

### TASK 9: Notification System (Partially Implemented)

**Remaining Work:**
- Email notification templates
- SendGrid/Nodemailer integration
- Notification center UI
- "Mark all as read" functionality
- Email frequency preferences

### TASK 10: Decision Date Tracking (Database Ready)

**Implementation:**
- Database has notification_date fields
- Display: "Decision Release: April 1, 2026"
- Countdown: "You'll hear in 7 days!"
- Alert on decision day

## Troubleshooting

### Deadlines Not Populating

**Check:**
1. Does `application_deadlines` table have data for college?
```sql
SELECT * FROM application_deadlines WHERE college_id = 1686;
```

2. Is confidence_score >= 0.7?
```sql
SELECT confidence_score FROM application_deadlines WHERE college_id = 1686;
```

3. Check logs:
```bash
tail -f backend.log | grep "Auto-populated deadlines"
```

### Essays Not Loading

**Check:**
1. Does `essay_prompts` table have supplements?
```sql
SELECT * FROM essay_prompts WHERE college_id = 1686;
```

2. Is `application_platforms` set on college?
```sql
SELECT application_platforms FROM colleges WHERE id = 1686;
```

3. Check if main essay already exists:
```sql
SELECT * FROM essays WHERE user_id = 123 AND essay_type = 'common_app_main';
```

### Word Count Not Updating

**Check:**
1. Is `onChange` handler connected?
2. Is text state being updated?
3. Console errors in browser DevTools?

## Maintenance

### Updating Essay Prompts

**Common App (annually):**
```javascript
// Edit essayAutoLoadingService.js
static _getCommonAppPrompts(year) {
  if (year === 2027) {
    return `Updated prompts for 2027...`;
  }
  return `Current prompts...`;
}
```

**UC (annually):**
```javascript
static _getUCPrompts(year) {
  if (year === 2027) {
    return [
      'Updated UC PIQ 1...',
      // ... all 8 prompts
    ];
  }
  return [ /* current prompts */ ];
}
```

### Adding New Application Platform

```javascript
// 1. Add to platform detection
static _detectApplicationPlatform(college) {
  // ...existing code...
  } else if (platforms.includes('Apply Texas')) {
    return 'apply_texas';
  }
}

// 2. Add to main essay loading
static async _loadPlatformMainEssay(userId, platform, result) {
  // ...existing code...
  } else if (platform === 'apply_texas') {
    // Load Apply Texas essay
  }
}
```

### Updating Terms

```tsx
// Edit src/pages/Terms.tsx
// Update section 3 with legal team approved language
// Update "Last updated" date
// Increment version number
```

## Performance Considerations

1. **Transaction Usage:** Auto-population uses database transactions for atomicity
2. **Async Operations:** Services don't block application creation
3. **Caching:** Consider caching prompt text for Common App/Coalition
4. **Indexing:** Database has indexes on foreign keys
5. **Batch Operations:** Use `db.transaction()` for multiple inserts

## Security Considerations

1. **Terms Consent:** Legally binding timestamp with IP address
2. **Data Privacy:** Never share user data with third parties
3. **Authentication:** All auto-population requires authenticated user
4. **SQL Injection:** Using prepared statements throughout
5. **XSS Protection:** React automatically escapes text content

## Conclusion

This system significantly reduces manual data entry for students while ensuring they don't miss critical deadlines or essay requirements. The auto-population happens transparently when colleges are added, and the data freshness indicators build trust by showing verification status.

Future web scraping services will keep this data current automatically, but the foundation is now in place for immediate use with manually entered deadline and essay data.
