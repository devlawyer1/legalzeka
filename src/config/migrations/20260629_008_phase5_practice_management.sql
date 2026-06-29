-- Phase 5 uses the existing firm/case/task/hearing/deadline/finance tables as
-- canonical storage where they already exist, then adds missing relation tables.
-- The migration runner wraps this file in a transaction; keep it idempotent.

DO $$
BEGIN
  IF to_regclass('public.law_firms') IS NULL OR to_regclass('public.cases') IS NULL THEN
    RAISE EXCEPTION 'Phase 5 migration requires the baseline firm and case schema';
  END IF;
END $$;

-- CRM leads: extend the legacy leads table instead of duplicating it.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES law_firms(id) ON DELETE CASCADE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone VARCHAR(60);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS company_name VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source VARCHAR(120);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS status VARCHAR(40) NOT NULL DEFAULT 'NEW';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS legal_domain VARCHAR(120);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_action_at TIMESTAMP;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS converted_client_id UUID;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

UPDATE leads
SET organization_id = firm_id
WHERE organization_id IS NULL AND firm_id IS NOT NULL;

UPDATE leads
SET full_name = COALESCE(full_name, name),
    summary = COALESCE(summary, notes, subject),
    status = CASE
      WHEN status IS NOT NULL AND status <> 'NEW' THEN status
      WHEN stage IN ('ilk_gorusme') THEN 'NEW'
      WHEN stage IN ('teklif_hazirlaniyor', 'pazarlik') THEN 'PROPOSAL'
      WHEN stage IN ('sozlesme_imzalandi') THEN 'WON'
      WHEN stage IN ('iptal') THEN 'LOST'
      ELSE COALESCE(status, 'NEW')
    END
WHERE full_name IS NULL OR summary IS NULL OR status IS NULL OR status = 'NEW';

CREATE INDEX IF NOT EXISTS idx_leads_phase5_org_status ON leads (organization_id, status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_phase5_owner_status ON leads (owner_user_id, status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_phase5_next_action ON leads (organization_id, next_action_at) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES law_firms(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  client_type VARCHAR(30) NOT NULL DEFAULT 'PERSON',
  full_name VARCHAR(255),
  company_name VARCHAR(255),
  identity_reference_encrypted TEXT,
  identity_reference_hash VARCHAR(64),
  tax_reference_encrypted TEXT,
  tax_reference_hash VARCHAR(64),
  email VARCHAR(255),
  phone VARCHAR(60),
  address TEXT,
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  CHECK (client_type IN ('PERSON', 'COMPANY', 'PUBLIC_ENTITY', 'OTHER')),
  CHECK (
    (organization_id IS NOT NULL AND owner_user_id IS NULL)
    OR (organization_id IS NULL AND owner_user_id IS NOT NULL)
  )
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_converted_client_fk') THEN
    ALTER TABLE leads
      ADD CONSTRAINT leads_converted_client_fk
      FOREIGN KEY (converted_client_id) REFERENCES clients(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_clients_org_name ON clients (organization_id, lower(COALESCE(company_name, full_name))) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_clients_owner_name ON clients (owner_user_id, lower(COALESCE(company_name, full_name))) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_clients_org_email ON clients (organization_id, lower(email)) WHERE deleted_at IS NULL AND email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_identity_hash ON clients (organization_id, identity_reference_hash) WHERE deleted_at IS NULL AND identity_reference_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_tax_hash ON clients (organization_id, tax_reference_hash) WHERE deleted_at IS NULL AND tax_reference_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS client_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  title VARCHAR(120),
  email VARCHAR(255),
  phone VARCHAR(60),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_contacts_one_primary
  ON client_contacts (client_id) WHERE is_primary = TRUE AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS matter_clients (
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  relationship_type VARCHAR(60) NOT NULL DEFAULT 'CLIENT',
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (case_id, client_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_matter_clients_one_primary
  ON matter_clients (case_id) WHERE is_primary = TRUE;

CREATE TABLE IF NOT EXISTS conflict_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES law_firms(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  query_terms JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
  result_summary TEXT,
  review_note TEXT,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('PENDING', 'CLEAR', 'POTENTIAL_CONFLICT', 'CONFIRMED_CONFLICT', 'OVERRIDDEN'))
);

CREATE TABLE IF NOT EXISTS conflict_check_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conflict_check_id UUID NOT NULL REFERENCES conflict_checks(id) ON DELETE CASCADE,
  matched_entity_type VARCHAR(60) NOT NULL,
  matched_entity_id UUID,
  matched_name VARCHAR(255),
  match_reason TEXT,
  score NUMERIC(5, 4) NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conflict_checks_org_status ON conflict_checks (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conflict_matches_check ON conflict_check_matches (conflict_check_id, score DESC);

CREATE TABLE IF NOT EXISTS matter_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(80) NOT NULL DEFAULT 'LAWYER',
  billing_role VARCHAR(80),
  hourly_rate_snapshot NUMERIC(14, 2),
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (case_id, user_id)
);

-- Tasks: extend legacy tasks and expose a canonical view.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES law_firms(id) ON DELETE CASCADE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status VARCHAR(40) NOT NULL DEFAULT 'TODO';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_at TIMESTAMP;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_type VARCHAR(60) NOT NULL DEFAULT 'MANUAL';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_id UUID;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

UPDATE tasks
SET organization_id = COALESCE(organization_id, firm_id),
    title = COALESCE(title, baslik),
    description = COALESCE(description, aciklama),
    assigned_to = COALESCE(assigned_to, atanan_id),
    created_by = COALESCE(created_by, atayan_id),
    due_at = COALESCE(due_at, son_tarih),
    priority = CASE
      WHEN upper(COALESCE(priority, oncelik, 'NORMAL')) IN ('LOW','NORMAL','HIGH','URGENT') THEN upper(COALESCE(priority, oncelik, 'NORMAL'))
      WHEN oncelik ILIKE 'D%%' OR oncelik ILIKE 'dusuk%%' THEN 'LOW'
      WHEN oncelik ILIKE 'Y%%' OR oncelik ILIKE 'yuksek%%' THEN 'HIGH'
      WHEN oncelik ILIKE 'A%%' OR oncelik ILIKE 'acil%%' THEN 'URGENT'
      ELSE 'NORMAL'
    END,
    status = CASE
      WHEN upper(COALESCE(status, durum, 'TODO')) IN ('TODO','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED') THEN upper(COALESCE(status, durum, 'TODO'))
      WHEN durum ILIKE 'tamam%%' THEN 'COMPLETED'
      WHEN durum ILIKE 'iptal%%' THEN 'CANCELLED'
      WHEN durum ILIKE 'devam%%' THEN 'IN_PROGRESS'
      ELSE 'TODO'
    END
WHERE organization_id IS NULL OR title IS NULL OR assigned_to IS NULL OR created_by IS NULL OR due_at IS NULL;

UPDATE tasks
SET completed_at = COALESCE(completed_at, updated_at, CURRENT_TIMESTAMP)
WHERE status = 'COMPLETED' AND completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_phase5_case_status ON tasks (case_id, status, due_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_phase5_org_assigned ON tasks (organization_id, assigned_to, status, due_at) WHERE deleted_at IS NULL;

-- Hearings: keep legacy storage, add canonical scheduling/status fields.
ALTER TABLE hearings ADD COLUMN IF NOT EXISTS court VARCHAR(255);
ALTER TABLE hearings ADD COLUMN IF NOT EXISTS hearing_type VARCHAR(120);
ALTER TABLE hearings ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP;
ALTER TABLE hearings ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Istanbul';
ALTER TABLE hearings ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE hearings ADD COLUMN IF NOT EXISTS online_meeting_url TEXT;
ALTER TABLE hearings ADD COLUMN IF NOT EXISTS status VARCHAR(40) NOT NULL DEFAULT 'SCHEDULED';
ALTER TABLE hearings ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE hearings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE hearings ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP;

UPDATE hearings
SET scheduled_at = COALESCE(scheduled_at, hearing_date, tarih_saat),
    court = COALESCE(court, (SELECT mahkeme FROM cases WHERE cases.id = hearings.case_id)),
    status = CASE
      WHEN upper(status) IN ('SCHEDULED','HELD','POSTPONED','CANCELLED') THEN upper(status)
      WHEN cancelled_at IS NOT NULL THEN 'CANCELLED'
      ELSE 'SCHEDULED'
    END
WHERE scheduled_at IS NULL OR court IS NULL;

CREATE INDEX IF NOT EXISTS idx_hearings_phase5_case_date ON hearings (case_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_hearings_phase5_org_date ON hearings (firm_id, scheduled_at);

-- Deadline alerts are the canonical storage; matter_deadlines is a compatibility view.
ALTER TABLE deadline_alerts ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES law_firms(id) ON DELETE CASCADE;
ALTER TABLE deadline_alerts ADD COLUMN IF NOT EXISTS status VARCHAR(40) NOT NULL DEFAULT 'UPCOMING';
ALTER TABLE deadline_alerts ADD COLUMN IF NOT EXISTS confirmed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE deadline_alerts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

UPDATE deadline_alerts
SET organization_id = COALESCE(organization_id, firm_id),
    confirmed = CASE WHEN source = 'calculation' OR calculation_run_id IS NOT NULL THEN TRUE ELSE confirmed END,
    status = CASE
      WHEN is_acknowledged = TRUE THEN 'COMPLETED'
      WHEN deadline_date < CURRENT_TIMESTAMP THEN 'MISSED'
      ELSE COALESCE(status, 'UPCOMING')
    END
WHERE organization_id IS NULL OR status IS NULL;

CREATE INDEX IF NOT EXISTS idx_deadline_phase5_case_due ON deadline_alerts (case_id, deadline_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deadline_phase5_org_status ON deadline_alerts (organization_id, status, deadline_date) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES law_firms(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  description TEXT,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  duration_minutes INTEGER,
  billable BOOLEAN NOT NULL DEFAULT TRUE,
  hourly_rate_snapshot NUMERIC(14, 2),
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'TRY',
  status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'INVOICED', 'VOID')),
  CHECK (duration_minutes IS NULL OR duration_minutes >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_time_entries_one_active_timer
  ON time_entries (user_id) WHERE ended_at IS NULL AND started_at IS NOT NULL AND deleted_at IS NULL AND status = 'DRAFT';
CREATE INDEX IF NOT EXISTS idx_time_entries_case ON time_entries (case_id, status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_time_entries_org ON time_entries (organization_id, status, created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES law_firms(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category VARCHAR(120),
  description TEXT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(14, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'TRY',
  billable BOOLEAN NOT NULL DEFAULT TRUE,
  receipt_document_id UUID REFERENCES case_documents(id) ON DELETE SET NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  CHECK (amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_expenses_case ON expenses (case_id, status, expense_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_org ON expenses (organization_id, status, expense_date DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS fee_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES law_firms(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
  agreement_type VARCHAR(30) NOT NULL DEFAULT 'OTHER',
  currency VARCHAR(3) NOT NULL DEFAULT 'TRY',
  fixed_amount NUMERIC(14, 2),
  hourly_rate NUMERIC(14, 2),
  success_rate NUMERIC(7, 4),
  terms TEXT,
  status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  signed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (agreement_type IN ('FIXED', 'HOURLY', 'MIXED', 'SUCCESS', 'RETAINER', 'OTHER'))
);

-- Finance: extend existing invoice/payment tables and add invoice item lines.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES law_firms(id) ON DELETE CASCADE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'TRY';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subtotal NUMERIC(14, 2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_total NUMERIC(14, 2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS total NUMERIC(14, 2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_total NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS balance NUMERIC(14, 2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS issued_at TIMESTAMP;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

UPDATE invoices
SET organization_id = COALESCE(organization_id, firm_id),
    subtotal = COALESCE(subtotal, amount, total_amount, 0),
    tax_total = COALESCE(tax_total, GREATEST(COALESCE(total_amount, amount, 0) - COALESCE(amount, 0), 0)),
    total = COALESCE(total, total_amount, amount, 0),
    paid_total = COALESCE(paid_total, 0),
    balance = COALESCE(balance, COALESCE(total, total_amount, amount, 0) - COALESCE(paid_total, 0)),
    status = CASE
      WHEN upper(status) IN ('DRAFT','ISSUED','PARTIALLY_PAID','PAID','OVERDUE','CANCELLED') THEN upper(status)
      WHEN lower(status) IN ('paid', 'odendi') THEN 'PAID'
      WHEN lower(status) IN ('overdue', 'gecikmis') THEN 'OVERDUE'
      WHEN lower(status) IN ('cancelled', 'iptal') THEN 'CANCELLED'
      WHEN lower(status) IN ('pending') THEN 'ISSUED'
      ELSE 'DRAFT'
    END
WHERE organization_id IS NULL OR subtotal IS NULL OR tax_total IS NULL OR total IS NULL OR balance IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_invoices_org_invoice_number_unique'
  ) AND NOT EXISTS (
    SELECT 1
    FROM invoices
    WHERE organization_id IS NOT NULL AND invoice_number IS NOT NULL AND deleted_at IS NULL
    GROUP BY organization_id, invoice_number
    HAVING COUNT(*) > 1
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX idx_invoices_org_invoice_number_unique ON invoices (organization_id, invoice_number) WHERE invoice_number IS NOT NULL AND deleted_at IS NULL';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoices_phase5_org_status ON invoices (organization_id, status, due_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_phase5_case ON invoices (case_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  source_type VARCHAR(40) NOT NULL DEFAULT 'CUSTOM',
  source_id UUID,
  description TEXT NOT NULL,
  quantity NUMERIC(14, 4) NOT NULL DEFAULT 1,
  unit_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(7, 4) NOT NULL DEFAULT 0,
  subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (source_type IN ('TIME_ENTRY', 'EXPENSE', 'FIXED_FEE', 'CUSTOM'))
);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES law_firms(id) ON DELETE CASCADE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'TRY';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS reference VARCHAR(255);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS status VARCHAR(40) NOT NULL DEFAULT 'RECORDED';

UPDATE payments
SET organization_id = COALESCE(organization_id, firm_id),
    reference = COALESCE(reference, reference_no),
    status = COALESCE(status, 'RECORDED')
WHERE organization_id IS NULL OR reference IS NULL OR status IS NULL;

CREATE INDEX IF NOT EXISTS idx_payments_phase5_invoice ON payments (invoice_id, payment_date DESC);

CREATE TABLE IF NOT EXISTS client_portal_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'INVITED',
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  invited_at TIMESTAMP,
  invitation_token_hash VARCHAR(64),
  invitation_expires_at TIMESTAMP,
  accepted_at TIMESTAMP,
  revoked_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('INVITED', 'ACTIVE', 'REVOKED', 'EXPIRED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_access_active
  ON client_portal_access (client_id, case_id, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_portal_access_user ON client_portal_access (user_id, status) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS client_portal_shared_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  item_type VARCHAR(40) NOT NULL,
  item_id UUID,
  title VARCHAR(255) NOT NULL,
  shared_by UUID REFERENCES users(id) ON DELETE SET NULL,
  shared_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP,
  CHECK (item_type IN ('DOCUMENT', 'DEADLINE', 'HEARING', 'UPDATE', 'INVOICE', 'MESSAGE'))
);

CREATE INDEX IF NOT EXISTS idx_portal_shared_items_case_client ON client_portal_shared_items (case_id, client_id, item_type) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS matter_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  visibility VARCHAR(40) NOT NULL DEFAULT 'INTERNAL',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (visibility IN ('INTERNAL', 'CLIENT_VISIBLE'))
);

CREATE INDEX IF NOT EXISTS idx_matter_updates_case_visibility ON matter_updates (case_id, visibility, created_at DESC);

CREATE TABLE IF NOT EXISTS portal_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  sender_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  sender_type VARCHAR(20) NOT NULL,
  subject VARCHAR(255),
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  CHECK (sender_type IN ('FIRM', 'CLIENT'))
);

CREATE TABLE IF NOT EXISTS practice_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES law_firms(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  recipient_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(80) NOT NULL,
  channel VARCHAR(30) NOT NULL DEFAULT 'IN_APP',
  title VARCHAR(255) NOT NULL,
  body TEXT,
  entity_type VARCHAR(60),
  entity_id UUID,
  idempotency_key VARCHAR(160) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'QUEUED',
  provider_error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMP,
  read_at TIMESTAMP,
  UNIQUE (idempotency_key, channel)
);

CREATE INDEX IF NOT EXISTS idx_practice_notifications_recipient ON practice_notifications (recipient_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS outbound_email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID REFERENCES practice_notifications(id) ON DELETE CASCADE,
  to_email VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'QUEUED',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS calendar_provider_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES law_firms(id) ON DELETE CASCADE,
  provider VARCHAR(40) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'DISABLED',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, provider)
);

ALTER TABLE firm_templates ADD COLUMN IF NOT EXISTS knowledge_category VARCHAR(80) NOT NULL DEFAULT 'PLEADING_TEMPLATE';
ALTER TABLE firm_templates ADD COLUMN IF NOT EXISTS knowledge_visibility VARCHAR(40) NOT NULL DEFAULT 'ORGANIZATION';
CREATE INDEX IF NOT EXISTS idx_firm_templates_phase5_knowledge ON firm_templates (organization_id, knowledge_category, created_at DESC);

CREATE OR REPLACE VIEW crm_leads AS
SELECT
  id,
  COALESCE(organization_id, firm_id) AS organization_id,
  owner_user_id,
  COALESCE(full_name, name) AS full_name,
  email,
  phone,
  company_name,
  source,
  status,
  legal_domain,
  COALESCE(summary, subject, notes) AS summary,
  assigned_to,
  next_action_at,
  converted_client_id,
  converted_case_id,
  created_by,
  created_at,
  updated_at,
  deleted_at
FROM leads;

CREATE OR REPLACE VIEW practice_tasks AS
SELECT
  id,
  case_id,
  COALESCE(organization_id, firm_id) AS organization_id,
  owner_user_id,
  COALESCE(title, baslik) AS title,
  COALESCE(description, aciklama) AS description,
  status,
  priority,
  COALESCE(assigned_to, atanan_id) AS assigned_to,
  COALESCE(created_by, atayan_id) AS created_by,
  COALESCE(due_at, son_tarih) AS due_at,
  completed_at,
  source_type,
  source_id,
  estimated_minutes,
  created_at,
  updated_at,
  deleted_at
FROM tasks;

CREATE OR REPLACE VIEW matter_deadlines AS
SELECT
  id,
  case_id,
  calculation_run_id,
  rule_version_id,
  title,
  deadline_date AS due_at,
  CASE
    WHEN status NOT IN ('COMPLETED', 'CANCELLED') AND deadline_date < CURRENT_TIMESTAMP THEN 'MISSED'
    ELSE status
  END AS status,
  confirmed,
  created_by,
  created_at,
  updated_at
FROM deadline_alerts
WHERE deleted_at IS NULL;
