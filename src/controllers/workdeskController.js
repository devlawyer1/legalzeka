const WorkdeskService = require('../services/workdeskService');

async function getOverview(req, res, next) {
  try {
    const firmId = req.user.firmId;
    if (!firmId) {
      return res.status(403).json({ success: false, message: 'Büro yetkiniz bulunmuyor.' });
    }

    const overview = await WorkdeskService.getOverview({
      firmId,
      userId: req.user.id,
    });

    res.json({ success: true, data: overview });
  } catch (error) {
    next(error);
  }
}

module.exports = { getOverview };
