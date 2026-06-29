const { membershipFor } = require('../accessContext');

const ALL_PERMISSIONS = Object.freeze([
  'CRM_READ',
  'CRM_WRITE',
  'CONFLICT_REVIEW',
  'MATTER_ADMIN',
  'TASK_ASSIGN',
  'TIME_APPROVE',
  'EXPENSE_APPROVE',
  'INVOICE_CREATE',
  'INVOICE_ISSUE',
  'PAYMENT_RECORD',
  'PORTAL_INVITE',
  'PORTAL_SHARE',
  'FINANCE_REPORT',
]);

const ROLE_PERMISSIONS = Object.freeze({
  kurucu: ALL_PERMISSIONS,
  ortak: ALL_PERMISSIONS,
  avukat: [
    'CRM_READ',
    'CRM_WRITE',
    'CONFLICT_REVIEW',
    'TASK_ASSIGN',
    'INVOICE_CREATE',
    'PORTAL_SHARE',
  ],
  asistan: ['CRM_READ', 'CRM_WRITE', 'TASK_ASSIGN'],
  stajyer: ['CRM_READ'],
});

function permissionError(permission) {
  const error = new Error(`Bu islem icin ${permission} yetkisi gerekir.`);
  error.status = 403;
  error.code = 'PERMISSION_DENIED';
  return error;
}

function hasPermission(context, organizationId, permission) {
  if (context?.isSystemAdmin) return true;
  const membership = membershipFor(context, organizationId);
  if (!membership) return false;
  const allowed = ROLE_PERMISSIONS[membership.role] || [];
  return allowed.includes(permission);
}

function requirePermission(context, organizationId, permission) {
  if (!hasPermission(context, organizationId, permission)) {
    throw permissionError(permission);
  }
  return true;
}

module.exports = {
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
  hasPermission,
  permissionError,
  requirePermission,
};
