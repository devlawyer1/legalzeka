// ============================================================
// Emsal Atlası - AI Agent Mevzuat Araçları (Tools)
// Vercel AI SDK veya Bedrock Tool formatına uygun yapıda.
// Not: Kullanım için 'zod' ve (kullanılıyorsa) 'ai' (Vercel) paketleri gerekir.
// ============================================================

const { z } = require('zod');
// Eğer Vercel AI SDK kullanılıyorsa:
// const { tool } = require('ai');
// Eğer Vercel kullanılmıyorsa, projedeki tool() sarmalayıcısını veya 
// AWS Bedrock Native Tool JSON formatını kullanabilirsiniz.
// Biz burada örnek bir tool fonksiyonu sarmalayıcısı varsayıyoruz:
const tool = (config) => config;

const mevzuatService = require('../services/mevzuat/mevzuatService');

const tools = {
  searchMevzuat: tool({
    description: "Türkiye Cumhuriyeti mevzuatında (Kanun, Yönetmelik, KHK, Kararname vb.) arama yapar. İçtihat ve kanun aramaları için kullanılabilir.",
    parameters: z.object({
      query: z.string().describe("Aranacak kelime, cümle veya hukuki konu."),
      mevzuatAdi: z.string().optional().describe("Eğer belirli bir kanun adı biliniyorsa (örn: 'Türk Medeni Kanunu')."),
      mevzuatTur: z.enum([
        "KANUN", "KHK", "TUZUK", "YONETMELIK", 
        "CB_KARARNAME", "CB_KARAR", "CB_YONETMELIK", 
        "CB_GENELGE", "TEBLIGLER", "MULGA"
      ]).optional().describe("Aramanın yapılacağı spesifik mevzuat türü."),
      mevzuatNo: z.string().optional().describe("Mevzuatın resmi numarası (örn: '6098')."),
    }),
    execute: async ({ query, mevzuatAdi, mevzuatTur, mevzuatNo }) => {
      try {
        return await mevzuatService.searchDocuments({
          query: query,
          mevzuatAdi: mevzuatAdi,
          mevzuatTur: mevzuatTur,
          mevzuatNo: mevzuatNo,
          pageSize: 5 // AI'a çok fazla data verip context'i şişirmemek için limitliyoruz
        });
      } catch (error) {
        return { error: error.message };
      }
    }
  }),

  getArticleContent: tool({
    description: "Bir kanunun belirli bir maddesinin veya tamamının metin içeriğini getirir.",
    parameters: z.object({
      mevzuatId: z.string().describe("searchMevzuat tool'undan dönen mevzuatın veya maddenin benzersiz ID'si."),
      mevzuatTur: z.number().optional().describe("Mevzuat tür kodu (GovTr fallback için)."),
      mevzuatTertip: z.string().optional().describe("Mevzuat tertip bilgisi (GovTr fallback için)."),
      resmiGazeteTarihi: z.string().optional().describe("RG tarihi, DD/MM/YYYY formatında (CB Genelgesi için).")
    }),
    execute: async ({ mevzuatId, mevzuatTur, mevzuatTertip, resmiGazeteTarihi }) => {
      try {
        // İki servisi de kapsayan ana metottan çağırıyoruz.
        // Aslında mevzuatService.getDocumentContent bütün dökümanı getirir.
        // Sadece madde getirmek için mevzuatService.getArticleContent de var.
        // AI'nın kullanımına göre ikisini de dönebiliriz.
        return await mevzuatService.getDocumentContent(
          mevzuatId, mevzuatTur, mevzuatTertip, resmiGazeteTarihi
        );
      } catch (error) {
        return { error: error.message };
      }
    }
  }),

  getArticleTree: tool({
    description: "Bir mevzuatın bölümlerini ve maddelerini (İçindekiler ağacını) listeler. Kanunun hangi maddelerden oluştuğunu görmek için kullanılır.",
    parameters: z.object({
      mevzuatId: z.string().describe("searchMevzuat tool'undan dönen mevzuatın ID'si.")
    }),
    execute: async ({ mevzuatId }) => {
      try {
        return await mevzuatService.getArticleTree(mevzuatId);
      } catch (error) {
        return { error: error.message };
      }
    }
  }),

  getGerekce: tool({
    description: "Bir kanunun, maddenin veya tasarının gerekçesini (niçin çıkarıldığını, Meclis komisyon raporlarını) getirir.",
    parameters: z.object({
      gerekceId: z.string().describe("Arama veya ağaç sonuçlarından elde edilen gerekçe ID'si.")
    }),
    execute: async ({ gerekceId }) => {
      try {
        return await mevzuatService.getGerekceContent(gerekceId);
      } catch (error) {
        return { error: error.message };
      }
    }
  }),
};

module.exports = tools;
