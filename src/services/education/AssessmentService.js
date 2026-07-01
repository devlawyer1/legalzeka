const { EducationAccessService, educationError } = require('./EducationAccessService');
const { EducationAiService } = require('./EducationAiService');
const { AcademicIntegrityService } = require('./AcademicIntegrityService');

class AssessmentService {
  constructor({ db, access = new EducationAccessService({ db }), ai = new EducationAiService({ db }), integrity = new AcademicIntegrityService({ db }) } = {}) {
    this.db = db; this.access = access; this.ai = ai; this.integrity = integrity;
  }

  scoreObjective(question, answer) {
    const submitted = answer?.value ?? answer;
    const expected = question.answer_schema?.correctOptionId ?? question.answer_schema?.correctAnswer;
    return String(submitted) === String(expected) ? Number(question.points) : 0;
  }

  async scoreWritten({ question, answer, quiz, context }) {
    await this.integrity.assertAllowed({ quizId: quiz.id, operation: 'ANSWER_EVALUATION' });
    const sourceIds = await this.access.assertSources(question.source_ids || [], context);
    const result = await this.ai.run({
      operation: 'QUIZ_ANSWER_EVALUATION', workspaceId: quiz.workspace_id, courseId: quiz.course_id,
      userId: context.userId,
      systemPrompt: 'Evaluate against the supplied rubric. Return {score,feedback,citationIds}. The score is advisory, concise, and contains no hidden reasoning.',
      payload: {
        question: question.prompt,
        answer: String(answer?.text ?? answer ?? '').slice(0, 12000),
        rubric: question.answer_schema?.rubric || {},
        modelAnswer: question.answer_schema?.modelAnswer || null,
        allowedSourceIds: sourceIds,
        maxPoints: Number(question.points),
      },
    });
    const citationIds = await this.access.assertSources(result.output.citationIds || [], context);
    if (citationIds.some((id) => !sourceIds.includes(id))) throw educationError('Evaluation cited an out-of-scope source.', 422, 'AI_SOURCE_OUT_OF_SCOPE');
    const score = Math.max(0, Math.min(Number(question.points), Number(result.output.score) || 0));
    return { score, feedback: { text: String(result.output.feedback || '').slice(0, 4000), advisory: true }, citationIds, usageId: result.usage.id };
  }
}

module.exports = { AssessmentService };
