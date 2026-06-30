const { pool } = require('../config/db');

const BLOCKED_METADATA_KEYS = /token|password|secret|authorization|prompt|content|document_text|identity|tax|kimlik|vergi|message|body/i;

function sanitizeMetadata(value, depth = 0) {
  if (depth > 3 || value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeMetadata(item, depth + 1));
  if (typeof value !== 'object') {
    return typeof value === 'string' ? value.slice(0, 500) : value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !BLOCKED_METADATA_KEYS.test(key))
      .slice(0, 30)
      .map(([key, item]) => [key, sanitizeMetadata(item, depth + 1)])
  );
}

class AuditLogService {
  static async record({
    db = pool,
    strict = false,
    req,
    action,
    entityType = null,
    entityId = null,
    lawFirmId = null,
    caseId = null,
    documentId = null,
    success = true,
    metadata = {},
  }) {
    try {
      await db.query(
        `INSERT INTO audit_logs (
           firm_id, user_id, action, entity_type, entity_id, metadata,
           case_id, document_id, ip_address, user_agent, request_id, success
         )
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12)`,
        [
          lawFirmId || req?.matter?.law_firm_id || null,
          req?.user?.id || null,
          action,
          entityType,
          entityId ? String(entityId) : null,
          JSON.stringify(sanitizeMetadata(metadata) || {}),
          caseId || req?.matter?.id || null,
          documentId || null,
          String(req?.ip || req?.socket?.remoteAddress || '').slice(0, 64) || null,
          String(req?.get?.('user-agent') || '').slice(0, 1000) || null,
          String(req?.requestId || req?.get?.('x-request-id') || '').slice(0, 128) || null,
          Boolean(success),
        ]
      );
      return true;
    } catch (error) {
      console.error(`[AuditLog] Could not persist ${action}: ${error.message}`);
      if (strict) throw error;
      return false;
    }
  }
}

module.exports = AuditLogService;
