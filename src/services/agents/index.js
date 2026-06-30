const { AgentApprovalService } = require('./AgentApprovalService');
const { AgentBudgetService } = require('./AgentBudgetService');
const { AgentContextBuilder } = require('./AgentContextBuilder');
const { AgentPolicyService } = require('./AgentPolicyService');
const { AgentProposalService } = require('./AgentProposalService');
const { AgentQueueService } = require('./AgentQueueService');
const { AgentRunner } = require('./AgentRunner');
const { AgentScheduleService } = require('./AgentScheduleService');
const { AgentToolRegistry } = require('./AgentToolRegistry');
const { AgentWorkflowService } = require('./AgentWorkflowService');

function createAgentServices(options = {}) {
  const workflowService = options.workflowService || new AgentWorkflowService(options);
  const proposalService = options.proposalService || new AgentProposalService(options);
  const approvalService = options.approvalService || new AgentApprovalService({
    ...options,
    workflowService,
    proposalService,
  });
  const scheduleService = options.scheduleService || new AgentScheduleService({ ...options, workflowService });
  return {
    approvalService,
    proposalService,
    scheduleService,
    workflowService,
  };
}

let singleton;
function getAgentServices() {
  if (!singleton) singleton = createAgentServices();
  return singleton;
}

function setAgentServicesForTests(services = null) {
  if (process.env.NODE_ENV !== 'test') throw new Error('Agent service replacement is test-only.');
  singleton = services;
}

module.exports = {
  AgentApprovalService,
  AgentBudgetService,
  AgentContextBuilder,
  AgentPolicyService,
  AgentProposalService,
  AgentQueueService,
  AgentRunner,
  AgentScheduleService,
  AgentToolRegistry,
  AgentWorkflowService,
  createAgentServices,
  getAgentServices,
  setAgentServicesForTests,
};
