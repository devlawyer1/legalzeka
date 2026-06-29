class CalculationExplanationService {
  explain(output) {
    return (output.steps || []).map((step, index) => ({
      number: index + 1,
      title: step.title,
      operation: step.operation,
      explanation: step.explanation,
      result: step.result,
    }));
  }
}

module.exports = { CalculationExplanationService };
