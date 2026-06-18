-- 110_create_documents_table.sql
-- P1 (add-college pipeline): the Document model (backend/src/models/Document.js)
-- and the /documents routes reference a `documents` table that does NOT exist in
-- the database — every document operation currently errors. Create it to match the
-- model exactly: tags/college_ids/metadata are TEXT holding JSON (the model
-- JSON.stringify's on write, JSON.parse's on read, and filters with `college_ids
-- LIKE`), so JSONB would break those queries.

CREATE TABLE IF NOT EXISTS public.documents (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL,
  file_type   TEXT,
  file_size   BIGINT,
  file_path   TEXT,
  file_url    TEXT,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',
  expiry_date DATE,
  tags        TEXT DEFAULT '[]',
  college_ids TEXT DEFAULT '[]',
  metadata    TEXT DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_user ON public.documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_user_category ON public.documents(user_id, category);
CREATE INDEX IF NOT EXISTS idx_documents_status ON public.documents(status);
