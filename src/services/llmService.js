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
 * Gemini API ile chat completion
 */
async function callGemini(messages) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY tanımlanmamış. Lütfen .env dosyasına ekleyin.');

  // Gemini API formatına çevir
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

  const systemInstruction = messages.find(m => m.role === 'system');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction.content }] } : undefined,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096,
          topP: 0.9,
        }
      })
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API hatası: ${response.status} — ${err}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Yanıt üretilemedi.';
}

/**
 * OpenAI API ile chat completion
 */
async function callOpenAI(messages) {
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
      temperature: 0.7,
      max_tokens: 4096,
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
async function callClaude(messages) {
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
      max_tokens: 4096,
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
async function callOllama(messages) {
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
        temperature: 0.7,
        num_predict: 1024,
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
async function chat(conversationHistory, userMessage) {
  const provider = (process.env.LLM_PROVIDER || 'ollama').toLowerCase();

  // Mesaj zincirini oluştur
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...conversationHistory,
    { role: 'user', content: userMessage }
  ];

  switch (provider) {
    case 'openai':
      return callOpenAI(messages);
    case 'claude':
      return callClaude(messages);
    case 'gemini':
      return callGemini(messages);
    case 'bedrock':
      return invokeBedrockClaude(userMessage, {
        conversationHistory: [
          ...conversationHistory,
        ],
      });
    case 'ollama':
    default:
      return callOllama(messages);
  }
}

module.exports = { chat, callOllamaStream, SYSTEM_PROMPT };
