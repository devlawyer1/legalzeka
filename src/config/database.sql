-- ============================================================
-- Emsal Atlası - Veritabanı Şeması (Database Schema)
-- ============================================================

CREATE DATABASE IF NOT EXISTS emsal_atlasi
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE emsal_atlasi;

-- ============================================================
-- 1. Roles (Roller) Tablosu
-- ============================================================
CREATE TABLE IF NOT EXISTS Roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  role_name VARCHAR(50) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 2. SubscriptionPlans (Abonelik Planları) Tablosu
-- ============================================================
CREATE TABLE IF NOT EXISTS SubscriptionPlans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  plan_name VARCHAR(100) NOT NULL UNIQUE,
  max_search_limit INT NOT NULL DEFAULT 10,
  price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  duration_days INT NOT NULL DEFAULT 7,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES Roles(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. UserSubscriptions (Kullanıcı Abonelikleri) Tablosu
-- ============================================================
CREATE TABLE IF NOT EXISTS UserSubscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  plan_id INT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES SubscriptionPlans(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 5. SearchHistory (Kullanıcı Arama Geçmişi) Tablosu
-- ============================================================
CREATE TABLE IF NOT EXISTS SearchHistory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  query VARCHAR(500) NOT NULL,
  search_type ENUM('keyword', 'semantic') NOT NULL DEFAULT 'keyword',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 6. GuestSearches (Misafir Arama Kotaları) Tablosu
-- ============================================================
CREATE TABLE IF NOT EXISTS GuestSearches (
  ip_address VARCHAR(45) PRIMARY KEY,
  search_count INT NOT NULL DEFAULT 1,
  last_search_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 7. Conversations (Sohbetler) Tablosu
-- ============================================================
CREATE TABLE IF NOT EXISTS Conversations (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) DEFAULT NULL,
  guest_ip VARCHAR(45) DEFAULT NULL,
  title VARCHAR(255) DEFAULT 'Yeni Sohbet',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 8. Messages (Mesajlar) Tablosu
-- ============================================================
CREATE TABLE IF NOT EXISTS Messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id CHAR(36) NOT NULL,
  role ENUM('user', 'assistant', 'system') NOT NULL,
  content TEXT NOT NULL,
  tool_used VARCHAR(50) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES Conversations(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 9. Varsayılan Veriler (Seed Data)
-- ============================================================

-- Roller
INSERT IGNORE INTO Roles (role_name) VALUES ('Admin'), ('Users');

-- Abonelik Planları
INSERT IGNORE INTO SubscriptionPlans (plan_name, max_search_limit, price, duration_days)
VALUES
  ('Ücretsiz Deneme', 10, 0.00, 7),
  ('Başlangıç', 100, 99.90, 30),
  ('Profesyonel', 500, 249.90, 30),
  ('Kurumsal', -1, 499.90, 30);
