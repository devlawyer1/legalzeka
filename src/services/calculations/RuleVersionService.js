const { pool } = require('../../config/db');
const { checksum, validateRuleDefinition, validateSchema } = require('./RuleValidator');

function serviceError(status, message, code) {
  return Object.assign(new Error(message), { status, code });
}

class RuleVersionService {
  constructor({ db = pool } = {}) { this.db = db; }

  async listRuleSets({ calculationType = null, includeInactive = false } = {}) {
    const values = [];
    const filters = [];
    if (!includeInactive) filters.push("rule_set.status = 'ACTIVE'");
    if (calculationType) { values.push(calculationType); filters.push(`rule_set.calculation_type = $${values.length}`); }
    const { rows } = await this.db.query(
      `SELECT rule_set.*, active.id AS active_version_id, active.version_number,
              active.effective_from, active.effective_to, active.legal_reference,
              active.official_source_reference
       FROM legal_rule_sets rule_set
       LEFT JOIN LATERAL (
         SELECT version.* FROM legal_rule_versions version
         WHERE version.rule_set_id = rule_set.id AND version.status = 'ACTIVE'
         ORDER BY version.effective_from DESC LIMIT 1
       ) active ON TRUE
       ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
       ORDER BY rule_set.calculation_type, rule_set.name`, values
    );
    return rows;
  }

  async listVersions(ruleCode, { includeInactive = false } = {}) {
    const { rows } = await this.db.query(
      `SELECT version.*, rule_set.rule_code, rule_set.name, rule_set.calculation_type,
              rule_set.jurisdiction, rule_set.legal_domain,
              EXISTS(
                SELECT 1 FROM legal_rule_versions other
                WHERE other.rule_set_id=version.rule_set_id AND other.id<>version.id
                  AND other.status IN ('REVIEWED','ACTIVE')
                  AND other.effective_from<=COALESCE(version.effective_to,'infinity'::date)
                  AND version.effective_from<=COALESCE(other.effective_to,'infinity'::date)
              ) AS conflict_warning
       FROM legal_rule_versions version
       JOIN legal_rule_sets rule_set ON rule_set.id = version.rule_set_id
       WHERE rule_set.rule_code = $1 ${includeInactive ? '' : "AND version.status = 'ACTIVE'"}
       ORDER BY version.version_number DESC`, [ruleCode]
    );
    return rows;
  }

  async resolveActive({ ruleCode, calculationType, effectiveAt, db = this.db }) {
    const values = [effectiveAt];
    const filters = ["version.status = 'ACTIVE'", "rule_set.status = 'ACTIVE'",
      'version.effective_from <= $1::date', '(version.effective_to IS NULL OR version.effective_to >= $1::date)'];
    if (ruleCode) { values.push(ruleCode); filters.push(`rule_set.rule_code = $${values.length}`); }
    if (calculationType) { values.push(calculationType); filters.push(`rule_set.calculation_type = $${values.length}`); }
    const { rows } = await db.query(
      `SELECT version.*, rule_set.rule_code, rule_set.name AS rule_name,
              rule_set.calculation_type, rule_set.jurisdiction, rule_set.legal_domain
       FROM legal_rule_versions version
       JOIN legal_rule_sets rule_set ON rule_set.id = version.rule_set_id
       WHERE ${filters.join(' AND ')}
       ORDER BY version.effective_from DESC, version.version_number DESC LIMIT 1`, values
    );
    return rows[0] || null;
  }

  async createRuleSet(input, userId) {
    const { rows } = await this.db.query(
      `INSERT INTO legal_rule_sets
       (rule_code, name, description, calculation_type, jurisdiction, legal_domain, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT') RETURNING *`,
      [input.ruleCode, input.name, input.description || null, input.calculationType, input.jurisdiction || 'TR', input.legalDomain || null]
    );
    return { ...rows[0], created_by: userId };
  }

  async createVersion(ruleCode, input, userId) {
    validateSchema(input.inputSchema || {}, 'inputSchema');
    validateSchema(input.outputSchema || {}, 'outputSchema');
    validateRuleDefinition(input.ruleDefinition);
    const digest = checksum(input.ruleDefinition);
    const { rows } = await this.db.query(
      `INSERT INTO legal_rule_versions (
         rule_set_id, version_number, effective_from, effective_to, status,
         input_schema, rule_definition, output_schema, legal_source_id,
         legal_reference, official_source_reference, created_by, checksum
       )
       SELECT id, $2, $3, $4, 'DRAFT', $5::jsonb, $6::jsonb, $7::jsonb,
              $8, $9, $10, $11, $12
       FROM legal_rule_sets WHERE rule_code = $1
       RETURNING *`,
      [ruleCode, input.versionNumber, input.effectiveFrom, input.effectiveTo || null,
        JSON.stringify(input.inputSchema || {}), JSON.stringify(input.ruleDefinition),
        JSON.stringify(input.outputSchema || {}), input.legalSourceId || null,
        input.legalReference || null, input.officialSourceReference || null, userId, digest]
    );
    if (!rows[0]) throw serviceError(404, 'Rule set not found.', 'RULE_SET_NOT_FOUND');
    return rows[0];
  }

  async getVersion(ruleCode, versionId, { db = this.db } = {}) {
    const { rows } = await db.query(
      `SELECT version.*, rule_set.rule_code, rule_set.calculation_type
       FROM legal_rule_versions version JOIN legal_rule_sets rule_set ON rule_set.id = version.rule_set_id
       WHERE rule_set.rule_code = $1 AND version.id = $2`, [ruleCode, versionId]
    );
    return rows[0] || null;
  }

  async review(ruleCode, versionId, reviewerId) {
    const version = await this.getVersion(ruleCode, versionId);
    if (!version) throw serviceError(404, 'Rule version not found.', 'RULE_VERSION_NOT_FOUND');
    if (version.status === 'REVIEWED') return version;
    if (version.status !== 'DRAFT') throw serviceError(409, 'Only DRAFT rules can be reviewed.', 'INVALID_RULE_TRANSITION');
    if (version.created_by === reviewerId) throw serviceError(409, 'Creator and legal reviewer must be different users.', 'REVIEWER_MUST_DIFFER');
    if (!version.legal_reference || !version.official_source_reference) {
      throw serviceError(409, 'Legal and official source references are required.', 'RULE_SOURCE_REQUIRED');
    }
    if (checksum(version.rule_definition) !== version.checksum) throw serviceError(409, 'Rule checksum mismatch.', 'RULE_CHECKSUM_MISMATCH');
    const { rows } = await this.db.query(
      `UPDATE legal_rule_versions SET status = 'REVIEWED', reviewed_by = $3,
         reviewed_at = now(), fixture_status = 'PASSED', updated_at = now() WHERE id = $2 AND rule_set_id =
         (SELECT id FROM legal_rule_sets WHERE rule_code = $1) RETURNING *`,
      [ruleCode, versionId, reviewerId]
    );
    await this.db.query("UPDATE legal_rule_sets SET status = 'REVIEWED', updated_at = now() WHERE id = $1 AND status = 'DRAFT'", [version.rule_set_id]);
    return rows[0];
  }

  async activate(ruleCode, versionId, activatedBy = null) {
    const version = await this.getVersion(ruleCode, versionId);
    if (!version) throw serviceError(404, 'Rule version not found.', 'RULE_VERSION_NOT_FOUND');
    if (version.status === 'ACTIVE') return version;
    if (version.status !== 'REVIEWED' || !version.reviewed_by || !version.reviewed_at) {
      throw serviceError(409, 'Only reviewed rules can be activated.', 'RULE_NOT_REVIEWED');
    }
    if (!version.legal_reference || !version.official_source_reference || checksum(version.rule_definition) !== version.checksum) {
      throw serviceError(409, 'Verified source and checksum are required.', 'RULE_ACTIVATION_BLOCKED');
    }
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        "UPDATE legal_rule_versions SET status = 'ACTIVE', activated_by = $2, activated_at = now(), updated_at = now() WHERE id = $1 RETURNING *", [versionId, activatedBy || version.reviewed_by]
      );
      await client.query("UPDATE legal_rule_sets SET status = 'ACTIVE', updated_at = now() WHERE id = $1", [version.rule_set_id]);
      await client.query('COMMIT');
      return rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23P01') throw serviceError(409, 'Overlapping ACTIVE rule versions are not allowed.', 'ACTIVE_RULE_OVERLAP');
      throw error;
    } finally { client.release(); }
  }

  async retire(ruleCode, versionId) {
    const version = await this.getVersion(ruleCode, versionId);
    if (!version) throw serviceError(404, 'Rule version not found.', 'RULE_VERSION_NOT_FOUND');
    const { rows } = await this.db.query(
      "UPDATE legal_rule_versions SET status = 'RETIRED', updated_at = now() WHERE id = $1 RETURNING *", [versionId]
    );
    const active = await this.db.query("SELECT 1 FROM legal_rule_versions WHERE rule_set_id = $1 AND status = 'ACTIVE' LIMIT 1", [version.rule_set_id]);
    if (!active.rows[0]) await this.db.query("UPDATE legal_rule_sets SET status = 'RETIRED', updated_at = now() WHERE id = $1", [version.rule_set_id]);
    return rows[0];
  }

  async loadRatePeriods(rateCode, startDate, endDate, { db = this.db } = {}) {
    const { rows } = await db.query(
      `SELECT * FROM legal_rate_periods WHERE rate_code = $1 AND status = 'ACTIVE'
       AND effective_from < $3::date AND (effective_to IS NULL OR effective_to >= $2::date)
       ORDER BY effective_from`, [rateCode, startDate, endDate]
    );
    return rows;
  }
}

module.exports = { RuleVersionService, serviceError };
