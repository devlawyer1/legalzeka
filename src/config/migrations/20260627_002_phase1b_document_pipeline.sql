-- Applied transactionally by src/utils/migrate.js under an advisory lock.

DO $$
BEGIN
  IF to_regclass('public.case_documents') IS NULL THEN
    RAISE EXCEPTION 'Phase 1B migration requires the case_documents table';
  END IF;
END $$;

ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255);
ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS safe_filename VARCHAR(255);
ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS storage_key TEXT;
ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS storage_provider VARCHAR(30) DEFAULT 'LOCAL';
ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS declared_mime_type VARCHAR(150);
ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS detected_mime_type VARCHAR(150);
ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS file_extension VARCHAR(20);
ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT;
ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS sha256_hash VARCHAR(64);
ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS processing_status VARCHAR(30) DEFAULT 'UPLOADED';
ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS processing_version INT DEFAULT 1;
ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS processing_attempts INT DEFAULT 0;
ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;
ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS processing_completed_at TIMESTAMPTZ;
ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS processing_failed_at TIMESTAMPTZ;
ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS processing_error_code VARCHAR(80);
ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS processing_error_message VARCHAR(500);
ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS page_count INT;
ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS text_extracted BOOLEAN DEFAULT FALSE;
ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS ocr_required BOOLEAN DEFAULT FALSE;
ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

UPDATE case_documents
SET original_filename = COALESCE(NULLIF(document_name, ''), NULLIF(file_name, ''), NULLIF(title, ''), id::text),
    safe_filename = COALESCE(NULLIF(regexp_replace(file_url, '^.*/', ''), ''), id::text),
    storage_key = file_url,
    storage_provider = COALESCE(NULLIF(storage_provider, ''), 'LOCAL'),
    processing_status = CASE lower(COALESCE(analysis_status, 'pending'))
      WHEN 'completed' THEN 'COMPLETED'
      WHEN 'failed' THEN 'FAILED'
      ELSE 'UPLOADED'
    END,
    processing_version = COALESCE(processing_version, 1),
    processing_attempts = COALESCE(processing_attempts, 0),
    processing_completed_at = CASE
      WHEN lower(COALESCE(analysis_status, '')) = 'completed' THEN analyzed_at
      ELSE processing_completed_at
    END,
    processing_failed_at = CASE
      WHEN lower(COALESCE(analysis_status, '')) = 'failed' THEN analyzed_at
      ELSE processing_failed_at
    END,
    text_extracted = (NULLIF(BTRIM(extracted_text), '') IS NOT NULL),
    ocr_required = COALESCE(ocr_required, FALSE),
    uploaded_at = COALESCE(uploaded_at, created_at)
WHERE original_filename IS NULL
   OR safe_filename IS NULL
   OR storage_key IS NULL
   OR processing_status IS NULL;

UPDATE case_documents
SET file_extension = lower(regexp_replace(safe_filename, '^.*\.', ''))
WHERE file_extension IS NULL
  AND safe_filename LIKE '%.%';

CREATE OR REPLACE FUNCTION sync_case_document_pipeline_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.original_filename := COALESCE(
    NULLIF(NEW.original_filename, ''), NULLIF(NEW.document_name, ''),
    NULLIF(NEW.file_name, ''), NULLIF(NEW.title, ''), NEW.id::text
  );
  NEW.safe_filename := COALESCE(
    NULLIF(NEW.safe_filename, ''),
    NULLIF(regexp_replace(NEW.file_url, '^.*/', ''), ''),
    NEW.id::text
  );
  NEW.storage_key := COALESCE(NULLIF(NEW.storage_key, ''), NEW.file_url);
  NEW.storage_provider := COALESCE(NULLIF(NEW.storage_provider, ''), 'LOCAL');
  NEW.processing_status := COALESCE(NEW.processing_status, 'UPLOADED');
  NEW.processing_version := COALESCE(NEW.processing_version, 1);
  NEW.processing_attempts := COALESCE(NEW.processing_attempts, 0);
  NEW.text_extracted := COALESCE(NEW.text_extracted, FALSE);
  NEW.ocr_required := COALESCE(NEW.ocr_required, FALSE);
  IF NEW.file_extension IS NULL AND NEW.safe_filename LIKE '%.%' THEN
    NEW.file_extension := lower(regexp_replace(NEW.safe_filename, '^.*\.', ''));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_case_documents_pipeline_metadata ON case_documents;
CREATE TRIGGER trg_case_documents_pipeline_metadata
BEFORE INSERT OR UPDATE OF
  original_filename, safe_filename, storage_key, storage_provider,
  processing_status, processing_version, processing_attempts,
  text_extracted, ocr_required, document_name, file_name, title, file_url
ON case_documents
FOR EACH ROW EXECUTE FUNCTION sync_case_document_pipeline_metadata();

ALTER TABLE case_documents ALTER COLUMN original_filename SET NOT NULL;
ALTER TABLE case_documents ALTER COLUMN safe_filename SET NOT NULL;
ALTER TABLE case_documents ALTER COLUMN storage_key SET NOT NULL;
ALTER TABLE case_documents ALTER COLUMN storage_provider SET NOT NULL;
ALTER TABLE case_documents ALTER COLUMN processing_status SET NOT NULL;
ALTER TABLE case_documents ALTER COLUMN processing_version SET NOT NULL;
ALTER TABLE case_documents ALTER COLUMN processing_attempts SET NOT NULL;
ALTER TABLE case_documents ALTER COLUMN text_extracted SET NOT NULL;
ALTER TABLE case_documents ALTER COLUMN ocr_required SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_documents_processing_status_ck') THEN
    ALTER TABLE case_documents ADD CONSTRAINT case_documents_processing_status_ck
      CHECK (processing_status IN ('UPLOADED', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_documents_file_size_ck') THEN
    ALTER TABLE case_documents ADD CONSTRAINT case_documents_file_size_ck
      CHECK (file_size_bytes IS NULL OR file_size_bytes > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_documents_attempts_ck') THEN
    ALTER TABLE case_documents ADD CONSTRAINT case_documents_attempts_ck
      CHECK (processing_attempts >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_documents_version_ck') THEN
    ALTER TABLE case_documents ADD CONSTRAINT case_documents_version_ck
      CHECK (processing_version > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_documents_storage_key_ck') THEN
    ALTER TABLE case_documents ADD CONSTRAINT case_documents_storage_key_ck
      CHECK (BTRIM(storage_key) <> '');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_documents_sha256_ck') THEN
    ALTER TABLE case_documents ADD CONSTRAINT case_documents_sha256_ck
      CHECK (sha256_hash IS NULL OR sha256_hash ~ '^[0-9a-fA-F]{64}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_documents_page_count_ck') THEN
    ALTER TABLE case_documents ADD CONSTRAINT case_documents_page_count_ck
      CHECK (page_count IS NULL OR page_count > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_case_documents_case_deleted
  ON case_documents (case_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_case_documents_status_deleted
  ON case_documents (processing_status, deleted_at);
CREATE INDEX IF NOT EXISTS idx_case_documents_sha256
  ON case_documents (sha256_hash) WHERE sha256_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_case_documents_storage
  ON case_documents (storage_provider, storage_key);
CREATE INDEX IF NOT EXISTS idx_case_documents_uploaded_by
  ON case_documents (uploaded_by);
CREATE INDEX IF NOT EXISTS idx_case_documents_case_hash_active
  ON case_documents (case_id, sha256_hash)
  WHERE deleted_at IS NULL AND sha256_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS document_processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_job_id UUID REFERENCES document_processing_jobs(id) ON DELETE SET NULL,
  document_id UUID NOT NULL REFERENCES case_documents(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES law_firms(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  job_type VARCHAR(40) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'QUEUED',
  priority INT NOT NULL DEFAULT 0,
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_at TIMESTAMPTZ,
  locked_by VARCHAR(150),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_code VARCHAR(80),
  error_message VARCHAR(500),
  idempotency_key VARCHAR(255) NOT NULL UNIQUE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT document_jobs_type_ck
    CHECK (job_type IN ('PROCESS_DOCUMENT', 'DELETE_DOCUMENT', 'OCR_DOCUMENT', 'EXTRACT_ENTITIES', 'CREATE_EMBEDDINGS', 'INDEX_DOCUMENT')),
  CONSTRAINT document_jobs_status_ck
    CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'RETRYING', 'CANCELLED', 'DEAD_LETTER')),
  CONSTRAINT document_jobs_attempts_ck
    CHECK (attempt_count >= 0 AND max_attempts > 0 AND attempt_count <= max_attempts),
  CONSTRAINT document_jobs_scope_ck
    CHECK (
      (organization_id IS NOT NULL AND owner_user_id IS NULL)
      OR (organization_id IS NULL AND owner_user_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_document_jobs_active_type
  ON document_processing_jobs (document_id, job_type)
  WHERE status IN ('QUEUED', 'RUNNING', 'RETRYING');
CREATE INDEX IF NOT EXISTS idx_document_jobs_claim
  ON document_processing_jobs (status, available_at, priority DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_document_jobs_document
  ON document_processing_jobs (document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_jobs_parent
  ON document_processing_jobs (parent_job_id) WHERE parent_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_document_jobs_case
  ON document_processing_jobs (case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_jobs_locked
  ON document_processing_jobs (locked_at) WHERE locked_at IS NOT NULL;
