const Case = require('../../models/Case');
const FirmTemplate = require('../../models/FirmTemplate');
const LawVersion = require('../../models/LawVersion');
const LegalWorkflowProfile = require('../../models/LegalWorkflowProfile');
const { chat } = require('../llmService');
const { searchLegalSources } = require('../researchProvider');
const mevzuatService = require('../mevzuat/mevzuatService');
const { REVIEW_MARKERS, getWorkflowById } = require('./workflowRegistry');

const MAX_CONTEXT_CHARS = 12000;

function truncate(text, max = 1200) {
  if (!text) return '';
  const value = String(text).replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function toBool(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return String(value).toLowerCase() !== 'false';
}

function buildRetrievalQuery({ workflow, task, text, caseData }) {
  const pieces = [
    workflow.title,
    task,
    caseData?.konu,
    caseData?.mahkeme,
    caseData?.esas_no,
    text,
  ].filter(Boolean);

  return truncate(pieces.join('\n'), 900);
}

function sourceLine(source, index) {
  const citation = source.citation ? ` (${source.citation})` : '';
  const origin = source.origin ? ` · ${source.origin}` : '';
  return `[S${index + 1}] ${source.type.toUpperCase()} · ${source.title}${citation}${origin}\n${truncate(source.excerpt, 700)}`;
}

function normalizeEmsalSource(item) {
  return {
    type: 'emsal',
    title: item.konu || item.court || item.mahkeme || 'Emsal karar',
    citation: [item.mahkeme || item.court, item.esas_no, item.karar_no, item.date || item.karar_yili]
      .filter(Boolean)
      .join(' · '),
    origin: item.source_label || item.source || 'Emsal',
    excerpt: item.snippet || item.ozet || item.metin,
    verification: item.fetch_status || 'metadata',
  };
}

function normalizeLawSource(item) {
  return {
    type: 'mevzuat',
    title: `${item.law_name || item.lawName || 'Mevzuat'}${item.article_number ? ` m. ${item.article_number}` : ''}`,
    citation: [item.law_number, item.article_title].filter(Boolean).join(' · '),
    origin: item.source_url || 'Yerel mevzuat indeksi',
    excerpt: item.article_text || item.articleText,
    verification: item.source_url ? 'source-linked' : 'indexed',
  };
}

function normalizeOfficialMevzuatSource(item, sourceName) {
  return {
    type: 'resmi_mevzuat',
    title: item.mevzuatAdi || item.title || item.name || item.baslik || 'Resmi mevzuat kaydı',
    citation: [item.mevzuatNo, item.resmiGazeteTarihi || item.date].filter(Boolean).join(' · '),
    origin: sourceName || 'Mevzuat servisi',
    excerpt: item.ozet || item.summary || item.content || item.mevzuatAdi || item.title,
    verification: 'metadata',
  };
}

function normalizeTemplateSource(template) {
  return {
    type: 'büro_şablonu',
    title: template.title || 'Büro şablonu',
    citation: template.template_type || '',
    origin: 'Kurumsal şablon hafızası',
    excerpt: template.content,
    verification: 'internal-template',
  };
}

async function safeGather(label, fn) {
  try {
    return { label, ok: true, value: await fn() };
  } catch (error) {
    return { label, ok: false, error: error.message, value: null };
  }
}

async function gatherSources({ query, firmId, includeLiveSources }) {
  const [emsalResult, lawsResult, officialMevzuatResult, templatesResult] = await Promise.all([
    safeGather('emsal', () =>
      searchLegalSources({
        query,
        mode: 'semantic',
        limit: 5,
        includeLive: includeLiveSources,
        indexLiveResults: true,
      })
    ),
    safeGather('law_versions', () => LawVersion.searchSemantic(query, 5)),
    safeGather('official_mevzuat', () =>
      mevzuatService.searchDocuments({
        query,
        basliktaAra: false,
        page: 1,
        pageSize: 5,
      })
    ),
    safeGather('firm_templates', () => (firmId ? FirmTemplate.findByFirm(firmId) : [])),
  ]);

  const diagnostics = [emsalResult, lawsResult, officialMevzuatResult, templatesResult].map((item) => ({
    source: item.label,
    ok: item.ok,
    error: item.error,
  }));

  const sources = [];

  if (emsalResult.ok && emsalResult.value?.results) {
    sources.push(...emsalResult.value.results.slice(0, 5).map(normalizeEmsalSource));
  }

  if (lawsResult.ok && Array.isArray(lawsResult.value)) {
    sources.push(...lawsResult.value.slice(0, 5).map(normalizeLawSource));
  }

  const officialDocs = officialMevzuatResult.value?.documents || officialMevzuatResult.value?.results || [];
  if (officialMevzuatResult.ok && Array.isArray(officialDocs)) {
    sources.push(...officialDocs.slice(0, 3).map((doc) => normalizeOfficialMevzuatSource(doc, officialMevzuatResult.value?.source)));
  }

  if (templatesResult.ok && Array.isArray(templatesResult.value)) {
    const tokens = query.toLocaleLowerCase('tr-TR').split(/\W+/).filter((token) => token.length > 3).slice(0, 12);
    const templates = templatesResult.value
      .map((template) => {
        const text = `${template.title || ''} ${template.template_type || ''} ${template.content || ''}`.toLocaleLowerCase('tr-TR');
        const score = tokens.reduce((sum, token) => sum + (text.includes(token) ? 1 : 0), 0);
        return { template, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ template }) => normalizeTemplateSource(template));
    sources.push(...templates);
  }

  return {
    sources: sources.filter((source) => source.excerpt || source.title).slice(0, 14),
    diagnostics,
  };
}

function buildSystemPrompt({ workflow, profile }) {
  const markerText = REVIEW_MARKERS.map((marker) => `${marker.code}: ${marker.description}`).join('\n');

  return `Sen Legal Zeka'nın Türk hukuk sistemine uyarlanmış uzman iş akışı ajanısın.

Aktif ajan: ${workflow.title}
Amaç: ${workflow.purpose}
Rol odağı: ${workflow.role}
Yargı çevresi: ${profile.jurisdictionFocus || 'Türkiye'}
Çalışma alanları: ${(profile.practiceAreas || []).join(', ') || 'Genel hukuk'}
Üslup: ${profile.houseStyle || 'Resmi ve kaynaklı'}
Risk yaklaşımı: ${profile.riskPosture || 'dengeli'}
İnceleme politikası: ${profile.reviewPolicy || 'Tüm çıktılar taslaktır; uzman kontrolü gerekir.'}

Zorunlu güvenlik ve doğrulama işaretleri:
${markerText}

Kurallar:
- Her cevap Türk hukuk sistemine göre ve Türkçe olmalı.
- ABD/İngiltere kurumlarını Türk karşılığı yoksa kullanma; HMK, CMK, TCK, TBK, TTK, KVKK, İYUK, İİK, UYAP, BAM, Yargıtay, Danıştay, AYM ve resmi kaynak mantığıyla düşün.
- Kaynak bağlamında görünmeyen kesin kanun/karar numarası uydurma; gerekiyorsa [DOĞRULA] etiketi koy.
- Eksik vakıa varsa varsayım yapma; [VAKA GEREKİYOR] etiketiyle sorulacak bilgiyi yaz.
- Mesleki kanaat, strateji, karar destek veya imza/filing etkisi olan önerileri [UZMAN İNCELEMESİ] ile işaretle.
- Öğrenci modunda nihai ödev/sınav cevabı yazma; öğrenme iskelesi, soru ve geri bildirim ver.
- Hakim/savcı modunda tarafsız kal; hüküm veya nihai kanaat üretme.
- Çıktının en üstünde kısa "İnceleme notu" yaz ve bunun kaynaklı taslak olduğunu belirt.
- Şu bölüm başlıklarını kullan: ${workflow.outputSections.join(' | ')}.`;
}

function buildUserPrompt({ workflow, profile, task, text, caseData, sources }) {
  const sourceContext = sources.length
    ? sources.map(sourceLine).join('\n\n')
    : 'Kaynak bulunamadı. Hukuki iddialarda [DOĞRULA] etiketi kullan.';

  const caseContext = caseData
    ? `Esas No: ${caseData.esas_no || 'Belirtilmemiş'}
Mahkeme: ${caseData.mahkeme || 'Belirtilmemiş'}
Konu: ${caseData.konu || 'Belirtilmemiş'}
Davacı: ${caseData.taraf_davaci || 'Belirtilmemiş'}
Davalı: ${caseData.taraf_davali || 'Belirtilmemiş'}
Durum: ${caseData.durum || 'Belirtilmemiş'}
Notlar: ${caseData.notlar || 'Yok'}`
    : 'Bağlı dava dosyası seçilmedi.';

  return `Kullanıcı görevi:
${task || workflow.inputHint}

Pratik profili:
Rol: ${profile.roleFocus}
Kaynak tercihleri: ${(profile.sourcePreferences || []).join(', ') || 'Standart Türkiye kaynakları'}

Dava/dosya bağlamı:
${caseContext}

Kullanıcı metni veya yüklenen belge:
${truncate(text, MAX_CONTEXT_CHARS) || 'Metin girilmedi; görev açıklamasına göre çalış.'}

Kaynak bağlamı:
${sourceContext}

Yanıtı uygulanabilir, kaynaklara referans veren ve doğrulama işaretlerini açık kullanan bir taslak olarak üret.`;
}

class LegalWorkflowService {
  static async run({ workflowId, user, firmId, caseId, task, text, includeLiveSources }) {
    const workflow = getWorkflowById(workflowId);
    if (!workflow) {
      const error = new Error('Geçersiz uzman ajan seçimi.');
      error.status = 400;
      throw error;
    }

    const profile = await LegalWorkflowProfile.getOrDefault(user);
    const caseData = caseId && firmId ? await Case.findById(caseId, firmId) : null;
    const query = buildRetrievalQuery({ workflow, task, text, caseData });
    const gathered = await gatherSources({
      query,
      firmId,
      includeLiveSources: toBool(includeLiveSources, true),
    });

    const systemPrompt = buildSystemPrompt({ workflow, profile });
    const userPrompt = buildUserPrompt({
      workflow,
      profile,
      task,
      text,
      caseData,
      sources: gathered.sources,
    });

    const answer = await chat([], userPrompt, systemPrompt);

    return {
      workflow,
      profile,
      answer,
      sources: gathered.sources,
      diagnostics: gathered.diagnostics,
      markers: REVIEW_MARKERS,
      reviewRequired: true,
      generatedAt: new Date().toISOString(),
    };
  }
}

module.exports = LegalWorkflowService;
