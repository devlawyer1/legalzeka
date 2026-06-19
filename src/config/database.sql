-- ============================================================
-- Emsal Atlası - Veritabanı Şeması (PostgreSQL / Supabase)
-- ============================================================

-- Bu migration artik idempotent calisir. Reset/temiz kurulum gerekiyorsa
-- ayrica kontrollu bir maintenance script kullanilmali; normal migrate veriyi silmez.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1. roles Tablosu
-- ============================================================
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  role_name VARCHAR(50) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 2. subscription_plans Tablosu
-- ============================================================
CREATE TABLE IF NOT EXISTS subscription_plans (
  id SERIAL PRIMARY KEY,
  plan_name VARCHAR(100) NOT NULL UNIQUE,
  max_search_limit INT NOT NULL DEFAULT 10,
  max_seats INT NOT NULL DEFAULT 1,
  price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  duration_days INT NOT NULL DEFAULT 7,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 3. users Tablosu
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  role_id INT NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  theme_preference VARCHAR(20) DEFAULT 'light',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ============================================================
-- 3b. law_firms Tablosu (Hukuk Büroları)
-- ============================================================
CREATE TABLE IF NOT EXISTS law_firms (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  tax_number VARCHAR(50),
  address TEXT,
  phone VARCHAR(30),
  owner_id UUID NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- ============================================================
-- 3c. firm_users Tablosu (Büro Üyeleri / Seats)
-- ============================================================
CREATE TABLE IF NOT EXISTS firm_users (
  id SERIAL PRIMARY KEY,
  firm_id UUID NOT NULL,
  user_id UUID NOT NULL,
  firm_role VARCHAR(30) NOT NULL DEFAULT 'avukat' CHECK (firm_role IN ('kurucu', 'ortak', 'avukat', 'stajyer', 'asistan')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (firm_id) REFERENCES law_firms(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE(firm_id, user_id)
);

-- ============================================================
-- 3d. firm_invitations Tablosu (Büro Davetleri)
-- ============================================================
CREATE TABLE IF NOT EXISTS firm_invitations (
  id UUID PRIMARY KEY,
  firm_id UUID NOT NULL,
  email VARCHAR(255) NOT NULL,
  firm_role VARCHAR(30) NOT NULL DEFAULT 'avukat',
  invited_by UUID NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (firm_id) REFERENCES law_firms(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- ============================================================
-- 4. user_subscriptions Tablosu
-- ============================================================
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  plan_id INT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ============================================================
-- 5. search_history Tablosu
-- ============================================================
CREATE TABLE IF NOT EXISTS search_history (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  query VARCHAR(500) NOT NULL,
  search_type VARCHAR(20) NOT NULL DEFAULT 'keyword' CHECK (search_type IN ('keyword', 'semantic')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- ============================================================
-- 6. guest_searches Tablosu
-- ============================================================
CREATE TABLE IF NOT EXISTS guest_searches (
  ip_address VARCHAR(45) PRIMARY KEY,
  search_count INT NOT NULL DEFAULT 1,
  last_search_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 7. conversations Tablosu
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY,
  user_id UUID DEFAULT NULL,
  guest_ip VARCHAR(45) DEFAULT NULL,
  title VARCHAR(255) DEFAULT 'Yeni Sohbet',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- ============================================================
-- 8. messages Tablosu
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  conversation_id UUID NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  tool_used VARCHAR(50) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- ============================================================
-- 9. Varsayılan Veriler (Seed Data)
-- ============================================================

-- Roller
INSERT INTO roles (role_name) VALUES ('Admin'), ('Users') ON CONFLICT (role_name) DO NOTHING;

-- Abonelik Planları
INSERT INTO subscription_plans (plan_name, max_search_limit, max_seats, price, duration_days)
VALUES
  ('Ücretsiz Deneme', 10, 1, 0.00, 7),
  ('Başlangıç', 100, 3, 99.90, 30),
  ('Profesyonel', 500, 10, 249.90, 30),
  ('Kurumsal', -1, 50, 499.90, 30)
ON CONFLICT (plan_name) DO NOTHING;

-- ============================================================
-- 10. Emsal Kararlar (VectorDB) Tablosu
-- ============================================================
CREATE TABLE IF NOT EXISTS emsal_kararlar (
  id SERIAL PRIMARY KEY,
  karar_no VARCHAR(100),
  karar_yili INT,
  mahkeme VARCHAR(255),
  hukuk_dali VARCHAR(255) DEFAULT 'Genel Hukuk',
  konu TEXT,
  ozet TEXT,
  metin TEXT,
  anahtar_kelimeler TEXT[],
  source VARCHAR(80) DEFAULT 'local',
  source_document_id TEXT,
  source_url TEXT,
  verification_status VARCHAR(40) DEFAULT 'indexed',
  fetched_at TIMESTAMP,
  raw_payload JSONB,
  embedding vector(384),
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('turkish', coalesce(konu, '') || ' ' || coalesce(ozet, '') || ' ' || coalesce(metin, ''))
  ) STORED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE emsal_kararlar ADD COLUMN IF NOT EXISTS source VARCHAR(80) DEFAULT 'local';
ALTER TABLE emsal_kararlar ADD COLUMN IF NOT EXISTS source_document_id TEXT;
ALTER TABLE emsal_kararlar ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE emsal_kararlar ADD COLUMN IF NOT EXISTS verification_status VARCHAR(40) DEFAULT 'indexed';
ALTER TABLE emsal_kararlar ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMP;
ALTER TABLE emsal_kararlar ADD COLUMN IF NOT EXISTS raw_payload JSONB;

-- Metin araması için indeks (Full-Text Search)
CREATE INDEX IF NOT EXISTS idx_emsal_kararlar_fts ON emsal_kararlar USING GIN (search_vector);

-- Semantik arama için HNSW Vektör İndeksi (Kosinüs benzerliği optimizasyonu)
CREATE INDEX IF NOT EXISTS idx_emsal_kararlar_embedding ON emsal_kararlar USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_emsal_kararlar_source ON emsal_kararlar (source, fetched_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_emsal_kararlar_source_document
  ON emsal_kararlar (source, source_document_id)
  WHERE source_document_id IS NOT NULL;

-- Eski demo/mock veriler arama sonuçlarında gerçek emsal gibi görünmemeli.
DELETE FROM emsal_kararlar
WHERE coalesce(ozet, '') ILIKE '%varyasyon%'
   OR coalesce(metin, '') ILIKE '%varyasyon%'
   OR source = 'demo';

-- ============================================================
-- Mod�l 2: Dava, ��, Duru�ma ve �leti�im Tablolar�
-- ============================================================

CREATE TABLE IF NOT EXISTS cases (
  id UUID PRIMARY KEY,
  firm_id UUID NOT NULL REFERENCES law_firms(id) ON DELETE CASCADE,
  esas_no VARCHAR(100),
  mahkeme VARCHAR(255),
  konu VARCHAR(255),
  taraf_davaci VARCHAR(255),
  taraf_davali VARCHAR(255),
  durum VARCHAR(50) DEFAULT 'A��k',
  atanan_avukat_id UUID REFERENCES users(id) ON DELETE SET NULL,
  notlar TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hearings (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  firm_id UUID NOT NULL REFERENCES law_firms(id) ON DELETE CASCADE,
  tarih_saat TIMESTAMP NOT NULL,
  katilacak_avukat_id UUID REFERENCES users(id) ON DELETE SET NULL,
  notlar TEXT,
  hatirlatici BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS case_documents (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  firm_id UUID NOT NULL REFERENCES law_firms(id) ON DELETE CASCADE,
  document_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY,
  firm_id UUID NOT NULL REFERENCES law_firms(id) ON DELETE CASCADE,
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  atayan_id UUID NOT NULL REFERENCES users(id),
  atanan_id UUID REFERENCES users(id),
  baslik VARCHAR(255) NOT NULL,
  aciklama TEXT,
  son_tarih TIMESTAMP,
  oncelik VARCHAR(20) DEFAULT 'Orta',
  durum VARCHAR(50) DEFAULT 'Beklemede',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS internal_messages (
  id UUID PRIMARY KEY,
  firm_id UUID NOT NULL REFERENCES law_firms(id) ON DELETE CASCADE,
  gonderen_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  icerik TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS petitions (
    id UUID PRIMARY KEY,
    case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
    firm_id UUID REFERENCES law_firms(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL, -- Örn: Davacı Dilekçesi, Cevap Dilekçesi, Beyan, vb.
    content TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS petition_comparisons (
    id UUID PRIMARY KEY,
    case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
    firm_id UUID REFERENCES law_firms(id) ON DELETE CASCADE,
    petition1_id UUID REFERENCES petitions(id) ON DELETE CASCADE,
    petition2_id UUID REFERENCES petitions(id) ON DELETE CASCADE,
    ai_report TEXT NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Modul 6: UYAP Entegrasyonu Tablolari
-- ============================================================

CREATE TABLE IF NOT EXISTS uyap_sync_logs (
  id UUID PRIMARY KEY,
  firm_id UUID NOT NULL REFERENCES law_firms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sync_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed', 'partial')),
  cases_synced INTEGER DEFAULT 0,
  hearings_synced INTEGER DEFAULT 0,
  notifications_synced INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS uyap_notifications (
  id UUID PRIMARY KEY,
  firm_id UUID NOT NULL REFERENCES law_firms(id) ON DELETE CASCADE,
  case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
  uyap_id VARCHAR(100),
  title VARCHAR(500) NOT NULL,
  content TEXT,
  notification_type VARCHAR(100),
  notification_date TIMESTAMP,
  is_read BOOLEAN DEFAULT false,
  raw_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Faz 2: Kurumsal Sablon Hafizasi Tablolari
-- ============================================================

CREATE TABLE IF NOT EXISTS firm_templates (
    id UUID PRIMARY KEY,
    firm_id UUID NOT NULL REFERENCES law_firms(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    template_type VARCHAR(100), -- orn: İşe İade, Boşanma, Cevap Dilekçesi
    tags TEXT[],
    embedding vector(384),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE petitions ADD COLUMN IF NOT EXISTS control_report JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_firm_templates_embedding ON firm_templates USING hnsw (embedding vector_cosine_ops);


-- ============================================================
-- Modul: Legal Workflow Uzman Ajan Profilleri
-- ============================================================

CREATE TABLE IF NOT EXISTS legal_workflow_profiles (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    firm_id UUID REFERENCES law_firms(id) ON DELETE SET NULL,
    role_focus VARCHAR(50) NOT NULL DEFAULT 'avukat',
    practice_areas TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    jurisdiction_focus TEXT NOT NULL DEFAULT 'Türkiye',
    house_style TEXT,
    risk_posture VARCHAR(50) NOT NULL DEFAULT 'dengeli',
    review_policy TEXT,
    source_preferences TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);


-- ============================================================
-- Modul: Law Versions Vector Eklentisi
-- ============================================================
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS law_versions (
  id SERIAL PRIMARY KEY,
  law_number VARCHAR(50) NOT NULL,
  law_name VARCHAR(500) NOT NULL,
  article_number VARCHAR(50),
  article_title VARCHAR(500),
  article_text TEXT NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  source_url TEXT,
  embedding vector(384),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_law_number ON law_versions(law_number);
CREATE INDEX IF NOT EXISTS idx_law_article ON law_versions(law_number, article_number);
CREATE INDEX IF NOT EXISTS idx_law_temporal ON law_versions(law_number, article_number, effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_law_versions_embedding ON law_versions USING hnsw (embedding vector_cosine_ops);

-- ============================================================
-- Legal Zeka Avukat/Buro Entegrasyon Katmani
-- Idempotent app schema additions for phases 0-6.
-- ============================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(80) PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS max_cases INT NOT NULL DEFAULT 25;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS max_document_analyses INT NOT NULL DEFAULT 25;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS max_workflows INT NOT NULL DEFAULT 25;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS client_portal_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS audit_logs_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS private_knowledge_base_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS feature_entitlements JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE subscription_plans
SET
  max_cases = CASE plan_name
    WHEN 'Ucretsiz Deneme' THEN 3
    WHEN 'Ücretsiz Deneme' THEN 3
    WHEN 'Baslangic' THEN 25
    WHEN 'Başlangıç' THEN 25
    WHEN 'Profesyonel' THEN 150
    WHEN 'Kurumsal' THEN -1
    ELSE max_cases
  END,
  max_document_analyses = CASE plan_name
    WHEN 'Ucretsiz Deneme' THEN 5
    WHEN 'Ücretsiz Deneme' THEN 5
    WHEN 'Baslangic' THEN 50
    WHEN 'Başlangıç' THEN 50
    WHEN 'Profesyonel' THEN 500
    WHEN 'Kurumsal' THEN -1
    ELSE max_document_analyses
  END,
  max_workflows = CASE plan_name
    WHEN 'Ucretsiz Deneme' THEN 5
    WHEN 'Ücretsiz Deneme' THEN 5
    WHEN 'Baslangic' THEN 50
    WHEN 'Başlangıç' THEN 50
    WHEN 'Profesyonel' THEN 500
    WHEN 'Kurumsal' THEN -1
    ELSE max_workflows
  END,
  client_portal_enabled = CASE WHEN plan_name IN ('Profesyonel', 'Kurumsal') THEN true ELSE client_portal_enabled END,
  audit_logs_enabled = CASE WHEN plan_name IN ('Profesyonel', 'Kurumsal') THEN true ELSE audit_logs_enabled END,
  private_knowledge_base_enabled = CASE WHEN plan_name IN ('Profesyonel', 'Kurumsal') THEN true ELSE private_knowledge_base_enabled END,
  feature_entitlements = jsonb_build_object(
    'maxSeats', max_seats,
    'maxCases', CASE
      WHEN plan_name IN ('Ucretsiz Deneme', 'Ücretsiz Deneme') THEN 3
      WHEN plan_name IN ('Baslangic', 'Başlangıç') THEN 25
      WHEN plan_name = 'Profesyonel' THEN 150
      WHEN plan_name = 'Kurumsal' THEN -1
      ELSE max_cases
    END,
    'maxDocumentAnalyses', CASE
      WHEN plan_name IN ('Ucretsiz Deneme', 'Ücretsiz Deneme') THEN 5
      WHEN plan_name IN ('Baslangic', 'Başlangıç') THEN 50
      WHEN plan_name = 'Profesyonel' THEN 500
      WHEN plan_name = 'Kurumsal' THEN -1
      ELSE max_document_analyses
    END,
    'maxWorkflows', CASE
      WHEN plan_name IN ('Ucretsiz Deneme', 'Ücretsiz Deneme') THEN 5
      WHEN plan_name IN ('Baslangic', 'Başlangıç') THEN 50
      WHEN plan_name = 'Profesyonel' THEN 500
      WHEN plan_name = 'Kurumsal' THEN -1
      ELSE max_workflows
    END,
    'clientPortal', plan_name IN ('Profesyonel', 'Kurumsal'),
    'auditLogs', plan_name IN ('Profesyonel', 'Kurumsal'),
    'privateKnowledgeBase', plan_name IN ('Profesyonel', 'Kurumsal')
  )
WHERE feature_entitlements = '{}'::jsonb OR feature_entitlements IS NULL;

ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS file_name VARCHAR(255);
ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS document_type VARCHAR(100) DEFAULT 'Genel';
ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS extracted_text TEXT;
ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS analysis_status VARCHAR(30) DEFAULT 'pending';
ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS analysis_summary TEXT;
ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMP;

ALTER TABLE hearings ADD COLUMN IF NOT EXISTS hearing_date TIMESTAMP;
ALTER TABLE hearings ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE hearings ADD COLUMN IF NOT EXISTS result TEXT;
ALTER TABLE uyap_notifications ADD COLUMN IF NOT EXISTS case_ref VARCHAR(120);

CREATE TABLE IF NOT EXISTS deadline_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES law_firms(id) ON DELETE CASCADE,
  case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  deadline_date TIMESTAMP NOT NULL,
  alert_type VARCHAR(50) DEFAULT 'genel',
  priority VARCHAR(20) DEFAULT 'normal',
  is_acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by UUID REFERENCES users(id),
  acknowledged_at TIMESTAMP,
  source VARCHAR(50) DEFAULT 'manual',
  source_ref VARCHAR(255),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_deadline_firm ON deadline_alerts(firm_id);
CREATE INDEX IF NOT EXISTS idx_deadline_date ON deadline_alerts(deadline_date);
CREATE INDEX IF NOT EXISTS idx_deadline_active ON deadline_alerts(firm_id, is_acknowledged, deadline_date);

CREATE TABLE IF NOT EXISTS case_document_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES law_firms(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES case_documents(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  extracted_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  UNIQUE(document_id)
);

CREATE INDEX IF NOT EXISTS idx_case_document_analyses_case ON case_document_analyses(case_id);
CREATE INDEX IF NOT EXISTS idx_case_document_analyses_firm ON case_document_analyses(firm_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID REFERENCES law_firms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(120) NOT NULL,
  entity_type VARCHAR(80),
  entity_id VARCHAR(120),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_firm_date ON audit_logs(firm_id, created_at DESC);

CREATE TABLE IF NOT EXISTS collections (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS collection_items (
  id UUID PRIMARY KEY,
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  emsal_karar_id INT NOT NULL REFERENCES emsal_kararlar(id) ON DELETE CASCADE,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(collection_id, emsal_karar_id)
);

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY,
  firm_id UUID NOT NULL REFERENCES law_firms(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  contact_info TEXT,
  subject VARCHAR(255),
  estimated_value DECIMAL(12, 2) DEFAULT 0.00,
  stage VARCHAR(50) NOT NULL DEFAULT 'ilk_gorusme',
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE leads ADD COLUMN IF NOT EXISTS converted_case_id UUID REFERENCES cases(id) ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS converted_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS proposals (
  id UUID PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  firm_id UUID NOT NULL REFERENCES law_firms(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  pdf_url VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'taslak',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID REFERENCES law_firms(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
  client_name VARCHAR(255) NOT NULL,
  invoice_number VARCHAR(100),
  amount DECIMAL(12, 2) NOT NULL,
  tax_rate DECIMAL(5, 2) DEFAULT 20.00,
  total_amount DECIMAL(12, 2) NOT NULL,
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  notes TEXT,
  is_recurring BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID REFERENCES law_firms(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL,
  payment_date DATE NOT NULL,
  payment_method VARCHAR(100),
  reference_no VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS corporate_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID REFERENCES law_firms(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  parent_id UUID REFERENCES corporate_entities(id) ON DELETE SET NULL,
  type VARCHAR(100),
  share_percentage DECIMAL(5, 2),
  tax_number VARCHAR(100),
  industry VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS client_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID REFERENCES law_firms(id) ON DELETE CASCADE,
  client_name VARCHAR(255) NOT NULL,
  is_vip BOOLEAN DEFAULT false,
  subject VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'open',
  priority VARCHAR(50) DEFAULT 'medium',
  due_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO schema_migrations (version)
VALUES ('2026-06-18-legalzeka-avukat-buro-core')
ON CONFLICT (version) DO NOTHING;

