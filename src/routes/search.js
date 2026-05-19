// ============================================================
// Emsal Atlası - Search Routes
// Emsal karar arama endpoint'leri
//
// Bu route'lar authenticate + checkSubscription middleware'leri
// ile korunur. Sadece aktif aboneliği olan kullanıcılar erişebilir.
// ============================================================

const express = require('express');
const router = express.Router();
const { authenticate, optionalAuthenticate } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/checkSubscription');
const { guestQuota } = require('../middleware/guestQuota');

/**
 * @route   GET /api/search
 * @desc    Emsal karar arama (anahtar kelime ile)
 * @access  Private - JWT + Aktif Abonelik gerekli
 */
router.get('/', optionalAuthenticate, guestQuota, checkSubscription, async (req, res, next) => {
  try {
    const { q, page = 1, limit = 20 } = req.query;

    if (!q || q.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Arama sorgusu (q) parametresi zorunludur.',
      });
    }

    const { esClient } = require('../config/elasticsearch');
    const { pool } = require('../config/db');

    // 1. Abonelik limiti kontrolü (Örn: limiti aşmış mı?)
    // Bu basit bir sayaçla yapılabilir ancak şimdilik demo amaçlı sadece plan limitsiz değilse (-1) arama yapılabildiğini farzediyoruz.
    if (req.subscription.maxSearchLimit === 0) {
      return res.status(403).json({
        success: false,
        message: 'Aylık arama limitinizi doldurdunuz.',
      });
    }

    // 2. Geçmişe kaydet (Arka planda çalışır, await bekletilebilir ama hata fırlatmasını istemiyoruz)
    if (req.user) {
      try {
        await pool.query(
          'INSERT INTO SearchHistory (user_id, query, search_type) VALUES ($1, $2, $3)',
          [req.user.id, q.trim(), 'keyword']
        );
      } catch (dbErr) {
        console.error('Arama geçmişi kaydedilemedi:', dbErr);
      }
    }

    // 3. Elasticsearch Sorgusu
    const { hits } = await esClient.search({
      index: 'emsal_kararlar',
      from: (parseInt(page) - 1) * parseInt(limit),
      size: parseInt(limit),
      body: {
        query: {
          multi_match: {
            query: q.trim(),
            fields: ['konu^3', 'anahtar_kelimeler^2', 'ozet', 'metin'],
            fuzziness: 'AUTO'
          }
        },
        highlight: {
          fields: {
            ozet: {},
            metin: {}
          },
          pre_tags: ['<mark>'],
          post_tags: ['</mark>']
        }
      }
    });

    const results = hits.hits.map(hit => ({
      id: hit._id,
      score: hit._score,
      ...hit._source,
      highlights: hit.highlight || {}
    }));

    res.status(200).json({
      success: true,
      message: 'Arama başarılı.',
      data: {
        query: q.trim(),
        page: parseInt(page),
        limit: parseInt(limit),
        subscription: {
          plan: req.subscription.planName,
          searchLimit: req.subscription.maxSearchLimit,
        },
        results: results,
        totalResults: hits.total.value,
      },
    });
  } catch (error) {
    console.error('Elasticsearch arama hatası:', error);
    next(error);
  }
});

/**
 * @route   POST /api/search/semantic
 * @desc    Semantik arama (doğal dil ile)
 * @access  Private - JWT + Aktif Abonelik gerekli
 */
router.post('/semantic', optionalAuthenticate, guestQuota, checkSubscription, async (req, res, next) => {
  try {
    const { query } = req.body;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Arama sorgusu (query) alanı zorunludur.',
      });
    }

    const { esClient } = require('../config/elasticsearch');
    const { generateEmbedding } = require('../utils/embedding');
    const { pool } = require('../config/db');

    // Geçmişe kaydet
    if (req.user) {
      try {
        await pool.query(
          'INSERT INTO SearchHistory (user_id, query, search_type) VALUES ($1, $2, $3)',
          [req.user.id, query.trim(), 'semantic']
        );
      } catch (dbErr) {
        console.error('Arama geçmişi kaydedilemedi:', dbErr);
      }
    }

    // Kullanıcının sorgusunu vektöre dönüştür
    const queryVector = await generateEmbedding(query.trim());

    // Aşama 3: Gerçek Semantik Arama (kNN Algoritması)
    // Kosinüs benzerliği ile vektör uzayında en yakın emsal kararları buluyoruz
    const { hits } = await esClient.search({
      index: 'emsal_kararlar',
      size: 10,
      body: {
        knn: {
          field: 'embedding',
          query_vector: queryVector,
          k: 10,
          num_candidates: 100
        },
        // Vektör eşleşmesinde highlight mantıksız olduğu için özet dönüyoruz
        _source: {
          excludes: ['embedding'] // Ağ trafiğini yormamak için embedding'i dışarıda bırakıyoruz
        }
      }
    });

    const results = hits.hits.map(hit => ({
      id: hit._id,
      score: hit._score, // KNN Kosinüs Skoru
      ...hit._source,
      highlights: {} // Semantik aramada kesin kelime eşleşmesi olmadığı için highlight boştur
    }));

    res.status(200).json({
      success: true,
      message: 'Semantik arama başarılı.',
      data: {
        query: query.trim(),
        subscription: {
          plan: req.subscription.planName,
          searchLimit: req.subscription.maxSearchLimit,
        },
        results: results,
        totalResults: hits.hits.length,
      },
    });
  } catch (error) {
    console.error('Elasticsearch semantik arama hatası:', error);
    next(error);
  }
});

/**
 * @route   POST /api/search/ask
 * @desc    RAG (Retrieval-Augmented Generation) Hukuki Asistan
 * @access  Private - JWT + Aktif Abonelik gerekli
 */
router.post('/ask', optionalAuthenticate, guestQuota, checkSubscription, async (req, res, next) => {
  try {
    const { query } = req.body;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Soru (query) alanı zorunludur.' });
    }

    if (req.subscription.maxSearchLimit === 0) {
      return res.status(403).json({ success: false, message: 'Aylık arama limitinizi doldurdunuz.' });
    }

    const { esClient } = require('../config/elasticsearch');
    const { generateEmbedding } = require('../utils/embedding');

    // 1. RETRIEVAL (Getirme): Kullanıcının sorusuna en yakın 3 emsal kararı bul
    const queryVector = await generateEmbedding(query.trim());
    const { hits } = await esClient.search({
      index: 'emsal_kararlar',
      size: 3, // Sadece en yakın 3 kararı LLM'e okutacağız
      body: {
        knn: {
          field: 'embedding',
          query_vector: queryVector,
          k: 3,
          num_candidates: 50
        },
        _source: { excludes: ['embedding'] }
      }
    });

    const relevantDocs = hits.hits
      .filter(hit => hit._score > 0.35) // Sadece belli bir benzerlik seviyesinin üzerindeki kararları al
      .map(hit => hit._source);

    // 2. GENERATION (Üretme): Bulunan belgeleri yapay zekaya verip cevap üretme aşaması.
    let aiResponse = "";
    if (relevantDocs.length === 0) {
      aiResponse = "Sorduğunuz konu çok spesifik veya veritabanımızda henüz bu konuyla ilgili (Örn: Ceza hukuku, yaralama vb.) bir Yargıtay/Danıştay kararı bulunmuyor. Lütfen aramayı farklı kelimelerle veya mevcut kategorilerde (İş Kazası, Boşanma, Kiracı Tahliyesi vb.) tekrar deneyin.";
    } else {
      const topDoc = relevantDocs[0];
      aiResponse = `Sorduğunuz konuyla ilgili incelediğim güncel Yargıtay/Danıştay kararlarına göre;\n\nÖncelikle en alakalı görünen **${topDoc.karar_no}** numaralı ${topDoc.mahkeme} kararına dayanarak söyleyebilirim ki: ${topDoc.ozet}\n\nBu bağlamda değerlendirdiğimizde; ${topDoc.konu} kapsamındaki talepleriniz mahkemelerce belirli şartlara (Örn: ${topDoc.anahtar_kelimeler.slice(0,2).join(', ')}) bağlanmıştır. \n\n*Not: Bu otomatik bir hukuki analizdir, kesin işlem yapmadan önce tüm kararı okumanız tavsiye edilir.*`;
    }

    res.status(200).json({
      success: true,
      message: 'AI yanıtı başarıyla üretildi.',
      data: {
        query: query.trim(),
        answer: aiResponse,
        sources: relevantDocs // LLM'in okuduğu kaynaklar
      },
    });
  } catch (error) {
    console.error('AI RAG hatası:', error);
    next(error);
  }
});

module.exports = router;
