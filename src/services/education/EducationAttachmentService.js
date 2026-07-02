const path = require('node:path');
const { pool } = require('../../config/db');
const { storage } = require('../storage');
const { validateTemporaryUpload } = require('../security/fileValidationService');
const { EducationAccessService, educationError } = require('./EducationAccessService');

class EducationAttachmentService {
  constructor({ db = pool, storageProvider = storage, access = new EducationAccessService({ db }) } = {}) { this.db = db; this.storage = storageProvider; this.access = access; }

  async resolveTarget(target, context) {
    if (target.workspaceId) {
      const workspace = await this.access.getWorkspace(target.workspaceId, context, 'write');
      return { workspace, column: 'workspace_id', id: target.workspaceId, scopeType: target.scopeType || 'ACADEMIC_SOURCE' };
    }
    if (target.assignmentId) {
      const row = await this.db.query('SELECT assignment.*,course.workspace_id FROM assignments assignment JOIN courses course ON course.id=assignment.course_id WHERE assignment.id=$1', [target.assignmentId]);
      if (!row.rows[0]) throw educationError('Assignment not found.', 404, 'ASSIGNMENT_NOT_FOUND');
      const workspace = await this.access.getWorkspace(row.rows[0].workspace_id, context, 'write');
      return { workspace, column: 'assignment_id', id: target.assignmentId, scopeType: 'EDUCATION_ASSIGNMENT' };
    }
    if (target.researchProjectId) {
      const project = await this.access.getProject(target.researchProjectId, context, 'write');
      return { workspace: project.workspace, column: 'research_project_id', id: target.researchProjectId, scopeType: 'RESEARCH_ATTACHMENT' };
    }
    throw educationError('Attachment target is required.', 400, 'VALIDATION_FAILED');
  }

  async upload(file, target, context) {
    const resolved = await this.resolveTarget(target, context);
    const validated = await validateTemporaryUpload(file);
    const storageKey = this.storage.createStorageKey(validated.extension);
    let stored;
    try {
      stored = await this.storage.store({ sourcePath: file.path, storageKey, expectedSha256: validated.sha256Hash, metadata: { scope: resolved.scopeType.toLowerCase() } });
      const { rows } = await this.db.query(
        `WITH object AS (
          INSERT INTO storage_objects(provider,storage_key,scope_type,organization_id,owner_user_id,content_sha256,size_bytes,metadata)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING id
        ) INSERT INTO education_attachments(storage_object_id,${resolved.column},uploaded_by)
          SELECT id,$9,$10 FROM object RETURNING *`,
        [this.storage.constructor.name === 'S3StorageProvider' ? 'S3' : 'LOCAL', storageKey, resolved.scopeType,
          resolved.workspace.organization_id || null, resolved.workspace.owner_user_id || context.userId,
          validated.sha256Hash, validated.fileSizeBytes, JSON.stringify({ originalFilename: path.basename(validated.originalFilename), mimeType: validated.detectedMimeType }),
          resolved.id, context.userId]
      );
      return { ...rows[0], storageKey, sha256: validated.sha256Hash, size: validated.fileSizeBytes };
    } catch (error) {
      if (stored) await this.storage.delete(storageKey).catch(() => {});
      await this.storage.deleteTemporary?.(file.path).catch(() => {});
      throw error;
    }
  }
}

module.exports = { EducationAttachmentService };
