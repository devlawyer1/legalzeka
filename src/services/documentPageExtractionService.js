const pdfParseLib = require('pdf-parse');
const AuditLogService = require('./AuditLogService');
const { ocrProvider: defaultOcrProvider } = require('./ocr');
const { parseTextBuffer } = require('../utils/fileParser');

function pageError(code, message, cause = null) {
  const error = new Error(message);
  error.code = code;
  error.safeMessage = message;
  error.cause = cause;
  return error;
}

function bounded(value, limit) {
  return String(value || '').slice(0, limit);
}

async function auditOcr(action, context, metadata = {}, success = true) {
  await AuditLogService.record({
    action,
    entityType: 'DOCUMENT_PAGE',
    entityId: context.documentId,
    caseId: context.caseId,
    documentId: context.documentId,
    lawFirmId: context.organizationId,
    success,
    metadata,
  });
}

async function runOcr(input, pageNumber, context, ocrProvider) {
  await auditOcr('OCR_STARTED', context, { pageNumber, language: process.env.OCR_LANGUAGE || 'tur' });
  try {
    const result = await ocrProvider.recognize(input, { pageNumber });
    await auditOcr('OCR_COMPLETED', context, {
      pageNumber,
      confidence: result.confidence,
      language: result.language,
      durationMs: result.durationMs,
      lowConfidence: result.confidence < Number(process.env.OCR_MIN_CONFIDENCE || 0.65),
    });
    return result;
  } catch (error) {
    await auditOcr('OCR_FAILED', context, { pageNumber, errorCode: error.code || 'OCR_FAILED' }, false);
    throw error;
  }
}

async function extractPdfPages(buffer, context, ocrProvider) {
  if (typeof pdfParseLib.PDFParse !== 'function') {
    throw pageError('PARSER_ERROR', 'The installed PDF parser does not support page extraction.');
  }
  const parser = new pdfParseLib.PDFParse({ data: buffer });
  const maxPageChars = Number(process.env.DOCUMENT_MAX_PAGE_TEXT_CHARS || 250000);
  const nativeThreshold = Number(process.env.OCR_NATIVE_TEXT_MIN_CHARS || 40);
  const scale = Number(process.env.OCR_PDF_RENDER_SCALE || 1.7);
  try {
    const result = await parser.getText();
    const pages = [];
    for (const nativePage of result.pages || []) {
      const pageNumber = Number(nativePage.num);
      const nativeText = bounded(nativePage.text, maxPageChars);
      if (nativeText.trim().length >= nativeThreshold) {
        pages.push({
          pageNumber,
          extractedText: nativeText,
          textSource: 'NATIVE',
          ocrConfidence: null,
          width: null,
          height: null,
          metadata: {},
        });
        continue;
      }

      let screenshot;
      try {
        const screenshots = await parser.getScreenshot({ partial: [pageNumber], scale, imageBuffer: true });
        screenshot = screenshots.pages?.[0];
      } catch (error) {
        throw pageError('PDF_RENDER_FAILED', 'A scanned PDF page could not be rendered for OCR.', error);
      }
      if (!screenshot?.data) throw pageError('PDF_RENDER_FAILED', 'A scanned PDF page could not be rendered for OCR.');
      const ocr = await runOcr(Buffer.from(screenshot.data), pageNumber, context, ocrProvider);
      pages.push({
        pageNumber,
        extractedText: bounded(ocr.text, maxPageChars),
        textSource: 'OCR',
        ocrConfidence: ocr.confidence,
        width: screenshot.width || null,
        height: screenshot.height || null,
        metadata: { language: ocr.language, durationMs: ocr.durationMs },
      });
    }
    return pages;
  } finally {
    await parser.destroy();
  }
}

async function extractDocumentPages({ buffer, mimeType, context, ocrProvider = defaultOcrProvider }) {
  const maxPageChars = Number(process.env.DOCUMENT_MAX_PAGE_TEXT_CHARS || 250000);
  if (mimeType === 'application/pdf') return extractPdfPages(buffer, context, ocrProvider);
  if (mimeType === 'text/plain') {
    return [{
      pageNumber: 1,
      extractedText: bounded(parseTextBuffer(buffer), maxPageChars),
      textSource: 'NATIVE',
      ocrConfidence: null,
      width: null,
      height: null,
      metadata: {},
    }];
  }
  if (mimeType === 'image/png' || mimeType === 'image/jpeg') {
    const ocr = await runOcr(buffer, 1, context, ocrProvider);
    return [{
      pageNumber: 1,
      extractedText: bounded(ocr.text, maxPageChars),
      textSource: 'OCR',
      ocrConfidence: ocr.confidence,
      width: null,
      height: null,
      metadata: { language: ocr.language, durationMs: ocr.durationMs },
    }];
  }
  throw pageError('UNSUPPORTED_TYPE', 'Document type is not supported.');
}

module.exports = { extractDocumentPages, extractPdfPages, pageError, runOcr };
