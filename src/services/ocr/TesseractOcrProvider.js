const Tesseract = require('tesseract.js');
const OcrProvider = require('./OcrProvider');

function ocrError(code, message, cause = null) {
  const error = new Error(message);
  error.code = code;
  error.safeMessage = message;
  error.cause = cause;
  return error;
}

class TesseractOcrProvider extends OcrProvider {
  constructor({ language, langPath, workerFactory } = {}) {
    super();
    this.language = language || process.env.OCR_LANGUAGE || 'tur';
    this.langPath = langPath || process.env.TESSERACT_LANG_PATH || undefined;
    this.workerFactory = workerFactory || Tesseract.createWorker;
  }

  async recognize(input, { pageNumber = 1 } = {}) {
    if (this.language !== 'tur') {
      throw ocrError('OCR_LANGUAGE_CONFIGURATION', 'OCR_LANGUAGE must be explicitly configured as tur for Phase 1C.');
    }
    const startedAt = Date.now();
    let worker;
    try {
      worker = await this.workerFactory(this.language, Tesseract.OEM.LSTM_ONLY, {
        ...(this.langPath ? { langPath: this.langPath } : {}),
        logger: () => {},
      });
      const result = await worker.recognize(input);
      const confidence = Math.max(0, Math.min(1, Number(result?.data?.confidence || 0) / 100));
      return {
        text: String(result?.data?.text || ''),
        pageNumber,
        confidence,
        language: this.language,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      if (message.includes('traineddata') || message.includes('language') || message.includes('tur')) {
        throw ocrError('OCR_LANGUAGE_UNAVAILABLE', 'Turkish OCR language data is unavailable.', error);
      }
      throw ocrError('OCR_FAILED', 'OCR processing failed.', error);
    } finally {
      if (worker) await worker.terminate().catch(() => {});
    }
  }
}

module.exports = { TesseractOcrProvider, ocrError };
