const LegalWorkflowProfile = require('../models/LegalWorkflowProfile');
const LegalWorkflowService = require('../services/legalWorkflows/legalWorkflowService');
const { WORKFLOWS, REVIEW_MARKERS } = require('../services/legalWorkflows/workflowRegistry');
const { parseAndCleanup } = require('../utils/fileParser');

exports.getCatalog = async (req, res) => {
  res.json({
    success: true,
    data: {
      workflows: WORKFLOWS,
      markers: REVIEW_MARKERS,
      roles: [
        { id: 'avukat', label: 'Avukat' },
        { id: 'ogrenci', label: 'Hukuk öğrencisi' },
        { id: 'akademisyen', label: 'Akademisyen' },
        { id: 'hakim_savci', label: 'Hakim / Savcı' },
      ],
    },
  });
};

exports.getProfile = async (req, res, next) => {
  try {
    const profile = await LegalWorkflowProfile.getOrDefault(req.user);
    res.json({ success: true, data: profile });
  } catch (error) {
    next(error);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const profile = await LegalWorkflowProfile.upsert(req.user, req.body);
    res.json({ success: true, data: profile });
  } catch (error) {
    next(error);
  }
};

exports.runWorkflow = async (req, res, next) => {
  try {
    const documentText = req.file ? await parseAndCleanup(req.file.path) : '';
    const text = [req.body.text, documentText].filter(Boolean).join('\n\n');
    const firmId = req.body.firmId || req.user.firmId || null;

    const result = await LegalWorkflowService.run({
      workflowId: req.body.workflowId,
      user: req.user,
      firmId,
      caseId: req.body.caseId || null,
      task: req.body.task || '',
      text,
      includeLiveSources: req.body.includeLiveSources,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};
