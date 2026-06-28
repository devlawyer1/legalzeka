// ============================================================
// Emsal Atlası - LLM Service (Pluggable AI Provider)
// Desteklenen Sağlayıcılar: Ollama, Gemini, OpenAI, Claude, AWS Bedrock
// ============================================================

/**
 * LLM Service — Yapay zeka sağlayıcısı soyutlama katmanı.
 * .env dosyasındaki LLM_PROVIDER değişkenine göre doğru sağlayıcıyı kullanır.
 * 
 * Şu an desteklenen:
 *   - ollama  → Yerel Ollama emsal_atlasi modeli (VARSAYILAN)
 *   - gemini  → Google Gemini 2.5 Flash
 *   - openai  → OpenAI GPT-4o
 *   - claude  → Anthropic Claude 3.5 Sonnet
 *   - bedrock → AWS Bedrock Claude 3.5 Haiku (Cross-Region)
 */

const { invokeBedrockClaude } = require('./bedrockService');
const { invokeGemini } = require('./geminiService');

const SYSTEM_PROMPT = `Sen "Legal Zeka" adlı Türk hukuk platformunun yapay zeka asistanısın. Adın "Legal Zeka".

## Kimliğin
- Legal Zeka'nın yapay zeka asistanısın.
- Seni "LegalZeka" ekibi geliştirdi. Sana "Seni kim geliştirdi?", "Kimin eserisin?", "Seni Google mı yaptı?" gibi sorular sorulduğunda veya genel olarak geliştiricin sorulduğunda, Google, OpenAI, Anthropic gibi şirketlerin ismini KESİNLİKLE anma. Sadece ve sadece "LegalZeka ekibi tarafından geliştirildim" de.
- Türk hukuk sistemi konusunda uzman bir yapay zeka asistanısın.
- Yargıtay, Danıştay, Bölge Adliye Mahkemesi kararları, Türk mevzuatı ve hukuk doktrininde derinlemesine bilgi sahibisin.
- Kullanıcılarına Türkçe olarak yardım edersin.

## Yeteneklerin
1. **Emsal Karar Arama & Analiz**: Yargıtay/Danıştay kararlarını bul, analiz et, karşılaştır
2. **Dilekçe & İddianame Yazma**: Her türlü hukuki belge taslağını hazırla
3. **Mevzuat Arama**: Kanun maddelerini bul ve açıkla (TCK, TMK, TBK, HMK, CMK vb.)
4. **Dava Analizi & Strateji**: Dava detaylarını analiz et, olası sonuçları değerlendir
5. **Belge Özetleme**: Uzun mahkeme kararları veya sözleşmeleri özetle
6. **Hukuk Eğitimi**: Hukuk öğrencilerine ders anlatma, sınav sorusu çözme, pratik yapma
7. **Genel Hukuk Danışmanlığı**: Her türlü hukuki soruyu cevapla

## Kurallar
- Her zaman Türkçe cevap ver.
- Hukuki terimler için parantez içinde açıklama ekle.
- Yanıtlarında ilgili kanun maddelerini ve Yargıtay kararlarını referans göster.
- Belirsiz durumlarda mutlaka bir avukata danışılmasını öner.
- Markdown formatını kullan: başlıklar, maddeler, kalın/italik, tablolar.
- Kısa ve öz ol ama gerektiğinde derinlemesine açıkla.
- "Ben bir avukat değilim" veya "Bu hukuki tavsiye değildir" gibi uyarılar ekleme — kullanıcılar bunu biliyor. Doğrudan yardımcı ol.

## Dilekçe/Belge Yazarken
- Başlık, taraflar, açıklamalar, hukuki dayanak, sonuç ve talep bölümlerini içer.
- İlgili kanun maddelerini ve emsal kararları belge içinde referans göster.
- Profesyonel ve resmi bir dil kullan.`;


/**
 * OpenAI API ile chat completion
 */
async function callOpenAI(messages, { temperature = 0.7, maxTokens = 4096 } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY tanımlanmamış. Lütfen .env dosyasına ekleyin.');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages,
      temperature,
      max_tokens: maxTokens,
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API hatası: ${response.status} — ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'Yanıt üretilemedi.';
}

/**
 * Anthropic Claude API ile chat completion
 */
async function callClaude(messages, { temperature = 0.7, maxTokens = 4096 } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY tanımlanmamış. Lütfen .env dosyasına ekleyin.');

  const systemMsg = messages.find(m => m.role === 'system');
  const chatMessages = messages.filter(m => m.role !== 'system');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      temperature,
      system: systemMsg?.content || '',
      messages: chatMessages,
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API hatası: ${response.status} — ${err}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || 'Yanıt üretilemedi.';
}

/**
 * Ollama API ile local model çağrısı (emsal_atlasi)
 * Ollama generate endpoint'i kullanır.
 */
async function callOllama(messages, { temperature = 0.7, maxTokens = 1024 } = {}) {
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  const modelName = process.env.OLLAMA_MODEL || 'emsal_atlasi';

  // Ollama'nın /api/chat endpoint'i OpenAI uyumlu mesaj formatı destekler
  const response = await fetch(`${ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelName,
      messages: messages,
      stream: false,
      options: {
        temperature,
        num_predict: maxTokens,
        top_p: 0.9,
      }
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Ollama API hatası: ${response.status} — ${err}`);
  }

  const data = await response.json();
  return data.message?.content || 'Yanıt üretilemedi.';
}

/**
 * Ollama streaming — SSE formatında yanıt döner.
 * Express response objesine doğrudan stream yapar.
 */
async function callOllamaStream(messages, res) {
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  const modelName = process.env.OLLAMA_MODEL || 'emsal_atlasi';

  const response = await fetch(`${ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelName,
      messages: messages,
      stream: true,
      options: {
        temperature: 0.7,
        num_predict: 1024,
        top_p: 0.9,
      }
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Ollama Stream hatası: ${response.status} — ${err}`);
  }

  return response;
}

/**
 * Ana chat fonksiyonu — provider'a göre doğru API'yi çağırır.
 * @param {Array} conversationHistory - [{role: 'user'|'assistant', content: '...'}]
 * @param {string} userMessage - Kullanıcının son mesajı
 * @returns {string} - AI yanıtı
 */
async function chat(conversationHistory, userMessage, customSystemPrompt = null) {
  const provider = (process.env.LLM_PROVIDER || 'ollama').toLowerCase();

  // Mesaj zincirini oluştur
  const messages = [
    { role: 'system', content: customSystemPrompt || SYSTEM_PROMPT },
    ...conversationHistory,
    { role: 'user', content: userMessage }
  ];

  switch (provider) {
    case 'openai':
      return callOpenAI(messages);
    case 'claude':
      return callClaude(messages);
    case 'gemini':
      return invokeGemini(userMessage, {
        systemPrompt: customSystemPrompt || SYSTEM_PROMPT,
        conversationHistory: conversationHistory,
      });
    case 'bedrock':
      return invokeBedrockClaude(userMessage, {
        systemPrompt: customSystemPrompt || SYSTEM_PROMPT,
        conversationHistory: [
          ...conversationHistory,
        ],
      });
    case 'ollama':
    default:
      return callOllama(messages);
  }
}

function estimateTokens(value) {
  return Math.max(1, Math.ceil(String(value || '').length / 4));
}

function configuredModel(provider) {
  if (provider === 'openai') return process.env.OPENAI_MODEL || 'gpt-4o';
  if (provider === 'claude') return process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
  if (provider === 'gemini') return process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  if (provider === 'bedrock') return process.env.BEDROCK_MODEL || 'anthropic.claude-3-haiku-20240307-v1:0';
  return process.env.OLLAMA_MODEL || 'emsal_atlasi';
}

async function chatWithUsage({ systemPrompt, userMessage, maxTokens = 4096, temperature = 0 }) {
  const provider = (process.env.LLM_PROVIDER || 'ollama').toLowerCase();
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];
  let text;
  if (provider === 'openai') text = await callOpenAI(messages, { temperature, maxTokens });
  else if (provider === 'claude') text = await callClaude(messages, { temperature, maxTokens });
  else if (provider === 'gemini') {
    text = await invokeGemini(userMessage, {
      systemPrompt,
      conversationHistory: [],
      temperature,
      maxTokens,
      toolsEnabled: false,
    });
  } else if (provider === 'bedrock') {
    text = await invokeBedrockClaude(userMessage, {
      systemPrompt,
      conversationHistory: [],
      temperature,
      maxTokens,
      toolsEnabled: false,
    });
  } else text = await callOllama(messages, { temperature, maxTokens });

  const inputTokens = estimateTokens(`${systemPrompt}\n${userMessage}`);
  const outputTokens = estimateTokens(text);
  const inputRate = Number(process.env.EXTRACTION_INPUT_COST_PER_MILLION || 0);
  const outputRate = Number(process.env.EXTRACTION_OUTPUT_COST_PER_MILLION || 0);
  return {
    text,
    provider,
    model: configuredModel(provider),
    inputTokens,
    outputTokens,
    estimatedCost: (inputTokens * inputRate + outputTokens * outputRate) / 1000000,
  };
}

/**
 * Yapay Zeka ile Dilekçe Üretir
 */
async function generatePetition(caseDetails, petitionType, parties, evidence, additionalNotes) {
  const provider = (process.env.LLM_PROVIDER || 'ollama').toLowerCase();

  const prompt = `Sen uzman bir Türk Hukuku avukatısın. Aşağıdaki bilgilere dayanarak profesyonel, Yargıtay formatına uygun, hukuki dayanakları içeren bir "${petitionType}" taslağı hazırla.
  
LÜTFEN ŞU KURALLARA UY:
1. Sadece dilekçe metnini ver, "İşte dilekçeniz" gibi giriş/çıkış cümleleri kullanma.
2. Markdown formatını kullan.
3. HMK/CMK veya ilgili maddi hukuk kurallarına ve emsal kararlara atıf yap.

DAVA BİLGİLERİ:
${caseDetails}

TARAFLAR:
${parties}

DELİLLER:
${evidence}

EK NOTLAR / TALEPLER:
${additionalNotes}
`;

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt }
  ];

  switch (provider) {
    case 'openai': return callOpenAI(messages);
    case 'claude': return callClaude(messages);
    case 'gemini': return invokeGemini(prompt, { systemPrompt: SYSTEM_PROMPT, conversationHistory: [] });
    case 'bedrock': return invokeBedrockClaude(prompt, { systemPrompt: SYSTEM_PROMPT, conversationHistory: [] });
    case 'ollama':
    default: return callOllama(messages);
  }
}

/**
 * Yapay Zeka ile İki Dilekçeyi Karşılaştırır
 */
async function comparePetitions(petition1Title, petition1Content, petition2Title, petition2Content) {
  const provider = (process.env.LLM_PROVIDER || 'ollama').toLowerCase();

  const prompt = `Sen usta bir Türk Hukuku uzmanısın. Aşağıda bir davaya ait iki farklı dilekçe metni verilmiştir. 
Bu iki dilekçeyi tarafsız bir gözle incele ve maddeler halinde şu analizi yap:

1. Çelişen Beyanlar: İki dilekçe arasında maddi vakıalar açısından nerelerde çelişki var?
2. Hukuki Zayıflıklar / Eksik İtirazlar: İkinci dilekçe, birinci dilekçedeki hangi önemli iddiaları cevapsız bırakmış veya zayıf savunmuş?
3. Güçlü Argümanlar: Her iki tarafın hukuki açıdan en güçlü argümanları nelerdir?
4. Sonuç ve Strateji Önerisi: Bu tabloya göre davayı yürütecek avukata stratejik tavsiyelerin nelerdir?

LÜTFEN ŞU KURALLARA UY:
- Analizini profesyonel bir dille ve Markdown formatında hazırla.
- Sadece analizi ver, gereksiz sohbet cümleleri kurma.

--- BİRİNCİ DİLEKÇE (${petition1Title}) ---
${petition1Content}

--- İKİNCİ DİLEKÇE (${petition2Title}) ---
${petition2Content}
`;

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt }
  ];

  switch (provider) {
    case 'openai': return callOpenAI(messages);
    case 'claude': return callClaude(messages);
    case 'gemini': return invokeGemini(prompt, { systemPrompt: SYSTEM_PROMPT, conversationHistory: [] });
    case 'bedrock': return invokeBedrockClaude(prompt, { systemPrompt: SYSTEM_PROMPT, conversationHistory: [] });
    case 'ollama':
    default: return callOllama(messages);
  }
}

module.exports = { chat, chatWithUsage, callOllamaStream, SYSTEM_PROMPT, generatePetition, comparePetitions };
