// ============================================================
// Emsal Atlası - Search Routes
// Prod arama akışı: local FTS/vector + MCP federation + RRF/rerank
// ============================================================

const express = require('express');
const router = express.Router();
const { optionalAuthenticate } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/checkSubscription');
const { guestQuota } = require('../middleware/guestQuota');
const { cacheMiddleware } = require('../services/cache');
const { pool } = require('../config/db');
const { chat } = require('../services/llmService');
const { searchLegalSources, hydrateLegalSources } = require('../services/researchProvider');

const SOURCE_GROUNDED_SYSTEM_PROMPT = `Sen Legal Zeka'nin kaynaklara bagli hukuk arastirma asistanisin.
Yalnizca kullanicinin sorusu icin verilen KAYNAKLAR bolumundeki emsal karar ve resmi kaynaklara dayan.
Kaynaklarda olmayan karar numarasi, mahkeme, tarih, olay veya ilke uydurma.
Yeterli kaynak yoksa bunu acikca soyle ve daha dar arama terimleri oner.
Her hukuki tespitte ilgili kaynagi [K1], [K2] gibi goster.
Cevapta mumkunse mahkeme/kurum, esas no, karar no ve karar tarihini yaz.`;

function parseSources(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value)
    .split(',')
    .map((source) => source.trim())
    .filter(Boolean);
}

function boolFromValue(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  return !['false', '0', 'no', 'hayir', 'hayır'].includes(String(value).toLocaleLowerCase('tr-TR'));
}

function extractFilters(input = {}) {
  return {
    mahkeme: input.mahkeme || undefined,
    yilMin: input.yilMin || undefined,
    yilMax: input.yilMax || undefined,
    hukuk_dali: input.hukuk_dali || undefined,
  };
}

function subscriptionPayload(req) {
  return req.subscription ? {
    plan: req.subscription.planName,
    searchLimit: req.subscription.maxSearchLimit,
  } : null;
}

async function saveSearchHistory(req, query, searchType) {
  if (!req.user) return;
  try {
    await pool.query(
      'INSERT INTO search_history (user_id, query, search_type) VALUES ($1, $2, $3)',
      [req.user.id, query.trim(), searchType]
    );
  } catch (dbErr) {
    console.error('Arama geçmişi kaydedilemedi:', dbErr);
  }
}

function requireSearchLimit(req, res) {
  if (req.subscription && req.subscription.maxSearchLimit === 0) {
    res.status(403).json({
      success: false,
      message: 'Aylık arama limitinizi doldurdunuz.',
    });
    return false;
  }
  return true;
}

function buildSearchResponse(message, searchResult, req) {
  return {
    success: true,
    message,
    data: {
      query: searchResult.query,
      mode: searchResult.mode,
      page: searchResult.page,
      limit: searchResult.limit,
      subscription: subscriptionPayload(req),
      results: searchResult.results,
      totalResults: searchResult.totalResults,
      diagnostics: searchResult.diagnostics,
    },
  };
}

function truncate(text, maxLength = 3500) {
  if (!text) return '';
  const normalized = String(text).replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

function formatSourceForPrompt(source, index) {
  const label = `K${index + 1}`;
  const court = source.court || source.mahkeme || source.source_label || 'Kaynak';
  const esas = source.esas_no ? `Esas No: ${source.esas_no}` : 'Esas No: belirtilmemis';
  const karar = source.karar_no ? `Karar No: ${source.karar_no}` : 'Karar No: belirtilmemis';
  const date = source.date || source.karar_yili || 'Tarih belirtilmemis';
  const text = truncate(source.metin || source.snippet || source.ozet || source.konu, 3500);

  return `[${label}] ${court} | ${esas} | ${karar} | Tarih: ${date} | Kaynak: ${source.source_label || source.source}
Metin: ${text}`;
}

function normalizeLegalSource(source, index, effectiveDate = null) {
  const citation = [
    source.mahkeme || source.court || source.source_label,
    source.esas_no ? `E. ${source.esas_no}` : null,
    source.karar_no ? `K. ${source.karar_no}` : null,
    source.date || source.karar_yili || null,
  ].filter(Boolean).join(' · ');

  const confidence = typeof source.confidence === 'number'
    ? source.confidence
    : (source.relevance_verified ? 0.72 : 0.48);

  const verificationStatus = source.fetch_status === 'fetched' || source.fetch_status === 'indexed' || source.fetch_status === 'verified'
    ? 'verified'
    : source.fetch_status === 'metadata_only'
      ? 'metadata_only'
      : 'needs_review';

  const conflictFlags = [];
  if (!source.karar_no && !source.esas_no && !source.document_id) conflictFlags.push('missing_identifier');
  if (!source.metin && !source.snippet && !source.ozet) conflictFlags.push('missing_excerpt');
  if (verificationStatus !== 'verified') conflictFlags.push('requires_source_check');

  return {
    type: source.type || source.source || 'emsal',
    title: source.konu || source.title || source.court || source.mahkeme || `Kaynak ${index + 1}`,
    citation,
    pinpoint: truncate(source.snippet || source.ozet || source.metin, 900),
    date: source.date || source.karar_yili || null,
    effectiveDate,
    origin: source.source_label || source.source || 'Legal Zeka indeksi',
    verificationStatus,
    confidence,
    conflictFlags,
    karar_no: source.karar_no || null,
    esas_no: source.esas_no || null,
    document_id: source.document_id || source.id || null,
    source_label: source.source_label || source.source || null,
  };
}

function buildResearchVerification(sources, effectiveDate = null) {
  const verifiedCount = sources.filter((source) => source.verificationStatus === 'verified').length;
  const needsReview = sources.filter((source) => source.verificationStatus !== 'verified');
  const conflictFlags = [...new Set(sources.flatMap((source) => source.conflictFlags || []))];

  return {
    generatedAt: new Date().toISOString(),
    effectiveDate,
    primarySourceCount: sources.filter((source) => ['local', 'bedesten', 'emsal', 'anayasa', 'uyusmazlik'].includes(source.type)).length,
    secondarySourceCount: Math.max(sources.length - verifiedCount, 0),
    verifiedSourceCount: verifiedCount,
    needsReviewCount: needsReview.length,
    conflictFlags,
    confidence: sources.length
      ? Number((sources.reduce((sum, source) => sum + Number(source.confidence || 0), 0) / sources.length).toFixed(2))
      : 0,
    missingOrUnverifiedInformation: needsReview.map((source) => ({
      title: source.title,
      reason: source.conflictFlags?.join(', ') || 'requires_source_check',
    })),
  };
}

/**
 * @route   GET /api/search
 * @desc    Hibrit emsal karar arama
 * @access  Private - JWT + Aktif Abonelik gerekli
 */
router.get('/', optionalAuthenticate, guestQuota, checkSubscription, cacheMiddleware, async (req, res, next) => {
  try {
    const { q, page = 1, limit = 20 } = req.query;

    if (!q || q.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Arama sorgusu (q) parametresi zorunludur.',
      });
    }

    if (!requireSearchLimit(req, res)) return;
    await saveSearchHistory(req, q, 'keyword');

    const searchResult = await searchLegalSources({
      query: q,
      mode: 'keyword',
      page,
      limit,
      filters: extractFilters(req.query),
      sources: parseSources(req.query.sources),
      includeLive: boolFromValue(req.query.live, true),
    });

    res.status(200).json(buildSearchResponse('Arama başarılı.', searchResult, req));
  } catch (error) {
    console.error('Hibrit emsal arama hatası:', error);
    next(error);
  }
});

/**
 * @route   POST /api/search/semantic
 * @desc    Semantik/hukuki niyet odaklı emsal arama
 * @access  Private - JWT + Aktif Abonelik gerekli
 */
router.post('/semantic', optionalAuthenticate, guestQuota, checkSubscription, cacheMiddleware, async (req, res, next) => {
  try {
    const { query, page = 1, limit = 20 } = req.body;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Arama sorgusu (query) alanı zorunludur.',
      });
    }

    if (!requireSearchLimit(req, res)) return;
    await saveSearchHistory(req, query, 'semantic');

    const searchResult = await searchLegalSources({
      query,
      mode: 'semantic',
      page,
      limit,
      filters: extractFilters(req.body),
      sources: parseSources(req.body.sources),
      includeLive: boolFromValue(req.body.live, true),
    });

    res.status(200).json(buildSearchResponse('Semantik arama başarılı.', searchResult, req));
  } catch (error) {
    console.error('Semantik emsal arama hatası:', error);
    next(error);
  }
});

/**
 * @route   POST /api/search/ask
 * @desc    Kaynaklı RAG hukuki asistan
 * @access  Private - JWT + Aktif Abonelik gerekli
 */
router.post('/ask', optionalAuthenticate, guestQuota, checkSubscription, cacheMiddleware, async (req, res, next) => {
  try {
    const { query, effectiveDate } = req.body;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Soru (query) alanı zorunludur.' });
    }

    if (!requireSearchLimit(req, res)) return;
    await saveSearchHistory(req, query, 'semantic');

    const searchResult = await searchLegalSources({
      query,
      mode: 'rag',
      page: 1,
      limit: req.body.limit || 8,
      filters: extractFilters(req.body),
      sources: parseSources(req.body.sources),
      includeLive: boolFromValue(req.body.live, true),
      indexLiveResults: true,
    });

    const hydratedSources = await hydrateLegalSources(searchResult.results, 4);
    const usableSources = hydratedSources.filter((source) => {
      const sourceText = source.metin || source.snippet || source.ozet || '';
      return sourceText.trim().length > 80 && (source.karar_no || source.document_id || source.court);
    });

    const legalSources = usableSources.map((source, index) => normalizeLegalSource(source, index, effectiveDate || null));
    const verification = buildResearchVerification(legalSources, effectiveDate || null);

    let aiResponse = '';
    if (usableSources.length === 0) {
      aiResponse = 'Bu soru için güvenilir ve atıf yapılabilir yeterli emsal karar bulunamadı. Daha dar bir hukuki kavram, mahkeme türü, karar yılı veya olay detayıyla tekrar arama yapmanız uygun olur.';
    } else {
      const sourceContext = usableSources.map(formatSourceForPrompt).join('\n\n---\n\n');
      const prompt = `Kullanıcı sorusu: "${query}"

KAYNAKLAR:
${sourceContext}

Gorev:
1. Soruyu yalnizca yukaridaki kaynaklara dayanarak cevapla.
2. Her tespitte [K1], [K2] gibi kaynak etiketi kullan.
3. Kaynaklarda karar no, esas no veya tarih eksikse "belirtilmemis" de; eksik bilgiyi uydurma.
4. Sonunda "Dayanak kaynaklar" basligi altinda kullandigin kaynaklari mahkeme/kurum, esas no, karar no ve tarih ile listele.`;

      try {
        aiResponse = await chat([], prompt, SOURCE_GROUNDED_SYSTEM_PROMPT);
      } catch (err) {
        console.error('[RAG AI] LLM generation error:', err);
        aiResponse = 'Kaynaklar bulundu ancak yapay zeka yanıt üretirken hata oluştu. Kaynak listesini inceleyerek aramayı daraltabilirsiniz.';
      }
    }

    res.status(200).json({
      success: true,
      message: 'AI yanıtı başarıyla üretildi.',
      data: {
        query: searchResult.query,
        answer: aiResponse,
        sources: legalSources,
        rawSources: usableSources,
        verification,
        retrieval: {
          totalResults: searchResult.totalResults,
          diagnostics: searchResult.diagnostics,
        },
      },
    });
  } catch (error) {
    console.error('Kaynaklı RAG hatası:', error);
    next(error);
  }
});

module.exports = router;
