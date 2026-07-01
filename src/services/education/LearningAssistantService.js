const { getLegalResearchService } = require('../legalResearch');
const { EducationAccessService } = require('./EducationAccessService');
const { EntitlementService } = require('./EntitlementService');

class LearningAssistantService {
  constructor({ db, access = new EducationAccessService({ db }), entitlements = new EntitlementService({ db }), legalResearch = getLegalResearchService() } = {}) {
    this.access = access; this.entitlements = entitlements; this.legalResearch = legalResearch;
  }

  async research(workspaceId, input, context, options = {}) {
    await this.entitlements.require(context, 'EDU_WORKSPACE');
    const workspace = await this.access.getWorkspace(workspaceId, context);
    return this.legalResearch.answer({
      query: input.query,
      effectiveAt: input.effectiveAt || null,
      filters: { ...(input.filters || {}), legalDomain: input.filters?.legalDomain || workspace.legal_domain || undefined },
      idempotencyKey: input.idempotencyKey || null,
    }, context, options);
  }
}

module.exports = { LearningAssistantService };
