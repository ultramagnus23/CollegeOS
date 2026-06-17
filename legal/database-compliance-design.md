# COLLEGEOS — DATABASE COMPLIANCE DESIGN

Last Updated: [DATE]

## 1. OVERVIEW

This document defines the database tables required to support legal compliance for CollegeOS. These tables track user consents, policy versions, data deletion requests, parental requests, and audit trails.

## 2. TABLE: legal_acceptances

Tracks acceptance of Terms of Service.

```sql
CREATE TABLE IF NOT EXISTS legal_acceptances (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    acceptance_type VARCHAR(50) NOT NULL CHECK (acceptance_type IN ('terms_of_service', 'privacy_policy', 'cookie_policy', 'ai_disclaimer', 'minor_user_policy')),
    version_number VARCHAR(20) NOT NULL,
    accepted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    acceptance_method VARCHAR(50) NOT NULL DEFAULT 'signup' CHECK (acceptance_method IN ('signup', 'settings', 'reconsent', 'feature_access', 'policy_update')),
    consent_text_hash VARCHAR(64) NOT NULL, -- SHA-256 hash of the consent text presented
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    withdrawn_at TIMESTAMP WITH TIME ZONE,
    withdrawal_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Audit fields
    created_by VARCHAR(100) DEFAULT 'system',
    updated_by VARCHAR(100) DEFAULT 'system',
    
    -- Constraints
    UNIQUE(user_id, acceptance_type, version_number),
    CHECK (accepted_at <= NOW())
);

-- Indexes
CREATE INDEX idx_legal_acceptances_user_id ON legal_acceptances(user_id);
CREATE INDEX idx_legal_acceptances_type ON legal_acceptances(acceptance_type);
CREATE INDEX idx_legal_acceptances_active ON legal_acceptances(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_legal_acceptances_accepted_at ON legal_acceptances(accepted_at);

-- Retention: Keep all records for 7 years after user deletion or account closure
-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_legal_acceptances_updated_at
    BEFORE UPDATE ON legal_acceptances
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

## 3. TABLE: privacy_acceptances

Tracks acceptance of Privacy Policy with enhanced GDPR/CCPA fields.

```sql
CREATE TABLE IF NOT EXISTS privacy_acceptances (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    policy_version VARCHAR(20) NOT NULL,
    accepted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    acceptance_method VARCHAR(50) NOT NULL DEFAULT 'signup' CHECK (acceptance_method IN ('signup', 'settings', 'reconsent', 'feature_access')),
    consent_text_hash VARCHAR(64) NOT NULL, -- SHA-256 hash
    jurisdiction VARCHAR(50), -- 'EEA', 'California', 'UK', 'Canada', 'Australia', 'other'
    legal_basis VARCHAR(100), -- 'consent', 'contract', 'legitimate_interest', 'legal_obligation'
    is_withdrawable BOOLEAN NOT NULL DEFAULT TRUE,
    withdrawn_at TIMESTAMP WITH TIME ZONE,
    withdrawal_reason TEXT,
    data_processing_consent BOOLEAN NOT NULL DEFAULT FALSE, -- GDPR: consent for AI processing
    analytics_consent BOOLEAN NOT NULL DEFAULT FALSE, -- GDPR: consent for analytics
    marketing_consent BOOLEAN NOT NULL DEFAULT FALSE, -- GDPR: consent for marketing
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Audit fields
    created_by VARCHAR(100) DEFAULT 'system',
    updated_by VARCHAR(100) DEFAULT 'system'
);

-- Indexes
CREATE INDEX idx_privacy_acceptances_user_id ON privacy_acceptances(user_id);
CREATE INDEX idx_privacy_acceptances_jurisdiction ON privacy_acceptances(jurisdiction);
CREATE INDEX idx_privacy_acceptances_accepted_at ON privacy_acceptances(accepted_at);

-- Retention: Keep for 7 years after last account activity
CREATE TRIGGER update_privacy_acceptances_updated_at
    BEFORE UPDATE ON privacy_acceptances
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

## 4. TABLE: cookie_acceptances

Tracks cookie consent with granular category-level preferences.

```sql
CREATE TABLE IF NOT EXISTS cookie_acceptances (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(100), -- For anonymous users
    accepted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    consent_method VARCHAR(50) NOT NULL DEFAULT 'banner' CHECK (consent_method IN ('banner', 'settings', 'browser_api')),
    essential_cookies_consent BOOLEAN NOT NULL DEFAULT TRUE,
    analytics_cookies_consent BOOLEAN NOT NULL DEFAULT FALSE,
    functional_cookies_consent BOOLEAN NOT NULL DEFAULT FALSE,
    marketing_cookies_consent BOOLEAN NOT NULL DEFAULT FALSE,
    cookie_policy_version VARCHAR(20) NOT NULL,
    consent_text_hash VARCHAR(64) NOT NULL,
    is_withdrawable BOOLEAN NOT NULL DEFAULT TRUE,
    withdrawn_at TIMESTAMP WITH TIME ZONE,
    withdrawal_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_cookie_acceptances_user_id ON cookie_acceptances(user_id);
CREATE INDEX idx_cookie_acceptances_session_id ON cookie_acceptances(session_id);
CREATE INDEX idx_cookie_acceptances_accepted_at ON cookie_acceptances(accepted_at);

-- Retention: Keep for 12 months after last cookie consent
CREATE TRIGGER update_cookie_acceptances_updated_at
    BEFORE UPDATE ON cookie_acceptances
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

## 5. TABLE: policy_versions

Tracks all versions of legal policies with their text and effective dates.

```sql
CREATE TABLE IF NOT EXISTS policy_versions (
    id SERIAL PRIMARY KEY,
    policy_type VARCHAR(50) NOT NULL CHECK (policy_type IN (
        'terms_of_service', 'privacy_policy', 'cookie_policy',
        'ai_disclaimer', 'minor_user_policy', 'data_retention_policy',
        'account_deletion_policy', 'community_guidelines'
    )),
    version_number VARCHAR(20) NOT NULL,
    effective_date DATE NOT NULL,
    change_summary TEXT, -- Plain language summary of changes
    full_text TEXT NOT NULL, -- Full policy text (or reference to file)
    full_text_hash VARCHAR(64) NOT NULL, -- SHA-256 hash for integrity
    is_current BOOLEAN NOT NULL DEFAULT FALSE,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    published_at TIMESTAMP WITH TIME ZONE,
    created_by VARCHAR(100) NOT NULL, -- User ID of policy author/admin
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_policy_versions_type ON policy_versions(policy_type);
CREATE INDEX idx_policy_versions_current ON policy_versions(is_current) WHERE is_current = TRUE;
CREATE INDEX idx_policy_versions_published ON policy_versions(is_published) WHERE is_published = TRUE;
CREATE INDEX idx_policy_versions_effective_date ON policy_versions(effective_date);

-- Ensure only one current version per policy type
CREATE UNIQUE INDEX idx_policy_versions_unique_current 
    ON policy_versions(policy_type) 
    WHERE is_current = TRUE;

-- Retention: Keep all versions indefinitely for audit purposes
CREATE TRIGGER update_policy_versions_updated_at
    BEFORE UPDATE ON policy_versions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

## 6. TABLE: data_deletion_requests

Tracks all data deletion requests with full audit trail.

```sql
CREATE TABLE IF NOT EXISTS data_deletion_requests (
    id SERIAL PRIMARY KEY,
    request_id VARCHAR(50) NOT NULL UNIQUE, -- Human-readable ID for user reference
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    request_type VARCHAR(50) NOT NULL CHECK (request_type IN ('user_request', 'parent_request', 'gdpr_erasure', 'ccpa_deletion', 'automatic')),
    requester_type VARCHAR(50) NOT NULL CHECK (requester_type IN ('account_holder', 'parent_guardian', 'legal_representative', 'system')),
    requester_email VARCHAR(255),
    requester_name VARCHAR(255),
    relationship_to_user VARCHAR(100), -- For parent requests: 'parent', 'guardian', 'legal_representative'
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'verification_in_progress', 'verified',
        'processing', 'completed', 'partial_completion',
        'rejected', 'cancelled'
    )),
    verification_method VARCHAR(100), -- 'email_link', 'document', 'question', 'oauth'
    verification_completed_at TIMESTAMP WITH TIME ZONE,
    data_categories_requested TEXT[], -- Which data categories to delete
    deletion_scope VARCHAR(50) NOT NULL DEFAULT 'full' CHECK (deletion_scope IN ('full', 'partial')),
    confirmation_sent_at TIMESTAMP WITH TIME ZONE,
    deletion_started_at TIMESTAMP WITH TIME ZONE,
    deletion_completed_at TIMESTAMP WITH TIME ZONE,
    retention_exceptions TEXT[], -- Categories of data retained despite deletion
    retention_reasons TEXT[], -- Why data was retained
    confirmation_email_sent BOOLEAN NOT NULL DEFAULT FALSE,
    ip_address INET,
    user_agent TEXT,
    notes TEXT,
    assigned_to VARCHAR(100), -- Staff member handling the request
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_data_deletion_requests_user_id ON data_deletion_requests(user_id);
CREATE INDEX idx_data_deletion_requests_status ON data_deletion_requests(status);
CREATE INDEX idx_data_deletion_requests_request_id ON data_deletion_requests(request_id);
CREATE INDEX idx_data_deletion_requests_created_at ON data_deletion_requests(created_at);
CREATE INDEX idx_data_deletion_requests_requester_email ON data_deletion_requests(requester_email);

-- Retention: Keep for 7 years after resolution
CREATE TRIGGER update_data_deletion_requests_updated_at
    BEFORE UPDATE ON data_deletion_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

## 7. TABLE: parental_requests

Tracks parental/guardian requests for minor user data access, correction, and deletion.

```sql
CREATE TABLE IF NOT EXISTS parental_requests (
    id SERIAL PRIMARY KEY,
    request_id VARCHAR(50) NOT NULL UNIQUE,
    minor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_guardian_id INTEGER REFERENCES users(id), -- If parent has their own account
    request_type VARCHAR(50) NOT NULL CHECK (request_type IN (
        'data_access', 'data_correction', 'data_deletion',
        'consent_withdrawal', 'processing_restriction',
        'portability', 'objection'
    )),
    requester_name VARCHAR(255) NOT NULL,
    requester_email VARCHAR(255) NOT NULL,
    requester_phone VARCHAR(50),
    relationship_to_minor VARCHAR(50) NOT NULL CHECK (relationship_to_minor IN ('parent', 'guardian', 'legal_representative')),
    verification_status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (verification_status IN (
        'pending', 'identity_verified', 'relationship_verified',
        'fully_verified', 'rejected'
    )),
    verification_documents TEXT[], -- Array of document types provided
    verification_completed_at TIMESTAMP WITH TIME ZONE,
    minor_user_notified BOOLEAN NOT NULL DEFAULT TRUE, -- If minor (14+) was notified
    minor_user_consent_obtained BOOLEAN, -- If minor's consent was obtained (where age-appropriate)
    minor_user_response TEXT, -- Minor's response to the request
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'in_review', 'approved', 'partial_approval',
        'rejected', 'completed', 'escalated'
    )),
    data_provided TEXT[], -- Categories of data provided (for access requests)
    corrections_made TEXT[], -- Categories of corrections made
    deletion_completed_at TIMESTAMP WITH TIME ZONE,
    response_sent_at TIMESTAMP WITH TIME ZONE,
    response_method VARCHAR(50) NOT NULL DEFAULT 'email' CHECK (response_method IN ('email', 'postal', 'in_app')),
    response_content TEXT, -- Summary of response (not full data, for audit)
    appeal_status VARCHAR(50) DEFAULT NULL CHECK (appeal_status IN ('none', 'appealed', 'appeal_reviewed', 'appeal_upheld', 'appeal_overturned')),
    appeal_decision TEXT,
    ip_address INET,
    user_agent TEXT,
    notes TEXT,
    assigned_to VARCHAR(100),
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_parental_requests_minor_user_id ON parental_requests(minor_user_id);
CREATE INDEX idx_parental_requests_status ON parental_requests(status);
CREATE INDEX idx_parental_requests_request_id ON parental_requests(request_id);
CREATE INDEX idx_parental_requests_created_at ON parental_requests(created_at);
CREATE INDEX idx_parental_requests_verification ON parental_requests(verification_status);

-- Retention: Keep for 7 years after resolution
CREATE TRIGGER update_parental_requests_updated_at
    BEFORE UPDATE ON parental_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

## 8. TABLE: policy_update_notifications

Tracks notifications sent to users about policy updates.

```sql
CREATE TABLE IF NOT EXISTS policy_update_notifications (
    id SERIAL PRIMARY KEY,
    policy_type VARCHAR(50) NOT NULL,
    new_version VARCHAR(20) NOT NULL,
    old_version VARCHAR(20),
    notification_method VARCHAR(50) NOT NULL CHECK (notification_method IN ('email', 'in_app', 'banner', 'all')),
    notification_sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    users_notified_count INTEGER NOT NULL DEFAULT 0,
    material_change BOOLEAN NOT NULL DEFAULT FALSE,
    reconsent_required BOOLEAN NOT NULL DEFAULT FALSE,
    grace_period_days INTEGER DEFAULT 30,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_policy_update_notifications_policy_type ON policy_update_notifications(policy_type);
CREATE INDEX idx_policy_update_notifications_sent_at ON policy_update_notifications(notification_sent_at);

-- Retention: Keep for 3 years
```

## 9. TABLE: consent_audit_log

Comprehensive audit log for all consent-related events.

```sql
CREATE TABLE IF NOT EXISTS consent_audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(100) NOT NULL CHECK (event_type IN (
        'consent_given', 'consent_withdrawn', 'consent_updated',
        'policy_viewed', 'policy_accepted', 'policy_rejected',
        'cookie_consent_given', 'cookie_consent_withdrawn',
        'data_deletion_requested', 'data_deletion_completed',
        'parental_request_submitted', 'parental_request_completed',
        'consent_exported', 'consent_records_accessed'
    )),
    policy_type VARCHAR(50),
    consent_type VARCHAR(100),
    old_value JSONB, -- Previous consent state
    new_value JSONB, -- New consent state
    event_data JSONB, -- Additional context
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_consent_audit_log_user_id ON consent_audit_log(user_id);
CREATE INDEX idx_consent_audit_log_event_type ON consent_audit_log(event_type);
CREATE INDEX idx_consent_audit_log_created_at ON consent_audit_log(created_at);

-- Retention: Keep for 3 years
```

## 10. TABLE: data_subject_requests

Unified table for all data subject rights requests (GDPR/CCPA).

```sql
CREATE TABLE IF NOT EXISTS data_subject_requests (
    id SERIAL PRIMARY KEY,
    request_id VARCHAR(50) NOT NULL UNIQUE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    request_type VARCHAR(50) NOT NULL CHECK (request_type IN (
        'access', 'rectification', 'erasure', 'restriction',
        'portability', 'objection', 'withdraw_consent',
        'non_discrimination'
    )),
    jurisdiction VARCHAR(50) NOT NULL CHECK (jurisdiction IN ('GDPR', 'CCPA', 'UK_DPA', 'PIPEDA', 'APP', 'other')),
    requester_email VARCHAR(255) NOT NULL,
    requester_name VARCHAR(255),
    verification_status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (verification_status IN (
        'pending', 'verified', 'rejected'
    )),
    verification_method VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'in_progress', 'completed', 'rejected', 'escalated'
    )),
    response_deadline DATE NOT NULL, -- 30 days for most, 45 for complex (GDPR)
    response_sent_at TIMESTAMP WITH TIME ZONE,
    response_content TEXT, -- Summary of response
    data_provided JSONB, -- What data was provided (for access requests)
    corrections_made JSONB, -- What was corrected
    erasure_completed_at TIMESTAMP WITH TIME ZONE,
    portability_format VARCHAR(50) DEFAULT 'JSON',
    appeal_status VARCHAR(50) DEFAULT 'none' CHECK (appeal_status IN ('none', 'appealed', 'reviewed', 'upheld', 'overturned')),
    supervisory_authority_notified BOOLEAN DEFAULT FALSE,
    authority_name VARCHAR(255),
    authority_reference VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    notes TEXT,
    assigned_to VARCHAR(100),
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_data_subject_requests_user_id ON data_subject_requests(user_id);
CREATE INDEX idx_data_subject_requests_status ON data_subject_requests(status);
CREATE INDEX idx_data_subject_requests_request_id ON data_subject_requests(request_id);
CREATE INDEX idx_data_subject_requests_jurisdiction ON data_subject_requests(jurisdiction);
CREATE INDEX idx_data_subject_requests_created_at ON data_subject_requests(created_at);
CREATE INDEX idx_data_subject_requests_deadline ON data_subject_requests(response_deadline);

-- Retention: Keep for 7 years after resolution
CREATE TRIGGER update_data_subject_requests_updated_at
    BEFORE UPDATE ON data_subject_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

## 11. INDEXES FOR COMPLIANCE QUERIES

```sql
-- Quick lookup: Get all consents for a user
CREATE INDEX idx_all_consent_user_id ON legal_acceptances(user_id);
CREATE INDEX idx_all_privacy_user_id ON privacy_acceptances(user_id);
CREATE INDEX idx_all_cookie_user_id ON cookie_acceptances(user_id);

-- Quick lookup: Get all active consents by type
CREATE INDEX idx_active_terms ON legal_acceptances(acceptance_type, is_active) WHERE acceptance_type = 'terms_of_service' AND is_active = TRUE;
CREATE INDEX idx_active_privacy ON legal_acceptances(acceptance_type, is_active) WHERE acceptance_type = 'privacy_policy' AND is_active = TRUE;

-- Compliance reporting: Get users who haven't accepted recent policy version
CREATE INDEX idx_policy_version_acceptance ON legal_acceptances(acceptance_type, version_number, accepted_at);

-- Audit trail: Get all events for a user
CREATE INDEX idx_audit_user_id ON consent_audit_log(user_id, created_at);

-- Data deletion: Get pending deletion requests
CREATE INDEX idx_pending_deletions ON data_deletion_requests(status, created_at) WHERE status IN ('pending', 'verification_in_progress');

-- Parental requests: Get pending parental requests
CREATE INDEX idx_pending_parental ON parental_requests(status, created_at) WHERE status IN ('pending', 'verification_in_progress', 'in_review');
```

## 12. RETENTION SUMMARY

| Table | Retention Period | Deletion Method |
|-------|-----------------|-----------------|
| legal_acceptances | 7 years after last activity | Automated batch job |
| privacy_acceptances | 7 years after last activity | Automated batch job |
| cookie_acceptances | 12 months after last consent | Automated batch job |
| policy_versions | Indefinitely | Never deleted (archive only) |
| data_deletion_requests | 7 years after resolution | Automated batch job |
| parental_requests | 7 years after resolution | Automated batch job |
| policy_update_notifications | 3 years | Automated batch job |
| consent_audit_log | 3 years | Automated batch job |
| data_subject_requests | 7 years after resolution | Automated batch job |

## 13. BACKUP CONSIDERATIONS

13.1 All compliance tables must be included in regular database backups.

13.2 Backup retention must align with table retention periods.

13.3 Compliance data must be recoverable in case of data breach or system failure.

13.4 Backup encryption must be enabled at rest and in transit.

---

**These tables should be implemented as part of migration 088.**
