-- ============================================================
-- Emsal Atlası - Veritabanı Şeması (PostgreSQL Schema)
-- ============================================================

-- PostgreSQL'de CREATE DATABASE IF NOT EXISTS doğrudan çalışmaz, 
-- veritabanının halihazırda var olduğu varsayılmıştır (Render vb. platformlarda zaten verilir).

-- ============================================================
-- 1. Roles (Roller) Tablosu
-- ============================================================
CREATE TABLE IF NOT EXISTS Roles (
  id SERIAL PRIMARY KEY,
  role_name VARCHAR(50) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 2. SubscriptionPlans (Abonelik Planları) Tablosu
-- ============================================================
CREATE TABLE IF NOT EXISTS SubscriptionPlans (
  id SERIAL PRIMARY KEY,
  plan_name VARCHAR(100) NOT NULL UNIQUE,
  max_search_limit INT NOT NULL DEFAULT 10,
  price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  duration_days INT NOT NULL DEFAULT 7,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 3. Users (Kullanıcılar) Tablosu
-- ============================================================
CREATE TABLE IF NOT EXISTS Users (
  id CHAR(36) PRIMARY KEY,
  role_id INT NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  theme_preference VARCHAR(20) DEFAULT 'light',
  is_active SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES Roles(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ============================================================
-- 4. UserSubscriptions (Kullanıcı Abonelikleri) Tablosu
-- ============================================================
CREATE TABLE IF NOT EXISTS UserSubscriptions (
  id SERIAL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  plan_id INT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES SubscriptionPlans(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ============================================================
-- 5. SearchHistory (Kullanıcı Arama Geçmişi) Tablosu
-- ============================================================
CREATE TABLE IF NOT EXISTS SearchHistory (
  id SERIAL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  query VARCHAR(500) NOT NULL,
  search_type VARCHAR(20) NOT NULL DEFAULT 'keyword' CHECK (search_type IN ('keyword', 'semantic')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- ============================================================
-- 6. GuestSearches (Misafir Arama Kotaları) Tablosu
-- ============================================================
CREATE TABLE IF NOT EXISTS GuestSearches (
  ip_address VARCHAR(45) PRIMARY KEY,
  search_count INT NOT NULL DEFAULT 1,
  last_search_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 7. Conversations (Sohbetler) Tablosu
-- ============================================================
CREATE TABLE IF NOT EXISTS Conversations (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) DEFAULT NULL,
  guest_ip VARCHAR(45) DEFAULT NULL,
  title VARCHAR(255) DEFAULT 'Yeni Sohbet',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- ============================================================
-- 8. Messages (Mesajlar) Tablosu
-- ============================================================
CREATE TABLE IF NOT EXISTS Messages (
  id SERIAL PRIMARY KEY,
  conversation_id CHAR(36) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  tool_used VARCHAR(50) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES Conversations(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- ============================================================
-- 9. Varsayılan Veriler (Seed Data)
-- ============================================================

-- Roller
INSERT INTO Roles (role_name) VALUES ('Admin'), ('Users') ON CONFLICT (role_name) DO NOTHING;

-- Abonelik Planları
INSERT INTO SubscriptionPlans (plan_name, max_search_limit, price, duration_days)
VALUES
  ('Ücretsiz Deneme', 10, 0.00, 7),
  ('Başlangıç', 100, 99.90, 30),
  ('Profesyonel', 500, 249.90, 30),
  ('Kurumsal', -1, 499.90, 30)
ON CONFLICT (plan_name) DO NOTHING;
