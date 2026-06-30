function budgetError(message, code = 'AGENT_BUDGET_EXCEEDED') {
  const error = new Error(message);
  error.status = 409;
  error.code = code;
  error.budgetExceeded = true;
  return error;
}

class AgentBudgetService {
  assertRunBudget(run, version, pending = {}) {
    const model = version.model_policy || {};
    const budget = version.budget_policy || {};
    const nextInput = Number(run.input_tokens || 0) + Number(pending.inputTokens || 0);
    const nextOutput = Number(run.output_tokens || 0) + Number(pending.outputTokens || 0);
    const nextCost = Number(run.estimated_cost || 0) + Number(pending.estimatedCost || 0);
    const nextTools = Number(run.tool_call_count || 0) + Number(pending.toolCalls || 0);
    const nextProposals = Number(run.proposal_count || 0) + Number(pending.proposals || 0);
    const nextModelCalls = Number(run.model_call_count || 0) + Number(pending.modelCalls || 0);

    if (nextInput > Number(model.maxInputTokens || 12000)) {
      throw budgetError('Agent input token budget exceeded.', 'INPUT_TOKEN_BUDGET_EXCEEDED');
    }
    if (nextOutput > Number(model.maxOutputTokens || 2500)) {
      throw budgetError('Agent output token budget exceeded.', 'OUTPUT_TOKEN_BUDGET_EXCEEDED');
    }
    if (nextCost > Number(model.maxEstimatedCost ?? 1)) {
      throw budgetError('Agent estimated cost budget exceeded.', 'COST_BUDGET_EXCEEDED');
    }
    if (nextTools > Number(budget.maxToolCalls ?? 12)) {
      throw budgetError('Agent tool call budget exceeded.', 'TOOL_CALL_BUDGET_EXCEEDED');
    }
    if (nextProposals > Number(budget.maxProposals ?? 8)) {
      throw budgetError('Agent proposal budget exceeded.', 'PROPOSAL_BUDGET_EXCEEDED');
    }
    if (nextModelCalls > Number(model.maxCalls ?? 3)) {
      throw budgetError('Agent model call budget exceeded.', 'MODEL_CALL_BUDGET_EXCEEDED');
    }
    return true;
  }
}

module.exports = { AgentBudgetService, budgetError };
