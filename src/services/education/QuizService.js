const { pool } = require('../../config/db');
const AuditLogService = require('../AuditLogService');
const { EducationAccessService, educationError } = require('./EducationAccessService');
const { EducationAiService } = require('./EducationAiService');
const { EntitlementService } = require('./EntitlementService');
const { AcademicIntegrityService } = require('./AcademicIntegrityService');
const { AssessmentService } = require('./AssessmentService');
const { assertNoInventedIdentifiers } = require('./GroundingPolicy');

const QUESTION_TYPES = Object.freeze(['MULTIPLE_CHOICE','TRUE_FALSE','SHORT_ANSWER','ISSUE_SPOTTING','CASE_ANALYSIS']);

class QuizService {
  constructor({ db = pool, access = new EducationAccessService({ db }), ai = new EducationAiService({ db }), entitlements = new EntitlementService({ db }), integrity = new AcademicIntegrityService({ db }), assessment = null } = {}) {
    this.db = db; this.access = access; this.ai = ai; this.entitlements = entitlements; this.integrity = integrity;
    this.assessment = assessment || new AssessmentService({ db, access, ai, integrity });
  }

  async validateQuestion(question, context) {
    if (!QUESTION_TYPES.includes(question.questionType)) throw educationError('Invalid question type.', 400, 'INVALID_QUESTION_TYPE');
    const sourceIds = await this.access.assertSources(question.sourceIds || [], context);
    if (!sourceIds.length || !question.explanation) throw educationError('Questions require a grounded explanation and source.', 400, 'QUIZ_SOURCE_REQUIRED');
    if (question.questionType === 'MULTIPLE_CHOICE') {
      const options = Array.isArray(question.options) ? question.options : [];
      const correct = question.answerSchema?.correctOptionId;
      const ids = options.map((option, index) => String(option?.id ?? index));
      if (options.length < 2 || !correct || ids.filter((id) => id === String(correct)).length !== 1) {
        throw educationError('Multiple-choice questions require exactly one valid correct option.', 400, 'INVALID_MULTIPLE_CHOICE_SCHEMA');
      }
    }
    const sources = [];
    for (const sourceId of sourceIds) sources.push(await this.access.getSource(sourceId, null, context));
    assertNoInventedIdentifiers([question.prompt, question.explanation, JSON.stringify(question.options || [])].join('\n'), sources);
    return { ...question, sourceIds };
  }

  async generateFlashcards(workspaceId, input, context) {
    await this.entitlements.require(context, 'EDU_FLASHCARDS');
    await this.access.getWorkspace(workspaceId, context, 'write');
    const sourceIds = await this.access.assertSources(input.sourceIds || [], context);
    const sources = [];
    for (const id of sourceIds) {
      const source = await this.access.getSource(id, null, context);
      sources.push({ sourceId: id, title: source.title, content: String(source.content || '').slice(0, 6000) });
    }
    const result = await this.ai.run({
      operation: 'FLASHCARD_GENERATE', workspaceId, userId: context.userId,
      systemPrompt: 'Generate draft learning cards. Return {cards:[{front,back,cardType,difficulty,sourceId}]}.',
      payload: { topic: input.topic || null, count: Math.min(Number(input.count) || 10, 50), sources },
    });
    const cards = Array.isArray(result.output.cards) ? result.output.cards : [];
    const inserted = [];
    for (const card of cards.slice(0, 50)) {
      if (!sourceIds.includes(card.sourceId)) throw educationError('AI returned an out-of-scope flashcard source.', 422, 'AI_SOURCE_OUT_OF_SCOPE');
      const { rows } = await this.db.query(
        `INSERT INTO learning_cards (workspace_id,topic_id,source_id,front,back,card_type,difficulty,status,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'DRAFT',$8) RETURNING *`,
        [workspaceId, input.topicId || null, card.sourceId, card.front, card.back,
          ['FLASHCARD','DEFINITION','CASE_RULE','ARTICLE','COMPARISON'].includes(card.cardType) ? card.cardType : 'FLASHCARD',
          ['EASY','MEDIUM','HARD'].includes(card.difficulty) ? card.difficulty : 'MEDIUM', context.userId]
      );
      inserted.push(rows[0]);
    }
    return { items: inserted, aiUsageId: result.usage.id, status: 'DRAFT' };
  }

  async createQuiz(workspaceId, input, context, { req } = {}) {
    await this.entitlements.require(context, 'EDU_QUIZ');
    await this.access.getWorkspace(workspaceId, context, 'write');
    let questions = input.questions || [];
    let usageId = null;
    if (input.generate) {
      await this.integrity.assertAllowed({ assignmentId: input.assignmentId || null, operation: 'GENERATE' });
      const sourceIds = await this.access.assertSources(input.sourceIds || [], context);
      const sources = [];
      for (const id of sourceIds) {
        const source = await this.access.getSource(id, null, context);
        sources.push({ sourceId: id, title: source.title, content: String(source.content || '').slice(0, 6000) });
      }
      const generated = await this.ai.run({
        operation: 'QUIZ_GENERATE', workspaceId, courseId: input.courseId || null, userId: context.userId,
        systemPrompt: 'Generate draft quiz questions. Return {questions:[{questionType,prompt,options,answerSchema,explanation,sourceIds,difficulty,points}]}. Every explanation must use supplied sources.',
        payload: { count: Math.min(Number(input.questionCount) || 10, 50), difficulty: input.difficulty || 'MEDIUM', legalDomain: input.legalDomain || null, types: input.questionTypes || QUESTION_TYPES, sources },
      });
      questions = generated.output.questions || [];
      usageId = generated.usage.id;
    }
    if (!questions.length) throw educationError('At least one quiz question is required.', 400, 'QUIZ_QUESTION_REQUIRED');
    const validated = [];
    for (const question of questions) validated.push(await this.validateQuestion(question, context));
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const quiz = await client.query(
        `INSERT INTO quiz_sets (workspace_id,topic_id,course_id,title,description,quiz_type,status,ai_policy,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [workspaceId, input.topicId || null, input.courseId || null, input.title, input.description || null,
          input.quizType || 'PRACTICE', input.status || 'DRAFT', input.aiPolicy || 'AI_ALLOWED', context.userId]
      );
      for (const [index, question] of validated.entries()) {
        await client.query(
          `INSERT INTO quiz_questions (
             quiz_set_id,question_type,prompt,options,answer_schema,explanation,source_ids,difficulty,points,sort_order
           ) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9,$10)`,
          [quiz.rows[0].id, question.questionType, question.prompt, JSON.stringify(question.options || null),
            JSON.stringify(question.answerSchema || {}), question.explanation, question.sourceIds,
            question.difficulty || 'MEDIUM', question.points || 1, index]
        );
      }
      await AuditLogService.record({ db: client, strict: true, req: req || { user: { id: context.userId } }, action: 'QUIZ_CREATED', entityType: 'QUIZ_SET', entityId: quiz.rows[0].id, metadata: { workspaceId, questionCount: validated.length, aiUsageId: usageId } });
      await client.query('COMMIT');
      return { ...quiz.rows[0], questionCount: validated.length, aiUsageId: usageId };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async createAttempt(quizId, context) {
    const quiz = await this.db.query('SELECT * FROM quiz_sets WHERE id=$1', [quizId]);
    if (!quiz.rows[0]) throw educationError('Quiz not found.', 404, 'QUIZ_NOT_FOUND');
    await this.access.getWorkspace(quiz.rows[0].workspace_id, context);
    const { rows } = await this.db.query(
      `INSERT INTO quiz_attempts (quiz_set_id,user_id) VALUES ($1,$2) RETURNING *`, [quizId, context.userId]
    );
    return rows[0];
  }

  async getQuiz(quizId, context) {
    const quizResult = await this.db.query('SELECT * FROM quiz_sets WHERE id=$1', [quizId]);
    const quiz = quizResult.rows[0];
    if (!quiz) throw educationError('Quiz not found.', 404, 'QUIZ_NOT_FOUND');
    await this.access.getWorkspace(quiz.workspace_id, context);
    const questions = await this.db.query(
      `SELECT id,question_type,prompt,options,source_ids,difficulty,points,sort_order
       FROM quiz_questions WHERE quiz_set_id=$1 ORDER BY sort_order,id`, [quizId]
    );
    return { ...quiz, questions: questions.rows };
  }

  async submitAttempt(attemptId, input, context, { req } = {}) {
    const attemptResult = await this.db.query(
      `SELECT attempt.*,quiz.workspace_id,quiz.course_id,quiz.ai_policy
       FROM quiz_attempts attempt JOIN quiz_sets quiz ON quiz.id=attempt.quiz_set_id
       WHERE attempt.id=$1`, [attemptId]
    );
    const attempt = attemptResult.rows[0];
    if (!attempt || attempt.user_id !== context.userId) throw educationError('Quiz attempt not found.', 404, 'QUIZ_ATTEMPT_NOT_FOUND');
    if (attempt.status !== 'IN_PROGRESS') throw educationError('Quiz attempt was already submitted.', 409, 'QUIZ_ATTEMPT_CLOSED');
    await this.access.getWorkspace(attempt.workspace_id, context);
    const questions = await this.db.query('SELECT * FROM quiz_questions WHERE quiz_set_id=$1 ORDER BY sort_order', [attempt.quiz_set_id]);
    const answerMap = new Map((input.answers || []).map((item) => [item.questionId, item.answer]));
    let score = 0;
    let maxScore = 0;
    const evaluated = [];
    for (const question of questions.rows) {
      maxScore += Number(question.points);
      const answer = answerMap.get(question.id);
      if (answer === undefined) continue;
      let result;
      if (['MULTIPLE_CHOICE','TRUE_FALSE'].includes(question.question_type)) {
        result = { score: this.assessment.scoreObjective(question, answer), feedback: { advisory: false }, citationIds: [] };
      } else {
        result = await this.assessment.scoreWritten({ question, answer, quiz: { id: attempt.quiz_set_id, workspace_id: attempt.workspace_id, course_id: attempt.course_id }, context });
      }
      score += result.score;
      evaluated.push({ question, answer, result });
    }
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      for (const item of evaluated) {
        await client.query(
          `INSERT INTO quiz_answers (attempt_id,question_id,answer,score,feedback,citation_ids)
           VALUES ($1,$2,$3::jsonb,$4,$5::jsonb,$6)
           ON CONFLICT (attempt_id,question_id) DO UPDATE SET score=EXCLUDED.score,feedback=EXCLUDED.feedback,citation_ids=EXCLUDED.citation_ids`,
          [attemptId, item.question.id, JSON.stringify(item.answer), item.result.score, JSON.stringify(item.result.feedback), item.result.citationIds]
        );
      }
      const updated = await client.query(
        `UPDATE quiz_attempts SET status='SUBMITTED',submitted_at=CURRENT_TIMESTAMP,score=$2,max_score=$3,
           feedback=$4::jsonb WHERE id=$1 RETURNING *`,
        [attemptId, score, maxScore, JSON.stringify({ advisoryAiScores: true, answered: evaluated.length })]
      );
      await AuditLogService.record({ db: client, strict: true, req: req || { user: { id: context.userId } }, action: 'QUIZ_ATTEMPT_SUBMITTED', entityType: 'QUIZ_ATTEMPT', entityId: attemptId, metadata: { workspaceId: attempt.workspace_id, score, maxScore, answered: evaluated.length } });
      await client.query('COMMIT');
      return updated.rows[0];
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}

module.exports = { QUESTION_TYPES, QuizService };
