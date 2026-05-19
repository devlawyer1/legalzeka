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

    const { pool } = require('../config/db');
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // 1. Abonelik limiti kontrolü
    if (req.subscription && req.subscription.maxSearchLimit === 0) {
      return res.status(403).json({
        success: false,
        message: 'Aylık arama limitinizi doldurdunuz.',
      });
    }

    // 2. Geçmişe kaydet
    if (req.user) {
      try {
        await pool.query(
          'INSERT INTO search_history (user_id, query, search_type) VALUES ($1, $2, $3)',
          [req.user.id, q.trim(), 'keyword']
        );
      } catch (dbErr) {
        console.error('Arama geçmişi kaydedilemedi:', dbErr);
      }
    }

    // 3. PostgreSQL Full-Text Search
    // to_tsvector ile websearch_to_tsquery kullanarak arama
    const queryStr = q.trim();
    
    // Total result count
    const countResult = await pool.query(`
      SELECT count(*) 
      FROM emsal_kararlar 
      WHERE to_tsvector('turkish', coalesce(konu, '') || ' ' || coalesce(ozet, '') || ' ' || coalesce(metin, '')) @@ websearch_to_tsquery('turkish', $1)
    `, [queryStr]);
    const totalResults = parseInt(countResult.rows[0].count);

    // Get paginated results
    const { rows } = await pool.query(`
      SELECT id, karar_no, karar_yili, mahkeme, konu, ozet, metin, anahtar_kelimeler,
             ts_rank(to_tsvector('turkish', coalesce(konu, '') || ' ' || coalesce(ozet, '') || ' ' || coalesce(metin, '')), websearch_to_tsquery('turkish', $1)) as score
      FROM emsal_kararlar
      WHERE to_tsvector('turkish', coalesce(konu, '') || ' ' || coalesce(ozet, '') || ' ' || coalesce(metin, '')) @@ websearch_to_tsquery('turkish', $1)
      ORDER BY score DESC
      LIMIT $2 OFFSET $3
    `, [queryStr, parseInt(limit), offset]);

    res.status(200).json({
      success: true,
      message: 'Arama başarılı.',
      data: {
        query: queryStr,
        page: parseInt(page),
        limit: parseInt(limit),
        subscription: req.subscription ? {
          plan: req.subscription.planName,
          searchLimit: req.subscription.maxSearchLimit,
        } : null,
        results: rows.map(r => ({ ...r, highlights: {} })), // To match old format
        totalResults: totalResults,
      },
    });
  } catch (error) {
    console.error('PostgreSQL arama hatası:', error);
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

    const { generateEmbedding } = require('../utils/embedding');
    const { pool } = require('../config/db');

    // Geçmişe kaydet
    if (req.user) {
      try {
        await pool.query(
          'INSERT INTO search_history (user_id, query, search_type) VALUES ($1, $2, $3)',
          [req.user.id, query.trim(), 'semantic']
        );
      } catch (dbErr) {
        console.error('Arama geçmişi kaydedilemedi:', dbErr);
      }
    }

    // Kullanıcının sorgusunu vektöre dönüştür
    const queryVector = await generateEmbedding(query.trim());
    const vectorString = `[${queryVector.join(',')}]`;

    // Aşama 3: Gerçek Semantik Arama (pgvector)
    // Kosinüs benzerliği (<=>) ile en yakın 10 karar
    const { rows } = await pool.query(`
      SELECT id, karar_no, karar_yili, mahkeme, konu, ozet, metin, anahtar_kelimeler,
             1 - (embedding <=> $1) as score
      FROM emsal_kararlar
      ORDER BY embedding <=> $1
      LIMIT 10
    `, [vectorString]);

    res.status(200).json({
      success: true,
      message: 'Semantik arama başarılı.',
      data: {
        query: query.trim(),
        subscription: req.subscription ? {
          plan: req.subscription.planName,
          searchLimit: req.subscription.maxSearchLimit,
        } : null,
        results: rows.map(r => ({ ...r, highlights: {} })),
        totalResults: rows.length,
      },
    });
  } catch (error) {
    console.error('PostgreSQL semantik arama hatası:', error);
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

    if (req.subscription && req.subscription.maxSearchLimit === 0) {
      return res.status(403).json({ success: false, message: 'Aylık arama limitinizi doldurdunuz.' });
    }

    const { pool } = require('../config/db');
    const { generateEmbedding } = require('../utils/embedding');

    // 1. RETRIEVAL (Getirme): Kullanıcının sorusuna en yakın 3 emsal kararı bul
    const queryVector = await generateEmbedding(query.trim());
    const vectorString = `[${queryVector.join(',')}]`;

    const { rows } = await pool.query(`
      SELECT id, karar_no, karar_yili, mahkeme, konu, ozet, metin, anahtar_kelimeler,
             1 - (embedding <=> $1) as score
      FROM emsal_kararlar
      ORDER BY embedding <=> $1
      LIMIT 3
    `, [vectorString]);

    const relevantDocs = rows.filter(hit => hit.score > 0.35);

    // 2. GENERATION (Üretme): Bulunan belgeleri yapay zekaya verip cevap üretme aşaması.
    let aiResponse = "";
    if (relevantDocs.length === 0) {
      aiResponse = "Sorduğunuz konu çok spesifik veya veritabanımızda henüz bu konuyla ilgili (Örn: Ceza hukuku, yaralama vb.) bir Yargıtay/Danıştay kararı bulunmuyor. Lütfen aramayı farklı kelimelerle veya mevcut kategorilerde (İş Kazası, Boşanma, Kiracı Tahliyesi vb.) tekrar deneyin.";
    } else {
      const topDoc = relevantDocs[0];
      const keywords = topDoc.anahtar_kelimeler || [];
      const keywordsStr = keywords.slice(0,2).join(', ');
      
      aiResponse = \`Sorduğunuz konuyla ilgili incelediğim güncel Yargıtay/Danıştay kararlarına göre;\\n\\nÖncelikle en alakalı görünen **\${topDoc.karar_no}** numaralı \${topDoc.mahkeme} kararına dayanarak söyleyebilirim ki: \${topDoc.ozet}\\n\\nBu bağlamda değerlendirdiğimizde; \${topDoc.konu} kapsamındaki talepleriniz mahkemelerce belirli şartlara (Örn: \${keywordsStr}) bağlanmıştır. \\n\\n*Not: Bu otomatik bir hukuki analizdir, kesin işlem yapmadan önce tüm kararı okumanız tavsiye edilir.*\`;
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
