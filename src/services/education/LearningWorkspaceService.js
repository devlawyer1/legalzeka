const { pool } = require('../../config/db');
const AuditLogService = require('../AuditLogService');
const { canUseOrganization } = require('../accessContext');
const { EducationAccessService, educationError, pageOptions } = require('./EducationAccessService');
const { EntitlementService } = require('./EntitlementService');

const WORKSPACE_TYPES = Object.freeze(['STUDENT','ACADEMIC','COURSE','RESEARCH_PROJECT']);
const ACADEMIC_LEVELS = Object.freeze(['UNDERGRADUATE','GRADUATE','DOCTORAL','PROFESSIONAL','OTHER']);

function requestFor(req, context) { return req || { user: { id: context.userId } }; }

class LearningWorkspaceService {
  constructor({ db = pool, access = new EducationAccessService({ db }), entitlements = new EntitlementService({ db }) } = {}) {
    this.db = db;
    this.access = access;
    this.entitlements = entitlements;
  }

  featureFor(type) {
    if (type === 'ACADEMIC') return 'ACADEMIC_RESEARCH';
    if (type === 'COURSE') return 'ACADEMIC_COURSE';
    if (type === 'RESEARCH_PROJECT') return 'ACADEMIC_RESEARCH';
    return 'EDU_WORKSPACE';
  }

  async create(input, context, { req } = {}) {
    if (!WORKSPACE_TYPES.includes(input.workspaceType)) throw educationError('Invalid workspace type.', 400, 'INVALID_WORKSPACE_TYPE');
    if (input.academicLevel && !ACADEMIC_LEVELS.includes(input.academicLevel)) throw educationError('Invalid academic level.', 400, 'INVALID_ACADEMIC_LEVEL');
    await this.entitlements.require(context, this.featureFor(input.workspaceType));
    const organizationId = input.organizationId || null;
    if (organizationId && !canUseOrganization(context, organizationId, 'write')) {
      throw educationError('Organization not found.', 404, 'ORGANIZATION_NOT_FOUND');
    }
    if (['STUDENT','ACADEMIC'].includes(input.workspaceType) && organizationId) {
      throw educationError('Personal workspace types cannot be organization scoped.', 400, 'INVALID_WORKSPACE_SCOPE');
    }
    const { rows } = await this.db.query(
      `INSERT INTO learning_workspaces (
         workspace_type,organization_id,owner_user_id,title,description,legal_domain,academic_level,created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$3) RETURNING *`,
      [input.workspaceType, organizationId, organizationId ? null : context.userId, input.title,
        input.description || null, input.legalDomain || null, input.academicLevel || null]
    );
    await AuditLogService.record({
      db: this.db, req: requestFor(req, context), action: 'LEARNING_WORKSPACE_CREATED',
      entityType: 'LEARNING_WORKSPACE', entityId: rows[0].id, lawFirmId: organizationId,
      metadata: { workspaceType: input.workspaceType },
    });
    return rows[0];
  }

  async list(context, filters = {}) {
    await this.entitlements.require(context, 'EDU_WORKSPACE');
    const page = pageOptions(filters);
    const types = filters.workspaceType ? [filters.workspaceType] : WORKSPACE_TYPES;
    if (types.some((type) => !WORKSPACE_TYPES.includes(type))) throw educationError('Invalid workspace filter.', 400, 'INVALID_WORKSPACE_FILTER');
    const { rows } = await this.db.query(
      `SELECT DISTINCT workspace.*, course.id AS course_id, project.id AS project_id
       FROM learning_workspaces workspace
       LEFT JOIN courses course ON course.workspace_id = workspace.id
       LEFT JOIN course_members course_member
         ON course_member.course_id = course.id AND course_member.user_id = $1 AND course_member.status = 'ACTIVE'
       LEFT JOIN research_projects project ON project.workspace_id = workspace.id
       LEFT JOIN research_project_members project_member
         ON project_member.project_id = project.id AND project_member.user_id = $1
       WHERE workspace.deleted_at IS NULL
         AND workspace.workspace_type = ANY($2::varchar[])
         AND ($3::varchar IS NULL OR workspace.status = $3)
         AND (
           $4::boolean = true OR workspace.owner_user_id = $1
           OR (workspace.workspace_type NOT IN ('COURSE','RESEARCH_PROJECT') AND workspace.organization_id = ANY($5::uuid[]))
           OR course_member.id IS NOT NULL OR project_member.id IS NOT NULL
         )
       ORDER BY ${page.sort} ${page.direction}, workspace.id
       LIMIT $6 OFFSET $7`,
      [context.userId, types, filters.status || null, context.isSystemAdmin || false,
        context.scopes?.organizationIds || [], page.limit, page.offset]
    );
    return { items: rows, limit: page.limit, offset: page.offset };
  }

  async get(id, context) {
    const workspace = await this.access.getWorkspace(id, context);
    const [topics, notes, briefs, cards, quizzes, scenarios, collections, progress] = await Promise.all([
      this.db.query('SELECT * FROM learning_topics WHERE workspace_id=$1 ORDER BY sort_order,title LIMIT 200', [id]),
      this.db.query("SELECT id,topic_id,title,status,current_version_id,updated_at FROM study_notes WHERE workspace_id=$1 AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 100", [id]),
      this.db.query('SELECT id,legal_source_id,title,court,case_number,decision_number,decision_date,verification_status,updated_at FROM case_briefs WHERE workspace_id=$1 ORDER BY updated_at DESC LIMIT 100', [id]),
      this.db.query('SELECT * FROM learning_cards WHERE workspace_id=$1 ORDER BY updated_at DESC LIMIT 200', [id]),
      this.db.query('SELECT id,topic_id,title,quiz_type,status,ai_policy,updated_at FROM quiz_sets WHERE workspace_id=$1 ORDER BY updated_at DESC LIMIT 100', [id]),
      this.db.query('SELECT id,title,status,updated_at FROM moot_scenarios WHERE workspace_id=$1 ORDER BY updated_at DESC LIMIT 100', [id]),
      this.db.query('SELECT id,title,description,collection_type,updated_at FROM source_collections WHERE workspace_id=$1 ORDER BY updated_at DESC LIMIT 100', [id]),
      this.db.query(`SELECT
        (SELECT count(*)::int FROM study_notes WHERE workspace_id=$1 AND deleted_at IS NULL) AS notes,
        (SELECT count(*)::int FROM case_briefs WHERE workspace_id=$1) AS briefs,
        (SELECT count(*)::int FROM learning_cards WHERE workspace_id=$1 AND status='ACTIVE') AS active_cards,
        (SELECT count(*)::int FROM quiz_attempts attempt JOIN quiz_sets quiz ON quiz.id=attempt.quiz_set_id WHERE quiz.workspace_id=$1 AND attempt.status='SUBMITTED') AS completed_quizzes`, [id]),
    ]);
    return { ...workspace, topics: topics.rows, notes: notes.rows, caseBriefs: briefs.rows, cards: cards.rows, quizzes: quizzes.rows, mootScenarios: scenarios.rows, sourceCollections: collections.rows, progress: progress.rows[0] };
  }

  async update(id, input, context) {
    await this.access.getWorkspace(id, context, 'write');
    const allowedStatus = input.status && ['ACTIVE','ARCHIVED'].includes(input.status) ? input.status : null;
    if (input.status && !allowedStatus) throw educationError('Invalid workspace status.', 400, 'INVALID_WORKSPACE_STATUS');
    const { rows } = await this.db.query(
      `UPDATE learning_workspaces SET
         title = coalesce($2,title), description = CASE WHEN $3::boolean THEN $4 ELSE description END,
         legal_domain = CASE WHEN $5::boolean THEN $6 ELSE legal_domain END,
         academic_level = CASE WHEN $7::boolean THEN $8 ELSE academic_level END,
         status = coalesce($9,status), updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id, input.title || null, Object.hasOwn(input, 'description'), input.description || null,
        Object.hasOwn(input, 'legalDomain'), input.legalDomain || null,
        Object.hasOwn(input, 'academicLevel'), input.academicLevel || null, allowedStatus]
    );
    return rows[0];
  }

  async remove(id, context) {
    await this.access.getWorkspace(id, context, 'write');
    await this.db.query("UPDATE learning_workspaces SET status='ARCHIVED',deleted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1", [id]);
  }

  async createTopic(workspaceId, input, context) {
    await this.access.getWorkspace(workspaceId, context, 'write');
    if (input.parentTopicId) {
      const parent = await this.db.query('SELECT workspace_id FROM learning_topics WHERE id = $1', [input.parentTopicId]);
      if (parent.rows[0]?.workspace_id !== workspaceId) throw educationError('Parent topic is outside workspace.', 400, 'TOPIC_SCOPE_MISMATCH');
    }
    if (input.courseId) {
      const course = await this.db.query('SELECT workspace_id FROM courses WHERE id = $1', [input.courseId]);
      if (course.rows[0]?.workspace_id !== workspaceId) throw educationError('Course is outside workspace.', 400, 'COURSE_SCOPE_MISMATCH');
    }
    const { rows } = await this.db.query(
      `INSERT INTO learning_topics (workspace_id,course_id,parent_topic_id,title,description,sort_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [workspaceId, input.courseId || null, input.parentTopicId || null, input.title, input.description || null, input.sortOrder || 0]
    );
    return rows[0];
  }

  async createCollection(workspaceId, input, context) {
    await this.access.getWorkspace(workspaceId, context, 'write');
    const types = ['READING_LIST','CASEBOOK','BIBLIOGRAPHY','RESEARCH_CORPUS','CUSTOM'];
    if (!types.includes(input.collectionType)) throw educationError('Invalid collection type.', 400, 'INVALID_COLLECTION_TYPE');
    const { rows } = await this.db.query(
      `INSERT INTO source_collections (workspace_id,title,description,collection_type,created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [workspaceId, input.title, input.description || null, input.collectionType, context.userId]
    );
    return rows[0];
  }

  async addCollectionItem(collectionId, input, context) {
    const collection = await this.db.query('SELECT * FROM source_collections WHERE id = $1', [collectionId]);
    if (!collection.rows[0]) throw educationError('Collection not found.', 404, 'COLLECTION_NOT_FOUND');
    await this.access.getWorkspace(collection.rows[0].workspace_id, context, 'write');
    if (input.legalSourceId) {
      await this.access.getSource(input.legalSourceId, input.legalSourceChunkId || null, context);
    } else if (!input.externalSourceMetadata) {
      throw educationError('A legal source or external metadata is required.', 400, 'COLLECTION_SOURCE_REQUIRED');
    }
    const external = input.externalSourceMetadata
      ? { ...input.externalSourceMetadata, verificationStatus: 'EXTERNAL_METADATA_ONLY' }
      : null;
    const { rows } = await this.db.query(
      `INSERT INTO source_collection_items (
         collection_id,legal_source_id,legal_source_chunk_id,external_source_metadata,title,note,sort_order,added_by
       ) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8) RETURNING *`,
      [collectionId, input.legalSourceId || null, input.legalSourceChunkId || null,
        external ? JSON.stringify(external) : null, input.title, input.note || null, input.sortOrder || 0, context.userId]
    );
    return rows[0];
  }
}

module.exports = { ACADEMIC_LEVELS, LearningWorkspaceService, WORKSPACE_TYPES };
