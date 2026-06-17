-- Convert deadlines.is_completed from INTEGER (0/1) to native BOOLEAN.
-- Fixes Deadline.js line 38 (= false) and line 56 (!!value) which are
-- correct for BOOLEAN but were bugs against the INTEGER column.
ALTER TABLE deadlines
  ALTER COLUMN is_completed TYPE BOOLEAN USING (is_completed <> 0),
  ALTER COLUMN is_completed SET DEFAULT FALSE;
