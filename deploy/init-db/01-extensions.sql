-- Enable required PostgreSQL extensions
-- pgvector: only available if using pgvector/pgvector image
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgvector not available, skipping (install pgvector/pgvector:pg15 image for RAG)';
END $$;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
