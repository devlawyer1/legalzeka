const { pool } = require('../../config/db');
const { HealthService } = require('./HealthService');

class OperationsService {
  constructor({ db = pool, health = new HealthService({ db }) } = {}) { this.db = db; this.health = health; }

  async overview({ institutionId = null } = {}) {
    const dependencies = await this.health.dependencies();
    const queue = await this.db.query(`SELECT
      (SELECT count(*)::int FROM document_processing_jobs WHERE status IN ('QUEUED','RETRYING','RUNNING')) AS document_depth,
      (SELECT count(*)::int FROM agent_runs WHERE status IN ('QUEUED','RUNNING','RETRYING')) AS agent_depth,
      (SELECT count(*)::int FROM outbound_email_queue WHERE status IN ('QUEUED','RETRY','RUNNING')) AS notification_depth,
      (SELECT count(*)::int FROM outbound_email_queue WHERE status='DEAD_LETTER') AS dead_letters`);
    const migration = await this.db.query('SELECT version,applied_at,verified_at FROM schema_migrations ORDER BY version DESC LIMIT 1');
    const backup = await this.db.query('SELECT status,backup_type,completed_at,verified_at FROM backup_runs ORDER BY created_at DESC LIMIT 1');
    const rules = await this.db.query("SELECT count(*)::int AS active FROM legal_rule_versions WHERE status='ACTIVE'");
    const notifications = await this.db.query("SELECT status,count(*)::int AS count FROM practice_notifications GROUP BY status ORDER BY status");
    const usage = await this.db.query('SELECT COALESCE(sum(estimated_cost),0)::numeric AS cost,COALESCE(sum(input_tokens+output_tokens),0)::bigint AS tokens FROM education_ai_usage');
    const providers = await this.db.query(
      `SELECT provider_type,provider_name,status,last_verified_at,last_error_code,organization_id,institution_id
       FROM provider_connections WHERE ($1::uuid IS NULL OR institution_id=$1) ORDER BY provider_type,provider_name LIMIT 100`, [institutionId]
    );
    const sso = await this.db.query(
      `SELECT id,institution_id,provider_type,name,issuer,domains,status,updated_at
       FROM identity_provider_configs WHERE ($1::uuid IS NULL OR institution_id=$1) ORDER BY name LIMIT 100`, [institutionId]
    );
    const policies = await this.db.query(
      `SELECT id,organization_id,institution_id,require_mfa,require_portal_mfa,session_ttl_minutes,updated_at
       FROM enterprise_security_policies WHERE ($1::uuid IS NULL OR institution_id=$1) ORDER BY updated_at DESC LIMIT 100`, [institutionId]
    );
    const privacy = await this.db.query(
      `SELECT status,count(*)::int AS count FROM privacy_requests request
       WHERE ($1::uuid IS NULL OR EXISTS(
         SELECT 1 FROM institution_memberships membership
         WHERE membership.institution_id=$1 AND membership.user_id=request.user_id
       )) GROUP BY status ORDER BY status`, [institutionId]
    );
    const seats = institutionId ? await this.db.query(
      `SELECT institution.id,institution.name,institution.seat_limit,
       count(seat.id) FILTER(WHERE seat.status='ACTIVE')::int AS used,
       count(seat.id) FILTER(WHERE seat.status='PENDING')::int AS pending
       FROM institutions institution LEFT JOIN subscription_seats seat ON seat.institution_id=institution.id
       WHERE institution.id=$1 GROUP BY institution.id`, [institutionId]
    ) : await this.db.query(
      `SELECT institution.id,institution.name,institution.seat_limit,
       count(seat.id) FILTER(WHERE seat.status='ACTIVE')::int AS used,
       count(seat.id) FILTER(WHERE seat.status='PENDING')::int AS pending
       FROM institutions institution LEFT JOIN subscription_seats seat ON seat.institution_id=institution.id
       WHERE institution.deleted_at IS NULL GROUP BY institution.id ORDER BY institution.name LIMIT 100`
    );
    const warnings = [];
    if (dependencies.storage.status !== 'CONFIGURED') warnings.push({ code: 'STORAGE_NOT_EXTERNAL', severity: 'HIGH' });
    if (dependencies.redis.status !== 'UP') warnings.push({ code: 'REDIS_NOT_READY', severity: 'HIGH' });
    if (dependencies.antivirus.status !== 'CONFIGURED') warnings.push({ code: 'ANTIVIRUS_NOT_CONFIGURED', severity: 'HIGH' });
    if (dependencies.email.status !== 'CONFIGURED') warnings.push({ code: 'EMAIL_NOT_CONFIGURED', severity: 'MEDIUM' });
    return {
      services: dependencies, queues: queue.rows[0], migration: migration.rows[0] || null,
      release: process.env.RELEASE_VERSION || 'dev', backup: backup.rows[0] || null,
      notifications: notifications.rows, aiUsage: usage.rows[0], seats: seats.rows,
      activeLegalRules: rules.rows[0].active, providers: providers.rows, sso: sso.rows,
      securityPolicies: policies.rows, privacyRequests: privacy.rows, warnings,
    };
  }

  async auditExport({ organizationId = null, institutionId = null, format = 'JSON' } = {}) {
    const { rows } = await this.db.query(
      `SELECT id,firm_id,institution_id,user_id,action,entity_type,entity_id,request_id,success,result,metadata,created_at,previous_hash,integrity_hash
       FROM audit_logs WHERE ($1::uuid IS NULL OR firm_id=$1) AND ($2::uuid IS NULL OR institution_id=$2)
       ORDER BY created_at DESC LIMIT 10000`, [organizationId, institutionId]
    );
    if (format === 'JSON') return { contentType: 'application/json', body: JSON.stringify(rows) };
    const header = ['id','organization_id','institution_id','actor_id','action','resource_type','resource_id','request_id','result','created_at','integrity_hash'];
    const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const body = [header.join(','), ...rows.map((row) => [row.id,row.firm_id,row.institution_id,row.user_id,row.action,row.entity_type,row.entity_id,row.request_id,row.result,row.created_at,row.integrity_hash].map(escape).join(','))].join('\n');
    return { contentType: 'text/csv; charset=utf-8', body };
  }
}

module.exports = { OperationsService };
