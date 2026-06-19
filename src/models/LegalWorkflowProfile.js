const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/db');

const DEFAULT_PROFILE = {
  roleFocus: 'avukat',
  practiceAreas: ['Genel hukuk'],
  jurisdictionFocus: 'Türkiye',
  houseStyle: 'Resmi, kaynaklı, kısa özet + uygulanabilir kontrol listesi',
  riskPosture: 'dengeli',
  reviewPolicy: 'Tüm çıktılar taslaktır; kaynak ve vakıa doğrulaması yapılmadan kullanılmaz.',
  sourcePreferences: ['Bedesten', 'UYAP Emsal', 'Mevzuat Bilgi Sistemi', 'Resmi Gazete'],
};

class LegalWorkflowProfile {
  static async ensureTable() {
    await pool.query(`
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
    `);
  }

  static toCamel(row) {
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      firmId: row.firm_id,
      roleFocus: row.role_focus,
      practiceAreas: row.practice_areas || [],
      jurisdictionFocus: row.jurisdiction_focus,
      houseStyle: row.house_style,
      riskPosture: row.risk_posture,
      reviewPolicy: row.review_policy,
      sourcePreferences: row.source_preferences || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  static async findByUser(userId) {
    await this.ensureTable();
    const { rows } = await pool.query(
      'SELECT * FROM legal_workflow_profiles WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    return this.toCamel(rows[0]);
  }

  static async getOrDefault(user) {
    const existing = await this.findByUser(user.id);
    if (existing) return existing;

    return {
      id: null,
      userId: user.id,
      firmId: user.firmId || null,
      ...DEFAULT_PROFILE,
      ownerName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      firmName: user.firmName || null,
    };
  }

  static normalizeArray(value, fallback = []) {
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
    if (typeof value === 'string') {
      return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
    return fallback;
  }

  static async upsert(user, data = {}) {
    await this.ensureTable();

    const profile = {
      roleFocus: data.roleFocus || DEFAULT_PROFILE.roleFocus,
      practiceAreas: this.normalizeArray(data.practiceAreas, DEFAULT_PROFILE.practiceAreas),
      jurisdictionFocus: data.jurisdictionFocus || DEFAULT_PROFILE.jurisdictionFocus,
      houseStyle: data.houseStyle || DEFAULT_PROFILE.houseStyle,
      riskPosture: data.riskPosture || DEFAULT_PROFILE.riskPosture,
      reviewPolicy: data.reviewPolicy || DEFAULT_PROFILE.reviewPolicy,
      sourcePreferences: this.normalizeArray(data.sourcePreferences, DEFAULT_PROFILE.sourcePreferences),
    };

    const { rows } = await pool.query(
      `INSERT INTO legal_workflow_profiles
        (id, user_id, firm_id, role_focus, practice_areas, jurisdiction_focus, house_style, risk_posture, review_policy, source_preferences)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (user_id) DO UPDATE SET
        firm_id = EXCLUDED.firm_id,
        role_focus = EXCLUDED.role_focus,
        practice_areas = EXCLUDED.practice_areas,
        jurisdiction_focus = EXCLUDED.jurisdiction_focus,
        house_style = EXCLUDED.house_style,
        risk_posture = EXCLUDED.risk_posture,
        review_policy = EXCLUDED.review_policy,
        source_preferences = EXCLUDED.source_preferences,
        updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        uuidv4(),
        user.id,
        user.firmId || data.firmId || null,
        profile.roleFocus,
        profile.practiceAreas,
        profile.jurisdictionFocus,
        profile.houseStyle,
        profile.riskPosture,
        profile.reviewPolicy,
        profile.sourcePreferences,
      ]
    );

    return this.toCamel(rows[0]);
  }
}

module.exports = LegalWorkflowProfile;
