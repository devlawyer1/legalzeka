const crypto = require('node:crypto');
const { pool } = require('../../config/db');
const AuditLogService = require('../AuditLogService');
const { canUseOrganization } = require('../accessContext');
const { EducationAccessService, educationError } = require('./EducationAccessService');
const { EntitlementService } = require('./EntitlementService');

function tokenHash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }

class CourseService {
  constructor({ db = pool, access = new EducationAccessService({ db }), entitlements = new EntitlementService({ db }) } = {}) {
    this.db = db; this.access = access; this.entitlements = entitlements;
  }

  async create(input, context, { req } = {}) {
    await this.entitlements.require(context, 'ACADEMIC_COURSE');
    if (input.organizationId && !canUseOrganization(context, input.organizationId, 'write')) throw educationError('Organization not found.', 404, 'ORGANIZATION_NOT_FOUND');
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const workspace = await client.query(
        `INSERT INTO learning_workspaces (workspace_type,organization_id,owner_user_id,title,description,legal_domain,academic_level,created_by)
         VALUES ('COURSE',$1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [input.organizationId || null, input.organizationId ? null : context.userId, input.title,
          input.description || null, input.legalDomain || null, input.academicLevel || null, context.userId]
      );
      const course = await client.query(
        `INSERT INTO courses (workspace_id,course_code,title,description,term,instructor_user_id,enrollment_policy,status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [workspace.rows[0].id, input.courseCode || null, input.title, input.description || null,
          input.term || null, context.userId, input.enrollmentPolicy || 'INVITE_ONLY', input.status || 'DRAFT']
      );
      await client.query(
        `INSERT INTO course_members (course_id,user_id,role,status,joined_at)
         VALUES ($1,$2,'INSTRUCTOR','ACTIVE',CURRENT_TIMESTAMP)`, [course.rows[0].id, context.userId]
      );
      await AuditLogService.record({ db: client, strict: true, req: req || { user: { id: context.userId } }, action: 'COURSE_CREATED', entityType: 'COURSE', entityId: course.rows[0].id, lawFirmId: input.organizationId || null, metadata: { workspaceId: workspace.rows[0].id } });
      await client.query('COMMIT');
      return { ...course.rows[0], workspace: workspace.rows[0] };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async requireCourseRole(courseId, context, roles) {
    const course = await this.access.getCourse(courseId, context);
    if (context.isSystemAdmin) return course;
    const membership = await this.db.query("SELECT role FROM course_members WHERE course_id=$1 AND user_id=$2 AND status='ACTIVE'", [courseId, context.userId]);
    if (!membership.rows[0] || !roles.includes(membership.rows[0].role)) throw educationError('Course permission denied.', 403, 'COURSE_PERMISSION_DENIED');
    return { ...course, memberRole: membership.rows[0].role };
  }

  async invite(courseId, input, context, { req } = {}) {
    const course = await this.requireCourseRole(courseId, context, ['INSTRUCTOR','TEACHING_ASSISTANT']);
    const entitlement = await this.entitlements.getForUser(context.userId);
    if (!entitlement.legacyUnrestricted && Number(entitlement.maxSeats) > 0) {
      const count = await this.db.query("SELECT count(*)::int AS value FROM course_members WHERE course_id=$1 AND status='ACTIVE'", [courseId]);
      if (count.rows[0].value >= Number(entitlement.maxSeats)) throw educationError('Course seat limit reached.', 409, 'COURSE_SEAT_LIMIT');
    }
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + Math.min(Math.max(Number(input.expiresInHours) || 72, 1), 168) * 3600000);
    const { rows } = await this.db.query(
      `INSERT INTO course_invitations (course_id,email,role,token_hash,invited_by,expires_at)
       VALUES ($1,lower($2),$3,$4,$5,$6) RETURNING id,course_id,email,role,expires_at,created_at`,
      [courseId, input.email, input.role || 'STUDENT', tokenHash(token), context.userId, expiresAt]
    );
    await AuditLogService.record({ db: this.db, req: req || { user: { id: context.userId } }, action: 'COURSE_MEMBER_INVITED', entityType: 'COURSE_INVITATION', entityId: rows[0].id, lawFirmId: course.workspace.organization_id, metadata: { courseId, role: rows[0].role, expiresAt } });
    return { ...rows[0], token };
  }

  async acceptInvitation(token, context) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const invitation = await client.query(
        `SELECT invitation.*,lower(users.email) AS user_email
         FROM course_invitations invitation JOIN users ON users.id=$2
         WHERE invitation.token_hash=$1 FOR UPDATE OF invitation`, [tokenHash(token), context.userId]
      );
      const row = invitation.rows[0];
      if (!row || row.used_at || new Date(row.expires_at) <= new Date() || row.email !== row.user_email) {
        throw educationError('Course invitation is invalid or expired.', 410, 'COURSE_INVITATION_INVALID');
      }
      await client.query(
        `INSERT INTO course_members (course_id,user_id,role,status,joined_at)
         VALUES ($1,$2,$3,'ACTIVE',CURRENT_TIMESTAMP)
         ON CONFLICT (course_id,user_id) DO UPDATE SET role=EXCLUDED.role,status='ACTIVE',joined_at=CURRENT_TIMESTAMP`,
        [row.course_id, context.userId, row.role]
      );
      await client.query('UPDATE course_invitations SET used_at=CURRENT_TIMESTAMP,used_by=$2 WHERE id=$1', [row.id, context.userId]);
      await client.query('COMMIT');
      return { courseId: row.course_id, role: row.role, status: 'ACTIVE' };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async createAssignment(courseId, input, context, { req } = {}) {
    const course = await this.requireCourseRole(courseId, context, ['INSTRUCTOR','TEACHING_ASSISTANT']);
    if (input.sourceCollectionId) {
      const collection = await this.db.query('SELECT workspace_id FROM source_collections WHERE id=$1', [input.sourceCollectionId]);
      if (collection.rows[0]?.workspace_id !== course.workspace_id) throw educationError('Source collection is outside the course.', 400, 'COLLECTION_SCOPE_MISMATCH');
    }
    const { rows } = await this.db.query(
      `INSERT INTO assignments (
         course_id,title,description,assignment_type,due_at,rubric,source_collection_id,status,ai_policy,late_submission_policy,created_by
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11) RETURNING *`,
      [courseId, input.title, input.description || null, input.assignmentType || 'ESSAY', input.dueAt || null,
        JSON.stringify(input.rubric || {}), input.sourceCollectionId || null, input.status || 'DRAFT',
        input.aiPolicy || 'AI_ALLOWED', input.lateSubmissionPolicy || 'BLOCK', context.userId]
    );
    await AuditLogService.record({ db: this.db, req: req || { user: { id: context.userId } }, action: 'ASSIGNMENT_CREATED', entityType: 'ASSIGNMENT', entityId: rows[0].id, lawFirmId: course.workspace.organization_id, metadata: { courseId, aiPolicy: rows[0].ai_policy, dueAt: rows[0].due_at } });
    return rows[0];
  }

  async listAssignments(courseId, context, filters = {}) {
    const course = await this.access.getCourse(courseId, context);
    const member = await this.db.query("SELECT role FROM course_members WHERE course_id=$1 AND user_id=$2 AND status='ACTIVE'", [courseId, context.userId]);
    if (!context.isSystemAdmin && !member.rows[0]) throw educationError('Course not found.', 404, 'COURSE_NOT_FOUND');
    const instructor = context.isSystemAdmin || ['INSTRUCTOR','TEACHING_ASSISTANT'].includes(member.rows[0]?.role);
    const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 100);
    const offset = Math.max(Number(filters.offset) || 0, 0);
    const sortMap = { due_at: 'due_at', created_at: 'created_at', title: 'title' };
    const sort = sortMap[filters.sort] || 'due_at';
    const direction = String(filters.direction || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const { rows } = await this.db.query(
      `SELECT * FROM assignments WHERE course_id=$1 AND ($2::boolean OR status <> 'DRAFT')
       AND ($3::varchar IS NULL OR status=$3) ORDER BY ${sort} ${direction} NULLS LAST,id LIMIT $4 OFFSET $5`,
      [courseId, instructor, filters.status || null, limit, offset]
    );
    return { items: rows, memberRole: member.rows[0]?.role, workspaceId: course.workspace_id, limit, offset };
  }

  async submit(assignmentId, input, context, { req } = {}) {
    const assignmentResult = await this.db.query(
      `SELECT assignment.*,course.workspace_id FROM assignments assignment JOIN courses course ON course.id=assignment.course_id WHERE assignment.id=$1`, [assignmentId]
    );
    const assignment = assignmentResult.rows[0];
    if (!assignment) throw educationError('Assignment not found.', 404, 'ASSIGNMENT_NOT_FOUND');
    await this.requireCourseRole(assignment.course_id, context, ['STUDENT']);
    if (assignment.status !== 'PUBLISHED') throw educationError('Assignment is not open.', 409, 'ASSIGNMENT_NOT_OPEN');
    const late = assignment.due_at && new Date(assignment.due_at) < new Date();
    if (late && assignment.late_submission_policy === 'BLOCK') throw educationError('Assignment deadline has passed.', 409, 'ASSIGNMENT_DEADLINE_PASSED');
    if (input.attachmentDocumentId) throw educationError('Professional Matter documents cannot be attached to education submissions.', 403, 'PROFESSIONAL_DOCUMENT_FORBIDDEN');
    if (assignment.ai_policy === 'AI_PROHIBITED' && Object.keys(input.aiDisclosure || {}).length) throw educationError('AI use is prohibited for this assignment.', 403, 'AI_POLICY_PROHIBITS_OPERATION');
    if (assignment.ai_policy === 'AI_ALLOWED_WITH_DISCLOSURE' && !input.aiDisclosure?.disclosed) throw educationError('AI use disclosure is required.', 400, 'AI_DISCLOSURE_REQUIRED');
    const { rows } = await this.db.query(
      `INSERT INTO assignment_submissions (
         assignment_id,student_user_id,content,status,ai_disclosure,submitted_at
       ) VALUES ($1,$2,$3::jsonb,'SUBMITTED',$4::jsonb,CURRENT_TIMESTAMP)
       ON CONFLICT (assignment_id,student_user_id) DO UPDATE SET
         content=EXCLUDED.content,status='SUBMITTED',ai_disclosure=EXCLUDED.ai_disclosure,submitted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
       WHERE assignment_submissions.status IN ('DRAFT','RETURNED') RETURNING *`,
      [assignmentId, context.userId, JSON.stringify(input.content), JSON.stringify({ ...(input.aiDisclosure || {}), late: Boolean(late) })]
    );
    if (!rows[0]) throw educationError('Submitted work cannot be silently replaced.', 409, 'SUBMISSION_ALREADY_FINAL');
    await AuditLogService.record({ db: this.db, req: req || { user: { id: context.userId } }, action: 'ASSIGNMENT_SUBMITTED', entityType: 'ASSIGNMENT_SUBMISSION', entityId: rows[0].id, metadata: { assignmentId, courseId: assignment.course_id, late: Boolean(late) } });
    return rows[0];
  }

  async getSubmission(submissionId, context) {
    const result = await this.db.query(
      `SELECT submission.*,assignment.course_id,course.workspace_id
       FROM assignment_submissions submission
       JOIN assignments assignment ON assignment.id=submission.assignment_id
       JOIN courses course ON course.id=assignment.course_id WHERE submission.id=$1`, [submissionId]
    );
    const submission = result.rows[0];
    if (!submission) throw educationError('Submission not found.', 404, 'SUBMISSION_NOT_FOUND');
    if (submission.student_user_id === context.userId || context.isSystemAdmin) return submission;
    await this.requireCourseRole(submission.course_id, context, ['INSTRUCTOR','TEACHING_ASSISTANT']);
    return submission;
  }

  async grade(submissionId, input, context, { req } = {}) {
    const submission = await this.getSubmission(submissionId, context);
    const course = await this.requireCourseRole(submission.course_id, context, ['INSTRUCTOR','TEACHING_ASSISTANT']);
    const { rows } = await this.db.query(
      `UPDATE assignment_submissions SET status='GRADED',graded_by=$2,grade=$3,feedback=$4,updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 RETURNING *`, [submissionId, context.userId, input.grade, input.feedback || null]
    );
    await AuditLogService.record({ db: this.db, req: req || { user: { id: context.userId } }, action: 'ASSIGNMENT_GRADED', entityType: 'ASSIGNMENT_SUBMISSION', entityId: submissionId, lawFirmId: course.workspace.organization_id, metadata: { assignmentId: submission.assignment_id, courseId: submission.course_id, grade: Number(input.grade) } });
    return rows[0];
  }
}

module.exports = { CourseService, tokenHash };
