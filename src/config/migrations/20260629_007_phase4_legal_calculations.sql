-- Phase 4: versioned, deterministic and explainable legal calculations.

CREATE TABLE IF NOT EXISTS legal_rule_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code VARCHAR(120) NOT NULL UNIQUE,
  name VARCHAR(300) NOT NULL,
  description TEXT,
  calculation_type VARCHAR(40) NOT NULL,
  jurisdiction VARCHAR(80) NOT NULL DEFAULT 'TR',
  legal_domain VARCHAR(120),
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT legal_rule_sets_type_ck CHECK (calculation_type IN (
    'DEADLINE', 'LIMITATION', 'FORFEITURE', 'INTEREST', 'COURT_FEE', 'ATTORNEY_FEE',
    'SEVERANCE', 'NOTICE_PAY', 'OVERTIME', 'ANNUAL_LEAVE', 'ENFORCEMENT_COST', 'CUSTOM'
  )),
  CONSTRAINT legal_rule_sets_status_ck CHECK (status IN ('DRAFT', 'REVIEWED', 'ACTIVE', 'RETIRED'))
);

CREATE TABLE IF NOT EXISTS legal_rule_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_set_id UUID NOT NULL REFERENCES legal_rule_sets(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  input_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  rule_definition JSONB NOT NULL,
  output_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  legal_source_id UUID REFERENCES legal_sources(id) ON DELETE RESTRICT,
  legal_reference TEXT,
  official_source_reference TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_at TIMESTAMPTZ,
  checksum CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT legal_rule_versions_number_ck CHECK (version_number > 0),
  CONSTRAINT legal_rule_versions_date_ck CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT legal_rule_versions_status_ck CHECK (status IN ('DRAFT', 'REVIEWED', 'ACTIVE', 'RETIRED')),
  CONSTRAINT legal_rule_versions_checksum_ck CHECK (checksum ~ '^[0-9a-f]{64}$'),
  CONSTRAINT legal_rule_versions_uq UNIQUE (rule_set_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_legal_rule_versions_resolution
  ON legal_rule_versions (rule_set_id, status, effective_from DESC, effective_to);

CREATE OR REPLACE FUNCTION prevent_active_rule_version_overlap()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'ACTIVE' AND EXISTS (
    SELECT 1 FROM legal_rule_versions existing
    WHERE existing.rule_set_id = NEW.rule_set_id
      AND existing.status = 'ACTIVE'
      AND existing.id <> NEW.id
      AND daterange(existing.effective_from, COALESCE(existing.effective_to + 1, 'infinity'::date), '[)')
          && daterange(NEW.effective_from, COALESCE(NEW.effective_to + 1, 'infinity'::date), '[)')
  ) THEN
    RAISE EXCEPTION 'overlapping ACTIVE rule versions are not allowed' USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_legal_rule_versions_no_overlap ON legal_rule_versions;
CREATE TRIGGER trg_legal_rule_versions_no_overlap
BEFORE INSERT OR UPDATE OF status, effective_from, effective_to, rule_set_id
ON legal_rule_versions FOR EACH ROW EXECUTE FUNCTION prevent_active_rule_version_overlap();

CREATE TABLE IF NOT EXISTS holiday_calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(300) NOT NULL,
  jurisdiction VARCHAR(80) NOT NULL DEFAULT 'TR',
  timezone VARCHAR(80) NOT NULL DEFAULT 'Europe/Istanbul',
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT holiday_calendars_status_ck CHECK (status IN ('DRAFT', 'REVIEWED', 'ACTIVE', 'RETIRED')),
  CONSTRAINT holiday_calendars_timezone_ck CHECK (timezone = 'Europe/Istanbul')
);

CREATE TABLE IF NOT EXISTS holiday_calendar_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id UUID NOT NULL REFERENCES holiday_calendars(id) ON DELETE CASCADE,
  holiday_date DATE NOT NULL,
  name VARCHAR(300) NOT NULL,
  holiday_type VARCHAR(40) NOT NULL,
  is_full_day BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_reference TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT holiday_calendar_days_type_ck CHECK (holiday_type IN (
    'WEEKEND', 'PUBLIC_HOLIDAY', 'ADMINISTRATIVE_HOLIDAY', 'COURT_CLOSURE', 'CUSTOM'
  )),
  CONSTRAINT holiday_calendar_days_uq UNIQUE (calendar_id, holiday_date, name)
);

CREATE INDEX IF NOT EXISTS idx_holiday_calendar_days_date ON holiday_calendar_days (calendar_id, holiday_date);

CREATE TABLE IF NOT EXISTS legal_rate_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_code VARCHAR(120) NOT NULL,
  name VARCHAR(300) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  numeric_value NUMERIC(30,12) NOT NULL,
  unit VARCHAR(40) NOT NULL,
  legal_source_id UUID REFERENCES legal_sources(id) ON DELETE RESTRICT,
  source_reference TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT legal_rate_periods_date_ck CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT legal_rate_periods_value_ck CHECK (numeric_value >= 0),
  CONSTRAINT legal_rate_periods_unit_ck CHECK (unit IN (
    'PERCENT_YEARLY', 'PERCENT_MONTHLY', 'TRY', 'TRY_DAILY', 'MULTIPLIER'
  )),
  CONSTRAINT legal_rate_periods_status_ck CHECK (status IN ('DRAFT', 'REVIEWED', 'ACTIVE', 'RETIRED')),
  CONSTRAINT legal_rate_periods_uq UNIQUE (rate_code, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_legal_rate_periods_resolution
  ON legal_rate_periods (rate_code, status, effective_from, effective_to);

CREATE TABLE IF NOT EXISTS calculation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  organization_id UUID REFERENCES law_firms(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  draft_id UUID REFERENCES legal_drafts(id) ON DELETE SET NULL,
  parent_run_id UUID REFERENCES calculation_runs(id) ON DELETE SET NULL,
  calculation_type VARCHAR(40) NOT NULL,
  rule_set_id UUID REFERENCES legal_rule_sets(id) ON DELETE RESTRICT,
  rule_version_id UUID REFERENCES legal_rule_versions(id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  input_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  rule_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  effective_at DATE NOT NULL,
  idempotency_key VARCHAR(160),
  result_hash CHAR(64),
  calculated_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT calculation_runs_status_ck CHECK (status IN (
    'DRAFT', 'CALCULATED', 'NEEDS_INPUT', 'NEEDS_REVIEW', 'CONFIRMED', 'VOID'
  )),
  CONSTRAINT calculation_runs_scope_ck CHECK (
    (organization_id IS NOT NULL AND owner_user_id IS NULL)
    OR (organization_id IS NULL AND owner_user_id IS NOT NULL)
  ),
  CONSTRAINT calculation_runs_hash_ck CHECK (result_hash IS NULL OR result_hash ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_calculation_runs_idempotency
  ON calculation_runs (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calculation_runs_org ON calculation_runs (organization_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_calculation_runs_owner ON calculation_runs (owner_user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_calculation_runs_case ON calculation_runs (case_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS calculation_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_run_id UUID NOT NULL REFERENCES calculation_runs(id) ON DELETE CASCADE,
  step_number INT NOT NULL,
  step_code VARCHAR(120) NOT NULL,
  title VARCHAR(500) NOT NULL,
  input_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  operation VARCHAR(50) NOT NULL,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  explanation TEXT NOT NULL,
  legal_source_id UUID REFERENCES legal_sources(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT calculation_steps_number_ck CHECK (step_number > 0),
  CONSTRAINT calculation_steps_uq UNIQUE (calculation_run_id, step_number)
);

CREATE TABLE IF NOT EXISTS calculation_warnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_run_id UUID NOT NULL REFERENCES calculation_runs(id) ON DELETE CASCADE,
  warning_code VARCHAR(120) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  field_name VARCHAR(120),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT calculation_warnings_severity_ck CHECK (severity IN ('INFO', 'WARNING', 'HIGH', 'BLOCKING'))
);

CREATE TABLE IF NOT EXISTS calculation_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_run_id UUID NOT NULL REFERENCES calculation_runs(id) ON DELETE CASCADE,
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  draft_id UUID REFERENCES legal_drafts(id) ON DELETE CASCADE,
  draft_version_id UUID REFERENCES legal_draft_versions(id) ON DELETE SET NULL,
  deadline_id UUID REFERENCES deadline_alerts(id) ON DELETE SET NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  relation_type VARCHAR(40) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT calculation_links_type_ck CHECK (relation_type IN (
    'CASE_CONTEXT', 'DRAFT_CONTEXT', 'DRAFT_NOTE', 'DEADLINE', 'TASK', 'INVOICE'
  )),
  CONSTRAINT calculation_links_uq UNIQUE (calculation_run_id, relation_type)
);

ALTER TABLE deadline_alerts ALTER COLUMN firm_id DROP NOT NULL;
ALTER TABLE deadline_alerts ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE deadline_alerts ADD COLUMN IF NOT EXISTS calculation_run_id UUID REFERENCES calculation_runs(id) ON DELETE SET NULL;
ALTER TABLE deadline_alerts ADD COLUMN IF NOT EXISTS rule_version_id UUID REFERENCES legal_rule_versions(id) ON DELETE SET NULL;
ALTER TABLE deadline_alerts ADD COLUMN IF NOT EXISTS calculation_warnings JSONB NOT NULL DEFAULT '[]'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS idx_deadline_alerts_calculation_run
  ON deadline_alerts (calculation_run_id) WHERE calculation_run_id IS NOT NULL;

ALTER TABLE tasks ALTER COLUMN firm_id DROP NOT NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS calculation_run_id UUID REFERENCES calculation_runs(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS rule_version_id UUID REFERENCES legal_rule_versions(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_calculation_run
  ON tasks (calculation_run_id) WHERE calculation_run_id IS NOT NULL;

-- Existing hard-coded calculators are retained as non-production legacy rule drafts.
INSERT INTO legal_rule_sets (rule_code, name, description, calculation_type, status)
VALUES
  ('LEGACY_FRONTEND_TERM', 'Legacy frontend süre hesabı', 'Kaynak doğrulaması bekleyen eski frontend süre hesapları.', 'DEADLINE', 'DRAFT'),
  ('LEGACY_DEADLINE_NOTIFICATION', 'Legacy bildirim deadline kuralları', 'deadlineService içindeki eski sabit gün kuralları.', 'DEADLINE', 'DRAFT'),
  ('LEGACY_FRONTEND_INTEREST', 'Legacy frontend faiz hesabı', 'Kaynak ve tarihsel oran doğrulaması bekleyen eski faiz hesabı.', 'INTEREST', 'DRAFT'),
  ('LEGACY_FRONTEND_EMPLOYMENT', 'Legacy frontend işçilik hesabı', 'Kaynak doğrulaması bekleyen eski işçilik hesapları.', 'SEVERANCE', 'DRAFT'),
  ('LEGACY_FRONTEND_FEE', 'Legacy frontend harç hesabı', 'Tarife doğrulaması bekleyen eski harç ve vekalet hesabı.', 'COURT_FEE', 'DRAFT')
ON CONFLICT (rule_code) DO NOTHING;

INSERT INTO holiday_calendars (code, name, jurisdiction, timezone, status)
VALUES ('TR_GENERAL', 'Türkiye Genel Takvimi', 'TR', 'Europe/Istanbul', 'DRAFT')
ON CONFLICT (code) DO NOTHING;
