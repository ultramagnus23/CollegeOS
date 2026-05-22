DO $$
DECLARE
  required_cols TEXT[] := ARRAY[
    'id','canonical_name','country_code','state_region','city','website',
    'logo_url','description','institution_type','popularity_score','global_rank',
    'acceptance_rate','test_optional','sat_50','act_50','tuition_international',
    'cost_of_attendance','avg_financial_aid','merit_scholarship_flag','need_blind_flag',
    'graduation_rate_4yr','employment_rate','median_start_salary','metadata'
  ];
  col TEXT;
BEGIN
  FOREACH col IN ARRAY required_cols LOOP
    -- Check canonical.mv_college_cards (materialized view — must use pg_attribute)
    IF NOT EXISTS (
      SELECT 1
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'canonical'
        AND c.relname = 'mv_college_cards'
        AND a.attname = col
        AND a.attnum > 0
        AND NOT a.attisdropped
    ) THEN
      RAISE EXCEPTION 'canonical.mv_college_cards missing required column: %', col;
    END IF;

    -- Check public.mv_college_cards (regular view — information_schema works)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'mv_college_cards'
        AND column_name  = col
    ) THEN
      RAISE EXCEPTION 'public.mv_college_cards missing required column: %', col;
    END IF;
  END LOOP;
END $$;
