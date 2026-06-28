const suggestionService = require('../services/matterSuggestionService');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validId(value) {
  return UUID_PATTERN.test(String(value || ''));
}

exports.list = async (req, res, next) => {
  try {
    if (!validId(req.params.documentId)) return res.status(404).json({ success: false, message: 'Belge bulunamadı.' });
    const rows = await suggestionService.getSuggestions(req.params.caseId, req.params.documentId);
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

async function review(req, res, next, action) {
  try {
    if (!validId(req.params.suggestionId)) return res.status(404).json({ success: false, message: 'Öneri bulunamadı.' });
    const result = await suggestionService.reviewOne({
      caseId: req.params.caseId,
      suggestionId: req.params.suggestionId,
      action,
      userId: req.user.id,
      reason: req.body?.reason,
      req,
    });
    res.json({ success: true, data: result.suggestion, idempotent: result.idempotent });
  } catch (error) {
    next(error);
  }
}

exports.accept = (req, res, next) => review(req, res, next, 'accept');
exports.reject = (req, res, next) => review(req, res, next, 'reject');

exports.bulkReview = async (req, res, next) => {
  try {
    const acceptIds = Array.isArray(req.body?.accept) ? req.body.accept : [];
    const rejectItems = Array.isArray(req.body?.reject) ? req.body.reject : [];
    if (![...acceptIds, ...rejectItems.map((item) => item?.id)].every(validId)) {
      return res.status(400).json({ success: false, message: 'Geçersiz öneri kimliği.' });
    }
    const results = await suggestionService.bulkReview({
      caseId: req.params.caseId, acceptIds, rejectItems, userId: req.user.id, req,
    });
    res.json({ success: true, data: results.map((item) => item.suggestion), strategy: 'all_or_nothing' });
  } catch (error) {
    next(error);
  }
};
