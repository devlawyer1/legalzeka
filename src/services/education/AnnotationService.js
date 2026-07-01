const { pool } = require('../../config/db');
const AuditLogService = require('../AuditLogService');
const { EducationAccessService, educationError, pageOptions } = require('./EducationAccessService');

const TYPES = Object.freeze(['HIGHLIGHT','COMMENT','QUESTION','ARGUMENT','COUNTER_ARGUMENT','METHOD_NOTE']);
const VISIBILITIES = Object.freeze(['PRIVATE','COURSE','WORKSPACE']);

class AnnotationService {
  constructor({ db = pool, access = new EducationAccessService({ db }) } = {}) { this.db = db; this.access = access; }

  async create(workspaceId, input, context, { req } = {}) {
    const workspace = await this.access.getWorkspace(workspaceId, context, 'write');
    if (!TYPES.includes(input.annotationType)) throw educationError('Invalid annotation type.', 400, 'INVALID_ANNOTATION_TYPE');
    if (!VISIBILITIES.includes(input.visibility || 'PRIVATE')) throw educationError('Invalid annotation visibility.', 400, 'INVALID_ANNOTATION_VISIBILITY');
    const source = await this.access.assertChunk(input.legalSourceId, input.chunkId || null, null, context);
    if (input.endOffset != null && input.endOffset > String(source.chunk_content || source.content || '').length) {
      throw educationError('Annotation offset exceeds source text.', 400, 'INVALID_ANNOTATION_OFFSET');
    }
    const { rows } = await this.db.query(
      `INSERT INTO source_annotations (
         workspace_id,legal_source_id,chunk_id,annotation_type,content,start_offset,end_offset,tags,visibility,created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [workspaceId, input.legalSourceId, input.chunkId || null, input.annotationType, input.content,
        input.startOffset ?? null, input.endOffset ?? null, input.tags || [], input.visibility || 'PRIVATE', context.userId]
    );
    await AuditLogService.record({ db: this.db, req: req || { user: { id: context.userId } }, action: 'SOURCE_ANNOTATED', entityType: 'SOURCE_ANNOTATION', entityId: rows[0].id, lawFirmId: workspace.organization_id, metadata: { workspaceId, annotationType: input.annotationType } });
    return rows[0];
  }

  async list(workspaceId, context, filters = {}) {
    await this.access.getWorkspace(workspaceId, context);
    const page = pageOptions(filters, ['created_at','updated_at']);
    const { rows } = await this.db.query(
      `SELECT annotation.* FROM source_annotations annotation
       WHERE annotation.workspace_id=$1
         AND ($2::uuid IS NULL OR annotation.legal_source_id=$2)
         AND (annotation.visibility <> 'PRIVATE' OR annotation.created_by=$3)
       ORDER BY ${page.sort} ${page.direction}, annotation.id LIMIT $4 OFFSET $5`,
      [workspaceId, filters.sourceId || null, context.userId, page.limit, page.offset]
    );
    return { items: rows, limit: page.limit, offset: page.offset };
  }
}

module.exports = { AnnotationService };
