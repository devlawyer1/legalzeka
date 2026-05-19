// ============================================================
// Emsal Atlası - AI Analysis Routes
// Şeytanın Avukatı ve Sözleşme İnceleme özellikleri
// ============================================================

const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const { parseAndCleanup } = require('../utils/fileParser');
const { chat } = require('../services/llmService');
const { authenticate } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/checkSubscription');

/**
 * Dosya veya düz metinden içeriği çıkaran yardımcı fonksiyon
 */
async function extractContent(req) {
  if (req.file) {
    return await parseAndCleanup(req.file.path);
  } else if (req.body.text) {
    return req.body.text;
  } else {
    throw new Error('Lütfen inceleme için bir dosya yükleyin veya metin (text) gönderin.');
  }
}

/**
 * @route   POST /api/analysis/devils-advocate
 * @desc    Şeytanın Avukatı (Karşı Argüman Asistanı)
 * @access  Private - Aktif Abonelik gerekli
 */
router.post('/devils-advocate', authenticate, checkSubscription, upload.single('document'), async (req, res, next) => {
  try {
    const documentText = await extractContent(req);

    if (documentText.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Dökümandan metin çıkarılamadı veya boş.' });
    }

    const systemPrompt = `Aşağıdaki dilekçe veya hukuki metin kullanıcının sunduğu bir argümandır. 
Sen karşı tarafın acımasız, son derece zeki ve detaycı avukatısın. Amacın bu argümanı çürütmek.
Görevlerin:
1. Argümandaki zayıf noktaları, çelişkileri ve mantıksal hataları bul.
2. Hukuki dayanakların (varsa) eksik yönlerini veya karşıt içtihat ihtimallerini vurgula.
3. En güçlü karşı argümanları üret.
Yanıtını net, madde madde ve profesyonel/agresif bir hukuki dille ver.`;

    const aiResponse = await chat(
      [{ role: 'system', content: systemPrompt }],
      `İncelenecek Argüman/Dilekçe:\n\n${documentText}`
    );

    res.status(200).json({
      success: true,
      message: 'Şeytanın Avukatı analizi tamamlandı.',
      data: {
        analysis: aiResponse
      }
    });

  } catch (error) {
    console.error('Devil\'s Advocate Error:', error);
    next(error);
  }
});

/**
 * @route   POST /api/analysis/contract-review
 * @desc    Sözleşme İnceleme ve Risk Analizi (Redlining)
 * @access  Private - Aktif Abonelik gerekli
 */
router.post('/contract-review', authenticate, checkSubscription, upload.single('document'), async (req, res, next) => {
  try {
    const documentText = await extractContent(req);

    if (documentText.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Dökümandan metin çıkarılamadı veya boş.' });
    }

    const systemPrompt = `Aşağıdaki metin bir sözleşmedir. 
Sen kıdemli bir şirket avukatı ve sözleşme uzmanısın (Hukuk Müşaviri).
Görevlerin:
1. Sözleşmedeki standart dışı, riskli veya tek taraflı (asimetrik) maddeleri (örn: fahiş cezai şartlar, tek taraflı fesih hakları, aleyhe yetki itirazları) tespit et.
2. Eksik bırakılmış ve ileride sorun yaratabilecek hayati maddeleri belirt.
3. Tehlikeli maddeler için revizyon önerileri sun (Redlining mantığıyla: Şunu çıkarın, yerine bunu ekleyin).
Yanıtını net, madde madde ve anlaşılır bir dille ver.`;

    const aiResponse = await chat(
      [{ role: 'system', content: systemPrompt }],
      `İncelenecek Sözleşme:\n\n${documentText}`
    );

    res.status(200).json({
      success: true,
      message: 'Sözleşme analizi tamamlandı.',
      data: {
        analysis: aiResponse
      }
    });

  } catch (error) {
    console.error('Contract Review Error:', error);
    next(error);
  }
});

module.exports = router;
