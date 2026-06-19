// ============================================================
// Emsal Atlası - Case Timeline Controller
// ============================================================

const CaseTimelineService = require('../services/caseTimelineService');

async function getCaseTimeline(req, res, next) {
  try {
    const { caseId } = req.params;
    const timeline = await CaseTimelineService.buildTimeline(caseId);
    res.json({ success: true, data: timeline });
  } catch (error) {
    next(error);
  }
}

module.exports = { getCaseTimeline };
