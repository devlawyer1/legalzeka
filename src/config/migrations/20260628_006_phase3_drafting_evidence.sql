-- Phase 3: canonical structured drafts, immutable versions, suggestions, evidence, and exports.

ALTER TABLE firm_templates ALTER COLUMN firm_id DROP NOT NULL;
ALTER TABLE firm_templates ADD COLUMN IF NOT EXISTS scope_type VARCHAR(20);
ALTER TABLE firm_templates ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES law_firms(id) ON DELETE CASCADE;
ALTER TABLE firm_templates ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE firm_templates ADD COLUMN IF NOT EXISTS is_read_only BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE firm_templates ADD COLUMN IF NOT EXISTS variables JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE firm_templates ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

UPDATE firm_templates
SET scope_type = 'ORGANIZATION', organization_id = firm_id
WHERE scope_type IS NULL AND firm_id IS NOT NULL;

ALTER TABLE firm_templates ALTER COLUMN scope_type SET DEFAULT 'ORGANIZATION';
ALTER TABLE firm_templates ALTER COLUMN scope_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'firm_templates_scope_ck') THEN
    ALTER TABLE firm_templates ADD CONSTRAINT firm_templates_scope_ck
      CHECK (scope_type IN ('PERSONAL', 'ORGANIZATION', 'SYSTEM'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'firm_templates_ownership_ck') THEN
    ALTER TABLE firm_templates ADD CONSTRAINT firm_templates_ownership_ck CHECK (
      (scope_type = 'PERSONAL' AND owner_user_id IS NOT NULL AND organization_id IS NULL AND firm_id IS NULL)
      OR (scope_type = 'ORGANIZATION' AND organization_id IS NOT NULL AND firm_id IS NOT DISTINCT FROM organization_id AND owner_user_id IS NULL)
      OR (scope_type = 'SYSTEM' AND owner_user_id IS NULL AND organization_id IS NULL AND firm_id IS NULL AND is_read_only = TRUE)
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_firm_templates_scope
  ON firm_templates (scope_type, organization_id, owner_user_id, deleted_at);

CREATE TABLE IF NOT EXISTS legal_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES law_firms(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(300) NOT NULL,
  draft_type VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  current_version_id UUID,
  template_id UUID REFERENCES firm_templates(id) ON DELETE SET NULL,
  legacy_petition_id UUID UNIQUE REFERENCES petitions(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT legal_drafts_type_ck CHECK (draft_type IN (
    'PETITION', 'RESPONSE', 'APPEAL', 'OBJECTION', 'NOTICE', 'LEGAL_OPINION', 'OTHER'
  )),
  CONSTRAINT legal_drafts_status_ck CHECK (status IN ('DRAFT', 'IN_REVIEW', 'FINAL', 'ARCHIVED')),
  CONSTRAINT legal_drafts_scope_ck CHECK (
    (organization_id IS NOT NULL AND owner_user_id IS NULL)
    OR (organization_id IS NULL AND owner_user_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_legal_drafts_case ON legal_drafts (case_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_legal_drafts_org ON legal_drafts (organization_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_legal_drafts_owner ON legal_drafts (owner_user_id, updated_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS legal_draft_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES legal_drafts(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  content_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  plain_text TEXT NOT NULL DEFAULT '',
  change_summary VARCHAR(500),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT legal_draft_versions_number_ck CHECK (version_number > 0),
  CONSTRAINT legal_draft_versions_length_ck CHECK (char_length(plain_text) <= 500000),
  CONSTRAINT legal_draft_versions_uq UNIQUE (draft_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_legal_draft_versions_draft
  ON legal_draft_versions (draft_id, version_number DESC);

CREATE TABLE IF NOT EXISTS legal_draft_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_version_id UUID NOT NULL REFERENCES legal_draft_versions(id) ON DELETE CASCADE,
  section_key VARCHAR(80) NOT NULL,
  title VARCHAR(300) NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT legal_draft_sections_key_ck CHECK (section_key ~ '^[A-Z][A-Z0-9_]{0,79}$'),
  CONSTRAINT legal_draft_sections_length_ck CHECK (char_length(content) <= 150000),
  CONSTRAINT legal_draft_sections_order_ck CHECK (sort_order >= 0),
  CONSTRAINT legal_draft_sections_uq UNIQUE (draft_version_id, section_key)
);

CREATE INDEX IF NOT EXISTS idx_legal_draft_sections_version
  ON legal_draft_sections (draft_version_id, sort_order, id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'legal_drafts_current_version_fk') THEN
    ALTER TABLE legal_drafts ADD CONSTRAINT legal_drafts_current_version_fk
      FOREIGN KEY (current_version_id) REFERENCES legal_draft_versions(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS draft_ai_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES legal_drafts(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES law_firms(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  operation VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'RUNNING',
  provider VARCHAR(80),
  model VARCHAR(200),
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  estimated_cost NUMERIC(14,8) NOT NULL DEFAULT 0,
  duration_ms INT,
  safe_error_code VARCHAR(80),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT draft_ai_runs_operation_ck CHECK (operation IN ('PLAN', 'SECTION', 'ANALYSIS', 'RELATION')),
  CONSTRAINT draft_ai_runs_status_ck CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED')),
  CONSTRAINT draft_ai_runs_usage_ck CHECK (
    input_tokens >= 0 AND output_tokens >= 0 AND estimated_cost >= 0 AND (duration_ms IS NULL OR duration_ms >= 0)
  ),
  CONSTRAINT draft_ai_runs_scope_ck CHECK (
    (organization_id IS NOT NULL AND owner_user_id IS NULL)
    OR (organization_id IS NULL AND owner_user_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_draft_ai_runs_draft ON draft_ai_runs (draft_id, created_at DESC);

CREATE TABLE IF NOT EXISTS draft_ai_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES legal_drafts(id) ON DELETE CASCADE,
  draft_version_id UUID NOT NULL REFERENCES legal_draft_versions(id) ON DELETE CASCADE,
  section_key VARCHAR(80) NOT NULL,
  suggestion_type VARCHAR(30) NOT NULL,
  original_text TEXT,
  suggested_text TEXT,
  reason VARCHAR(2000) NOT NULL,
  source_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  source_context JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  text_range JSONB,
  created_by_run_id UUID REFERENCES draft_ai_runs(id) ON DELETE SET NULL,
  applied_version_id UUID REFERENCES legal_draft_versions(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT draft_ai_suggestions_status_ck CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'SUPERSEDED')),
  CONSTRAINT draft_ai_suggestions_type_ck CHECK (suggestion_type IN (
    'ADD', 'REWRITE', 'REMOVE', 'SOURCE_REQUIRED', 'EVIDENCE_REQUIRED',
    'PROCEDURAL_WARNING', 'CONTRADICTION', 'STYLE'
  )),
  CONSTRAINT draft_ai_suggestions_severity_ck CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'))
);

CREATE INDEX IF NOT EXISTS idx_draft_ai_suggestions_draft
  ON draft_ai_suggestions (draft_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS matter_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  claim_type VARCHAR(50) NOT NULL DEFAULT 'FACT',
  asserted_by_party_id UUID REFERENCES matter_parties(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PROPOSED',
  verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT matter_claims_type_ck CHECK (claim_type IN ('FACT', 'LEGAL', 'DEFENSE', 'REQUEST')),
  CONSTRAINT matter_claims_status_ck CHECK (status IN ('PROPOSED', 'VERIFIED', 'DISPUTED', 'REJECTED'))
);

CREATE INDEX IF NOT EXISTS idx_matter_claims_case ON matter_claims (case_id, status, created_at);

CREATE TABLE IF NOT EXISTS matter_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  document_id UUID REFERENCES case_documents(id) ON DELETE SET NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  evidence_type VARCHAR(80) NOT NULL DEFAULT 'DOCUMENT',
  source_page INT,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT matter_evidence_page_ck CHECK (source_page IS NULL OR source_page > 0)
);

CREATE INDEX IF NOT EXISTS idx_matter_evidence_case ON matter_evidence (case_id, verified, created_at);

CREATE TABLE IF NOT EXISTS claim_evidence_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES matter_claims(id) ON DELETE CASCADE,
  evidence_id UUID NOT NULL REFERENCES matter_evidence(id) ON DELETE CASCADE,
  relation_type VARCHAR(20) NOT NULL,
  confidence NUMERIC(6,5),
  verification_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  suggested_by_ai BOOLEAN NOT NULL DEFAULT FALSE,
  verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT claim_evidence_relations_type_ck CHECK (relation_type IN ('SUPPORTS', 'CONTRADICTS', 'BACKGROUND')),
  CONSTRAINT claim_evidence_relations_status_ck CHECK (verification_status IN ('PENDING', 'VERIFIED', 'REJECTED')),
  CONSTRAINT claim_evidence_relations_confidence_ck CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  CONSTRAINT claim_evidence_relations_uq UNIQUE (claim_id, evidence_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_claim_evidence_claim ON claim_evidence_relations (claim_id, verification_status);

CREATE TABLE IF NOT EXISTS draft_claim_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES legal_drafts(id) ON DELETE CASCADE,
  draft_section_id UUID NOT NULL REFERENCES legal_draft_sections(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES matter_claims(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT draft_claim_relations_uq UNIQUE (draft_id, draft_section_id, claim_id)
);

CREATE TABLE IF NOT EXISTS draft_citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES legal_drafts(id) ON DELETE CASCADE,
  draft_version_id UUID NOT NULL REFERENCES legal_draft_versions(id) ON DELETE CASCADE,
  section_key VARCHAR(80) NOT NULL,
  claim_key VARCHAR(120) NOT NULL,
  source_id UUID NOT NULL REFERENCES legal_sources(id) ON DELETE RESTRICT,
  chunk_id UUID NOT NULL REFERENCES legal_source_chunks(id) ON DELETE RESTRICT,
  citation_order INT NOT NULL,
  source_excerpt TEXT NOT NULL,
  support_type VARCHAR(20) NOT NULL DEFAULT 'SUPPORTS',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT draft_citations_order_ck CHECK (citation_order > 0),
  CONSTRAINT draft_citations_support_ck CHECK (support_type IN ('SUPPORTS', 'CONTRADICTS', 'BACKGROUND')),
  CONSTRAINT draft_citations_uq UNIQUE (draft_version_id, section_key, claim_key, source_id, chunk_id)
);

CREATE INDEX IF NOT EXISTS idx_draft_citations_draft ON draft_citations (draft_id, draft_version_id, citation_order);

-- Preserve legacy petition rows by promoting them into the canonical draft model.
INSERT INTO legal_drafts (
  case_id, organization_id, owner_user_id, title, draft_type, status,
  legacy_petition_id, created_by, created_at, updated_at
)
SELECT p.case_id,
       CASE WHEN c.scope_type = 'ORGANIZATION' THEN c.law_firm_id ELSE NULL END,
       CASE WHEN c.scope_type = 'PERSONAL' THEN c.owner_user_id ELSE NULL END,
       p.title,
       CASE
         WHEN lower(p.type) LIKE '%cevap%' THEN 'RESPONSE'
         WHEN lower(p.type) LIKE '%istinaf%' OR lower(p.type) LIKE '%temyiz%' THEN 'APPEAL'
         WHEN lower(p.type) LIKE '%itiraz%' THEN 'OBJECTION'
         WHEN lower(p.type) LIKE '%ihtar%' THEN 'NOTICE'
         ELSE 'PETITION'
       END,
       'DRAFT', p.id, COALESCE(p.created_by, c.owner_user_id, lf.owner_id),
       p.created_at, p.updated_at
FROM petitions p
JOIN cases c ON c.id = p.case_id
LEFT JOIN law_firms lf ON lf.id = c.law_firm_id
WHERE COALESCE(p.created_by, c.owner_user_id, lf.owner_id) IS NOT NULL
ON CONFLICT (legacy_petition_id) DO NOTHING;

INSERT INTO legal_draft_versions (draft_id, version_number, content_json, plain_text, change_summary, created_by, created_at)
SELECT d.id, GREATEST(COALESCE(p.version, 1), 1),
       jsonb_build_object('sections', jsonb_build_array(jsonb_build_object(
         'sectionKey', 'FACTS', 'title', 'Dilekçe Metni', 'content', p.content, 'sortOrder', 0
       ))),
       p.content, 'Eski dilekçe altyapısından aktarıldı', d.created_by, p.updated_at
FROM legal_drafts d
JOIN petitions p ON p.id = d.legacy_petition_id
WHERE NOT EXISTS (SELECT 1 FROM legal_draft_versions v WHERE v.draft_id = d.id);

INSERT INTO legal_draft_sections (draft_version_id, section_key, title, content, sort_order)
SELECT v.id, 'FACTS', 'Dilekçe Metni', v.plain_text, 0
FROM legal_draft_versions v
JOIN legal_drafts d ON d.id = v.draft_id AND d.legacy_petition_id IS NOT NULL
WHERE NOT EXISTS (SELECT 1 FROM legal_draft_sections s WHERE s.draft_version_id = v.id);

UPDATE legal_drafts d
SET current_version_id = (
  SELECT v.id FROM legal_draft_versions v
  WHERE v.draft_id = d.id
  ORDER BY v.version_number DESC LIMIT 1
)
WHERE d.current_version_id IS NULL;
