const { pool } = require('../config/db');

async function setupSimulationDb() {
  console.log('🔄 Simülasyon modülü veritabanı tabloları oluşturuluyor...');
  
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS simulation_sessions (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        case_type VARCHAR(100) NOT NULL,
        case_scenario TEXT,
        current_stage INTEGER DEFAULT 1, -- 1: Müvekkil, 2: Karşı Avukat, 3: Hakim Değerlendirmesi
        score INTEGER DEFAULT null,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS simulation_messages (
        id SERIAL PRIMARY KEY,
        session_id INTEGER NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
        sender VARCHAR(50) NOT NULL, -- 'user', 'ai_client', 'ai_lawyer', 'ai_judge'
        stage INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS simulation_evaluations (
        id SERIAL PRIMARY KEY,
        session_id INTEGER NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
        feedback_text TEXT,
        missed_questions TEXT,
        missed_precedents TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- İndeksler
      CREATE INDEX IF NOT EXISTS idx_sim_session_user ON simulation_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sim_messages_session ON simulation_messages(session_id);
    `);

    console.log('✅ Simülasyon tabloları başarıyla oluşturuldu.');
  } catch (error) {
    console.error('❌ Tablo oluşturma hatası:', error.message);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  setupSimulationDb().then(() => process.exit(0));
}

module.exports = { setupSimulationDb };
