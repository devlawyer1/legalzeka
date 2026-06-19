// ============================================================
// Emsal Atlası - Local Embedding Service (Worker Threads)
// Metinleri vektörlere dönüştürür (Ana thread'i bloklamaz)
// ============================================================

const { Worker } = require('worker_threads');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

let worker = null;
let isReady = false;
let initError = null;
const pendingRequests = new Map();

function rejectPending(error) {
  for (const { reject } of pendingRequests.values()) {
    reject(error);
  }
  pendingRequests.clear();
}

function initWorker() {
  if (!worker) {
    initError = null;
    // Worker Thread'i başlatıyoruz
    worker = new Worker(path.join(__dirname, 'embeddingWorker.js'));

    worker.on('message', (message) => {
      if (message.status === 'ready') {
        console.log('✅ Embedding Worker Thread başarıyla yüklendi ve hazır.');
        isReady = true;
        initError = null;
      } else if (message.status === 'failed') {
        initError = new Error(message.error || 'Embedding modeli yüklenemedi.');
        isReady = false;
        console.error('Embedding Worker yükleme hatası:', initError.message);
        rejectPending(initError);
      } else if (message.id && pendingRequests.has(message.id)) {
        // Gelen yanıtı bekleyen Promise'e iletiyoruz
        const { resolve, reject } = pendingRequests.get(message.id);
        pendingRequests.delete(message.id);

        if (message.status === 'success') {
          resolve(message.embedding);
        } else {
          reject(new Error(message.error));
        }
      }
    });

    worker.on('error', (error) => {
      console.error('Embedding Worker hatası:', error);
      initError = error;
      rejectPending(error);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Embedding Worker, exit code ${code} ile durdu.`);
        initError = new Error(`Embedding Worker, exit code ${code} ile durdu.`);
        rejectPending(initError);
      }
      worker = null;
      isReady = false;
    });
  }
}

if (process.env.EMBEDDING_EAGER_LOAD === 'true') {
  initWorker();
}

/**
 * Verilen metni vektör (embedding) dizisine dönüştürür.
 * İşlemi Node.js ana iş parçacığını (event loop) bloklamadan Worker'a yaptırır.
 * 
 * @param {string} text - Vektörize edilecek metin
 * @returns {Promise<number[]>} - 384 boyutlu sayı dizisi
 */
function generateEmbedding(text) {
  return new Promise((resolve, reject) => {
    if (!worker) {
      initWorker();
    }

    // Eğer model henüz RAM'e yüklenmediyse ufak gecikmelerle tekrar dene
    const attempt = () => {
        if (initError) {
           reject(initError);
           return;
        }
        if (!isReady) {
           setTimeout(attempt, 200);
           return;
        }
        const id = uuidv4();
        pendingRequests.set(id, { resolve, reject });
        worker.postMessage({ type: 'embed', id, text });
    };

    attempt();
  });
}

async function shutdownEmbeddingWorker() {
  if (!worker) return;
  const currentWorker = worker;
  worker = null;
  isReady = false;
  rejectPending(new Error('Embedding worker kapatılıyor.'));
  await currentWorker.terminate();
}

module.exports = { generateEmbedding, shutdownEmbeddingWorker };
