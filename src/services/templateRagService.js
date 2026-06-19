const FirmTemplate = require('../models/FirmTemplate');
const { chat } = require('./llmService');
const { generateEmbedding } = require('../utils/embedding');

async function getEmbedding(text) {
  return generateEmbedding(text);
}

class TemplateRagService {
  /**
   * Bir şablon eklendiğinde veya güncellendiğinde çağrılır.
   * Şablonun başlık, etiketler ve içeriğini birleştirerek vektör embedding'ini alır ve veritabanına kaydeder.
   */
  static async indexTemplate(templateId) {
    const template = await FirmTemplate.findById(templateId);
    if (!template) throw new Error('Şablon bulunamadı.');

    const textToEmbed = `Başlık: ${template.title}\nTür: ${template.template_type}\nEtiketler: ${(template.tags || []).join(', ')}\n\nİçerik:\n${template.content}`;
    
    const embedding = await getEmbedding(textToEmbed);
    await FirmTemplate.updateEmbedding(templateId, embedding);
    return true;
  }

  /**
   * Yeni bir dilekçe yazdırılmak istendiğinde kullanıcının talebine en uygun kurumsal şablonları bulur.
   */
  static async searchRelevantTemplates(firmId, query, limit = 3) {
    const queryEmbedding = await getEmbedding(query);
    const similarTemplates = await FirmTemplate.findSimilar(firmId, queryEmbedding, limit);
    return similarTemplates;
  }

  /**
   * Yapay zeka ile şablonlara dayanarak yeni bir dilekçe/belge üretir.
   */
  static async generateDraftFromTemplates(firmId, prompt, caseData) {
    // 1. Önce kullanıcının talebine en uygun şablonları bul
    const relevantTemplates = await this.searchRelevantTemplates(firmId, prompt, 2);
    
    // 2. Şablon içeriklerini context olarak hazırla
    let contextText = relevantTemplates.map(t => 
      `--- ŞABLON: ${t.title} (${t.template_type}) ---\n${t.content}\n------------------------`
    ).join('\n\n');

    if (!contextText) {
      contextText = "Büronun bu konuyla ilgili geçmiş bir şablonu bulunamadı. Lütfen standart yasal standartlara uygun bir taslak hazırlayın.";
    }

    // 3. LLM Service ile iletişime geç
    const systemInstruction = `Görevin, aşağıdaki "KURUMSAL ŞABLONLAR" bölümünde verilen büro geçmiş dilekçe ve metin formatlarını öğrenmek ve kullanıcının istediği yeni belgeyi bu tarzda, aynı hukuki dilde ve şablonda hazırlamaktır.
Eğer şablonlarda ilgili yerler varsa, dava bilgilerini (Davacı, Davalı, Esas No vb.) uygun yerlere yerleştir.

KURUMSAL ŞABLONLAR:
${contextText}

DAVA BİLGİLERİ:
Esas No: ${caseData?.esasNo || 'Bilinmiyor'}
Mahkeme: ${caseData?.mahkeme || 'Bilinmiyor'}
Davacı: ${caseData?.tarafDavaci || 'Bilinmiyor'}
Davalı: ${caseData?.tarafDavali || 'Bilinmiyor'}
`;

    try {
      // Chat completion çağrısı
      const resultText = await chat([{ role: 'system', content: systemInstruction }], `Lütfen şu talebe uygun belgeyi hazırla: ${prompt}`);

      return {
        draft: resultText,
        usedTemplates: relevantTemplates.map(t => ({ id: t.id, title: t.title }))
      };
    } catch (error) {
      console.error('Taslak oluşturulurken hata:', error.message);
      throw new Error('Taslak üretilemedi.');
    }
  }
}

module.exports = TemplateRagService;
