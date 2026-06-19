const { parentPort } = require('worker_threads');

// Pipeline'ı global tutarak Singleton yapıyoruz. Worker ayağa kalktığında bir kere yüklenir.
let pipeline = null;

async function initPipeline() {
  try {
    const transformers = await import('@xenova/transformers');
    // Sadece modeli RAM'e bir kere alır
    pipeline = await transformers.pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2');
    parentPort.postMessage({ status: 'ready' });
  } catch (error) {
    console.error("Worker pipeline hatası:", error);
    parentPort.postMessage({ status: 'failed', error: error.message });
  }
}

// Ana thread'den gelen mesajları dinle
parentPort.on('message', async (message) => {
  if (message.type === 'embed') {
    try {
      if (!pipeline) {
        throw new Error('Yapay zeka modeli henüz yüklenmedi, lütfen biraz bekleyin.');
      }
      
      // Metni modele verip ortalama (mean pooling) vektörünü alıyoruz
      const output = await pipeline(message.text, { pooling: 'mean', normalize: true });
      const embeddingArray = Array.from(output.data);
      
      parentPort.postMessage({
        id: message.id,
        status: 'success',
        embedding: embeddingArray
      });
    } catch (error) {
      parentPort.postMessage({
        id: message.id,
        status: 'error',
        error: error.message
      });
    }
  }
});

// Başlat
initPipeline();
