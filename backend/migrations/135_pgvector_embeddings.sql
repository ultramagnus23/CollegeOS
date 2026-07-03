-- Migration 135: enable pgvector, fix canonical.institution_embeddings for real use
--
-- The v3 recommendation pipeline (backend/src/services/recommendation/embedding/
-- hybridRetrieval.js, embeddingService.js) was fully built expecting a pgvector
-- `vector` column and specific column names, but the actual table had `embedding`
-- as JSONB and different column names (model_name/embedding_dim, no
-- embedding_version) -- so every similarity query threw, and the pipeline silently
-- fell back to a constant 0.5-similarity ranking for every request. This migration
-- fixes the schema to match what the (already-written, already-tested) code
-- expects. table has 0 rows at time of writing, so the type change is safe.

CREATE EXTENSION IF NOT EXISTS vector;

-- embedding: jsonb -> vector(768). embeddingService.js EMBEDDING_DIM = 768.
ALTER TABLE canonical.institution_embeddings
  ALTER COLUMN embedding TYPE vector(768) USING NULL;

-- Columns the embedding service code actually writes (embeddingService.js
-- upsertInstitutionEmbedding). Kept the old model_name/embedding_dim columns
-- rather than dropping them, per project convention of not removing columns
-- that might have other readers.
ALTER TABLE canonical.institution_embeddings
  ADD COLUMN IF NOT EXISTS embedding_model TEXT,
  ADD COLUMN IF NOT EXISTS embedding_version TEXT;

-- ANN index for the <=> cosine-distance operator hybridRetrieval.js/
-- embeddingService.js already query with. HNSW chosen over IVFFLAT: no need to
-- pre-train on existing data (IVFFLAT needs a representative sample at index
-- build time; HNSW builds incrementally and this table currently has 0 rows).
CREATE INDEX IF NOT EXISTS idx_institution_embeddings_hnsw
  ON canonical.institution_embeddings
  USING hnsw (embedding vector_cosine_ops);
