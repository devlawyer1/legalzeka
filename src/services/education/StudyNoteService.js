const { pool } = require('../../config/db');
const AuditLogService = require('../AuditLogService');
const { EducationAccessService, educationError } = require('./EducationAccessService');
const { EducationAiService } = require('./EducationAiService');
const { EntitlementService } = require('./EntitlementService');

class StudyNoteService {
  constructor({ db = pool, access = new EducationAccessService({ db }), ai = new EducationAiService({ db }), entitlements = new EntitlementService({ db }) } = {}) {
    this.db = db; this.access = access; this.ai = ai; this.entitlements = entitlements;
  }

  async create(workspaceId, input, context, { req } = {}) {
    await this.entitlements.require(context, 'EDU_WORKSPACE');
    await this.access.getWorkspace(workspaceId, context, 'write');
    if (input.topicId) {
      const topic = await this.db.query('SELECT workspace_id FROM learning_topics WHERE id = $1', [input.topicId]);
      if (topic.rows[0]?.workspace_id !== workspaceId) throw educationError('Topic is outside workspace.', 400, 'TOPIC_SCOPE_MISMATCH');
    }
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const note = await client.query(
        `INSERT INTO study_notes (workspace_id,topic_id,title,content_json,plain_text,status,created_by)
         VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7) RETURNING *`,
        [workspaceId, input.topicId || null, input.title, JSON.stringify(input.contentJson || { type: 'doc', content: [] }),
          input.plainText || '', input.status || 'DRAFT', context.userId]
      );
      const version = await client.query(
        `INSERT INTO study_note_versions (note_id,version_number,content_json,plain_text,change_summary,created_by)
         VALUES ($1,1,$2::jsonb,$3,$4,$5) RETURNING *`,
        [note.rows[0].id, JSON.stringify(note.rows[0].content_json), note.rows[0].plain_text, 'Initial version', context.userId]
      );
      await client.query('UPDATE study_notes SET current_version_id = $2 WHERE id = $1', [note.rows[0].id, version.rows[0].id]);
      await AuditLogService.record({ db: client, strict: true, req: req || { user: { id: context.userId } }, action: 'STUDY_NOTE_CREATED', entityType: 'STUDY_NOTE', entityId: note.rows[0].id, metadata: { workspaceId } });
      await AuditLogService.record({ db: client, strict: true, req: req || { user: { id: context.userId } }, action: 'STUDY_NOTE_VERSION_CREATED', entityType: 'STUDY_NOTE_VERSION', entityId: version.rows[0].id, metadata: { workspaceId, versionNumber: 1 } });
      await client.query('COMMIT');
      return { ...note.rows[0], current_version_id: version.rows[0].id };
    } catch (error) {
      await client.query('ROLLBACK'); throw error;
    } finally { client.release(); }
  }

  async get(noteId, context) {
    const { rows } = await this.db.query('SELECT * FROM study_notes WHERE id=$1 AND deleted_at IS NULL', [noteId]);
    if (!rows[0]) throw educationError('Study note not found.', 404, 'STUDY_NOTE_NOT_FOUND');
    await this.access.getWorkspace(rows[0].workspace_id, context);
    const versions = await this.db.query(
      'SELECT id,version_number,change_summary,created_by,created_at FROM study_note_versions WHERE note_id=$1 ORDER BY version_number DESC', [noteId]
    );
    return { ...rows[0], versions: versions.rows };
  }

  async update(noteId, input, context, { req } = {}) {
    const note = await this.get(noteId, context);
    await this.access.getWorkspace(note.workspace_id, context, 'write');
    let contentJson = input.contentJson ?? note.content_json;
    let plainText = input.plainText ?? note.plain_text;
    let suggestionId = null;
    if (input.suggestionId) {
      const suggestion = await this.db.query("SELECT * FROM study_note_suggestions WHERE id=$1 AND note_id=$2 AND status='PENDING'", [input.suggestionId, noteId]);
      if (!suggestion.rows[0]) throw educationError('Pending suggestion not found.', 404, 'NOTE_SUGGESTION_NOT_FOUND');
      contentJson = suggestion.rows[0].suggested_content;
      plainText = suggestion.rows[0].suggested_plain_text;
      suggestionId = suggestion.rows[0].id;
    }
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const versionNumber = (await client.query('SELECT coalesce(max(version_number),0)+1 AS next FROM study_note_versions WHERE note_id=$1', [noteId])).rows[0].next;
      const version = await client.query(
        `INSERT INTO study_note_versions (note_id,version_number,content_json,plain_text,change_summary,created_by)
         VALUES ($1,$2,$3::jsonb,$4,$5,$6) RETURNING *`,
        [noteId, versionNumber, JSON.stringify(contentJson), plainText, input.changeSummary || null, context.userId]
      );
      const updated = await client.query(
        `UPDATE study_notes SET title=coalesce($2,title),content_json=$3::jsonb,plain_text=$4,
           status=coalesce($5,status),current_version_id=$6,updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *`,
        [noteId, input.title || null, JSON.stringify(contentJson), plainText, input.status || null, version.rows[0].id]
      );
      if (suggestionId) await client.query("UPDATE study_note_suggestions SET status='ACCEPTED',reviewed_by=$2,reviewed_at=CURRENT_TIMESTAMP WHERE id=$1", [suggestionId, context.userId]);
      await AuditLogService.record({ db: client, strict: true, req: req || { user: { id: context.userId } }, action: 'STUDY_NOTE_VERSION_CREATED', entityType: 'STUDY_NOTE_VERSION', entityId: version.rows[0].id, metadata: { workspaceId: note.workspace_id, versionNumber } });
      await client.query('COMMIT');
      return updated.rows[0];
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async suggest(noteId, input, context) {
    const note = await this.get(noteId, context);
    await this.access.getWorkspace(note.workspace_id, context, 'write');
    const sourceIds = await this.access.assertSources(input.sourceIds || [], context);
    const sources = [];
    for (const id of sourceIds) {
      const source = await this.access.getSource(id, null, context);
      sources.push({ sourceId: id, title: source.title, excerpt: String(source.content || '').slice(0, 5000) });
    }
    const result = await this.ai.run({
      operation: `NOTE_${input.operation}`,
      workspaceId: note.workspace_id,
      userId: context.userId,
      systemPrompt: 'Create a study-note preview. Return {contentJson,plainText,sourceIds}. The existing note must not be modified.',
      payload: { operation: input.operation, note: { plainText: note.plain_text }, sources },
    });
    const outputIds = await this.access.assertSources(result.output.sourceIds || [], context);
    if (outputIds.some((id) => !sourceIds.includes(id))) throw educationError('AI returned a source outside context.', 422, 'AI_SOURCE_OUT_OF_SCOPE');
    const { rows } = await this.db.query(
      `INSERT INTO study_note_suggestions (
         note_id,operation,suggested_content,suggested_plain_text,source_ids,ai_usage_id,created_by
       ) VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7) RETURNING *`,
      [noteId, input.operation, JSON.stringify(result.output.contentJson || { type: 'doc', content: [] }),
        result.output.plainText || '', outputIds, result.usage.id, context.userId]
    );
    return rows[0];
  }
}

module.exports = { StudyNoteService };
