const Case = require('../models/Case');
const AuditLogService = require('../services/AuditLogService');
const { getAccessContext, membershipFor } = require('../services/accessContext');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function matterIdFromRequest(req) {
  return req.params.caseId || req.params.id || null;
}

function requireMatterPermission(permission) {
  return async function matterPermissionMiddleware(req, res, next) {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ success: false, message: 'Kimlik doğrulaması gereklidir.' });
      }

      const matterId = matterIdFromRequest(req);
      if (!matterId) {
        return res.status(400).json({ success: false, message: 'Dosya kimliği gereklidir.' });
      }
      if (!UUID_PATTERN.test(matterId)) {
        return res.status(404).json({ success: false, message: 'Dava bulunamadı.' });
      }

      const accessContext = await getAccessContext(req);
      const matter = accessContext
        ? await Case.findAccessibleById(matterId, accessContext, permission)
        : null;

      if (!matter) {
        await AuditLogService.record({
          req,
          action: 'ACCESS_DENIED',
          entityType: 'CASE',
          entityId: matterId,
          caseId: null,
          success: false,
          metadata: { permission },
        });
        return res.status(404).json({ success: false, message: 'Dava bulunamadı.' });
      }

      req.matter = matter;
      if (matter.scope_type === 'ORGANIZATION') {
        const membership = membershipFor(accessContext, matter.law_firm_id);
        req.user.firmId = matter.law_firm_id;
        req.user.firmRole = membership?.role || (accessContext.isSystemAdmin ? 'system_admin' : null);
      } else {
        delete req.user.firmId;
        delete req.user.firmRole;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

const requireMatterRead = requireMatterPermission('read');
const requireMatterWrite = requireMatterPermission('write');
const requireMatterAdmin = requireMatterPermission('admin');

module.exports = {
  requireMatterAdmin,
  requireMatterRead,
  requireMatterWrite,
};
