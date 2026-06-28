const test = require('node:test');
const assert = require('node:assert/strict');

const { TesseractOcrProvider } = require('../../src/services/ocr/TesseractOcrProvider');

test('Turkish trained data failure is explicit and never falls back to English', async () => {
  const provider = new TesseractOcrProvider({
    language: 'tur',
    workerFactory: async () => { throw new Error('tur.traineddata.gz not found'); },
  });
  await assert.rejects(provider.recognize(Buffer.from('image')), (error) => error.code === 'OCR_LANGUAGE_UNAVAILABLE');
});

test('low OCR confidence is returned as metadata instead of an exception', async () => {
  const worker = {
    recognize: async () => ({ data: { text: 'Dusuk guvenli metin', confidence: 41 } }),
    terminate: async () => {},
  };
  const provider = new TesseractOcrProvider({ language: 'tur', workerFactory: async () => worker });
  const result = await provider.recognize(Buffer.from('image'), { pageNumber: 3 });
  assert.equal(result.pageNumber, 3);
  assert.equal(result.confidence, 0.41);
  assert.equal(result.language, 'tur');
});
