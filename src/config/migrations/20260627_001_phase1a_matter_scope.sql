-- The migration runner executes this file inside a transaction while holding
-- a PostgreSQL advisory lock. Keep every statement idempotent for safe retries.

DO $$
BEGIN
  IF to_regclass('public.cases') IS NULL THEN
    RAISE EXCEPTION 'Phase 1A migration requires the baseline cases table';
  END IF;
END $$;

ALTER TABLE cases ADD COLUMN IF NOT EXISTS scope_type VARCHAR(20);
ALTER TABLE cases ADD COLUMN IF NOT EXISTS owner_user_id UUID;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS law_firm_id UUID;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cases WHERE scope_type IS NULL AND firm_id IS NULL) THEN
    RAISE EXCEPTION
      'Phase 1A cannot infer scope for legacy cases with a null firm_id; repair those rows before migrating';
  END IF;
END $$;

UPDATE cases
SET scope_type = 'ORGANIZATION',
    law_firm_id = firm_id
WHERE scope_type IS NULL
  AND firm_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cases
    WHERE scope_type IS NULL
       OR scope_type NOT IN ('PERSONAL', 'ORGANIZATION')
       OR (scope_type = 'PERSONAL' AND (owner_user_id IS NULL OR law_firm_id IS NOT NULL OR firm_id IS NOT NULL))
       OR (scope_type = 'ORGANIZATION' AND (law_firm_id IS NULL OR firm_id IS DISTINCT FROM law_firm_id))
  ) THEN
    RAISE EXCEPTION 'Phase 1A scope backfill produced invalid case ownership rows';
  END IF;
END $$;

ALTER TABLE cases ALTER COLUMN firm_id DROP NOT NULL;
ALTER TABLE cases ALTER COLUMN scope_type SET DEFAULT 'ORGANIZATION';
ALTER TABLE cases ALTER COLUMN scope_type SET NOT NULL;
ALTER TABLE case_documents ALTER COLUMN firm_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cases_owner_user_fk') THEN
    ALTER TABLE cases
      ADD CONSTRAINT cases_owner_user_fk
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cases_law_firm_fk') THEN
    ALTER TABLE cases
      ADD CONSTRAINT cases_law_firm_fk
      FOREIGN KEY (law_firm_id) REFERENCES law_firms(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cases_scope_type_ck') THEN
    ALTER TABLE cases
      ADD CONSTRAINT cases_scope_type_ck
      CHECK (scope_type IN ('PERSONAL', 'ORGANIZATION'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cases_scope_ownership_ck') THEN
    ALTER TABLE cases
      ADD CONSTRAINT cases_scope_ownership_ck
      CHECK (
        (scope_type = 'PERSONAL'
          AND owner_user_id IS NOT NULL
          AND law_firm_id IS NULL
          AND firm_id IS NULL)
        OR
        (scope_type = 'ORGANIZATION'
          AND law_firm_id IS NOT NULL
          AND firm_id IS NOT DISTINCT FROM law_firm_id)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cases_firm_compatibility_ck') THEN
    ALTER TABLE cases
      ADD CONSTRAINT cases_firm_compatibility_ck
      CHECK (firm_id IS NOT DISTINCT FROM law_firm_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION sync_case_law_firm_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.scope_type = 'ORGANIZATION' THEN
    IF NEW.law_firm_id IS NULL AND NEW.firm_id IS NOT NULL THEN
      NEW.law_firm_id := NEW.firm_id;
    ELSIF NEW.firm_id IS NULL AND NEW.law_firm_id IS NOT NULL THEN
      NEW.firm_id := NEW.law_firm_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cases_sync_law_firm ON cases;
CREATE TRIGGER trg_cases_sync_law_firm
BEFORE INSERT OR UPDATE OF firm_id, law_firm_id, scope_type ON cases
FOR EACH ROW EXECUTE FUNCTION sync_case_law_firm_columns();

CREATE INDEX IF NOT EXISTS idx_cases_scope_type
  ON cases (scope_type);
CREATE INDEX IF NOT EXISTS idx_cases_owner_scope_active
  ON cases (owner_user_id, scope_type, is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cases_law_firm_scope_active
  ON cases (law_firm_id, scope_type, is_active, created_at DESC);

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS case_id UUID;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS document_id UUID;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address VARCHAR(64);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS request_id VARCHAR(128);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS success BOOLEAN NOT NULL DEFAULT TRUE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_case_fk') THEN
    ALTER TABLE audit_logs
      ADD CONSTRAINT audit_logs_case_fk
      FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_document_fk') THEN
    ALTER TABLE audit_logs
      ADD CONSTRAINT audit_logs_document_fk
      FOREIGN KEY (document_id) REFERENCES case_documents(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_logs_case_date
  ON audit_logs (case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id
  ON audit_logs (request_id);
