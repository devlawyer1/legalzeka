const { pool } = require('../../config/db');
const { educationError } = require('./EducationAccessService');

const AI_POLICIES = Object.freeze(['AI_ALLOWED','AI_ALLOWED_WITH_DISCLOSURE','AI_LIMITED','AI_PROHIBITED']);
const BLOCKED_OPERATIONS = Object.freeze(['GENERATE','REWRITE','ANSWER_EVALUATION','MOOT_ASSISTANT']);

class AcademicIntegrityService {
  constructor({ db = pool } = {}) { this.db = db; }

  async getAssignmentPolicy(assignmentId, { db = this.db } = {}) {
    const { rows } = await db.query('SELECT id, course_id, ai_policy FROM assignments WHERE id = $1', [assignmentId]);
    if (!rows[0]) throw educationError('Assignment not found.', 404, 'ASSIGNMENT_NOT_FOUND');
    return rows[0];
  }

  async assertAllowed({ assignmentId = null, quizId = null, operation }, { db = this.db } = {}) {
    if (!BLOCKED_OPERATIONS.includes(operation)) return true;
    let policy = 'AI_ALLOWED';
    if (assignmentId) policy = (await this.getAssignmentPolicy(assignmentId, { db })).ai_policy;
    if (quizId) {
      const { rows } = await db.query('SELECT ai_policy FROM quiz_sets WHERE id = $1', [quizId]);
      if (!rows[0]) throw educationError('Quiz not found.', 404, 'QUIZ_NOT_FOUND');
      policy = rows[0].ai_policy;
    }
    if (policy === 'AI_PROHIBITED') {
      throw educationError('AI assistance is prohibited for this academic activity.', 403, 'AI_POLICY_PROHIBITS_OPERATION');
    }
    if (policy === 'AI_LIMITED' && ['GENERATE','REWRITE'].includes(operation)) {
      throw educationError('This AI operation is outside the limited policy.', 403, 'AI_POLICY_LIMITED');
    }
    return true;
  }

  disclosureRequired(policy) { return policy === 'AI_ALLOWED_WITH_DISCLOSURE'; }
}

module.exports = { AcademicIntegrityService, AI_POLICIES, BLOCKED_OPERATIONS };
