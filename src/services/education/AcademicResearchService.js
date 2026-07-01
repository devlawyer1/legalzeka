const { pool } = require('../../config/db');
const AuditLogService = require('../AuditLogService');
const { canUseOrganization } = require('../accessContext');
const { EducationAccessService, educationError } = require('./EducationAccessService');
const { EntitlementService } = require('./EntitlementService');

const ENTRY_TYPES = Object.freeze(['LITERATURE_NOTE','CASE_NOTE','LEGISLATION_NOTE','METHOD_NOTE','FINDING','COUNTER_FINDING','LIMITATION']);
const FORBIDDEN_SCHEMA_KEYS = /^(eval|function|script|code|require|import|exec|command|shell|prototype|constructor)$/i;

function assertSafeSchema(value, depth = 0) {
  if (depth > 12) throw educationError('Coding schema is too deeply nested.', 400, 'INVALID_CODING_SCHEMA');
  if (Array.isArray(value)) return value.forEach((item) => assertSafeSchema(item, depth + 1));
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_SCHEMA_KEYS.test(key)) throw educationError('Coding schema cannot contain executable fields.', 400, 'ARBITRARY_CODE_REJECTED');
    assertSafeSchema(child, depth + 1);
  }
}

function validateCodedValues(schema, values) {
  if (schema?.type && schema.type !== 'object') throw educationError('Coding schema root must be an object.', 400, 'INVALID_CODING_SCHEMA');
  for (const key of schema?.required || []) {
    if (!Object.hasOwn(values || {}, key)) throw educationError(`Missing coded value: ${key}`, 400, 'CODED_VALUE_REQUIRED');
  }
  for (const [key, value] of Object.entries(values || {})) {
    const rule = schema?.properties?.[key];
    if (!rule) throw educationError(`Unknown coded value: ${key}`, 400, 'UNKNOWN_CODED_VALUE');
    if (rule.enum && !rule.enum.includes(value)) throw educationError(`Invalid coded enum: ${key}`, 400, 'INVALID_CODED_VALUE');
    if (rule.type === 'boolean' && typeof value !== 'boolean') throw educationError(`Expected boolean: ${key}`, 400, 'INVALID_CODED_VALUE');
    if (rule.type === 'string' && typeof value !== 'string') throw educationError(`Expected string: ${key}`, 400, 'INVALID_CODED_VALUE');
    if (rule.type === 'number' && typeof value !== 'number') throw educationError(`Expected number: ${key}`, 400, 'INVALID_CODED_VALUE');
  }
}

class AcademicResearchService {
  constructor({ db = pool, access = new EducationAccessService({ db }), entitlements = new EntitlementService({ db }) } = {}) {
    this.db = db; this.access = access; this.entitlements = entitlements;
  }

  async createProject(input, context, { req } = {}) {
    await this.entitlements.require(context, 'ACADEMIC_RESEARCH');
    if (input.organizationId && !canUseOrganization(context, input.organizationId, 'write')) throw educationError('Organization not found.', 404, 'ORGANIZATION_NOT_FOUND');
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const workspace = await client.query(
        `INSERT INTO learning_workspaces (
           workspace_type,organization_id,owner_user_id,title,description,legal_domain,academic_level,created_by
         ) VALUES ('RESEARCH_PROJECT',$1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [input.organizationId || null, input.organizationId ? null : context.userId, input.title,
          input.abstract || null, input.legalDomain || null, input.academicLevel || null, context.userId]
      );
      const project = await client.query(
        `INSERT INTO research_projects (
           workspace_id,title,abstract,research_question,hypothesis,methodology,status,created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [workspace.rows[0].id, input.title, input.abstract || null, input.researchQuestion || null,
          input.hypothesis || null, input.methodology || null, input.status || 'PLANNING', context.userId]
      );
      await client.query(
        `INSERT INTO research_project_members (project_id,user_id,role,permissions)
         VALUES ($1,$2,'OWNER','{"read":true,"write":true,"admin":true}'::jsonb)`, [project.rows[0].id, context.userId]
      );
      await AuditLogService.record({ db: client, strict: true, req: req || { user: { id: context.userId } }, action: 'RESEARCH_PROJECT_CREATED', entityType: 'RESEARCH_PROJECT', entityId: project.rows[0].id, lawFirmId: input.organizationId || null, metadata: { workspaceId: workspace.rows[0].id } });
      await client.query('COMMIT');
      return { ...project.rows[0], workspace: workspace.rows[0] };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async getProject(projectId, context) {
    const project = await this.access.getProject(projectId, context);
    const [members, entries, schemas, coded] = await Promise.all([
      this.db.query('SELECT user_id,role,permissions,created_at FROM research_project_members WHERE project_id=$1 ORDER BY created_at', [projectId]),
      this.db.query('SELECT * FROM research_entries WHERE project_id=$1 ORDER BY updated_at DESC LIMIT 100', [projectId]),
      this.db.query('SELECT * FROM coding_schemas WHERE project_id=$1 ORDER BY name,version_number DESC', [projectId]),
      this.db.query(`SELECT schema_id,legal_source_id,count(*)::int AS researcher_count,
        jsonb_agg(jsonb_build_object('codedBy',coded_by,'values',coded_values,'reviewStatus',review_status)) AS codings
        FROM coded_source_items WHERE project_id=$1 GROUP BY schema_id,legal_source_id`, [projectId]),
    ]);
    return { ...project, members: members.rows, entries: entries.rows, schemas: schemas.rows, codingComparison: coded.rows };
  }

  async createEntry(projectId, input, context) {
    const project = await this.access.getProject(projectId, context, 'write');
    if (!ENTRY_TYPES.includes(input.entryType)) throw educationError('Invalid research entry type.', 400, 'INVALID_RESEARCH_ENTRY_TYPE');
    if (input.legalSourceId) await this.access.getSource(input.legalSourceId, input.chunkId || null, context);
    const { rows } = await this.db.query(
      `INSERT INTO research_entries (project_id,entry_type,title,content,legal_source_id,chunk_id,tags,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [projectId, input.entryType, input.title, input.content, input.legalSourceId || null,
        input.chunkId || null, input.tags || [], context.userId]
    );
    return { ...rows[0], workspaceId: project.workspace_id };
  }

  async createCodingSchema(projectId, input, context, { req } = {}) {
    const project = await this.access.getProject(projectId, context, 'write');
    assertSafeSchema(input.definition);
    if (input.definition?.type !== 'object' || !input.definition?.properties) throw educationError('Coding schema must define object properties.', 400, 'INVALID_CODING_SCHEMA');
    const next = (await this.db.query('SELECT coalesce(max(version_number),0)+1 AS value FROM coding_schemas WHERE project_id=$1 AND name=$2', [projectId, input.name])).rows[0].value;
    const { rows } = await this.db.query(
      `INSERT INTO coding_schemas (project_id,name,description,version_number,definition,status,created_by)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7) RETURNING *`,
      [projectId, input.name, input.description || null, next, JSON.stringify(input.definition), input.status || 'DRAFT', context.userId]
    );
    await AuditLogService.record({ db: this.db, req: req || { user: { id: context.userId } }, action: 'CODING_SCHEMA_CREATED', entityType: 'CODING_SCHEMA', entityId: rows[0].id, lawFirmId: project.workspace.organization_id, metadata: { projectId, versionNumber: next } });
    return rows[0];
  }

  async codeSource(projectId, input, context, { req } = {}) {
    const project = await this.access.getProject(projectId, context, 'write');
    const schemaResult = await this.db.query('SELECT * FROM coding_schemas WHERE id=$1 AND project_id=$2', [input.schemaId, projectId]);
    const schema = schemaResult.rows[0];
    if (!schema) throw educationError('Coding schema not found.', 404, 'CODING_SCHEMA_NOT_FOUND');
    await this.access.getSource(input.legalSourceId, null, context);
    validateCodedValues(schema.definition, input.codedValues);
    try {
      const { rows } = await this.db.query(
        `INSERT INTO coded_source_items (
           project_id,schema_id,schema_version,legal_source_id,coded_values,coded_by
         ) VALUES ($1,$2,$3,$4,$5::jsonb,$6) RETURNING *`,
        [projectId, schema.id, schema.version_number, input.legalSourceId, JSON.stringify(input.codedValues), context.userId]
      );
      await AuditLogService.record({ db: this.db, req: req || { user: { id: context.userId } }, action: 'SOURCE_CODED', entityType: 'CODED_SOURCE_ITEM', entityId: rows[0].id, lawFirmId: project.workspace.organization_id, metadata: { projectId, schemaVersion: schema.version_number } });
      return rows[0];
    } catch (error) {
      if (error.code === '23505') throw educationError('This researcher already coded the source with this schema version.', 409, 'CODING_ALREADY_EXISTS');
      throw error;
    }
  }
}

module.exports = { AcademicResearchService, assertSafeSchema, validateCodedValues };
