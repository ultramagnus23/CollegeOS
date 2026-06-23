# COLLEGEOS — WEBSITE IMPLEMENTATION PLAN

Last Updated: 2026-06-23

## 1. FOOTER LINKS

### 1.1 Footer Structure

Every page of the CollegeOS website must include a footer with the following links:

```
┌─────────────────────────────────────────────────────────┐
│  CollegeOS                                              │
│                                                         │
│  Legal:                                                 │
│    Terms of Service  │  Privacy Policy  │  Cookie Policy │
│    AI Disclaimer  │  Minor User Policy  │  Community Guidelines │
│    Data Retention Policy  │  Account Deletion Policy │  Consent Management │
│                                                         │
│  Support:                                               │
│    Help Center  │  Contact Us  │  Report a Concern │    │
│                                                         │
│  Social:                                                │
│    [Twitter] [LinkedIn] [Instagram]                     │
│                                                         │
│  © 2026 CollegeOS. All rights reserved.              │
└─────────────────────────────────────────────────────────┘
```

### 1.2 Implementation Requirements

**File:** `frontend/src/components/Footer.jsx` (or equivalent)

```jsx
const Footer = () => {
  return (
    <footer className="site-footer">
      <div className="footer-legal-links">
        <Link href="/legal/terms">Terms of Service</Link>
        <Link href="/legal/privacy">Privacy Policy</Link>
        <Link href="/legal/cookies">Cookie Policy</Link>
        <Link href="/legal/ai-disclaimer">AI Disclaimer</Link>
        <Link href="/legal/minor-user">Minor User Policy</Link>
        <Link href="/legal/community-guidelines">Community Guidelines</Link>
        <Link href="/legal/data-retention">Data Retention Policy</Link>
        <Link href="/legal/account-deletion">Account Deletion Policy</Link>
        <Link href="/legal/consent-management">Consent Management</Link>
      </div>
      <div className="footer-support-links">
        <Link href="/help">Help Center</Link>
        <Link href="/contact">Contact Us</Link>
        <Link href="/report-concern">Report a Concern</Link>
      </div>
      <div className="footer-copyright">
        © {new Date().getFullYear()} CollegeOS. All rights reserved.
      </div>
    </footer>
  );
};
```

### 1.3 Legal Page Routing

Each legal document should be accessible at:

| Document | URL Path |
|----------|----------|
| Terms of Service | `/legal/terms` |
| Privacy Policy | `/legal/privacy` |
| Cookie Policy | `/legal/cookies` |
| AI Disclaimer | `/legal/ai-disclaimer` |
| Minor User Policy | `/legal/minor-user` |
| Community Guidelines | `/legal/community-guidelines` |
| Data Retention Policy | `/legal/data-retention` |
| Account Deletion Policy | `/legal/account-deletion` |

### 1.4 Legal Page Template

Each legal page should include:

```jsx
const LegalPage = ({ title, lastUpdated, content }) => {
  return (
    <div className="legal-page">
      <h1>{title}</h1>
      <p className="last-updated">Last Updated: {lastUpdated}</p>
      <div className="legal-content">{content}</div>
      <div className="legal-actions">
        <button onClick={() => window.print()}>Print</button>
        <button onClick={() => downloadPDF()}>Download PDF</button>
      </div>
    </div>
  );
};
```

## 2. SIGNUP FLOW IMPLEMENTATION

### 2.1 Signup Screen Components

**File:** `frontend/src/components/SignupForm.jsx`

```jsx
const SignupForm = () => {
  const [age, setAge] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptAI, setAcceptAI] = useState(false);
  const [isMinor, setIsMinor] = useState(false);
  const [parentConsent, setParentConsent] = useState(false);

  const handleAgeChange = (value) => {
    setAge(value);
    setIsMinor(value >= 13 && value < 18);
  };

  const canSubmit = acceptTerms && acceptPrivacy && 
    (age < 18 ? parentConsent : true) &&
    acceptAI;

  return (
    <form className="signup-form" onSubmit={handleSubmit}>
      {/* Age Verification */}
      <div className="age-verification">
        <label>I am at least 13 years old</label>
        <input
          type="number"
          min="13"
          max="100"
          value={age}
          onChange={(e) => handleAgeChange(e.target.value)}
          required
        />
      </div>

      {/* Minor User Provisions */}
      {isMinor && (
        <div className="minor-user-provisions">
          <p>
            You are under 18. By creating an account, you confirm that a parent
            or legal guardian has reviewed these documents and consents to your
            use of CollegeOS.
          </p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={parentConsent}
              onChange={(e) => setParentConsent(e.target.checked)}
              required
            />
            A parent or legal guardian has reviewed and consents to my use of
            CollegeOS and agrees to be bound by these Terms on my behalf
          </label>
        </div>
      )}

      {/* Parent Signup (if parent creates account for child) */}
      {isParentCreatingForChild && (
        <div className="parent-consent">
          <p>
            I am a parent or legal guardian of the user creating this account.
            By proceeding, I confirm that I have read and understand the Terms
            of Service, Privacy Policy, Cookie Policy, AI Disclaimer, and Minor
            User Policy. I consent to the collection, use, and processing of my
            child's personal information as described in the Privacy Policy.
            I agree to be bound by these Terms on behalf of my child. I accept
            responsibility for my child's use of CollegeOS. I understand I may
            exercise data subject rights on behalf of my child, including access,
            correction, and deletion requests.
          </p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={parentConsent}
              onChange={(e) => setParentConsent(e.target.checked)}
              required
            />
            I confirm the above statements and consent to my child's use of
            CollegeOS
          </label>
        </div>
      )}

      {/* Terms Acceptance */}
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={acceptTerms}
          onChange={(e) => setAcceptTerms(e.target.checked)}
          required
        />
        I have read and agree to the{' '}
        <Link href="/legal/terms">Terms of Service</Link> and{' '}
        <Link href="/legal/privacy">Privacy Policy</Link>
      </label>

      {/* Cookie Consent */}
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={acceptCookies}
          onChange={(e) => setAcceptCookies(e.target.checked)}
          required
        />
        I agree to the use of cookies as described in the{' '}
        <Link href="/legal/cookies">Cookie Policy</Link>
      </label>

      {/* AI Disclaimer */}
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={acceptAI}
          onChange={(e) => setAcceptAI(e.target.checked)}
          required
        />
        I have read and understand the{' '}
        <Link href="/legal/ai-disclaimer">AI Disclaimer</Link> and accept the
        limitations of AI-generated recommendations and predictions
      </label>

      {/* Marketing Opt-In (Optional) */}
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={acceptMarketing}
          onChange={(e) => setAcceptMarketing(e.target.checked)}
        />
        I consent to receive marketing emails from CollegeOS.
        I understand I can unsubscribe at any time.
      </label>

      {/* GDPR-specific consents (for EEA users) */}
      {userIsInEEA && (
        <div className="gdpr-consents">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={acceptAIProcessing}
              onChange={(e) => setAcceptAIProcessing(e.target.checked)}
            />
            I consent to the processing of my personal information through AI
            systems for the purposes described in the Privacy Policy. I
            understand I may withdraw this consent at any time.
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={acceptAnalytics}
              onChange={(e) => setAcceptAnalytics(e.target.checked)}
            />
            I consent to the use of analytics cookies and processing of usage
            data to improve the Service. I understand I may withdraw this
            consent at any time.
          </label>
        </div>
      )}

      <button type="submit" disabled={!canSubmit}>
        Create Account
      </button>
    </form>
  );
};
```

### 2.2 Backend Signup Handler

**File:** `backend/src/routes/auth.js`

```javascript
router.post('/signup', async (req, res, next) => {
  try {
    const {
      email,
      password,
      fullName,
      age,
      acceptTerms,
      acceptPrivacy,
      acceptCookies,
      acceptAI,
      parentConsent,
      acceptMarketing,
      acceptAIProcessing,
      acceptAnalytics,
      ip,
      userAgent
    } = req.body;

    // Validate age
    if (age < 13) {
      return res.status(400).json({ error: 'Must be at least 13 years old' });
    }

    // Validate parent consent for minors
    if (age < 18 && !parentConsent) {
      return res.status(400).json({ error: 'Parent/guardian consent required for users under 18' });
    }

    // Validate terms acceptance
    if (!acceptTerms || !acceptPrivacy) {
      return res.status(400).json({ error: 'Terms and Privacy Policy acceptance required' });
    }

    // Create user
    const user = await User.create({ email, password, fullName, age });

    // Record all acceptances
    await recordAcceptances({
      userId: user.id,
      ip,
      userAgent,
      acceptances: [
        { type: 'terms_of_service', version: '1.0' },
        { type: 'privacy_policy', version: '1.0' },
        { type: 'cookie_policy', version: '1.0' },
        { type: 'ai_disclaimer', version: '1.0' }
      ],
      consents: {
        marketing: acceptMarketing,
        aiProcessing: acceptAIProcessing,
        analytics: acceptAnalytics
      }
    });

    // Generate JWT token
    const token = generateToken(user);

    res.json({ success: true, token, userId: user.id });
  } catch (error) {
    next(error);
  }
});
```

## 3. ACCOUNT SETTINGS PAGE

### 3.1 Account Settings Structure

**File:** `frontend/src/components/AccountSettings.jsx`

```jsx
const AccountSettings = ({ user }) => {
  return (
    <div className="account-settings">
      <h1>Account Settings</h1>

      {/* Profile Section */}
      <section className="profile-section">
        <h2>Profile</h2>
        <ProfileForm user={user} />
      </section>

      {/* Privacy Section */}
      <section className="privacy-section">
        <h2>Privacy & Data</h2>
        
        {/* Consent Management */}
        <ConsentManagement user={user} />
        
        {/* Data Export */}
        <DataExport user={user} />
        
        {/* Data Deletion */}
        <DataDeletion user={user} />
        
        {/* Cookie Preferences */}
        <CookiePreferences />
      </section>

      {/* AI Features Section */}
      <section className="ai-section">
        <h2>AI Features</h2>
        <AIFeatureConsents user={user} />
      </section>

      {/* Notifications Section */}
      <section className="notifications-section">
        <h2>Notifications</h2>
        <NotificationPreferences user={user} />
      </section>

      {/* Danger Zone */}
      <section className="danger-zone">
        <h2>Danger Zone</h2>
        <DeleteAccount user={user} />
      </section>
    </div>
  );
};
```

### 3.2 Consent Management Component

```jsx
const ConsentManagement = ({ user }) => {
  const [consents, setConsents] = useState(user.consents);

  return (
    <div className="consent-management">
      <h3>Consent Management</h3>
      
      <div className="consent-item">
        <span>Terms of Service</span>
        <span className="consent-status accepted">Accepted on {user.termsAcceptedAt}</span>
        <span className="consent-version">v{user.termsVersion}</span>
      </div>

      <div className="consent-item">
        <span>Privacy Policy</span>
        <span className="consent-status accepted">Accepted on {user.privacyAcceptedAt}</span>
        <span className="consent-version">v{user.privacyVersion}</span>
      </div>

      <div className="consent-item">
        <span>Cookie Policy</span>
        <span className="consent-status accepted">Accepted on {user.cookieAcceptedAt}</span>
        <span className="consent-version">v{user.cookieVersion}</span>
      </div>

      <div className="consent-item">
        <span>AI Disclaimer</span>
        <span className="consent-status accepted">Accepted on {user.aiDisclaimerAcceptedAt}</span>
        <span className="consent-version">v{user.aiDisclaimerVersion}</span>
      </div>

      <div className="consent-item">
        <span>AI Processing Consent (GDPR)</span>
        <Toggle
          checked={consents.aiProcessing}
          onChange={(checked) => toggleConsent('aiProcessing', checked)}
        />
        {consents.aiProcessing ? (
          <span className="consent-status active">Active</span>
        ) : (
          <span className="consent-status withdrawn">Withdrawn</span>
        )}
      </div>

      <div className="consent-item">
        <span>Analytics Consent (GDPR)</span>
        <Toggle
          checked={consents.analytics}
          onChange={(checked) => toggleConsent('analytics', checked)}
        />
        {consents.analytics ? (
          <span className="consent-status active">Active</span>
        ) : (
          <span className="consent-status withdrawn">Withdrawn</span>
        )}
      </div>

      <div className="consent-item">
        <span>Marketing Consent</span>
        <Toggle
          checked={consents.marketing}
          onChange={(checked) => toggleConsent('marketing', checked)}
        />
        {consents.marketing ? (
          <span className="consent-status active">Active</span>
        ) : (
          <span className="consent-status withdrawn">Withdrawn</span>
        )}
      </div>

      <button onClick={exportConsentRecords}>
        Export Consent Records
      </button>
      <button onClick={downloadConsentAuditTrail}>
        Download Consent Audit Trail
      </button>
    </div>
  );
};
```

## 4. DATA EXPORT PAGE

### 4.1 Data Export Component

**File:** `frontend/src/components/DataExport.jsx`

```jsx
const DataExport = ({ user }) => {
  const [exportStatus, setExportStatus] = useState('idle'); // idle, processing, ready, completed
  const [exportUrl, setExportUrl] = useState(null);

  const handleExport = async () => {
    setExportStatus('processing');
    
    const response = await fetch('/api/data/export', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${user.token}` }
    });
    
    const data = await response.json();
    
    if (data.success) {
      setExportStatus('ready');
      setExportUrl(data.downloadUrl);
      
      // Auto-expire download link after 24 hours
      setTimeout(() => {
        setExportUrl(null);
        setExportStatus('completed');
      }, 24 * 60 * 60 * 1000);
    }
  };

  return (
    <div className="data-export">
      <h3>Data Export</h3>
      <p>
        Request a copy of all your personal data. You will receive a download
        link via email within 30 days.
      </p>
      
      <div className="export-options">
        <label>
          <input type="checkbox" checked={exportData.academicProfile} />
          Academic Profile
        </label>
        <label>
          <input type="checkbox" checked={exportData.extracurricular} />
          Extracurricular Activities
        </label>
        <label>
          <input type="checkbox" checked={exportData.collegeList} />
          College List
        </label>
        <label>
          <input type="checkbox" checked={exportData.applicationTracker} />
          Application Tracker
        </label>
        <label>
          <input type="checkbox" checked={exportData.essays} />
          Essays & Personal Statements
        </label>
        <label>
          <input type="checkbox" checked={exportData.communications} />
          Communications & Support Messages
        </label>
        <label>
          <input type="checkbox" checked={exportData.all} />
          All Data
        </label>
      </div>
      
      <button
        onClick={handleExport}
        disabled={exportStatus === 'processing'}
      >
        {exportStatus === 'processing' ? 'Processing...' : 'Request Data Export'}
      </button>
      
      {exportUrl && (
        <div className="export-ready">
          <p>Your data is ready for download.</p>
          <a href={exportUrl} download>Download Data (JSON)</a>
          <p className="export-expiry">
            This link will expire in 24 hours.
          </p>
        </div>
      )}
    </div>
  );
};
```

### 4.2 Backend Data Export Handler

**File:** `backend/src/routes/data.js`

```javascript
router.post('/data/export', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { categories } = req.body;

    // Gather data from all relevant tables
    const exportData = {
      account: await User.findById(userId),
      academicProfile: await StudentProfile.findByUser(userId),
      extracurricular: await StudentActivity.findByUser(userId),
      collegeList: await Application.findByUser(userId),
      applicationTracker: await Application.findAll({ userId }),
      essays: await Essay.findByUser(userId),
      communications: await SupportMessage.findByUser(userId),
      consents: await LegalAcceptance.findByUser(userId),
      exportDate: new Date().toISOString(),
      exportFormat: 'JSON'
    };

    // Generate secure download link
    const downloadUrl = await generateSecureDownloadLink(exportData, userId);

    // Log the export request
    await ConsentAuditLog.create({
      userId,
      eventType: 'consent_exported',
      eventData: { categories, exportDate: new Date().toISOString() }
    });

    res.json({
      success: true,
      downloadUrl,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    });
  } catch (error) {
    next(error);
  }
});
```

## 5. DATA DELETION PAGE

### 5.1 Data Deletion Component

**File:** `frontend/src/components/DataDeletion.jsx`

```jsx
const DataDeletion = ({ user }) => {
  const [deletionStatus, setDeletionStatus] = useState('idle'); // idle, confirm, processing, completed
  const [deletionId, setDeletionId] = useState(null);

  const initiateDeletion = async () => {
    setDeletionStatus('confirm');
  };

  const confirmDeletion = async () => {
    setDeletionStatus('processing');
    
    const response = await fetch('/api/data/delete', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${user.token}` }
    });
    
    const data = await response.json();
    
    if (data.success) {
      setDeletionId(data.requestId);
      setDeletionStatus('completed');
      
      // Log the deletion request
      await ConsentAuditLog.create({
        userId: user.id,
        eventType: 'data_deletion_requested',
        eventData: { requestId: data.requestId }
      });
    }
  };

  return (
    <div className="data-deletion">
      <h3>Delete Account & Data</h3>
      
      <div className="deletion-warnings">
        <div className="warning-box">
          <strong>Warning: This action is permanent and irreversible.</strong>
          <ul>
            <li>Your account will be permanently closed</li>
            <li>All your data will be deleted within 30 days</li>
            <li>You cannot recover your account or data</li>
            <li>You cannot recreate the account with the same email</li>
          </ul>
        </div>
        
        <div className="what-will-be-deleted">
          <h4>What will be deleted:</h4>
          <ul>
            <li>Account information (name, email, phone)</li>
            <li>Academic profile information</li>
            <li>Extracurricular and activity information</li>
            <li>Financial information</li>
            <li>Application tracker data</li>
            <li>User-generated content (essays, notes, comments)</li>
            <li>Uploaded documents and files</li>
            <li>Usage data and analytics</li>
          </ul>
        </div>
        
        <div className="what-will-be-retained">
          <h4>What may be retained:</h4>
          <ul>
            <li>Legal compliance records (acceptance records)</li>
            <li>Fraud prevention data</li>
            <li>Aggregated/anonymized data</li>
            <li>Backup data (until backup cycles expire)</li>
            <li>Payment records (for tax purposes)</li>
          </ul>
        </div>
      </div>
      
      {deletionStatus === 'idle' && (
        <button onClick={initiateDeletion}>Request Account Deletion</button>
      )}
      
      {deletionStatus === 'confirm' && (
        <div className="deletion-confirmation">
          <p>Please type "DELETE MY ACCOUNT" to confirm:</p>
          <input
            type="text"
            onChange={(e) => setConfirmationText(e.target.value)}
          />
          <button
            onClick={confirmDeletion}
            disabled={confirmationText !== 'DELETE MY ACCOUNT'}
          >
            Confirm Deletion
          </button>
          <button onClick={() => setDeletionStatus('idle')}>Cancel</button>
        </div>
      )}
      
      {deletionStatus === 'completed' && (
        <div className="deletion-completed">
          <p>Your deletion request has been received.</p>
          <p>Request ID: {deletionId}</p>
          <p>Your data will be deleted within 30 days.</p>
          <p>You will receive a confirmation email when deletion is complete.</p>
        </div>
      )}
    </div>
  );
};
```

### 5.2 Backend Data Deletion Handler

**File:** `backend/src/routes/data.js`

```javascript
router.post('/data/delete', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { confirmationText } = req.body;

    // Verify confirmation
    if (confirmationText !== 'DELETE MY ACCOUNT') {
      return res.status(400).json({ error: 'Confirmation text does not match' });
    }

    // Generate unique request ID
    const requestId = `DEL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create deletion request record
    const deletionRequest = await DataDeletionRequest.create({
      requestId,
      userId,
      requestType: 'user_request',
      requesterType: 'account_holder',
      requesterEmail: req.user.email,
      status: 'pending',
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    // Disable account access immediately
    await User.update(userId, { status: 'suspended' });

    // Schedule data deletion (30-day window)
    scheduleDataDeletion(userId, requestId, 30);

    // Log the request
    await ConsentAuditLog.create({
      userId,
      eventType: 'data_deletion_requested',
      eventData: { requestId }
    });

    // Send confirmation email
    await sendDeletionConfirmationEmail(req.user.email, requestId);

    res.json({
      success: true,
      requestId,
      message: 'Deletion request received. Your data will be deleted within 30 days.'
    });
  } catch (error) {
    next(error);
  }
});
```

## 6. PRIVACY REQUEST PAGE

### 6.1 Privacy Request Component

**File:** `frontend/src/components/PrivacyRequest.jsx`

```jsx
const PrivacyRequest = ({ user }) => {
  const [requestType, setRequestType] = useState('access');
  const [formData, setFormData] = useState({});
  const [status, setStatus] = useState('idle');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('processing');

    const response = await fetch('/api/privacy-request', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${user.token}` },
      body: JSON.stringify({ type: requestType, ...formData })
    });

    const data = await response.json();
    setStatus(data.success ? 'completed' : 'error');
  };

  return (
    <div className="privacy-request">
      <h3>Privacy Request</h3>
      <p>Submit a request to exercise your data rights.</p>

      <form onSubmit={handleSubmit}>
        <label>
          Request Type:
          <select value={requestType} onChange={(e) => setRequestType(e.target.value)}>
            <option value="access">Access My Data</option>
            <option value="rectification">Correct My Data</option>
            <option value="erasure">Delete My Data</option>
            <option value="restriction">Restrict Processing</option>
            <option value="portability">Data Portability</option>
            <option value="objection">Object to Processing</option>
            <option value="withdraw_consent">Withdraw Consent</option>
          </select>
        </label>

        {requestType === 'rectification' && (
          <div className="rectification-fields">
            <label>
              Field to Correct:
              <input type="text" onChange={(e) => setFormData({...formData, field: e.target.value})} />
            </label>
            <label>
              Current Value:
              <input type="text" onChange={(e) => setFormData({...formData, currentValue: e.target.value})} />
            </label>
            <label>
              Correct Value:
              <input type="text" onChange={(e) => setFormData({...formData, correctValue: e.target.value})} />
            </label>
          </div>
        )}

        <label>
          Additional Details:
          <textarea onChange={(e) => setFormData({...formData, details: e.target.value})} />
        </label>

        <button type="submit" disabled={status === 'processing'}>
          {status === 'processing' ? 'Submitting...' : 'Submit Request'}
        </button>
      </form>

      {status === 'completed' && (
        <div className="request-completed">
          <p>Your privacy request has been submitted. We will respond within 30 days.</p>
        </div>
      )}
    </div>
  );
};
```

## 7. COOKIE PREFERENCES PAGE

### 7.1 Cookie Preferences Component

**File:** `frontend/src/components/CookiePreferences.jsx`

```jsx
const CookiePreferences = () => {
  const [preferences, setPreferences] = useState({
    essential: true, // Cannot be disabled
    analytics: true,
    functional: true,
    marketing: false
  });

  const handleSave = async () => {
    await fetch('/api/cookie/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preferences)
    });
  };

  return (
    <div className="cookie-preferences">
      <h3>Cookie Preferences</h3>

      <div className="cookie-category">
        <h4>Essential Cookies</h4>
        <p>Required for the Service to function. Cannot be disabled.</p>
        <Toggle checked={true} disabled />
      </div>

      <div className="cookie-category">
        <h4>Analytics Cookies</h4>
        <p>Help us understand how you use the Service.</p>
        <Toggle
          checked={preferences.analytics}
          onChange={(checked) => setPreferences({...preferences, analytics: checked})}
        />
      </div>

      <div className="cookie-category">
        <h4>Functional Cookies</h4>
        <p>Remember your preferences and settings.</p>
        <Toggle
          checked={preferences.functional}
          onChange={(checked) => setPreferences({...preferences, functional: checked})}
        />
      </div>

      <div className="cookie-category">
        <h4>Marketing Cookies</h4>
        <p>Used to deliver relevant advertisements. [Currently not used]</p>
        <Toggle
          checked={preferences.marketing}
          onChange={(checked) => setPreferences({...preferences, marketing: checked})}
          disabled
        />
      </div>

      <button onClick={handleSave}>Save Preferences</button>
      <button onClick={() => setPreferences({ essential: true, analytics: true, functional: true, marketing: true })}>
        Accept All
      </button>
      <button onClick={() => setPreferences({ essential: true, analytics: false, functional: false, marketing: false })}>
        Reject Non-Essential
      </button>
    </div>
  );
};
```

## 8. PARENT REQUEST PAGE

### 8.1 Parent Request Component

**File:** `frontend/src/components/ParentRequest.jsx`

```jsx
const ParentRequest = () => {
  const [requestType, setRequestType] = useState('access');
  const [formData, setFormData] = useState({
    parentName: '',
    parentEmail: '',
    parentPhone: '',
    relationship: 'parent',
    minorName: '',
    minorEmail: '',
    verificationDocuments: []
  });
  const [status, setStatus] = useState('idle');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('processing');

    const response = await fetch('/api/parental-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: requestType, ...formData })
    });

    const data = await response.json();
    setStatus(data.success ? 'completed' : 'error');
  };

  return (
    <div className="parent-request">
      <h3>Parent/Guardian Request</h3>
      <p>Submit a request to access, correct, or delete your child's data.</p>

      <form onSubmit={handleSubmit}>
        <h4>Your Information</h4>
        <label>
          Your Name:
          <input
            type="text"
            value={formData.parentName}
            onChange={(e) => setFormData({...formData, parentName: e.target.value})}
            required
          />
        </label>
        <label>
          Your Email:
          <input
            type="email"
            value={formData.parentEmail}
            onChange={(e) => setFormData({...formData, parentEmail: e.target.value})}
            required
          />
        </label>
        <label>
          Your Phone:
          <input
            type="tel"
            value={formData.parentPhone}
            onChange={(e) => setFormData({...formData, parentPhone: e.target.value})}
          />
        </label>
        <label>
          Relationship to Minor:
          <select
            value={formData.relationship}
            onChange={(e) => setFormData({...formData, relationship: e.target.value})}
            required
          >
            <option value="parent">Parent</option>
            <option value="guardian">Guardian</option>
            <option value="legal_representative">Legal Representative</option>
          </select>
        </label>

        <h4>Child's Information</h4>
        <label>
          Child's Name:
          <input
            type="text"
            value={formData.minorName}
            onChange={(e) => setFormData({...formData, minorName: e.target.value})}
            required
          />
        </label>
        <label>
          Child's Email:
          <input
            type="email"
            value={formData.minorEmail}
            onChange={(e) => setFormData({...formData, minorEmail: e.target.value})}
            required
          />
        </label>

        <h4>Request Details</h4>
        <label>
          Request Type:
          <select
            value={requestType}
            onChange={(e) => setRequestType(e.target.value)}
            required
          >
            <option value="data_access">Data Access</option>
            <option value="data_correction">Data Correction</option>
            <option value="data_deletion">Data Deletion</option>
            <option value="consent_withdrawal">Withdraw Consent</option>
            <option value="processing_restriction">Restrict Processing</option>
            <option value="portability">Data Portability</option>
          </select>
        </label>

        <label>
          Verification Documents (upload birth certificate, school records, etc.):
          <input
            type="file"
            multiple
            onChange={(e) => setFormData({...formData, verificationDocuments: e.target.files})}
            required
          />
        </label>

        <label>
          Additional Details:
          <textarea
            onChange={(e) => setFormData({...formData, details: e.target.value})}
          />
        </label>

        <button type="submit" disabled={status === 'processing'}>
          {status === 'processing' ? 'Submitting...' : 'Submit Request'}
        </button>
      </form>

      {status === 'completed' && (
        <div className="request-completed">
          <p>Your parental request has been submitted. We will verify your identity
          and respond within 30 days.</p>
        </div>
      )}
    </div>
  );
};
```

## 9. VERSION TRACKING

### 9.1 Policy Version Display

Every legal page should display:

```jsx
const LegalPageHeader = ({ policyType, version, lastUpdated }) => {
  return (
    <div className="legal-page-header">
      <h1>{policyType}</h1>
      <div className="policy-meta">
        <span>Version: {version}</span>
        <span>•</span>
        <span>Last Updated: {lastUpdated}</span>
      </div>
      <div className="policy-history">
        <Link href={`/legal/${policyType.toLowerCase()}/history`}>
          View Version History
        </Link>
      </div>
    </div>
  );
};
```

### 9.2 Version History Page

**URL:** `/legal/{policy-type}/history`

```jsx
const PolicyHistory = ({ policyType }) => {
  const [versions, setVersions] = useState([]);

  useEffect(() => {
    fetch(`/api/legal/${policyType}/versions`)
      .then(res => res.json())
      .then(data => setVersions(data));
  }, [policyType]);

  return (
    <div className="policy-history">
      <h1>{policyType} - Version History</h1>
      {versions.map(version => (
        <div key={version.id} className="version-entry">
          <h3>Version {version.versionNumber}</h3>
          <p>Effective: {version.effectiveDate}</p>
          <p>Changes: {version.changeSummary}</p>
          <button onClick={() => viewVersion(version)}>View Full Text</button>
          {version.isCurrent && <span className="current-badge">Current</span>}
        </div>
      ))}
    </div>
  );
};
```

## 10. ACCEPTANCE LOGGING

### 10.1 Backend Acceptance Logger

**File:** `backend/src/services/acceptanceLogger.js`

```javascript
const acceptanceLogger = {
  async logTermsAcceptance(userId, ip, userAgent) {
    const version = await getCurrentPolicyVersion('terms_of_service');
    const textHash = await hashPolicyText(version.fullText);
    
    await db.query(`
      INSERT INTO legal_acceptances (user_id, acceptance_type, version_number,
        accepted_at, ip_address, user_agent, acceptance_method, consent_text_hash)
      VALUES ($1, 'terms_of_service', $2, NOW(), $3, $4, 'signup', $5)
      ON CONFLICT (user_id, acceptance_type, version_number) DO NOTHING
    `, [userId, version.versionNumber, ip, userAgent, textHash]);
  },

  async logPrivacyAcceptance(userId, ip, userAgent, jurisdiction) {
    const version = await getCurrentPolicyVersion('privacy_policy');
    const textHash = await hashPolicyText(version.fullText);
    
    await db.query(`
      INSERT INTO privacy_acceptances (user_id, policy_version, accepted_at,
        ip_address, user_agent, acceptance_method, consent_text_hash, jurisdiction)
      VALUES ($1, $2, NOW(), $3, $4, 'signup', $5, $6)
      ON CONFLICT DO NOTHING
    `, [userId, version.versionNumber, ip, userAgent, textHash, jurisdiction]);
  },

  async logCookieConsent(userId, sessionId, ip, userAgent, preferences) {
    const version = await getCurrentPolicyVersion('cookie_policy');
    const textHash = await hashPolicyText(version.fullText);
    
    await db.query(`
      INSERT INTO cookie_acceptances (user_id, session_id, accepted_at,
        ip_address, user_agent, consent_method, essential_cookies_consent,
        analytics_cookies_consent, functional_cookies_consent,
        marketing_cookies_consent, cookie_policy_version, consent_text_hash)
      VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [userId, sessionId, ip, userAgent, 'banner',
        preferences.essential, preferences.analytics,
        preferences.functional, preferences.marketing,
        version.versionNumber, textHash]);
  },

  async logAIDisclaimerAcceptance(userId, ip, userAgent) {
    const version = await getCurrentPolicyVersion('ai_disclaimer');
    const textHash = await hashPolicyText(version.fullText);
    
    await db.query(`
      INSERT INTO legal_acceptances (user_id, acceptance_type, version_number,
        accepted_at, ip_address, user_agent, acceptance_method, consent_text_hash)
      VALUES ($1, 'ai_disclaimer', $2, NOW(), $3, $4, 'feature_access', $5)
      ON CONFLICT DO NOTHING
    `, [userId, version.versionNumber, ip, userAgent, textHash]);
  },

  async logConsentWithdrawal(userId, consentType, reason) {
    await db.query(`
      UPDATE legal_acceptances
      SET is_active = FALSE, withdrawn_at = NOW(), withdrawal_reason = $2
      WHERE user_id = $1 AND acceptance_type = $3 AND is_active = TRUE
    `, [userId, reason, consentType]);

    await ConsentAuditLog.create({
      userId,
      eventType: 'consent_withdrawn',
      consentType,
      eventData: { reason }
    });
  }
};

module.exports = acceptanceLogger;
```

## 11. AUDIT LOGGING

### 11.1 Audit Log Middleware

**File:** `backend/src/middleware/auditLogger.js`

```javascript
const auditLogger = async (req, res, next) => {
  const startTime = Date.now();
  
  // Log request
  await ConsentAuditLog.create({
    userId: req.user?.userId || null,
    eventType: 'policy_viewed',
    policyType: req.path.split('/')[2],
    eventData: {
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    }
  });
  
  next();
};

module.exports = auditLogger;
```

## 12. POLICY UPDATES

### 12.1 Policy Update Workflow

```javascript
const policyUpdateWorkflow = {
  async updatePolicy(policyType, newVersion, newContent, changeSummary) {
    // 1. Mark old version as non-current
    await db.query(`
      UPDATE policy_versions SET is_current = FALSE WHERE policy_type = $1 AND is_current = TRUE
    `, [policyType]);

    // 2. Create new version
    const hash = await hashContent(newContent);
    const result = await db.query(`
      INSERT INTO policy_versions (policy_type, version_number, effective_date,
        change_summary, full_text, full_text_hash, is_current, is_published, created_by)
      VALUES ($1, $2, NOW(), $3, $4, $5, TRUE, TRUE, 'system')
      RETURNING id
    `, [policyType, newVersion, changeSummary, newContent, hash]);

    // 3. Notify users
    await notifyUsersOfPolicyUpdate(policyType, newVersion, changeSummary);

    // 4. Log the update
    await PolicyUpdateNotification.create({
      policyType,
      newVersion,
      oldVersion: await getPreviousVersion(policyType),
      notificationMethod: 'all',
      materialChange: isMaterialChange(changeSummary),
      reconsentRequired: requiresReconsent(changeSummary)
    });

    return result.rows[0].id;
  }
};
```

## 13. RE-CONSENT WORKFLOWS

### 13.1 Re-consent on Next Login

```javascript
const reConsentMiddleware = async (req, res, next) => {
  const userId = req.user?.userId;
  if (!userId) return next();

  // Check if user needs to re-consent
  const needsReconsent = await checkNeedsReconsent(userId);
  
  if (needsReconsent) {
    // Store flag in session
    req.session.needsReconsent = true;
    req.session.reconsentType = needsReconsent.policyType;
    req.session.reconsentVersion = needsReconsent.version;
  }

  next();
};
```

### 13.2 Re-consent Modal

```jsx
const ReConsentModal = ({ policyType, version, onAccept, onDecline }) => {
  const [accepted, setAccepted] = useState(false);

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Important Update: {policyType}</h2>
        <p>We have updated our {policyType}. Version {version} is now in effect.</p>
        
        <div className="changes-summary">
          <h3>Key Changes:</h3>
          <ul>
            <li>[Change 1]</li>
            <li>[Change 2]</li>
            <li>[Change 3]</li>
          </ul>
        </div>

        <p>
          Please review the updated {policyType} and confirm your acceptance.
          If you do not accept, you may continue to use the Service under the
          previous terms, or delete your account.
        </p>

        <div className="modal-actions">
          <button onClick={onAccept} disabled={!accepted}>
            I have reviewed and accept the updated {policyType}
          </button>
          <button onClick={onDecline}>
            I do not accept
          </button>
        </div>

        <label>
          <input
            type="checkbox"
            onChange={(e) => setAccepted(e.target.checked)}
          />
          I have reviewed the updated {policyType} (v{version})
        </label>
      </div>
    </div>
  );
};
```

---

**This implementation plan should be followed when building the frontend compliance features.**
