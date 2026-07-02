-- Phase 8: enterprise security, operations, privacy and production coordination.

CREATE TABLE IF NOT EXISTS institutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(300) NOT NULL,
  slug VARCHAR(180) NOT NULL UNIQUE,
  institution_type VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  default_timezone VARCHAR(80) NOT NULL DEFAULT 'Europe/Istanbul',
  data_region VARCHAR(80),
  seat_limit INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT institutions_type_ck CHECK (institution_type IN ('LAW_FIRM_GROUP','UNIVERSITY','PUBLIC_INSTITUTION','ENTERPRISE','OTHER')),
  CONSTRAINT institutions_status_ck CHECK (status IN ('ACTIVE','SUSPENDED','DELETED')),
  CONSTRAINT institutions_seat_limit_ck CHECK (seat_limit IS NULL OR seat_limit >= 0)
);

CREATE TABLE IF NOT EXISTS institution_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT institution_memberships_status_ck CHECK (status IN ('INVITED','ACTIVE','SUSPENDED','REVOKED')),
  CONSTRAINT institution_memberships_uq UNIQUE (institution_id, user_id)
);

CREATE TABLE IF NOT EXISTS subscription_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES law_firms(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  seat_type VARCHAR(30) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT subscription_seats_type_ck CHECK (seat_type IN ('STUDENT','ACADEMIC','LAWYER','STAFF','ADMIN','CUSTOM')),
  CONSTRAINT subscription_seats_status_ck CHECK (status IN ('PENDING','ACTIVE','REVOKED','EXPIRED'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_seats_active_user
  ON subscription_seats (institution_id, user_id) WHERE status IN ('PENDING','ACTIVE') AND user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS identity_provider_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  provider_type VARCHAR(10) NOT NULL,
  name VARCHAR(200) NOT NULL,
  issuer TEXT NOT NULL,
  client_id TEXT NOT NULL,
  encrypted_client_secret TEXT NOT NULL,
  discovery_url TEXT,
  domains TEXT[] NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'DISABLED',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT identity_provider_type_ck CHECK (provider_type IN ('OIDC','SAML')),
  CONSTRAINT identity_provider_status_ck CHECK (status IN ('ACTIVE','DISABLED','ERROR')),
  CONSTRAINT identity_provider_issuer_uq UNIQUE (institution_id, issuer)
);

CREATE TABLE IF NOT EXISTS user_identity_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  identity_provider_id UUID NOT NULL REFERENCES identity_provider_configs(id) ON DELETE CASCADE,
  external_subject TEXT NOT NULL,
  external_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  CONSTRAINT user_identity_subject_uq UNIQUE (identity_provider_id, external_subject),
  CONSTRAINT user_identity_user_uq UNIQUE (user_id, identity_provider_id)
);

CREATE TABLE IF NOT EXISTS provider_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES law_firms(id) ON DELETE CASCADE,
  institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
  provider_type VARCHAR(40) NOT NULL,
  provider_name VARCHAR(120) NOT NULL,
  encrypted_credentials TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'UNCONFIGURED',
  last_verified_at TIMESTAMPTZ,
  last_error_code VARCHAR(120),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT provider_connections_scope_ck CHECK (organization_id IS NOT NULL OR institution_id IS NOT NULL),
  CONSTRAINT provider_connections_status_ck CHECK (status IN ('UNCONFIGURED','ACTIVE','DISABLED','ERROR'))
);

CREATE TABLE IF NOT EXISTS enterprise_security_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES law_firms(id) ON DELETE CASCADE,
  institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
  require_mfa BOOLEAN NOT NULL DEFAULT false,
  require_portal_mfa BOOLEAN NOT NULL DEFAULT false,
  session_ttl_minutes INT NOT NULL DEFAULT 10080,
  allowed_redirect_uris TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT enterprise_security_policy_scope_ck CHECK (organization_id IS NOT NULL OR institution_id IS NOT NULL),
  CONSTRAINT enterprise_security_policy_ttl_ck CHECK (session_ttl_minutes BETWEEN 15 AND 43200)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_security_policy_org ON enterprise_security_policies(organization_id) WHERE organization_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_security_policy_institution ON enterprise_security_policies(institution_id) WHERE institution_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash CHAR(64) NOT NULL UNIQUE,
  previous_token_hash CHAR(64),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  user_agent_summary VARCHAR(300),
  ip_hash CHAR(64),
  mfa_verified_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoke_reason VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT auth_sessions_status_ck CHECK (status IN ('ACTIVE','REVOKED','COMPROMISED','EXPIRED'))
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_family ON auth_sessions(family_id);

CREATE TABLE IF NOT EXISTS user_mfa_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method_type VARCHAR(30) NOT NULL DEFAULT 'TOTP',
  encrypted_secret TEXT NOT NULL,
  recovery_code_hashes TEXT[] NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  verified_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_mfa_type_ck CHECK (method_type = 'TOTP'),
  CONSTRAINT user_mfa_status_ck CHECK (status IN ('PENDING','ACTIVE','DISABLED')),
  CONSTRAINT user_mfa_method_uq UNIQUE (user_id, method_type)
);

CREATE TABLE IF NOT EXISTS account_action_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_type VARCHAR(30) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT account_action_type_ck CHECK (token_type IN ('EMAIL_VERIFICATION','PASSWORD_RESET'))
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS data_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES law_firms(id) ON DELETE CASCADE,
  institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
  resource_type VARCHAR(100) NOT NULL,
  retention_days INT NOT NULL,
  archive_after_days INT,
  delete_behavior VARCHAR(30) NOT NULL,
  legal_hold_supported BOOLEAN NOT NULL DEFAULT true,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT retention_scope_ck CHECK (organization_id IS NOT NULL OR institution_id IS NOT NULL),
  CONSTRAINT retention_days_ck CHECK (retention_days > 0 AND (archive_after_days IS NULL OR archive_after_days BETWEEN 0 AND retention_days)),
  CONSTRAINT retention_delete_behavior_ck CHECK (delete_behavior IN ('SOFT_DELETE','ANONYMIZE','PHYSICAL_DELETE','RETAIN')),
  CONSTRAINT retention_status_ck CHECK (status IN ('DRAFT','ACTIVE','DISABLED'))
);

CREATE TABLE IF NOT EXISTS legal_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES law_firms(id) ON DELETE CASCADE,
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  resource_type VARCHAR(100) NOT NULL,
  resource_id UUID,
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  released_at TIMESTAMPTZ,
  CONSTRAINT legal_holds_status_ck CHECK (status IN ('ACTIVE','RELEASED'))
);

CREATE TABLE IF NOT EXISTS privacy_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES law_firms(id) ON DELETE CASCADE,
  request_type VARCHAR(40) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'REQUESTED',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result_reference TEXT,
  safe_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT privacy_request_type_ck CHECK (request_type IN ('DATA_EXPORT','DATA_CORRECTION','ACCOUNT_DELETION','PROCESSING_RESTRICTION')),
  CONSTRAINT privacy_request_status_ck CHECK (status IN ('REQUESTED','IDENTITY_VERIFIED','PROCESSING','COMPLETED','REJECTED','EXPIRED'))
);

CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES law_firms(id) ON DELETE SET NULL,
  institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
  event_type VARCHAR(120) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  ip_hash CHAR(64),
  user_agent_summary VARCHAR(300),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT security_events_severity_ck CHECK (severity IN ('INFO','LOW','MEDIUM','HIGH','CRITICAL'))
);

CREATE TABLE IF NOT EXISTS deployment_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version VARCHAR(120) NOT NULL,
  git_commit VARCHAR(64) NOT NULL,
  environment VARCHAR(40) NOT NULL,
  migration_version VARCHAR(255),
  status VARCHAR(30) NOT NULL,
  deployed_at TIMESTAMPTZ,
  deployed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  rollback_reference TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT deployment_release_uq UNIQUE (environment, version)
);

CREATE TABLE IF NOT EXISTS backup_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment VARCHAR(40) NOT NULL,
  backup_type VARCHAR(30) NOT NULL,
  status VARCHAR(30) NOT NULL,
  storage_reference TEXT,
  checksum CHAR(64),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  safe_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT backup_status_ck CHECK (status IN ('STARTED','COMPLETED','VERIFIED','FAILED')),
  CONSTRAINT backup_verified_ck CHECK (status <> 'VERIFIED' OR verified_at IS NOT NULL),
  CONSTRAINT backup_checksum_ck CHECK (checksum IS NULL OR checksum ~ '^[0-9a-f]{64}$')
);

CREATE TABLE IF NOT EXISTS data_export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES law_firms(id) ON DELETE CASCADE,
  institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
  export_type VARCHAR(50) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'QUEUED',
  storage_key TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT data_export_status_ck CHECK (status IN ('QUEUED','RUNNING','COMPLETED','FAILED','EXPIRED'))
);

CREATE TABLE IF NOT EXISTS storage_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(30) NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  scope_type VARCHAR(40) NOT NULL,
  organization_id UUID REFERENCES law_firms(id) ON DELETE CASCADE,
  institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content_sha256 CHAR(64) NOT NULL,
  size_bytes BIGINT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  retention_until TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  physical_deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT storage_scope_type_ck CHECK (scope_type IN ('MATTER_DOCUMENT','EDUCATION_ASSIGNMENT','ACADEMIC_SOURCE','RESEARCH_ATTACHMENT','PRIVACY_EXPORT','BACKUP')),
  CONSTRAINT storage_hash_ck CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT storage_size_ck CHECK (size_bytes >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_storage_scope_hash
  ON storage_objects(scope_type, COALESCE(organization_id, institution_id, owner_user_id), content_sha256)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS storage_migration_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_provider VARCHAR(30) NOT NULL,
  source_key TEXT NOT NULL,
  destination_provider VARCHAR(30) NOT NULL,
  destination_key TEXT,
  content_sha256 CHAR(64) NOT NULL,
  status VARCHAR(30) NOT NULL,
  safe_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT storage_migration_uq UNIQUE(source_provider, source_key, destination_provider)
);

CREATE TABLE IF NOT EXISTS education_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_object_id UUID NOT NULL REFERENCES storage_objects(id) ON DELETE RESTRICT,
  workspace_id UUID REFERENCES learning_workspaces(id) ON DELETE CASCADE,
  assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE,
  research_project_id UUID REFERENCES research_projects(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT education_attachment_parent_ck CHECK (num_nonnulls(workspace_id, assignment_id, research_project_id) = 1)
);

ALTER TABLE practice_notifications ADD COLUMN IF NOT EXISTS template_version VARCHAR(40) NOT NULL DEFAULT 'v1';
ALTER TABLE practice_notifications ADD COLUMN IF NOT EXISTS attempt_count INT NOT NULL DEFAULT 0;
ALTER TABLE practice_notifications ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;
ALTER TABLE practice_notifications ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE practice_notifications ADD COLUMN IF NOT EXISTS dead_lettered_at TIMESTAMPTZ;
ALTER TABLE outbound_email_queue ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);
ALTER TABLE outbound_email_queue ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;
ALTER TABLE outbound_email_queue ADD COLUMN IF NOT EXISTS provider_message_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_outbound_email_idempotency ON outbound_email_queue(idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS execution_ms BIGINT;
ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS backup_required BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS breaking BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

ALTER TABLE legal_rule_versions ADD COLUMN IF NOT EXISTS activated_by UUID REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE legal_rule_versions ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;
ALTER TABLE legal_rule_versions ADD COLUMN IF NOT EXISTS fixture_status VARCHAR(20) NOT NULL DEFAULT 'PENDING';
ALTER TABLE legal_rule_versions ADD COLUMN IF NOT EXISTS conflict_warnings JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE legal_rule_versions ADD CONSTRAINT legal_rule_fixture_status_ck CHECK (fixture_status IN ('PENDING','PASSED','FAILED'));

CREATE OR REPLACE FUNCTION enforce_legal_rule_activation()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'ACTIVE' AND OLD.status IS DISTINCT FROM 'ACTIVE' THEN
    IF NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL
       OR (NEW.legal_source_id IS NULL AND NEW.official_source_reference IS NULL)
       OR NEW.fixture_status <> 'PASSED' THEN
      RAISE EXCEPTION 'active legal rule requires source, reviewer and passing fixture' USING ERRCODE = '23514';
    END IF;
    IF NEW.created_by = NEW.reviewed_by THEN
      RAISE EXCEPTION 'rule creator and reviewer must differ' USING ERRCODE = '23514';
    END IF;
    NEW.activated_at := COALESCE(NEW.activated_at, now());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_legal_rule_activation_guard ON legal_rule_versions;
CREATE TRIGGER trg_legal_rule_activation_guard
BEFORE UPDATE OF status ON legal_rule_versions FOR EACH ROW EXECUTE FUNCTION enforce_legal_rule_activation();

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS result VARCHAR(30) NOT NULL DEFAULT 'SUCCESS';
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS previous_hash CHAR(64);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS integrity_hash CHAR(64);

CREATE OR REPLACE FUNCTION audit_log_integrity_chain()
RETURNS trigger AS $$
DECLARE prior_hash TEXT;
BEGIN
  SELECT integrity_hash INTO prior_hash FROM audit_logs
  WHERE firm_id IS NOT DISTINCT FROM NEW.firm_id
    AND institution_id IS NOT DISTINCT FROM NEW.institution_id
  ORDER BY created_at DESC, id DESC LIMIT 1;
  NEW.previous_hash := prior_hash;
  NEW.integrity_hash := encode(digest(
    COALESCE(prior_hash, '') || NEW.id::text || COALESCE(NEW.user_id::text, '') ||
    NEW.action || COALESCE(NEW.entity_type, '') || COALESCE(NEW.entity_id, '') ||
    COALESCE(NEW.request_id, '') || NEW.created_at::text || NEW.metadata::text,
    'sha256'
  ), 'hex');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_audit_log_integrity ON audit_logs;
CREATE TRIGGER trg_audit_log_integrity BEFORE INSERT ON audit_logs
FOR EACH ROW EXECUTE FUNCTION audit_log_integrity_chain();

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit logs are append-only' USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_audit_log_immutable ON audit_logs;
CREATE TRIGGER trg_audit_log_immutable BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

CREATE INDEX IF NOT EXISTS idx_security_events_scope ON security_events(institution_id, organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_privacy_requests_user ON privacy_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_data_export_expiry ON data_export_jobs(expires_at) WHERE status = 'COMPLETED';
CREATE INDEX IF NOT EXISTS idx_notification_delivery ON practice_notifications(status, next_attempt_at, created_at);
