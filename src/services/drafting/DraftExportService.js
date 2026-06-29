const fs = require('node:fs');
const {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} = require('docx');
const PDFDocument = require('pdfkit');
const { httpError } = require('./DraftService');

const FONT_PATHS = Object.freeze([
  process.env.DRAFT_PDF_FONT_PATH,
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  'C:\\Windows\\Fonts\\arial.ttf',
].filter(Boolean));

function safeFilename(value, extension) {
  const base = String(value || 'dilekce')
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100) || 'dilekce';
  return `${base}.${extension}`;
}

function splitParagraphs(content) {
  return String(content || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function citationLabel(citation, index) {
  const identity = [citation.court, citation.chamber].filter(Boolean).join(' ');
  const number = [citation.case_number, citation.decision_number].filter(Boolean).join(', ');
  const date = citation.decision_date ? String(citation.decision_date).slice(0, 10) : '';
  return `${index + 1}. ${citation.source_title || identity || 'Hukuki kaynak'}${number ? `, ${number}` : ''}${date ? `, ${date}` : ''}. ${citation.source_excerpt || ''}`.trim();
}

class DraftExportService {
  constructor({ draftService }) {
    this.draftService = draftService;
  }

  async load(draftId, accessContext) {
    const detail = await this.draftService.getDetail(draftId, accessContext);
    if (!detail) throw httpError(404, 'Taslak bulunamadı.', 'DRAFT_NOT_FOUND');
    return detail;
  }

  async toDocx(draftId, accessContext) {
    const draft = await this.load(draftId, accessContext);
    const children = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        heading: HeadingLevel.TITLE,
        children: [new TextRun({ text: draft.title, bold: true, size: 30 })],
      }),
    ];
    for (const section of draft.sections) {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: section.title, bold: true })],
      }));
      const paragraphs = splitParagraphs(section.content);
      for (const paragraph of paragraphs.length ? paragraphs : ['']) {
        children.push(new Paragraph({ text: paragraph, spacing: { after: 120 }, alignment: AlignmentType.JUSTIFIED }));
      }
    }
    if (draft.citations.length) {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: 'Kaynaklar', bold: true })],
      }));
      draft.citations.forEach((citation, index) => children.push(new Paragraph({
        text: citationLabel(citation, index),
        spacing: { after: 100 },
      })));
    }
    const document = new Document({
      creator: 'Legal Zeka',
      title: draft.title,
      description: 'Hukuki belge taslağı',
      sections: [{ properties: {}, children }],
    });
    return {
      buffer: await Packer.toBuffer(document),
      filename: safeFilename(draft.title, 'docx'),
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      draft,
    };
  }

  async toPdf(draftId, accessContext) {
    const draft = await this.load(draftId, accessContext);
    const buffer = await new Promise((resolve, reject) => {
      const document = new PDFDocument({ size: 'A4', margins: { top: 56, right: 56, bottom: 56, left: 56 }, info: { Title: draft.title, Author: 'Legal Zeka' } });
      const chunks = [];
      document.on('data', (chunk) => chunks.push(chunk));
      document.on('error', reject);
      document.on('end', () => resolve(Buffer.concat(chunks)));
      const font = FONT_PATHS.find((candidate) => fs.existsSync(candidate));
      if (font) document.font(font);
      document.fontSize(17).text(draft.title, { align: 'center' }).moveDown(1.5);
      for (const section of draft.sections) {
        document.fontSize(12).fillColor('#111827').text(section.title, { continued: false }).moveDown(0.35);
        document.fontSize(10.5).fillColor('#1f2937').text(section.content || '', { align: 'justify', lineGap: 3 }).moveDown(1);
      }
      if (draft.citations.length) {
        document.addPage();
        document.fontSize(13).fillColor('#111827').text('Kaynaklar').moveDown(0.75);
        draft.citations.forEach((citation, index) => {
          document.fontSize(9).fillColor('#374151').text(citationLabel(citation, index), { lineGap: 2 }).moveDown(0.6);
        });
      }
      document.end();
    });
    return {
      buffer,
      filename: safeFilename(draft.title, 'pdf'),
      contentType: 'application/pdf',
      draft,
    };
  }
}

module.exports = { DraftExportService, citationLabel, safeFilename };
