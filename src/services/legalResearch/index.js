const { LegalResearchService } = require('./LegalResearchService');

let service = new LegalResearchService();

function getLegalResearchService() {
  return service;
}

function setLegalResearchServiceForTests(nextService) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Legal research service replacement is test-only.');
  }
  service = nextService;
}

module.exports = { getLegalResearchService, setLegalResearchServiceForTests };
