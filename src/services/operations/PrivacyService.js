const { pool } = require('../../config/db');
const AuditLogService = require('../AuditLogService');

function privacyError(message, code, status = 409) { return Object.assign(new Error(message), { code, status }); }

class PrivacyService {
  constructor({ db = pool } = {}) { this.db = db; }

  async createRequest(userId, { organizationId = null, requestType }, { identityVerified = false, req } = {}) {
    if (organizationId) {
      const membership = await this.db.query('SELECT 1 FROM firm_users WHERE firm_id=$1 AND user_id=$2 AND is_active=true', [organizationId, userId]);
      if (!membership.rows[0]) throw privacyError('Organization is not accessible.', 'TENANT_SCOPE_VIOLATION', 404);
    }
    const { rows } = await this.db.query(
      `INSERT INTO privacy_requests(user_id,organization_id,request_type,status,verified_at)
       VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [userId, organizationId, requestType, identityVerified ? 'IDENTITY_VERIFIED' : 'REQUESTED', identityVerified ? new Date() : null]
    );
    await AuditLogService.record({ req, action: 'PRIVACY_REQUEST_CREATED', entityType: 'PRIVACY_REQUEST', entityId: rows[0].id, lawFirmId: organizationId, metadata: { requestType, identityVerified } });
    return rows[0];
  }

  async exportData(requestId, userId) {
    const request = await this.db.query("SELECT * FROM privacy_requests WHERE id=$1 AND user_id=$2 AND request_type='DATA_EXPORT' AND status IN ('IDENTITY_VERIFIED','PROCESSING')", [requestId, userId]);
    if (!request.rows[0]) throw privacyError('Verified export request not found.', 'RESOURCE_NOT_FOUND', 404);
    const organizationId = request.rows[0].organization_id;
    const user = await this.db.query('SELECT id,first_name,last_name,email,created_at,email_verified_at FROM users WHERE id=$1', [userId]);
    const memberships = await this.db.query('SELECT firm_id,firm_role,joined_at FROM firm_users WHERE user_id=$1 AND ($2::uuid IS NULL OR firm_id=$2)', [userId, organizationId]);
    const matters = await this.db.query(
      `SELECT id,scope_type,konu,esas_no,mahkeme,created_at FROM cases
       WHERE is_active=true AND (($2::uuid IS NULL AND scope_type='PERSONAL' AND owner_user_id=$1) OR ($2::uuid IS NOT NULL AND law_firm_id=$2))`,
      [userId, organizationId]
    );
    return { generatedAt: new Date().toISOString(), scope: { userId, organizationId }, user: user.rows[0], memberships: memberships.rows, matters: matters.rows, retainedDataNotice: 'Financial, legal-hold and statutory records may remain subject to retention policies.' };
  }

  async assertDeletionAllowed({ userId, organizationId = null, resourceType = 'USER', resourceId = null }) {
    const holds = await this.db.query(
      `SELECT id,reason FROM legal_holds WHERE status='ACTIVE'
       AND ($1::uuid IS NULL OR organization_id=$1)
       AND (resource_type=$2 OR resource_type='ALL')
       AND ($3::uuid IS NULL OR resource_id IS NULL OR resource_id=$3) LIMIT 1`,
      [organizationId, resourceType, resourceId]
    );
    if (holds.rows[0]) throw privacyError('Deletion is blocked by an active legal hold.', 'LEGAL_HOLD_ACTIVE', 423);
    const finance = await this.db.query('SELECT 1 FROM invoices WHERE created_by=$1 AND deleted_at IS NULL LIMIT 1', [userId]).catch(() => ({ rows: [] }));
    return { allowed: true, retained: finance.rows[0] ? [{ category: 'FINANCIAL', reason: 'Statutory retention' }] : [] };
  }

  async expireExports() {
    return this.db.query("UPDATE data_export_jobs SET status='EXPIRED' WHERE status='COMPLETED' AND expires_at<=now() RETURNING id");
  }
}

module.exports = { PrivacyService, privacyError };
