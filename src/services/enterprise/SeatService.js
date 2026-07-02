const { pool } = require('../../config/db');
const AuditLogService = require('../AuditLogService');

function seatError(message, code, status = 409) { return Object.assign(new Error(message), { code, status }); }

class SeatService {
  constructor({ db = pool } = {}) { this.db = db; }

  async usage(institutionId, db = this.db) {
    const { rows } = await db.query(
      `SELECT institution.id,institution.seat_limit,
        count(seat.id) FILTER (WHERE seat.status='ACTIVE')::int AS used,
        count(seat.id) FILTER (WHERE seat.status='PENDING')::int AS pending
       FROM institutions institution LEFT JOIN subscription_seats seat ON seat.institution_id=institution.id
       WHERE institution.id=$1 AND institution.deleted_at IS NULL GROUP BY institution.id`, [institutionId]
    );
    if (!rows[0]) throw seatError('Institution not found.', 'RESOURCE_NOT_FOUND', 404);
    return rows[0];
  }

  async assign(institutionId, input, actor, { req } = {}) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`seat:${institutionId}`]);
      const membership = await client.query("SELECT role FROM institution_memberships WHERE institution_id=$1 AND user_id=$2 AND status='ACTIVE'", [institutionId, actor.userId]);
      if (!membership.rows[0] || !['OWNER','ADMIN'].includes(membership.rows[0].role)) throw seatError('Institution admin permission is required.', 'ACCESS_DENIED', 403);
      const usage = await this.usage(institutionId, client);
      if (usage.seat_limit !== null && usage.used + usage.pending >= usage.seat_limit) throw seatError('Institution seat limit reached.', 'SEAT_LIMIT_REACHED');
      const { rows } = await client.query(
        `INSERT INTO subscription_seats(institution_id,organization_id,user_id,seat_type,status,assigned_by,assigned_at)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [institutionId, input.organizationId || null, input.userId || null, input.seatType, input.status || 'PENDING', actor.userId, (input.status || 'PENDING') === 'ACTIVE' ? new Date() : null]
      );
      await AuditLogService.record({ db: client, strict: true, req, action: 'INSTITUTION_SEAT_ASSIGNED', entityType: 'SUBSCRIPTION_SEAT', entityId: rows[0].id, metadata: { institutionId, seatType: input.seatType, status: rows[0].status } });
      await client.query('COMMIT'); return rows[0];
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async revoke(institutionId, seatId, actor, { req } = {}) {
    const membership = await this.db.query("SELECT 1 FROM institution_memberships WHERE institution_id=$1 AND user_id=$2 AND status='ACTIVE' AND role IN ('OWNER','ADMIN')", [institutionId, actor.userId]);
    if (!membership.rows[0]) throw seatError('Institution admin permission is required.', 'ACCESS_DENIED', 403);
    const { rows } = await this.db.query(
      `UPDATE subscription_seats SET status='REVOKED',revoked_at=now()
       WHERE id=$1 AND institution_id=$2 AND status IN ('PENDING','ACTIVE') RETURNING *`, [seatId, institutionId]
    );
    if (!rows[0]) throw seatError('Seat not found.', 'RESOURCE_NOT_FOUND', 404);
    await AuditLogService.record({ req, action: 'INSTITUTION_SEAT_REVOKED', entityType: 'SUBSCRIPTION_SEAT', entityId: seatId, metadata: { institutionId, accessRevoked: true, dataDeleted: false } });
    return rows[0];
  }
}

module.exports = { SeatService, seatError };
