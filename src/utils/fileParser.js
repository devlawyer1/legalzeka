const fs = require('fs');
const pdfParseLib = require('pdf-parse');
const Tesseract = require('tesseract.js');
const path = require('path');

async function parsePdfBuffer(dataBuffer) {
  if (typeof pdfParseLib === 'function') {
    const data = await pdfParseLib(dataBuffer);
    return data.text || '';
  }

  if (typeof pdfParseLib.PDFParse === 'function') {
    const parser = new pdfParseLib.PDFParse({ data: dataBuffer });
    try {
      const data = await parser.getText();
      return data.text || '';
    } finally {
      await parser.destroy();
    }
  }

  throw new Error('PDF parser desteklenmeyen bir API dondurdu.');
}

/**
 * Verilen dosyanın türüne göre metnini çıkarır ve ardından dosyayı siler.
 * @param {string} filePath - İşlenecek dosyanın yolu
 * @returns {Promise<string>} Çıkarılan metin
 */
async function parseFileText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  let text = '';

  if (ext === '.pdf') {
    const dataBuffer = fs.readFileSync(filePath);
    text = await parsePdfBuffer(dataBuffer);
  } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
    // Türkçe dil desteğiyle OCR işlemi
    const { data: { text: ocrText } } = await Tesseract.recognize(
      filePath,
      'tur', // Türkçe
      { logger: m => {} } // Logları gizle
    );
    text = ocrText;
  } else if (ext === '.txt') {
    text = fs.readFileSync(filePath, 'utf8');
  } else {
    throw new Error('Desteklenmeyen dosya formatı.');
  }

  return text;
}

async function parseAndCleanup(filePath) {
  try {
    return await parseFileText(filePath);
  } finally {
    // İşlem başarılı da olsa hata da verse dosyayı kalıcı olarak sil (Ephemeral Storage Policy)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

module.exports = { parseAndCleanup, parseFileText };
