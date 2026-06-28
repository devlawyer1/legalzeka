-- Phase 1C: page text, OCR metadata, structured suggestions, and verified Matter Twin data.

ALTER TABLE cases ADD COLUMN IF NOT EXISTS legal_domain VARCHAR(150);

ALTER TABLE document_processing_jobs DROP CONSTRAINT IF EXISTS document_jobs_type_ck;
ALTER TABLE document_processing_jobs ADD CONSTRAINT document_jobs_type_ck
  CHECK (job_type IN (
    'PROCESS_DOCUMENT', 'DELETE_DOCUMENT', 'EXTRACT_MATTER_DATA',
    'OCR_DOCUMENT', 'EXTRACT_ENTITIES', 'CREATE_EMBEDDINGS', 'INDEX_DOCUMENT'
  ));

CREATE TABLE IF NOT EXISTS document_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES case_documents(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  page_number INT NOT NULL,
  extracted_text TEXT NOT NULL DEFAULT '',
  text_source VARCHAR(20) NOT NULL,
  ocr_confidence NUMERIC(6,5),
  width INT,
  height INT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT document_pages_number_ck CHECK (page_number > 0),
  CONSTRAINT document_pages_source_ck CHECK (text_source IN ('NATIVE', 'OCR')),
  CONSTRAINT document_pages_confidence_ck CHECK (ocr_confidence IS NULL OR (ocr_confidence >= 0 AND ocr_confidence <= 1)),
  CONSTRAINT document_pages_dimensions_ck CHECK ((width IS NULL OR width > 0) AND (height IS NULL OR height > 0)),
  CONSTRAINT document_pages_document_number_uq UNIQUE (document_id, page_number)
);

CREATE INDEX IF NOT EXISTS idx_document_pages_case ON document_pages (case_id, page_number);
CREATE INDEX IF NOT EXISTS idx_document_pages_document_source ON document_pages (document_id, text_source);

CREATE TABLE IF NOT EXISTS extraction_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES case_documents(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES law_firms(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
  extraction_version INT NOT NULL DEFAULT 1,
  provider VARCHAR(80) NOT NULL,
  model VARCHAR(150) NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_code VARCHAR(80),
  safe_error_message VARCHAR(500),
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  estimated_cost NUMERIC(14,8) NOT NULL DEFAULT 0,
  duration_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT extraction_runs_status_ck CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  CONSTRAINT extraction_runs_version_ck CHECK (extraction_version > 0),
  CONSTRAINT extraction_runs_usage_ck CHECK (input_tokens >= 0 AND output_tokens >= 0 AND estimated_cost >= 0 AND (duration_ms IS NULL OR duration_ms >= 0)),
  CONSTRAINT extraction_runs_scope_ck CHECK (
    (organization_id IS NOT NULL AND owner_user_id IS NULL)
    OR (organization_id IS NULL AND owner_user_id IS NOT NULL)
  ),
  CONSTRAINT extraction_runs_document_version_uq UNIQUE (document_id, extraction_version)
);

CREATE INDEX IF NOT EXISTS idx_extraction_runs_case ON extraction_runs (case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_extraction_runs_status ON extraction_runs (status, created_at);

CREATE TABLE IF NOT EXISTS extraction_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_run_id UUID NOT NULL REFERENCES extraction_runs(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES case_documents(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  suggestion_type VARCHAR(30) NOT NULL,
  normalized_value JSONB NOT NULL,
  display_value VARCHAR(1000) NOT NULL,
  source_page INT NOT NULL,
  source_quote VARCHAR(2000) NOT NULL,
  confidence NUMERIC(6,5) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  rejection_reason VARCHAR(500),
  target_entity_id UUID,
  suggestion_fingerprint VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT extraction_suggestions_type_ck CHECK (suggestion_type IN ('PARTY', 'DATE', 'EVENT', 'CASE_NUMBER', 'COURT', 'LEGAL_DOMAIN')),
  CONSTRAINT extraction_suggestions_status_ck CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'SUPERSEDED')),
  CONSTRAINT extraction_suggestions_page_ck CHECK (source_page > 0),
  CONSTRAINT extraction_suggestions_quote_ck CHECK (BTRIM(source_quote) <> ''),
  CONSTRAINT extraction_suggestions_confidence_ck CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT extraction_suggestions_fingerprint_ck CHECK (suggestion_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT extraction_suggestions_run_fingerprint_uq UNIQUE (extraction_run_id, suggestion_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_extraction_suggestions_document ON extraction_suggestions (document_id, status, source_page);
CREATE INDEX IF NOT EXISTS idx_extraction_suggestions_case ON extraction_suggestions (case_id, status, created_at);

CREATE TABLE IF NOT EXISTS matter_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  name VARCHAR(500) NOT NULL,
  normalized_name VARCHAR(500) NOT NULL,
  party_type VARCHAR(30) NOT NULL,
  role VARCHAR(80) NOT NULL,
  source_document_id UUID NOT NULL REFERENCES case_documents(id) ON DELETE RESTRICT,
  source_page INT NOT NULL,
  source_suggestion_id UUID NOT NULL UNIQUE REFERENCES extraction_suggestions(id) ON DELETE RESTRICT,
  verified_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT matter_parties_type_ck CHECK (party_type IN ('PERSON', 'ORGANIZATION', 'UNKNOWN')),
  CONSTRAINT matter_parties_page_ck CHECK (source_page > 0)
);

CREATE INDEX IF NOT EXISTS idx_matter_parties_case ON matter_parties (case_id, normalized_name);

CREATE TABLE IF NOT EXISTS matter_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  event_date DATE,
  date_precision VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
  source_document_id UUID NOT NULL REFERENCES case_documents(id) ON DELETE RESTRICT,
  source_page INT NOT NULL,
  source_suggestion_id UUID NOT NULL UNIQUE REFERENCES extraction_suggestions(id) ON DELETE RESTRICT,
  verified_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT matter_events_precision_ck CHECK (date_precision IN ('EXACT', 'MONTH', 'YEAR', 'UNKNOWN')),
  CONSTRAINT matter_events_page_ck CHECK (source_page > 0)
);

CREATE INDEX IF NOT EXISTS idx_matter_events_case_date ON matter_events (case_id, event_date, verified_at DESC);
