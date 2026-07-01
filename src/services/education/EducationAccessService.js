const { pool } = require('../../config/db');
const { canUseOrganization } = require('../accessContext');

function educationError(message, status = 400, code = 'EDUCATION_ERROR') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function pageOptions(input = {}, allowedSorts = ['updated_at', 'created_at', 'title']) {
  const limit = Math.min(Math.max(Number(input.limit) || 50, 1), 100);
  const offset = Math.max(Number(input.offset) || 0, 0);
  const sort = allowedSorts.includes(input.sort) ? input.sort : allowedSorts[0];
  const direction = String(input.direction || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return { limit, offset, sort, direction };
}

class EducationAccessService {
  constructor({ db = pool } = {}) { this.db = db; }

  async getWorkspace(workspaceId, context, permission = 'read', { db = this.db } = {}) {
    const { rows } = await db.query(
      `SELECT workspace.*,
              course.id AS course_id,
              course.instructor_user_id,
              course_member.role AS course_role,
              course_member.status AS course_member_status,
              project.id AS project_id,
              project_member.role AS project_role
       FROM learning_workspaces workspace
       LEFT JOIN courses course ON course.workspace_id = workspace.id
       LEFT JOIN course_members course_member
         ON course_member.course_id = course.id AND course_member.user_id = $2
       LEFT JOIN research_projects project ON project.workspace_id = workspace.id
       LEFT JOIN research_project_members project_member
         ON project_member.project_id = project.id AND project_member.user_id = $2
       WHERE workspace.id = $1 AND workspace.deleted_at IS NULL LIMIT 1`,
      [workspaceId, context?.userId || null]
    );
    const workspace = rows[0];
    if (!workspace) throw educationError('Learning workspace not found.', 404, 'LEARNING_WORKSPACE_NOT_FOUND');
    const owns = workspace.owner_user_id === context?.userId;
    const membershipScoped = ['COURSE', 'RESEARCH_PROJECT'].includes(workspace.workspace_type);
    const organizationPermission = !membershipScoped && workspace.organization_id
      && canUseOrganization(context, workspace.organization_id, permission === 'read' ? 'read' : 'write');
    const courseRead = workspace.course_member_status === 'ACTIVE';
    const courseWrite = courseRead && ['INSTRUCTOR', 'TEACHING_ASSISTANT'].includes(workspace.course_role);
    const projectRead = Boolean(workspace.project_role);
    const projectWrite = ['OWNER', 'RESEARCHER'].includes(workspace.project_role);
    const allowed = context?.isSystemAdmin || owns || organizationPermission
      || (permission === 'read' ? courseRead || projectRead : courseWrite || projectWrite);
    if (!allowed) throw educationError('Learning workspace not found.', 404, 'LEARNING_WORKSPACE_NOT_FOUND');
    return workspace;
  }

  async getCourse(courseId, context, permission = 'read', { db = this.db } = {}) {
    const { rows } = await db.query('SELECT * FROM courses WHERE id = $1', [courseId]);
    if (!rows[0]) throw educationError('Course not found.', 404, 'COURSE_NOT_FOUND');
    const workspace = await this.getWorkspace(rows[0].workspace_id, context, permission, { db });
    return { ...rows[0], workspace };
  }

  async getProject(projectId, context, permission = 'read', { db = this.db } = {}) {
    const { rows } = await db.query('SELECT * FROM research_projects WHERE id = $1', [projectId]);
    if (!rows[0]) throw educationError('Research project not found.', 404, 'RESEARCH_PROJECT_NOT_FOUND');
    const workspace = await this.getWorkspace(rows[0].workspace_id, context, permission, { db });
    return { ...rows[0], workspace };
  }

  async getSource(sourceId, chunkId, context, { db = this.db } = {}) {
    const organizationIds = context?.scopes?.organizationIds || [];
    const { rows } = await db.query(
      `SELECT source.*,
              chunk.id AS chunk_id, chunk.content AS chunk_content,
              chunk.heading AS chunk_heading, chunk.chunk_type
       FROM legal_sources source
       LEFT JOIN legal_source_chunks chunk ON chunk.source_id = source.id AND chunk.id = $2
       WHERE source.id = $1
         AND (
           $3::boolean = true OR source.visibility = 'PUBLIC'
           OR (source.visibility = 'PERSONAL' AND source.owner_user_id = $4)
           OR (source.visibility = 'ORGANIZATION' AND source.organization_id = ANY($5::uuid[]))
         ) LIMIT 1`,
      [sourceId, chunkId || null, context?.isSystemAdmin || false, context?.userId || null, organizationIds]
    );
    const source = rows[0];
    if (!source || (chunkId && !source.chunk_id)) {
      throw educationError('Legal source not found.', 404, 'LEGAL_SOURCE_NOT_FOUND');
    }
    return source;
  }

  async assertSources(sourceIds, context, { db = this.db } = {}) {
    const unique = [...new Set((sourceIds || []).filter(Boolean))];
    for (const sourceId of unique) await this.getSource(sourceId, null, context, { db });
    return unique;
  }

  async assertChunk(sourceId, chunkId, excerpt, context, { db = this.db } = {}) {
    const source = await this.getSource(sourceId, chunkId, context, { db });
    if (excerpt && !String(source.chunk_content || '').includes(String(excerpt))) {
      throw educationError('Citation excerpt is not present in the selected source chunk.', 400, 'CITATION_NOT_GROUNDED');
    }
    return source;
  }
}

module.exports = { EducationAccessService, educationError, pageOptions };
