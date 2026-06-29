const { DraftAnalyzer } = require('./DraftAnalyzer');
const { DraftCitationService } = require('./DraftCitationService');
const { DraftExportService } = require('./DraftExportService');
const { DraftGenerator } = require('./DraftGenerator');
const { DraftService } = require('./DraftService');
const { DraftSuggestionService } = require('./DraftSuggestionService');
const { DraftVersionService } = require('./DraftVersionService');
const { EvidenceMatrixService } = require('./EvidenceMatrixService');
const { pool } = require('../../config/db');

function createDraftingServices(options = {}) {
  const db = options.db || pool;
  const versionService = options.versionService || new DraftVersionService({ db });
  const draftService = options.draftService || new DraftService({ db, versionService });
  const evidenceMatrixService = options.evidenceMatrixService || new EvidenceMatrixService({ db, draftService });
  const citationOptions = { db, draftService };
  if (options.searchService) citationOptions.searchService = options.searchService;
  if (options.sourceRepository) citationOptions.sourceRepository = options.sourceRepository;
  const citationService = options.citationService || new DraftCitationService(citationOptions);
  const generator = options.generator || new DraftGenerator(options.llm ? { llm: options.llm } : {});
  const analyzer = options.analyzer || new DraftAnalyzer(options.llm ? { llm: options.llm } : {});
  const suggestionService = options.suggestionService || new DraftSuggestionService({
    db,
    draftService,
    versionService,
    analyzer,
    generator,
    evidenceMatrixService,
    citationService,
  });
  const exportService = options.exportService || new DraftExportService({ draftService });
  return {
    analyzer,
    citationService,
    draftService,
    evidenceMatrixService,
    exportService,
    generator,
    suggestionService,
    versionService,
  };
}

let singleton;

function getDraftingServices() {
  if (!singleton) singleton = createDraftingServices();
  return singleton;
}

function setDraftingServicesForTests(services = null) {
  singleton = services;
}

module.exports = { createDraftingServices, getDraftingServices, setDraftingServicesForTests };
