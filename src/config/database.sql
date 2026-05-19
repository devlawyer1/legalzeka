-- ============================================================
-- Emsal Atlası - Veritabanı Şeması (PostgreSQL / Supabase)
-- ============================================================

-- ÖNCEKİ TABLOLARI TEMİZLE (Eğer çakışma varsa diye)
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS guest_searches CASCADE;
DROP TABLE IF EXISTS search_history CASCADE;
DROP TABLE IF EXISTS user_subscriptions CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS subscription_plans CASCADE;
DROP TABLE IF EXISTS roles CASCADE;

-- ============================================================
-- 1. roles Tablosu
-- ============================================================
CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  role_name VARCHAR(50) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 2. subscription_plans Tablosu
-- ============================================================
CREATE TABLE subscription_plans (
  id SERIAL PRIMARY KEY,
  plan_name VARCHAR(100) NOT NULL UNIQUE,
  max_search_limit INT NOT NULL DEFAULT 10,
  price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  duration_days INT NOT NULL DEFAULT 7,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 3. users Tablosu
-- ============================================================
CREATE TABLE users (
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
-- 4. user_subscriptions Tablosu
-- ============================================================
CREATE TABLE user_subscriptions (
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
CREATE TABLE search_history (
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
CREATE TABLE guest_searches (
  ip_address VARCHAR(45) PRIMARY KEY,
  search_count INT NOT NULL DEFAULT 1,
  last_search_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 7. conversations Tablosu
-- ============================================================
CREATE TABLE conversations (
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
CREATE TABLE messages (
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
INSERT INTO subscription_plans (plan_name, max_search_limit, price, duration_days)
VALUES
  ('Ücretsiz Deneme', 10, 0.00, 7),
  ('Başlangıç', 100, 99.90, 30),
  ('Profesyonel', 500, 249.90, 30),
  ('Kurumsal', -1, 499.90, 30)
ON CONFLICT (plan_name) DO NOTHING;

-- ============================================================
-- 10. Emsal Kararlar (VectorDB) Tablosu
-- ============================================================
CREATE EXTENSION IF NOT EXISTS vector;

DROP TABLE IF EXISTS emsal_kararlar CASCADE;

CREATE TABLE emsal_kararlar (
  id SERIAL PRIMARY KEY,
  karar_no VARCHAR(100),
  karar_yili INT,
  mahkeme VARCHAR(255),
  konu TEXT,
  ozet TEXT,
  metin TEXT,
  anahtar_kelimeler TEXT[],
  embedding vector(384),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Metin araması için indeks (Full-Text Search)
CREATE INDEX idx_emsal_kararlar_fts ON emsal_kararlar USING GIN (to_tsvector('turkish', coalesce(konu, '') || ' ' || coalesce(ozet, '') || ' ' || coalesce(metin, '')));
