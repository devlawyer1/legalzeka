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
  'AGENT_RUN',
  'AGENT_WORKFLOW_CREATE',
  'AGENT_WORKFLOW_ACTIVATE',
  'AGENT_SCHEDULE',
  'AGENT_APPROVE_REVERSIBLE',
  'AGENT_APPROVE_CRITICAL',
  'AGENT_VIEW_COSTS',
  'AGENT_CANCEL_RUN',
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
    'AGENT_RUN',
    'AGENT_WORKFLOW_CREATE',
    'AGENT_WORKFLOW_ACTIVATE',
    'AGENT_SCHEDULE',
    'AGENT_APPROVE_REVERSIBLE',
    'AGENT_APPROVE_CRITICAL',
    'AGENT_VIEW_COSTS',
    'AGENT_CANCEL_RUN',
  ],
  asistan: [
    'CRM_READ', 'CRM_WRITE', 'TASK_ASSIGN', 'AGENT_RUN', 'AGENT_WORKFLOW_CREATE',
    'AGENT_APPROVE_REVERSIBLE', 'AGENT_CANCEL_RUN',
  ],
  stajyer: ['CRM_READ', 'AGENT_RUN', 'AGENT_WORKFLOW_CREATE', 'AGENT_CANCEL_RUN'],
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
