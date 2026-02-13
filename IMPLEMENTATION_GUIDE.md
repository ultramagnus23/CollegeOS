# CollegeOS - Deadlines, Essays & Requirements Implementation Guide

## Current Status

### ✅ Completed
1. **Database Setup**
   - 32 migrations executed successfully
   - 6,429 colleges seeded with 70,469 total records
   - Tables created:
     - `deadlines` - User's personal application deadlines
     - `essays` - User's essay tracking
     - `application_deadlines` - College-specific deadline reference data
     - `college_requirements` - College-specific requirements
     - `course_requirements` - Academic course requirements

2. **Backend Infrastructure**
   - Controllers: DeadlineController, EssayController
   - Models: Deadline, Essay, Application
   - Routes: `/api/deadlines`, `/api/essays`
   - Authentication: JWT with token refresh

3. **Frontend Pages**
   - Deadlines.tsx - Basic UI with CRUD operations
   - Essays.tsx - Basic UI with CRUD operations
   - API integration with proper namespaces

### ⚠️ Needs Fixing
1. **Backend Server Stability** - Process crashes after start, needs investigation
2. **Test Data** - Need sample applications, deadlines, essays for testing
3. **Frontend Loading States** - Add proper error boundaries and loading indicators

## Priority 1: Fix Existing Pages

### Step 1: Verify Backend Starts
```bash
cd backend
npm install
npm run migrate
npm run seed
node src/app.js
```

### Step 2: Create Test User and Data
```bash
# Register user
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email":"student@test.com",
    "password":"Password123",
    "fullName":"Test Student",
    "country":"USA"
  }'

# Save the token, then create an application
TOKEN="<access_token_from_above>"

# Find Duke University ID
curl -s "http://localhost:5000/api/colleges/search?q=Duke"

# Create application for Duke
curl -X POST http://localhost:5000/api/applications \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "collegeId": 1686,
    "status": "researching",
    "applicationType": "regular_decision"
  }'
```

### Step 3: Test Deadlines API
```bash
# Get applications to find application_id
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/api/applications

# Create deadline
curl -X POST http://localhost:5000/api/deadlines \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "applicationId": 1,
    "deadlineType": "regular_decision",
    "deadlineDate": "2026-01-01",
    "description": "Regular Decision Deadline"
  }'

# Get all deadlines
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/api/deadlines
```

### Step 4: Frontend Testing
1. Start frontend: `npm run dev`
2. Navigate to `/deadlines`
3. Verify page loads without errors
4. Test adding a deadline
5. Test marking deadline as complete
6. Test deleting a deadline

## Priority 2: College-Specific Deadlines

### Database Schema (Already Migrated)
```sql
-- application_deadlines table stores reference data for each college
CREATE TABLE application_deadlines (
  id INTEGER PRIMARY KEY,
  college_id INTEGER NOT NULL,
  application_year INTEGER NOT NULL,
  early_decision_1_date DATE,
  early_decision_1_notification DATE,
  early_decision_2_date DATE,
  early_decision_2_notification DATE,
  early_action_date DATE,
  early_action_notification DATE,
  restrictive_ea_date DATE,
  restrictive_ea_notification DATE,
  regular_decision_date DATE,
  regular_decision_notification DATE,
  rolling_admission BOOLEAN DEFAULT 0,
  priority_deadline DATE,
  fafsa_deadline DATE,
  css_profile_deadline DATE,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  source_url TEXT,
  confidence_score REAL DEFAULT 0.5,
  verification_status TEXT DEFAULT 'unverified',
  FOREIGN KEY (college_id) REFERENCES colleges(id)
);
```

### Implementation Tasks

#### 1. Create College Deadline Model
File: `backend/src/models/CollegeDeadline.js`

```javascript
const dbManager = require('../config/database');

class CollegeDeadline {
  static findByCollege(collegeId, year = new Date().getFullYear()) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM application_deadlines 
      WHERE college_id = ? AND application_year = ?
    `);
    return stmt.get(collegeId, year);
  }

  static getOfferedDeadlineTypes(collegeId, year = new Date().getFullYear()) {
    const deadlines = this.findByCollege(collegeId, year);
    if (!deadlines) return [];
    
    const offered = [];
    if (deadlines.early_decision_1_date) offered.push('Early Decision I');
    if (deadlines.early_decision_2_date) offered.push('Early Decision II');
    if (deadlines.early_action_date) offered.push('Early Action');
    if (deadlines.restrictive_ea_date) offered.push('Restrictive Early Action');
    if (deadlines.regular_decision_date) offered.push('Regular Decision');
    if (deadlines.rolling_admission) offered.push('Rolling Admission');
    
    return offered;
  }

  static create(data) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare(`
      INSERT INTO application_deadlines (
        college_id, application_year,
        early_decision_1_date, early_decision_1_notification,
        early_decision_2_date, early_decision_2_notification,
        early_action_date, early_action_notification,
        restrictive_ea_date, restrictive_ea_notification,
        regular_decision_date, regular_decision_notification,
        rolling_admission, priority_deadline,
        fafsa_deadline, css_profile_deadline,
        source_url, confidence_score, verification_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    return stmt.run(
      data.collegeId,
      data.applicationYear || new Date().getFullYear(),
      data.earlyDecision1Date || null,
      data.earlyDecision1Notification || null,
      data.earlyDecision2Date || null,
      data.earlyDecision2Notification || null,
      data.earlyActionDate || null,
      data.earlyActionNotification || null,
      data.restrictiveEADate || null,
      data.restrictiveEANotification || null,
      data.regularDecisionDate || null,
      data.regularDecisionNotification || null,
      data.rollingAdmission || 0,
      data.priorityDeadline || null,
      data.fafsaDeadline || null,
      data.cssProfileDeadline || null,
      data.sourceUrl || null,
      data.confidenceScore || 0.5,
      data.verificationStatus || 'unverified'
    );
  }
}

module.exports = CollegeDeadline;
```

#### 2. Create Controller
File: `backend/src/controllers/collegeDeadlineController.js`

```javascript
const CollegeDeadline = require('../models/CollegeDeadline');
const College = require('../models/College');

class CollegeDeadlineController {
  static async getCollegeDeadlines(req, res, next) {
    try {
      const { id } = req.params;
      const { year } = req.query;
      
      const deadlines = CollegeDeadline.findByCollege(
        parseInt(id), 
        year ? parseInt(year) : undefined
      );
      
      if (!deadlines) {
        return res.status(404).json({
          success: false,
          message: 'Deadlines not found for this college',
          errorCode: 'DEADLINES_NOT_FOUND'
        });
      }
      
      // Get offered deadline types
      const offeredTypes = CollegeDeadline.getOfferedDeadlineTypes(parseInt(id));
      
      res.json({
        success: true,
        data: {
          ...deadlines,
          offeredDeadlineTypes: offeredTypes
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = CollegeDeadlineController;
```

#### 3. Add Route
File: `backend/src/routes/colleges.js` (add to existing routes)

```javascript
const CollegeDeadlineController = require('../controllers/collegeDeadlineController');

// Add this route
router.get('/:id/deadlines', CollegeDeadlineController.getCollegeDeadlines);
```

#### 4. Sample Data Script
File: `backend/scripts/populateCollegeDeadlines.js`

```javascript
const dbManager = require('../src/config/database');

// Sample deadlines for top colleges
const sampleDeadlines = [
  {
    college_name: 'Duke University',
    college_id: 1686,
    application_year: 2026,
    early_decision_1_date: '2025-11-01',
    early_decision_1_notification: '2025-12-15',
    regular_decision_date: '2026-01-02',
    regular_decision_notification: '2026-04-01',
    fafsa_deadline: '2026-02-01',
    css_profile_deadline: '2026-02-01',
    source_url: 'https://admissions.duke.edu/apply/',
    confidence_score: 0.9,
    verification_status: 'manually_verified'
  },
  {
    college_name: 'Stanford University',
    college_id: null, // Find via query
    application_year: 2026,
    early_action_date: '2025-11-01',
    early_action_notification: '2025-12-15',
    restrictive_ea_date: '2025-11-01',
    restrictive_ea_notification: '2025-12-15',
    regular_decision_date: '2026-01-05',
    regular_decision_notification: '2026-04-01',
    fafsa_deadline: '2026-02-15',
    css_profile_deadline: '2026-02-15',
    source_url: 'https://admission.stanford.edu/apply/',
    confidence_score: 0.9,
    verification_status: 'manually_verified'
  },
  // Add more colleges...
];

async function populateCollegeDeadlines() {
  const db = dbManager.getDatabase();
  
  console.log('🗓️  Populating college deadlines...\n');
  
  for (const deadline of sampleDeadlines) {
    // Find college_id if not provided
    if (!deadline.college_id) {
      const college = db.prepare('SELECT id FROM colleges WHERE name = ?')
        .get(deadline.college_name);
      
      if (!college) {
        console.log(`⚠️  College not found: ${deadline.college_name}`);
        continue;
      }
      deadline.college_id = college.id;
    }
    
    // Insert deadline
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO application_deadlines (
        college_id, application_year,
        early_decision_1_date, early_decision_1_notification,
        early_action_date, early_action_notification,
        restrictive_ea_date, restrictive_ea_notification,
        regular_decision_date, regular_decision_notification,
        fafsa_deadline, css_profile_deadline,
        source_url, confidence_score, verification_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      deadline.college_id,
      deadline.application_year,
      deadline.early_decision_1_date || null,
      deadline.early_decision_1_notification || null,
      deadline.early_action_date || null,
      deadline.early_action_notification || null,
      deadline.restrictive_ea_date || null,
      deadline.restrictive_ea_notification || null,
      deadline.regular_decision_date || null,
      deadline.regular_decision_notification || null,
      deadline.fafsa_deadline || null,
      deadline.css_profile_deadline || null,
      deadline.source_url,
      deadline.confidence_score,
      deadline.verification_status
    );
    
    console.log(`✅ Added deadlines for ${deadline.college_name}`);
  }
  
  console.log('\n✅ College deadlines populated!');
}

if (require.main === module) {
  populateCollegeDeadlines()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}

module.exports = { populateCollegeDeadlines };
```

Run with: `node backend/scripts/populateCollegeDeadlines.js`

#### 5. Display on College Details Page
File: `src/pages/CollegeDetails.tsx` (add new section)

```typescript
// Add to component
const [collegeDeadlines, setCollegeDeadlines] = useState<any>(null);

useEffect(() => {
  if (college?.id) {
    fetchCollegeDeadlines();
  }
}, [college]);

const fetchCollegeDeadlines = async () => {
  try {
    const response = await api.request(`/colleges/${college.id}/deadlines`);
    setCollegeDeadlines(response.data);
  } catch (error) {
    console.error('Failed to load deadlines:', error);
  }
};

// Add to render (in the main content area)
{collegeDeadlines && (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
    <h2 className="text-2xl font-bold mb-4">Application Deadlines (2026)</h2>
    
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {collegeDeadlines.early_decision_1_date && (
        <div className="p-4 bg-blue-50 rounded-lg">
          <h3 className="font-bold text-blue-900">Early Decision I</h3>
          <p className="text-blue-700">
            Application: {new Date(collegeDeadlines.early_decision_1_date).toLocaleDateString()}
          </p>
          {collegeDeadlines.early_decision_1_notification && (
            <p className="text-sm text-blue-600">
              Decision: {new Date(collegeDeadlines.early_decision_1_notification).toLocaleDateString()}
            </p>
          )}
        </div>
      )}
      
      {collegeDeadlines.early_decision_2_date && (
        <div className="p-4 bg-blue-50 rounded-lg">
          <h3 className="font-bold text-blue-900">Early Decision II</h3>
          <p className="text-blue-700">
            Application: {new Date(collegeDeadlines.early_decision_2_date).toLocaleDateString()}
          </p>
          {collegeDeadlines.early_decision_2_notification && (
            <p className="text-sm text-blue-600">
              Decision: {new Date(collegeDeadlines.early_decision_2_notification).toLocaleDateString()}
            </p>
          )}
        </div>
      )}
      
      {collegeDeadlines.early_action_date && (
        <div className="p-4 bg-green-50 rounded-lg">
          <h3 className="font-bold text-green-900">Early Action</h3>
          <p className="text-green-700">
            Application: {new Date(collegeDeadlines.early_action_date).toLocaleDateString()}
          </p>
          {collegeDeadlines.early_action_notification && (
            <p className="text-sm text-green-600">
              Decision: {new Date(collegeDeadlines.early_action_notification).toLocaleDateString()}
            </p>
          )}
        </div>
      )}
      
      {collegeDeadlines.regular_decision_date && (
        <div className="p-4 bg-orange-50 rounded-lg">
          <h3 className="font-bold text-orange-900">Regular Decision</h3>
          <p className="text-orange-700">
            Application: {new Date(collegeDeadlines.regular_decision_date).toLocaleDateString()}
          </p>
          {collegeDeadlines.regular_decision_notification && (
            <p className="text-sm text-orange-600">
              Decision: {new Date(collegeDeadlines.regular_decision_notification).toLocaleDateString()}
            </p>
          )}
        </div>
      )}
    </div>
    
    {collegeDeadlines.last_updated && (
      <p className="mt-4 text-sm text-gray-500">
        Last updated: {new Date(collegeDeadlines.last_updated).toLocaleDateString()}
        {collegeDeadlines.verification_status === 'manually_verified' && (
          <span className="ml-2 text-green-600">✓ Verified</span>
        )}
      </p>
    )}
  </div>
)}
```

## Priority 3: Enhanced Features

### Calendar View Component
File: `src/components/DeadlineCalendar.tsx`

```typescript
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Deadline {
  id: number;
  college_name: string;
  deadline_type: string;
  deadline_date: string;
  is_completed: boolean;
}

export const DeadlineCalendar = ({ deadlines }: { deadlines: Deadline[] }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'month' | 'week'>('month');
  
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    return new Date(year, month + 1, 0).getDate();
  };
  
  const getDeadlinesForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return deadlines.filter(d => d.deadline_date.startsWith(dateStr));
  };
  
  const renderMonthView = () => {
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
    const days = [];
    
    // Empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="p-2 border border-gray-200"></div>);
    }
    
    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
      const dayDeadlines = getDeadlinesForDate(date);
      const isToday = date.toDateString() === new Date().toDateString();
      
      days.push(
        <div
          key={day}
          className={`p-2 border border-gray-200 min-h-24 ${
            isToday ? 'bg-blue-50' : ''
          }`}
        >
          <div className="font-semibold mb-1">{day}</div>
          {dayDeadlines.map(deadline => (
            <div
              key={deadline.id}
              className={`text-xs p-1 mb-1 rounded ${
                deadline.is_completed
                  ? 'bg-green-100 text-green-800'
                  : 'bg-yellow-100 text-yellow-800'
              }`}
            >
              {deadline.college_name}
            </div>
          ))}
        </div>
      );
    }
    
    return (
      <div className="grid grid-cols-7 gap-0">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="p-2 text-center font-bold border border-gray-300 bg-gray-100">
            {day}
          </div>
        ))}
        {days}
      </div>
    );
  };
  
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))}
          >
            <ChevronLeft size={16} />
          </Button>
          <h2 className="text-xl font-bold">
            {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))}
          >
            <ChevronRight size={16} />
          </Button>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant={view === 'month' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setView('month')}
          >
            Month
          </Button>
          <Button
            variant={view === 'week' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setView('week')}
          >
            Week
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentDate(new Date())}
          >
            Today
          </Button>
        </div>
      </div>
      
      {view === 'month' && renderMonthView()}
    </div>
  );
};
```

### CSV Export Function
File: `src/utils/exportDeadlines.ts`

```typescript
export const exportDeadlinesCSV = (deadlines: any[]) => {
  const headers = ['Date', 'College', 'Deadline Type', 'Status', 'Description'];
  const rows = deadlines.map(d => [
    d.deadline_date,
    d.college_name,
    d.deadline_type,
    d.is_completed ? 'Completed' : 'Pending',
    d.description || ''
  ]);
  
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `deadlines_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};
```

### iCal Export Function
File: `src/utils/exportDeadlines.ts` (add to same file)

```typescript
export const exportDeadlinesICal = (deadlines: any[]) => {
  const icalEvents = deadlines.map(d => {
    const date = d.deadline_date.replace(/-/g, '');
    return [
      'BEGIN:VEVENT',
      `UID:${d.id}@collegeos.app`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      `DTSTART;VALUE=DATE:${date}`,
      `SUMMARY:${d.college_name} - ${d.deadline_type}`,
      `DESCRIPTION:${d.description || 'Application deadline'}`,
      `LOCATION:${d.college_name}`,
      'BEGIN:VALARM',
      'TRIGGER:-P7D',
      'ACTION:DISPLAY',
      'DESCRIPTION:Deadline in 7 days',
      'END:VALARM',
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      'DESCRIPTION:Deadline tomorrow',
      'END:VALARM',
      'END:VEVENT'
    ].join('\r\n');
  }).join('\r\n');
  
  const ical = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CollegeOS//Application Deadlines//EN',
    'CALSCALE:GREGORIAN',
    icalEvents,
    'END:VCALENDAR'
  ].join('\r\n');
  
  const blob = new Blob([ical], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `deadlines_${new Date().toISOString().split('T')[0]}.ics`;
  link.click();
  URL.revokeObjectURL(url);
};
```

## Priority 4: Dynamic Requirements System

### College Requirements Model
File: `backend/src/models/CollegeRequirement.js`

```javascript
const dbManager = require('../config/database');

class CollegeRequirement {
  static findByCollege(collegeId) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM college_requirements 
      WHERE college_id = ?
    `);
    return stmt.get(collegeId);
  }

  static getCourseRequirements(collegeId) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM course_requirements 
      WHERE college_id = ?
      ORDER BY subject ASC
    `);
    return stmt.all(collegeId);
  }

  static getTestPolicy(collegeId) {
    const requirements = this.findByCollege(collegeId);
    if (!requirements) return null;
    
    return {
      policy: requirements.test_policy, // 'required', 'optional', 'blind', 'flexible'
      acceptedTests: requirements.accepted_tests ? 
        JSON.parse(requirements.accepted_tests) : [],
      superscoring: requirements.superscoring_policy,
      testCodes: {
        sat: requirements.sat_code,
        act: requirements.act_code
      }
    };
  }

  static getRecommendationRequirements(collegeId) {
    const requirements = this.findByCollege(collegeId);
    if (!requirements) return null;
    
    return {
      teacherRecs: requirements.teacher_recs_required || 0,
      counselorRec: requirements.counselor_rec_required,
      peerRec: requirements.peer_rec_required,
      additionalRecs: requirements.additional_recs_allowed
    };
  }
}

module.exports = CollegeRequirement;
```

## Next Steps

1. **Fix Backend Stability**
   - Investigate why process crashes
   - Add better error handling
   - Implement process monitoring

2. **Complete Testing**
   - Test all API endpoints
   - Verify frontend pages load
   - Test CRUD operations
   - Test authentication flow

3. **Implement Enhancements**
   - Add calendar component to Deadlines page
   - Implement export functions
   - Add countdown timers
   - Build requirements display

4. **Web Scraping** (Future Phase)
   - Build scraping service
   - Implement error handling
   - Add scheduling system
   - Create verification workflow

## Resources

- Database Schema: `backend/migrations/`
- API Documentation: `backend/src/routes/`
- Frontend Pages: `src/pages/Deadlines.tsx`, `src/pages/Essays.tsx`
- Models: `backend/src/models/`

## Support

For issues:
1. Check backend logs: `tail -f /tmp/backend.log`
2. Verify database: `sqlite3 backend/database/college_app.db ".tables"`
3. Test API: `curl http://localhost:5000/api/colleges?limit=1`
