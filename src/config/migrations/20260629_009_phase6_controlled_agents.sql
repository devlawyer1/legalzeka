CREATE TABLE IF NOT EXISTS agent_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES law_firms(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  scope_type VARCHAR(20) NOT NULL DEFAULT 'ORGANIZATION',
  is_system_template BOOLEAN NOT NULL DEFAULT false,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  workflow_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  current_version_id UUID,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT agent_workflows_status_ck CHECK (status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED')),
  CONSTRAINT agent_workflows_type_ck CHECK (workflow_type IN (
    'MATTER_INTAKE', 'DOCUMENT_REVIEW', 'EVIDENCE_GAP_REVIEW', 'LEGAL_RESEARCH',
    'RESEARCH_MONITOR', 'DRAFT_REVIEW', 'DEADLINE_RISK', 'CLIENT_UPDATE', 'CUSTOM'
  )),
  CONSTRAINT agent_workflows_scope_ck CHECK (
    (scope_type = 'SYSTEM' AND is_system_template = true AND organization_id IS NULL AND owner_user_id IS NULL)
    OR (scope_type = 'PERSONAL' AND is_system_template = false AND organization_id IS NULL AND owner_user_id IS NOT NULL)
    OR (scope_type = 'ORGANIZATION' AND is_system_template = false AND organization_id IS NOT NULL AND owner_user_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS agent_workflow_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES agent_workflows(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  definition JSONB NOT NULL,
  tool_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  model_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  budget_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  trigger_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  checksum VARCHAR(64) NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workflow_id, version_number),
  UNIQUE (workflow_id, checksum)
);

ALTER TABLE agent_workflows
  ADD CONSTRAINT agent_workflows_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES agent_workflow_versions(id) ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

CREATE OR REPLACE FUNCTION prevent_agent_workflow_version_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'agent workflow versions are immutable' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agent_workflow_versions_immutable ON agent_workflow_versions;
CREATE TRIGGER trg_agent_workflow_versions_immutable
BEFORE UPDATE OR DELETE ON agent_workflow_versions
FOR EACH ROW EXECUTE FUNCTION prevent_agent_workflow_version_mutation();

CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES agent_workflows(id) ON DELETE RESTRICT,
  workflow_version_id UUID NOT NULL REFERENCES agent_workflow_versions(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  organization_id UUID REFERENCES law_firms(id) ON DELETE CASCADE,
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL DEFAULT 'QUEUED',
  trigger_type VARCHAR(40) NOT NULL DEFAULT 'MANUAL',
  trigger_reference VARCHAR(255),
  input_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_step INTEGER NOT NULL DEFAULT 0,
  idempotency_key VARCHAR(255),
  provider VARCHAR(80),
  model VARCHAR(160),
  model_call_count INTEGER NOT NULL DEFAULT 0,
  tool_call_count INTEGER NOT NULL DEFAULT 0,
  proposal_count INTEGER NOT NULL DEFAULT 0,
  retry_count INTEGER NOT NULL DEFAULT 0,
  approval_wait_ms BIGINT NOT NULL DEFAULT 0,
  waiting_approval_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  error_code VARCHAR(80),
  safe_error_message VARCHAR(500),
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost NUMERIC(18, 8) NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT agent_runs_status_ck CHECK (status IN (
    'QUEUED', 'RUNNING', 'WAITING_APPROVAL', 'COMPLETED', 'PARTIALLY_COMPLETED',
    'FAILED', 'CANCELLED', 'BUDGET_EXCEEDED'
  )),
  CONSTRAINT agent_runs_trigger_ck CHECK (trigger_type IN (
    'MANUAL', 'SCHEDULE', 'DOCUMENT_PROCESSED', 'MATTER_UPDATED', 'DEADLINE_APPROACHING',
    'TASK_COMPLETED', 'RESEARCH_CORPUS_UPDATED'
  )),
  CONSTRAINT agent_runs_metrics_ck CHECK (
    input_tokens >= 0 AND output_tokens >= 0 AND estimated_cost >= 0
    AND model_call_count >= 0 AND tool_call_count >= 0 AND proposal_count >= 0 AND retry_count >= 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_runs_idempotency
  ON agent_runs (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_runs_trigger_event
  ON agent_runs (workflow_id, trigger_type, trigger_reference) WHERE trigger_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_runs_tenant ON agent_runs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_user ON agent_runs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_case ON agent_runs (case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs (status, updated_at);

CREATE TABLE IF NOT EXISTS agent_run_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  step_code VARCHAR(120) NOT NULL,
  step_type VARCHAR(30) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'QUEUED',
  input_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_code VARCHAR(80),
  safe_error_message VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT agent_run_steps_type_ck CHECK (step_type IN ('LLM', 'TOOL', 'CONDITION', 'APPROVAL', 'TRANSFORM')),
  CONSTRAINT agent_run_steps_status_ck CHECK (status IN ('QUEUED', 'RUNNING', 'WAITING_APPROVAL', 'COMPLETED', 'FAILED', 'SKIPPED', 'CANCELLED')),
  UNIQUE (run_id, step_number),
  UNIQUE (run_id, step_code)
);

CREATE TABLE IF NOT EXISTS agent_tool_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES agent_run_steps(id) ON DELETE CASCADE,
  tool_name VARCHAR(120) NOT NULL,
  tool_version VARCHAR(40) NOT NULL,
  risk_level VARCHAR(30) NOT NULL,
  status VARCHAR(30) NOT NULL,
  input_hash VARCHAR(64) NOT NULL,
  output_hash VARCHAR(64),
  duration_ms INTEGER NOT NULL DEFAULT 0,
  error_code VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT agent_tool_calls_risk_ck CHECK (risk_level IN ('READ_ONLY', 'REVERSIBLE_WRITE', 'CRITICAL_WRITE', 'EXTERNAL_ACTION')),
  CONSTRAINT agent_tool_calls_status_ck CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED', 'DENIED'))
);

CREATE TABLE IF NOT EXISTS agent_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  step_id UUID REFERENCES agent_run_steps(id) ON DELETE SET NULL,
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  proposal_type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  deduplication_key VARCHAR(64) NOT NULL,
  risk_level VARCHAR(30) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  expires_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  execution_reference VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT agent_proposals_type_ck CHECK (proposal_type IN (
    'CREATE_TASK', 'CREATE_DEADLINE', 'START_CALCULATION', 'ADD_MATTER_EVENT',
    'ADD_MATTER_PARTY', 'ADD_EVIDENCE_RELATION', 'CREATE_DRAFT',
    'APPLY_DRAFT_SUGGESTION', 'SAVE_RESEARCH', 'CREATE_CLIENT_UPDATE',
    'SHARE_PORTAL_UPDATE', 'SEND_NOTIFICATION', 'CREATE_TIME_ENTRY'
  )),
  CONSTRAINT agent_proposals_risk_ck CHECK (risk_level IN ('READ_ONLY', 'REVERSIBLE_WRITE', 'CRITICAL_WRITE', 'EXTERNAL_ACTION')),
  CONSTRAINT agent_proposals_status_ck CHECK (status IN (
    'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'EXECUTED',
    'EXECUTION_FAILED', 'CANCELLED'
  )),
  UNIQUE (run_id, deduplication_key)
);

CREATE INDEX IF NOT EXISTS idx_agent_proposals_pending
  ON agent_proposals (status, expires_at, created_at) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_agent_proposals_case ON agent_proposals (case_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_approval_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES agent_proposals(id) ON DELETE CASCADE,
  action VARCHAR(30) NOT NULL,
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT agent_approval_events_action_ck CHECK (action IN ('APPROVED', 'REJECTED', 'EXECUTED', 'EXECUTION_FAILED', 'EXPIRED'))
);

CREATE TABLE IF NOT EXISTS agent_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES agent_workflows(id) ON DELETE CASCADE,
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  cron_expression VARCHAR(120) NOT NULL,
  timezone VARCHAR(100) NOT NULL DEFAULT 'Europe/Istanbul',
  next_run_at TIMESTAMPTZ NOT NULL,
  last_run_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT agent_schedules_status_ck CHECK (status IN ('ACTIVE', 'PAUSED', 'DISABLED'))
);

CREATE INDEX IF NOT EXISTS idx_agent_schedules_due
  ON agent_schedules (next_run_at) WHERE status = 'ACTIVE';

ALTER TABLE document_processing_jobs ALTER COLUMN document_id DROP NOT NULL;
ALTER TABLE document_processing_jobs ALTER COLUMN case_id DROP NOT NULL;
ALTER TABLE document_processing_jobs ADD COLUMN IF NOT EXISTS agent_run_id UUID REFERENCES agent_runs(id) ON DELETE CASCADE;
ALTER TABLE document_processing_jobs DROP CONSTRAINT IF EXISTS document_jobs_type_ck;
ALTER TABLE document_processing_jobs ADD CONSTRAINT document_jobs_type_ck
  CHECK (job_type IN (
    'PROCESS_DOCUMENT', 'DELETE_DOCUMENT', 'OCR_DOCUMENT', 'EXTRACT_ENTITIES',
    'EXTRACT_MATTER_DATA', 'CREATE_EMBEDDINGS', 'INDEX_DOCUMENT', 'AGENT_RUN'
  ));
ALTER TABLE document_processing_jobs DROP CONSTRAINT IF EXISTS document_jobs_target_ck;
ALTER TABLE document_processing_jobs ADD CONSTRAINT document_jobs_target_ck CHECK (
  (agent_run_id IS NULL AND document_id IS NOT NULL AND case_id IS NOT NULL AND job_type <> 'AGENT_RUN')
  OR (agent_run_id IS NOT NULL AND document_id IS NULL AND job_type = 'AGENT_RUN')
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_document_jobs_active_agent_run
  ON document_processing_jobs (agent_run_id)
  WHERE agent_run_id IS NOT NULL AND status IN ('QUEUED', 'RUNNING', 'RETRYING');
CREATE INDEX IF NOT EXISTS idx_document_jobs_agent_run
  ON document_processing_jobs (agent_run_id, created_at DESC) WHERE agent_run_id IS NOT NULL;

WITH templates(id, version_id, name, description, workflow_type, definition) AS (
  VALUES
    ('60000000-0000-4000-8000-000000000001'::uuid, '61000000-0000-4000-8000-000000000001'::uuid,
     'Matter intake', 'Accepted document suggestions and missing Matter data review.', 'MATTER_INTAKE',
     '{"steps":[{"id":"start","type":"START"},{"id":"context","type":"LOAD_CONTEXT","scope":["MATTER_SUMMARY","VERIFIED_EVENTS","VERIFIED_PARTIES"]},{"id":"review","type":"CALL_MODEL","schema":"MATTER_INTAKE_FINDINGS"},{"id":"end","type":"END"}]}'::jsonb),
    ('60000000-0000-4000-8000-000000000002'::uuid, '61000000-0000-4000-8000-000000000002'::uuid,
     'Document review', 'Completed document facts, evidence and risk review.', 'DOCUMENT_REVIEW',
     '{"steps":[{"id":"start","type":"START"},{"id":"context","type":"LOAD_CONTEXT","scope":["MATTER_SUMMARY","DOCUMENT_PAGES"]},{"id":"review","type":"CALL_MODEL","schema":"DOCUMENT_REVIEW_FINDINGS"},{"id":"end","type":"END"}]}'::jsonb),
    ('60000000-0000-4000-8000-000000000003'::uuid, '61000000-0000-4000-8000-000000000003'::uuid,
     'Evidence gap review', 'Claim and evidence matrix gap review.', 'EVIDENCE_GAP_REVIEW',
     '{"steps":[{"id":"start","type":"START"},{"id":"matrix","type":"CALL_TOOL","tool":"evidence.get_matrix"},{"id":"review","type":"CALL_MODEL","schema":"EVIDENCE_GAPS"},{"id":"end","type":"END"}]}'::jsonb),
    ('60000000-0000-4000-8000-000000000004'::uuid, '61000000-0000-4000-8000-000000000004'::uuid,
     'Legal research', 'Grounded Phase 2 supporting and counter-source research.', 'LEGAL_RESEARCH',
     '{"steps":[{"id":"start","type":"START"},{"id":"research","type":"CALL_TOOL","tool":"legal.research"},{"id":"end","type":"END"}]}'::jsonb),
    ('60000000-0000-4000-8000-000000000005'::uuid, '61000000-0000-4000-8000-000000000005'::uuid,
     'Research monitor', 'Re-runs saved research after corpus changes.', 'RESEARCH_MONITOR',
     '{"steps":[{"id":"start","type":"START"},{"id":"research","type":"CALL_TOOL","tool":"legal.research"},{"id":"end","type":"END"}]}'::jsonb),
    ('60000000-0000-4000-8000-000000000006'::uuid, '61000000-0000-4000-8000-000000000006'::uuid,
     'Draft review', 'Grounding, evidence, procedure and calculation warning review.', 'DRAFT_REVIEW',
     '{"steps":[{"id":"start","type":"START"},{"id":"analysis","type":"CALL_TOOL","tool":"draft.analyze"},{"id":"end","type":"END"}]}'::jsonb),
    ('60000000-0000-4000-8000-000000000007'::uuid, '61000000-0000-4000-8000-000000000007'::uuid,
     'Deadline risk', 'Upcoming deadline and hearing preparation risk review.', 'DEADLINE_RISK',
     '{"steps":[{"id":"start","type":"START"},{"id":"deadlines","type":"CALL_TOOL","tool":"practice.list_deadlines"},{"id":"hearings","type":"CALL_TOOL","tool":"practice.list_hearings"},{"id":"review","type":"CALL_MODEL","schema":"DEADLINE_RISKS"},{"id":"end","type":"END"}]}'::jsonb),
    ('60000000-0000-4000-8000-000000000008'::uuid, '61000000-0000-4000-8000-000000000008'::uuid,
     'Client update', 'Drafts an update from explicitly shareable Matter data only.', 'CLIENT_UPDATE',
     '{"steps":[{"id":"start","type":"START"},{"id":"updates","type":"CALL_TOOL","tool":"practice.list_client_updates"},{"id":"draft","type":"CALL_MODEL","schema":"CLIENT_UPDATE_DRAFT"},{"id":"end","type":"END"}]}'::jsonb)
)
INSERT INTO agent_workflows (
  id, scope_type, is_system_template, name, description, workflow_type,
  status, current_version_id, owner_user_id, organization_id, created_by
)
SELECT id, 'SYSTEM', true, name, description, workflow_type, 'DRAFT', version_id, NULL, NULL, NULL
FROM templates
ON CONFLICT (id) DO NOTHING;

WITH templates(workflow_id, version_id, definition) AS (
  VALUES
    ('60000000-0000-4000-8000-000000000001'::uuid, '61000000-0000-4000-8000-000000000001'::uuid, '{"steps":[{"id":"start","type":"START"},{"id":"context","type":"LOAD_CONTEXT","scope":["MATTER_SUMMARY","VERIFIED_EVENTS","VERIFIED_PARTIES"]},{"id":"review","type":"CALL_MODEL","schema":"MATTER_INTAKE_FINDINGS"},{"id":"end","type":"END"}]}'::jsonb),
    ('60000000-0000-4000-8000-000000000002'::uuid, '61000000-0000-4000-8000-000000000002'::uuid, '{"steps":[{"id":"start","type":"START"},{"id":"context","type":"LOAD_CONTEXT","scope":["MATTER_SUMMARY","DOCUMENT_PAGES"]},{"id":"review","type":"CALL_MODEL","schema":"DOCUMENT_REVIEW_FINDINGS"},{"id":"end","type":"END"}]}'::jsonb),
    ('60000000-0000-4000-8000-000000000003'::uuid, '61000000-0000-4000-8000-000000000003'::uuid, '{"steps":[{"id":"start","type":"START"},{"id":"matrix","type":"CALL_TOOL","tool":"evidence.get_matrix"},{"id":"review","type":"CALL_MODEL","schema":"EVIDENCE_GAPS"},{"id":"end","type":"END"}]}'::jsonb),
    ('60000000-0000-4000-8000-000000000004'::uuid, '61000000-0000-4000-8000-000000000004'::uuid, '{"steps":[{"id":"start","type":"START"},{"id":"research","type":"CALL_TOOL","tool":"legal.research"},{"id":"end","type":"END"}]}'::jsonb),
    ('60000000-0000-4000-8000-000000000005'::uuid, '61000000-0000-4000-8000-000000000005'::uuid, '{"steps":[{"id":"start","type":"START"},{"id":"research","type":"CALL_TOOL","tool":"legal.research"},{"id":"end","type":"END"}]}'::jsonb),
    ('60000000-0000-4000-8000-000000000006'::uuid, '61000000-0000-4000-8000-000000000006'::uuid, '{"steps":[{"id":"start","type":"START"},{"id":"analysis","type":"CALL_TOOL","tool":"draft.analyze"},{"id":"end","type":"END"}]}'::jsonb),
    ('60000000-0000-4000-8000-000000000007'::uuid, '61000000-0000-4000-8000-000000000007'::uuid, '{"steps":[{"id":"start","type":"START"},{"id":"deadlines","type":"CALL_TOOL","tool":"practice.list_deadlines"},{"id":"hearings","type":"CALL_TOOL","tool":"practice.list_hearings"},{"id":"review","type":"CALL_MODEL","schema":"DEADLINE_RISKS"},{"id":"end","type":"END"}]}'::jsonb),
    ('60000000-0000-4000-8000-000000000008'::uuid, '61000000-0000-4000-8000-000000000008'::uuid, '{"steps":[{"id":"start","type":"START"},{"id":"updates","type":"CALL_TOOL","tool":"practice.list_client_updates"},{"id":"draft","type":"CALL_MODEL","schema":"CLIENT_UPDATE_DRAFT"},{"id":"end","type":"END"}]}'::jsonb)
)
INSERT INTO agent_workflow_versions (
  id, workflow_id, version_number, definition, tool_policy, model_policy,
  budget_policy, trigger_policy, checksum, created_by
)
SELECT
  version_id, workflow_id, 1, definition,
  '{"mode":"ALLOWLIST"}'::jsonb,
  '{"taskType":"CONTROLLED_AGENT","maxInputTokens":12000,"maxOutputTokens":2500,"maxCalls":3,"maxEstimatedCost":1,"timeout":60000}'::jsonb,
  '{"maxToolCalls":12,"maxProposals":8,"maxRunMs":300000}'::jsonb,
  '{"events":[],"cooldownSeconds":300}'::jsonb,
  encode(digest(definition::text, 'sha256'), 'hex'), NULL
FROM templates
ON CONFLICT (id) DO NOTHING;
