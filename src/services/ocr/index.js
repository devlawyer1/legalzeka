const { TesseractOcrProvider } = require('./TesseractOcrProvider');

function createOcrProvider() {
  const provider = String(process.env.OCR_PROVIDER || 'tesseract').toLowerCase();
  if (provider !== 'tesseract') throw new Error(`Unsupported OCR_PROVIDER: ${provider}`);
  return new TesseractOcrProvider();
}

const ocrProvider = createOcrProvider();

module.exports = { createOcrProvider, ocrProvider };
