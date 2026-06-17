# COLLEGEOS — CONSENT FRAMEWORK

Last Updated: [DATE]

## 1. OVERVIEW

This document defines the exact legal acceptance flow for CollegeOS ("Service"). These are production-ready strings for implementation in the signup flow, account settings, and AI feature usage.

## 2. SIGNUP SCREEN CONSENT

### 2.1 Primary Terms Acceptance

**Placement:** Signup screen, before "Create Account" button

**Checkbox Label:**
```
[ ] I have read and agree to the Terms of Service and Privacy Policy
```

**Supporting Text (above checkbox):**
```
By creating an account, you agree to our Terms of Service, Privacy Policy, and Cookie Policy.
You must be at least 13 years old to use CollegeOS.
```

**Links (inline):**
```
Terms of Service | Privacy Policy | Cookie Policy | AI Disclaimer
```

### 2.2 Age Verification Acknowledgement

**Placement:** Signup screen, if user indicates they are under 18

**Conditional Text (shown if age < 18):**
```
You are under 18. By creating an account, you confirm that a parent or legal guardian
has reviewed these documents and consents to your use of CollegeOS.
```

**Parent/Guardian Checkbox (shown if age < 18):**
```
[ ] I am at least 13 years old
[ ] A parent or legal guardian has reviewed and consents to my use of CollegeOS
    and agrees to be bound by these Terms on my behalf
```

### 2.3 Parent/Guardian Signup Consent

**Placement:** Parent/guardian signup flow (if parent creates account on behalf of minor)

**Parent Consent Text:**
```
I am a parent or legal guardian of the user creating this account.

By proceeding, I confirm that:
  - I have read and understand the Terms of Service, Privacy Policy, Cookie Policy,
    AI Disclaimer, and Minor User Policy;
  - I consent to the collection, use, and processing of my child's personal information
    as described in the Privacy Policy;
  - I agree to be bound by these Terms on behalf of my child;
  - I accept responsibility for my child's use of CollegeOS;
  - I understand I may exercise data subject rights on behalf of my child,
    including access, correction, and deletion requests.
```

**Parent Consent Checkbox:**
```
[ ] I confirm the above statements and consent to my child's use of CollegeOS
```

## 3. AI DISCLAIMER ACKNOWLEDGEMENT

### 3.1 Initial AI Feature Acknowledgement

**Placement:** First time user accesses AI-powered features (recommendations, chancing, analytics)

**Acknowledgement Text:**
```
AI-Powered Features Acknowledgement

CollegeOS uses artificial intelligence to generate college recommendations,
admissions chance predictions, and analytics. Before using these features,
please acknowledge:

  - AI-generated recommendations are estimates, not guarantees of admission;
  - Admissions chances are statistical predictions, not facts;
  - AI systems may produce incorrect, incomplete, or misleading outputs;
  - AI outputs do not constitute professional educational advice;
  - You are responsible for verifying information from official sources;
  - CollegeOS does not guarantee the accuracy or reliability of AI outputs.

Please read our full AI Disclaimer for detailed information.
```

**AI Disclaimer Checkbox:**
```
[ ] I have read and understand the AI Disclaimer and accept the limitations of
    AI-generated recommendations and predictions
```

### 3.2 AI Feature Usage Acknowledgement

**Placement:** Every time user generates a new recommendation or chancing calculation

**In-Feature Text (displayed with results):**
```
These recommendations are AI-generated estimates based on statistical analysis.
They do not guarantee admission to any college. Please read our AI Disclaimer
for more information.
```

**Acknowledgement (implicit by use):**
```
By viewing or using these results, you acknowledge that you understand the
limitations of AI-generated outputs as described in our AI Disclaimer.
```

## 4. COOKIE CONSENT

### 4.1 First-Visit Cookie Banner

**Banner Text:**
```
CollegeOS uses cookies to provide and improve our Service.
We use essential cookies (required for the Service to function),
analytics cookies (to understand how you use the Service), and
functional cookies (to remember your preferences).

[Accept All] [Manage Preferences] [Reject Non-Essential]
```

**Manage Preferences Modal:**
```
Cookie Preferences

Essential Cookies [Always On]
  Required for the Service to function. Cannot be disabled.

Analytics Cookies [Toggle]
  Help us understand how you use the Service.
  Examples: Google Analytics.

Functional Cookies [Toggle]
  Remember your preferences and settings.
  Examples: theme, language, country.

Marketing Cookies [Toggle] [If applicable]
  Used to deliver relevant advertisements.
  [Currently not used]

[Save Preferences] [Accept All] [Reject All]
```

### 4.2 Cookie Consent Record

**Storage Requirements:**
```
Cookie consent must be recorded with:
  - User ID (if logged in) or anonymous session ID
  - Consent timestamp
  - Consent version (policy version at time of consent)
  - Consent method (banner, settings, etc.)
  - Specific preferences (which categories accepted/rejected)
  - IP address (for audit trail)
  - User agent string
```

## 5. PRIVACY POLICY ACCEPTANCE

### 5.1 Privacy Policy Acceptance on Signup

**Placement:** Signup screen (integrated with Terms acceptance)

**Text:**
```
By creating an account, you also agree to our Privacy Policy,
which describes how we collect, use, and protect your personal information.
```

### 5.2 Privacy Policy Acceptance Record

**Storage Requirements:**
```
Privacy acceptance must be recorded with:
  - User ID
  - Acceptance timestamp
  - Policy version accepted
  - Policy URL at time of acceptance
  - IP address
  - User agent string
```

## 6. TERMS OF SERVICE ACCEPTANCE

### 6.1 Terms of Service Acceptance on Signup

**Placement:** Signup screen

**Text:**
```
By creating an account, you agree to our Terms of Service,
which govern your use of CollegeOS.
```

### 6.2 Terms Acceptance Record

**Storage Requirements:**
```
Terms acceptance must be recorded with:
  - User ID
  - Acceptance timestamp
  - Terms version accepted
  - Terms URL at time of acceptance
  - IP address
  - User agent string
```

## 7. MATERIAL CHANGE RE-CONSENT

### 7.1 Material Change Notification

**When Required:** When changes materially affect user rights or obligations

**Notification Text:**
```
Important Update to CollegeOS Terms

We have updated our [Terms of Service / Privacy Policy / AI Disclaimer].
The changes took effect on [DATE].

Key changes:
  - [Summary of material change 1]
  - [Summary of material change 2]
  - [Summary of material change 3]

Please review the updated [document] at:
[LINK TO UPDATED DOCUMENT]

If you continue to use CollegeOS after [DATE + 30 days],
you agree to the updated [document].

To opt out of arbitration (if applicable), please contact:
[PRIVACY EMAIL]
```

### 7.2 Re-Consent Checkbox (For Highly Material Changes)

**Placement:** Next login after material change

**Text:**
```
Important: We have updated our [Terms of Service / Privacy Policy].

Please review the changes and confirm your acceptance:
[LINK TO CHANGES SUMMARY]

[ ] I have reviewed the updated [document] and agree to be bound by it
```

## 8. MINOR USER SPECIFIC CONSENT

### 8.1 Minor User Age Acknowledgement

**Placement:** Signup screen, for users indicating age 13-17

**Text:**
```
I confirm that I am between 13 and 17 years old.
I understand that I must use CollegeOS with the involvement
and consent of a parent or legal guardian.
```

**Checkbox:**
```
[ ] I am between 13 and 17 years old and have my parent/guardian's consent
```

### 8.2 Parent Acknowledgement of Minor User Policy

**Placement:** Parent signup or minor user account creation with parent involvement

**Text:**
```
Parent/Guardian Acknowledgement of Minor User Policy

I understand that:
  - CollegeOS collects personal information from users aged 13-17;
  - I have the right to access, correct, and delete my child's information;
  - I may request deletion of my child's account at any time;
  - I am responsible for my child's use of CollegeOS;
  - CollegeOS implements additional safety measures for Minor Users.
```

**Checkbox:**
```
[ ] I acknowledge the Minor User Policy and accept responsibility for my child's use of CollegeOS
```

## 9. DATA PROCESSING CONSENT (GDPR)

### 9.1 Consent for AI Processing

**Placement:** First use of AI-powered features, or in privacy settings

**Text:**
```
AI Processing Consent (GDPR)

CollegeOS uses artificial intelligence to generate recommendations,
predictions, and analytics. This involves processing your personal
information through AI systems.

Processing purposes:
  - Generating personalized college recommendations;
  - Calculating admissions chances;
  - Providing profile strength assessments;
  - Improving our AI models.

Your rights:
  - You may withdraw consent at any time;
  - Withdrawing consent will not affect the legality of prior processing;
  - Withdrawing consent may limit access to AI-powered features.
```

**Checkbox:**
```
[ ] I consent to the processing of my personal information through AI systems
    for the purposes described above. I understand I may withdraw this consent
    at any time.
```

### 9.2 Consent for Analytics

**Placement:** Cookie consent banner, or privacy settings

**Text:**
```
Analytics Processing Consent (GDPR)

CollegeOS uses analytics tools to understand how users interact with
the Service. This helps us improve our platform.

Data collected:
  - Page views and feature usage;
  - Click patterns and navigation;
  - Session duration and frequency;
  - Device information (non-identifiable).
```

**Checkbox:**
```
[ ] I consent to the use of analytics cookies and processing of usage data
    to improve the Service. I understand I may withdraw this consent at any time.
```

## 10. MARKETING CONSENT

### 10.1 Marketing Opt-In

**Placement:** Signup screen (optional), or email preferences in account settings

**Text:**
```
Stay Updated (Optional)

Would you like to receive emails about:
  - New features and updates;
  - College planning tips and resources;
  - Exclusive content and offers;
  - Product announcements.

You can unsubscribe at any time.
```

**Checkbox:**
```
[ ] I consent to receive marketing emails from CollegeOS.
    I understand I can unsubscribe at any time.
```

## 11. CONSENT MANAGEMENT

### 11.1 Consent Dashboard

**Location:** Account Settings > Privacy > Consent Management

**Features:**
```
Consent Management Dashboard

View and manage your consents:

  Terms of Service: Accepted on [DATE] - Version [X.X] [View]
  Privacy Policy: Accepted on [DATE] - Version [X.X] [View]
  Cookie Policy: Accepted on [DATE] - Version [X.X] [View]
  AI Disclaimer: Accepted on [DATE] - Version [X.X] [View]
  Minor User Policy: Accepted on [DATE] - Version [X.X] [View]

  AI Processing Consent: [Active / Withdrawn] [Manage]
  Analytics Consent: [Active / Withdrawn] [Manage]
  Marketing Consent: [Active / Withdrawn] [Manage]

  Cookie Preferences: [Manage Cookies]

  [Export Consent Records]
  [Download Consent Audit Trail]
```

### 11.2 Withdrawal of Consent

**Process:**
```
To withdraw consent:
  1. Go to Account Settings > Privacy > Consent Management;
  2. Toggle the consent you wish to withdraw;
  3. Confirm withdrawal in the confirmation dialog;
  4. Withdrawal takes effect immediately;
  5. You will receive a confirmation email.

Note: Withdrawing consent does not affect the legality of processing
that occurred before withdrawal.
```

## 12. CONSENT RECORD SCHEMA

### 12.1 Database Schema

See Section 12 of the Legal Framework (Database Compliance Design) for the full schema.

### 12.2 Required Fields

Every consent record must include:
```
- user_id (nullable for anonymous consent)
- consent_type (terms, privacy, cookie, ai_processing, analytics, marketing, minor_user)
- consent_version (policy version at time of consent)
- consent_timestamp (UTC)
- consent_method (signup, settings, banner, reconsent)
- consent_ip_address
- consent_user_agent
- consent_text_snapshot (hash of the text presented at time of consent)
- is_withdrawable (boolean)
- withdrawn_at (nullable)
- withdrawn_reason (nullable)
- ip_address
- user_agent
- created_at (UTC)
- updated_at (UTC)
```

---

**These consent strings are production-ready and should be implemented as specified.**
