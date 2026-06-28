const { pool } = require('../config/db');

const FIRM_READ_ROLES = Object.freeze(['kurucu', 'ortak', 'avukat', 'stajyer', 'asistan']);
const FIRM_WRITE_ROLES = FIRM_READ_ROLES;
const FIRM_ADMIN_ROLES = Object.freeze(['kurucu', 'ortak']);

async function buildAccessContext(userId, { db = pool } = {}) {
  const { rows: users } = await db.query(
    `SELECT u.id, r.role_name
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.id = $1 AND u.is_active = true`,
    [userId]
  );

  if (users.length === 0) return null;

  const { rows: memberships } = await db.query(
    `SELECT fu.firm_id, fu.firm_role, lf.name AS firm_name
     FROM firm_users fu
     JOIN law_firms lf ON lf.id = fu.firm_id
     WHERE fu.user_id = $1
       AND fu.is_active = true
       AND lf.is_active = true`,
    [userId]
  );

  const role = users[0].role_name;
  return {
    userId: users[0].id,
    systemRole: role,
    isSystemAdmin: role === 'Admin',
    memberships: memberships.map((membership) => ({
      lawFirmId: membership.firm_id,
      role: membership.firm_role,
      name: membership.firm_name,
      canRead: FIRM_READ_ROLES.includes(membership.firm_role),
      canWrite: FIRM_WRITE_ROLES.includes(membership.firm_role),
      canAdmin: FIRM_ADMIN_ROLES.includes(membership.firm_role),
    })),
    scopes: {
      personalOwnerUserId: users[0].id,
      organizationIds: memberships.map((membership) => membership.firm_id),
    },
  };
}

async function getAccessContext(req) {
  if (req.accessContext) return req.accessContext;
  if (!req.user?.id) return null;
  req.accessContext = await buildAccessContext(req.user.id);
  return req.accessContext;
}

function membershipFor(context, lawFirmId) {
  if (!context || !lawFirmId) return null;
  return context.memberships.find((membership) => membership.lawFirmId === lawFirmId) || null;
}

function canUseOrganization(context, lawFirmId, permission = 'read') {
  if (context?.isSystemAdmin) return true;
  const membership = membershipFor(context, lawFirmId);
  if (!membership) return false;
  if (permission === 'admin') return membership.canAdmin;
  if (permission === 'write') return membership.canWrite;
  return membership.canRead;
}

module.exports = {
  FIRM_ADMIN_ROLES,
  FIRM_READ_ROLES,
  FIRM_WRITE_ROLES,
  buildAccessContext,
  canUseOrganization,
  getAccessContext,
  membershipFor,
};
