-- Migration 087: College ID compatibility and data consistency
-- Ensures all tables using college_id can handle both UUID and INTEGER lookups

-- 1. Create institution_identity_map if not exists (canonical UUID → legacy INTEGER)
CREATE TABLE IF NOT EXISTS canonical.institution_identity_map (
  id SERIAL PRIMARY KEY,
  canonical_institution_id UUID NOT NULL REFERENCES canonical.institutions(id),
  legacy_id INTEGER NOT NULL,
  source VARCHAR(50) DEFAULT 'manual',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(canonical_institution_id),
  UNIQUE(legacy_id)
);

-- 2. Create index on legacy_id for fast reverse lookups
CREATE INDEX IF NOT EXISTS idx_institution_identity_map_legacy_id 
  ON canonical.institution_identity_map(legacy_id);

-- 3. Create index on canonical_institution_id for fast forward lookups
CREATE INDEX IF NOT EXISTS idx_institution_identity_map_canonical_id 
  ON canonical.institution_identity_map(canonical_institution_id);

-- 4. Add college_id index to applications if not exists
CREATE INDEX IF NOT EXISTS idx_applications_college_id 
  ON applications(college_id);

-- 5. Add college_id index to chancing_predictions if not exists
CREATE INDEX IF NOT EXISTS idx_chancing_predictions_college_id 
  ON chancing_predictions(college_id);

-- 6. Add college_id index to user_outcome_contributions if not exists
CREATE INDEX IF NOT EXISTS idx_user_outcome_contributions_college_id 
  ON user_outcome_contributions(college_id);

-- 7. Add college_id index to recommendations if not exists
CREATE INDEX IF NOT EXISTS idx_recommendations_college_id 
  ON recommendations(college_id);

-- 8. Create function to resolve college ID (UUID or INTEGER)
CREATE OR REPLACE FUNCTION resolve_college_id(p_raw_id TEXT)
RETURNS INTEGER AS $$
DECLARE
  v_numeric INTEGER;
  v_legacy_id INTEGER;
BEGIN
  -- Try numeric lookup first
  BEGIN
    v_numeric := p_raw_id::INTEGER;
    IF v_numeric > 0 THEN
      -- Verify it exists in legacy colleges table
      IF EXISTS (SELECT 1 FROM colleges WHERE id = v_numeric LIMIT 1) THEN
        RETURN v_numeric;
      END IF;
      -- Try colleges_comprehensive
      BEGIN
        IF EXISTS (SELECT 1 FROM colleges_comprehensive WHERE id = v_numeric LIMIT 1) THEN
          RETURN v_numeric;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- Table may not exist
      END;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Not a numeric ID, try UUID lookup
  END;
  
  -- Try UUID lookup via institution_identity_map
  BEGIN
    SELECT im.legacy_id INTO v_legacy_id
    FROM canonical.institutions i
    JOIN canonical.institution_identity_map im ON i.id = im.canonical_institution_id
    WHERE i.id = p_raw_id::UUID
    LIMIT 1;
    
    IF v_legacy_id IS NOT NULL THEN
      RETURN v_legacy_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- UUID lookup failed
  END;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 9. Create function to resolve college UUID from legacy INTEGER ID
CREATE OR REPLACE FUNCTION resolve_college_uuid(p_legacy_id INTEGER)
RETURNS UUID AS $$
DECLARE
  v_canonical_id UUID;
BEGIN
  -- Look up in institution_identity_map
  SELECT im.canonical_institution_id INTO v_canonical_id
  FROM canonical.institution_identity_map im
  WHERE im.legacy_id = p_legacy_id
  LIMIT 1;
  
  RETURN v_canonical_id;
END;
$$ LANGUAGE plpgsql;
