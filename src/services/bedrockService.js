// ============================================================
// Emsal Atlası - AWS Bedrock Service
// Model: Claude 4.5 Haiku (Cross-Region — us.anthropic)
// ============================================================

/**
 * AWS Bedrock Service — Claude 4.5 Haiku modeline istek atar.
 * 
 * Kimlik bilgileri .env dosyasından okunur:
 *   - AWS_ACCESS_KEY_ID
 *   - AWS_SECRET_ACCESS_KEY
 *   - AWS_REGION (varsayılan: us-east-1)
 * 
 * Cross-Region Inference ile us.anthropic.claude-haiku-4-5-20251001-v1:0 kullanılır.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const {
  BedrockRuntimeClient,
  InvokeModelCommand,
} = require('@aws-sdk/client-bedrock-runtime');

// ── AWS İstemcisi ────────────────────────────────────────────
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// ── Model Konfigürasyonu ─────────────────────────────────────
// Başındaki "us." takısını sildik. Doğrudan standart Haiku 3'ü çağırıyoruz.
const MODEL_ID = 'anthropic.claude-3-haiku-20240307-v1:0';
const ANTHROPIC_VERSION = 'bedrock-2023-05-31';

const BEDROCK_SYSTEM_PROMPT =
  'Sen Legal Zeka platformunun yapay zeka asistanısın. Avukatların sorularını profesyonelce yanıtlarsın. Seni "LegalZeka" ekibi geliştirdi. Sana "Seni kim geliştirdi?", "Kimin eserisin?" gibi sorular sorulduğunda Google, Anthropic vb. şirketlerin ismini KESİNLİKLE anma, sadece "LegalZeka ekibi tarafından geliştirildim" de.';

// ── Ana Fonksiyon ────────────────────────────────────────────

/**
 * AWS Bedrock üzerinden Claude 4.5 Haiku'ya mesaj gönderir.
 * 
 * @param {string} userMessage - Kullanıcının gönderdiği mesaj.
 * @param {Object} [options] - Opsiyonel ayarlar.
 * @param {string} [options.systemPrompt] - Özel system prompt (varsayılan: BEDROCK_SYSTEM_PROMPT).
 * @param {number} [options.maxTokens] - Maksimum token sayısı (varsayılan: 4096).
 * @param {number} [options.temperature] - Yaratıcılık seviyesi 0-1 (varsayılan: 0.7).
 * @param {Array}  [options.conversationHistory] - Önceki mesaj geçmişi [{role, content}].
 * @returns {Promise<string>} - Modelin ürettiği yanıt metni.
 */
async function invokeBedrockClaude(userMessage, options = {}) {
  const {
    systemPrompt = BEDROCK_SYSTEM_PROMPT,
    maxTokens = 4096,
    temperature = 0.7,
    conversationHistory = [],
  } = options;

  // Kimlik bilgileri kontrolü
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error(
      'AWS kimlik bilgileri eksik! Lütfen .env dosyasına AWS_ACCESS_KEY_ID ve AWS_SECRET_ACCESS_KEY ekleyin.'
    );
  }

  // Anthropic Messages API formatında payload
  const messages = [
    ...conversationHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    {
      role: 'user',
      content: userMessage,
    },
  ];

  const payload = {
    anthropic_version: ANTHROPIC_VERSION,
    system: systemPrompt,
    messages,
    max_tokens: maxTokens,
    temperature,
    top_p: 0.9,
  };

  const command = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(payload),
  });

  try {
    const response = await bedrockClient.send(command);

    // Yanıtı parse et
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    if (responseBody.content && responseBody.content.length > 0) {
      return responseBody.content[0].text;
    }

    return 'Yanıt üretilemedi.';
  } catch (error) {
    // DEBUG: Ham hata detaylarını logla
    console.error('🔴 Bedrock RAW Error:', {
      name: error.name,
      message: error.message,
      code: error.$metadata?.httpStatusCode,
      requestId: error.$metadata?.requestId,
    });

    // Hata türlerine göre anlaşılır mesajlar
    if (error.name === 'AccessDeniedException') {
      throw new Error(
        'AWS erişim reddedildi. IAM kullanıcınızın Bedrock erişim izinleri olduğundan emin olun.'
      );
    }
    if (error.name === 'ValidationException') {
      throw new Error(
        `Bedrock doğrulama hatası: ${error.message}. Model ID veya payload formatını kontrol edin.`
      );
    }
    if (error.name === 'ThrottlingException') {
      throw new Error(
        'AWS Bedrock istek limiti aşıldı. Lütfen biraz bekleyip tekrar deneyin.'
      );
    }
    if (error.name === 'ModelNotReadyException') {
      throw new Error(
        'Model henüz hazır değil. Bedrock konsolundan model erişimini etkinleştirdiğinizden emin olun.'
      );
    }

    throw new Error(`AWS Bedrock hatası: ${error.message}`);
  }
}

module.exports = {
  invokeBedrockClaude,
  BEDROCK_SYSTEM_PROMPT,
  MODEL_ID,
};
