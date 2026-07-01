const fs = require('node:fs');
const { Document, HeadingLevel, Packer, Paragraph, TextRun } = require('docx');
const PDFDocument = require('pdfkit');
const { pool } = require('../../config/db');
const AuditLogService = require('../AuditLogService');
const { safeFilename } = require('../drafting/DraftExportService');
const { EducationAccessService, educationError } = require('./EducationAccessService');
const { EntitlementService } = require('./EntitlementService');

const FONT_PATHS = [process.env.DRAFT_PDF_FONT_PATH, '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 'C:\\Windows\\Fonts\\arial.ttf'].filter(Boolean);

function sourceMetadata(source) {
  return {
    title: source.title || null,
    court: source.court || null,
    caseNumber: source.case_number || null,
    decisionNumber: source.decision_number || null,
    decisionDate: source.decision_date ? String(source.decision_date).slice(0, 10) : null,
    sourceUrl: source.source_url || null,
    sourceType: source.source_type || null,
  };
}

function missingFields(source) {
  const meta = sourceMetadata(source);
  const required = ['title', 'sourceType'];
  if (String(meta.sourceType || '').includes('DECISION')) required.push('court', 'caseNumber', 'decisionNumber', 'decisionDate');
  else required.push('sourceUrl');
  return required.filter((key) => !meta[key]);
}

function draftCitation(source, style = 'LEGAL_ZEKA_SIMPLE') {
  const meta = sourceMetadata(source);
  const pieces = [meta.court, meta.caseNumber, meta.decisionNumber, meta.decisionDate, meta.title].filter(Boolean);
  const prefix = style === 'APA' ? `${meta.court || meta.title || 'Unknown source'} (${meta.decisionDate?.slice(0, 4) || 'n.d.'}).` : '';
  return { text: prefix || pieces.join(', '), style, draft: style !== 'LEGAL_ZEKA_SIMPLE', missing: missingFields(source) };
}

function csvEscape(value) { const text = String(value ?? ''); return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }

class CitationExportService {
  constructor({ db = pool, access = new EducationAccessService({ db }), entitlements = new EntitlementService({ db }) } = {}) {
    this.db = db; this.access = access; this.entitlements = entitlements;
  }

  async exportNote(noteId, format, context, { req } = {}) {
    await this.entitlements.require(context, 'ACADEMIC_EXPORT');
    const noteResult = await this.db.query('SELECT * FROM study_notes WHERE id=$1 AND deleted_at IS NULL', [noteId]);
    const note = noteResult.rows[0];
    if (!note) throw educationError('Study note not found.', 404, 'STUDY_NOTE_NOT_FOUND');
    const workspace = await this.access.getWorkspace(note.workspace_id, context);
    let output;
    if (format === 'DOCX') {
      const children = [new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: note.title, bold: true })] })];
      for (const line of String(note.plain_text || '').split(/\r?\n/)) children.push(new Paragraph({ text: line }));
      const document = new Document({ creator: 'Legal Zeka', title: note.title, description: 'Study note export', sections: [{ children }] });
      output = { buffer: await Packer.toBuffer(document), filename: safeFilename(note.title, 'docx'), contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
    } else if (format === 'PDF') {
      const buffer = await new Promise((resolve, reject) => {
        const document = new PDFDocument({ size: 'A4', margins: { top: 56, right: 56, bottom: 56, left: 56 }, info: { Title: note.title, Author: 'Legal Zeka' } });
        const chunks = []; document.on('data', (chunk) => chunks.push(chunk)); document.on('error', reject); document.on('end', () => resolve(Buffer.concat(chunks)));
        const font = FONT_PATHS.find((candidate) => fs.existsSync(candidate)); if (font) document.font(font);
        document.fontSize(17).text(note.title, { align: 'center' }).moveDown();
        document.fontSize(10.5).text(note.plain_text || '', { align: 'justify', lineGap: 3 }); document.end();
      });
      output = { buffer, filename: safeFilename(note.title, 'pdf'), contentType: 'application/pdf' };
    } else throw educationError('Unsupported note export format.', 400, 'INVALID_EXPORT_FORMAT');
    await AuditLogService.record({ db: this.db, req: req || { user: { id: context.userId } }, action: 'EDUCATION_EXPORT_CREATED', entityType: 'STUDY_NOTE', entityId: noteId, lawFirmId: workspace.organization_id, metadata: { format, workspaceId: note.workspace_id } });
    return output;
  }

  async exportProject(projectId, format, context, { req } = {}) {
    await this.entitlements.require(context, 'ACADEMIC_EXPORT');
    const project = await this.access.getProject(projectId, context);
    const coded = await this.db.query(
      `SELECT schema.name AS schema_name,item.schema_version,source.title,source.source_type,source.court,
              source.case_number,source.decision_number,source.decision_date,source.source_url,item.coded_values,item.review_status
       FROM coded_source_items item JOIN coding_schemas schema ON schema.id=item.schema_id
       JOIN legal_sources source ON source.id=item.legal_source_id WHERE item.project_id=$1
       ORDER BY schema.name,source.title`, [projectId]
    );
    let buffer; let extension; let contentType;
    if (format === 'CSV') {
      const headers = ['schema','schemaVersion','sourceTitle','sourceType','court','caseNumber','decisionNumber','decisionDate','codedValues','reviewStatus'];
      const lines = [headers.join(',')];
      for (const row of coded.rows) lines.push([
        row.schema_name,row.schema_version,row.title,row.source_type,row.court,row.case_number,row.decision_number,
        row.decision_date ? String(row.decision_date).slice(0,10) : '',JSON.stringify(row.coded_values),row.review_status,
      ].map(csvEscape).join(','));
      buffer = Buffer.from(lines.join('\n'), 'utf8'); extension = 'csv'; contentType = 'text/csv; charset=utf-8';
    } else if (format === 'JSON') {
      const entries = await this.db.query('SELECT entry_type,title,content,tags FROM research_entries WHERE project_id=$1 ORDER BY created_at', [projectId]);
      buffer = Buffer.from(JSON.stringify({ title: project.title, abstract: project.abstract, researchQuestion: project.research_question, hypothesis: project.hypothesis, methodology: project.methodology, entries: entries.rows.map((row) => ({ type: row.entry_type, title: row.title, content: row.content, tags: row.tags })), codedSources: coded.rows.map((row) => ({ schema: row.schema_name, schemaVersion: row.schema_version, source: sourceMetadata(row), codedValues: row.coded_values, reviewStatus: row.review_status })) }, null, 2));
      extension = 'json'; contentType = 'application/json';
    } else if (format === 'RIS') {
      const unique = [...new Map(coded.rows.map((source) => [JSON.stringify(sourceMetadata(source)), source])).values()];
      buffer = Buffer.from(unique.map((source) => {
        const meta = sourceMetadata(source); const missing = missingFields(source);
        return ['TY  - CASE', meta.title && `TI  - ${meta.title}`, meta.court && `AU  - ${meta.court}`, meta.decisionDate && `PY  - ${meta.decisionDate.slice(0,4)}`, meta.sourceUrl && `UR  - ${meta.sourceUrl}`, missing.length && `N1  - Draft citation; missing metadata: ${missing.join(', ')}`, 'ER  -'].filter(Boolean).join('\n');
      }).join('\n\n')); extension = 'ris'; contentType = 'application/x-research-info-systems';
    } else if (format === 'BIBTEX') {
      const unique = [...new Map(coded.rows.map((source) => [JSON.stringify(sourceMetadata(source)), source])).values()];
      buffer = Buffer.from(unique.map((source, index) => {
        const meta = sourceMetadata(source); const missing = missingFields(source);
        return `@misc{source${index + 1},\n  title = {${meta.title || ''}},${meta.court ? `\n  author = {${meta.court}},` : ''}${meta.decisionDate ? `\n  year = {${meta.decisionDate.slice(0,4)}},` : ''}${meta.sourceUrl ? `\n  url = {${meta.sourceUrl}},` : ''}\n  note = {Draft citation${missing.length ? `; missing metadata: ${missing.join(', ')}` : ''}}\n}`;
      }).join('\n\n')); extension = 'bib'; contentType = 'application/x-bibtex';
    } else throw educationError('Unsupported project export format.', 400, 'INVALID_EXPORT_FORMAT');
    await AuditLogService.record({ db: this.db, req: req || { user: { id: context.userId } }, action: 'EDUCATION_EXPORT_CREATED', entityType: 'RESEARCH_PROJECT', entityId: projectId, lawFirmId: project.workspace.organization_id, metadata: { format } });
    return { buffer, filename: safeFilename(project.title, extension), contentType };
  }
}

module.exports = { CitationExportService, draftCitation, missingFields, sourceMetadata };
