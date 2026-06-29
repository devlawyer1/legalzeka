CREATE TABLE IF NOT EXISTS legal_research_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES law_firms(id) ON DELETE CASCADE,
  case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
  title VARCHAR(300) NOT NULL,
  session_summary TEXT,
  effective_at DATE,
  legal_domain VARCHAR(120),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS legal_research_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES legal_research_sessions(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('USER', 'ASSISTANT', 'SYSTEM_EVENT')),
  content TEXT NOT NULL,
  structured_content JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legal_research_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES legal_research_sessions(id) ON DELETE CASCADE,
  user_message_id UUID NOT NULL UNIQUE REFERENCES legal_research_messages(id) ON DELETE CASCADE,
  answer TEXT,
  summary TEXT,
  structured_content JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence_level VARCHAR(20) CHECK (confidence_level IN ('LOW', 'MEDIUM', 'HIGH')),
  confidence_reason TEXT,
  provider VARCHAR(80),
  model VARCHAR(180),
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost NUMERIC(14,8) NOT NULL DEFAULT 0,
  search_embedding_cost NUMERIC(14,8) NOT NULL DEFAULT 0,
  reranker_cost NUMERIC(14,8) NOT NULL DEFAULT 0,
  verifier_cost NUMERIC(14,8) NOT NULL DEFAULT 0,
  total_cost NUMERIC(14,8) NOT NULL DEFAULT 0,
  search_duration_ms INTEGER NOT NULL DEFAULT 0,
  verifier_duration_ms INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  search_cache_status VARCHAR(10),
  idempotency_key VARCHAR(160),
  request_hash CHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PROCESSING'
    CHECK (status IN ('PROCESSING', 'COMPLETED', 'INSUFFICIENT', 'FAILED')),
  safe_error_code VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_research_answer_idempotency
  ON legal_research_answers (session_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS legal_research_answer_citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_id UUID NOT NULL REFERENCES legal_research_answers(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES legal_sources(id) ON DELETE RESTRICT,
  chunk_id UUID NOT NULL REFERENCES legal_source_chunks(id) ON DELETE RESTRICT,
  claim_key VARCHAR(120) NOT NULL,
  source_excerpt TEXT NOT NULL,
  source_page_or_section VARCHAR(200),
  citation_order INTEGER NOT NULL CHECK (citation_order > 0),
  support_type VARCHAR(20) NOT NULL
    CHECK (support_type IN ('SUPPORTS', 'CONTRADICTS', 'BACKGROUND')),
  verification_status VARCHAR(20) NOT NULL
    CHECK (verification_status IN ('VERIFIED', 'REJECTED', 'PARTIAL')),
  overlap_score NUMERIC(7,6) NOT NULL DEFAULT 0
    CHECK (overlap_score >= 0 AND overlap_score <= 1),
  verification_reason VARCHAR(300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (answer_id, claim_key, source_id, chunk_id, support_type)
);

CREATE TABLE IF NOT EXISTS matter_research_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES legal_research_sessions(id) ON DELETE CASCADE,
  answer_id UUID NOT NULL UNIQUE REFERENCES legal_research_answers(id) ON DELETE CASCADE,
  title VARCHAR(300) NOT NULL,
  content TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_sessions_user_date
  ON legal_research_sessions (user_id, updated_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_research_sessions_org_date
  ON legal_research_sessions (organization_id, updated_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_research_sessions_case_date
  ON legal_research_sessions (case_id, updated_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_research_messages_session_date
  ON legal_research_messages (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_research_answers_session_date
  ON legal_research_answers (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_citations_answer_order
  ON legal_research_answer_citations (answer_id, citation_order);
CREATE INDEX IF NOT EXISTS idx_matter_research_notes_case_date
  ON matter_research_notes (case_id, created_at DESC);
