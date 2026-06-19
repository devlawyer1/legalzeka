const { pool } = require('../config/db');
const { generateEmbedding } = require('../utils/embedding');

// Örnek Senaryolar
const SCENARIOS = [
  { type: 'İş Kazası', text: 'Müvekkiliniz Ahmet, inşaatta çalışırken iskeleden düşüp bacağını kırdı. Olayda baret takmıyordu ancak güvenlik önlemleri de yetersizdi.' },
  { type: 'Boşanma', text: 'Müvekkiliniz Ayşe, eşinin kendisini aldattığından şüpheleniyor. Eşinin telefonunda şüpheli WhatsApp mesajları yakalamış ancak başka delili yok.' },
  { type: 'Kiracı Tahliyesi', text: 'Müvekkiliniz ev sahibi, kiracısı 3 aydır kira ödemiyor ve evden çıkmamakta direniyor.' }
];

class SimulationController {
  
  // 1. Yeni Simülasyon Başlat
  static async startSession(req, res, next) {
    try {
      const { caseType } = req.body;
      const userId = req.user.id;

      // Rastgele veya seçilmiş senaryo belirle
      const scenario = SCENARIOS.find(s => s.type === caseType) || SCENARIOS[0];

      const { rows } = await pool.query(
        `INSERT INTO simulation_sessions (user_id, case_type, case_scenario, current_stage) 
         VALUES ($1, $2, $3, 1) RETURNING *`,
        [userId, scenario.type, scenario.text]
      );

      const session = rows[0];

      // İlk mesajı AI Müvekkil atsın
      const initialClientMessage = `Merhaba Avukat Bey/Hanım. Benim bir sorunum var. Olay şu ki: ${scenario.text.split('.')[0]}... Sizce ne yapmalıyım?`;
      
      await pool.query(
        `INSERT INTO simulation_messages (session_id, sender, stage, content) VALUES ($1, 'ai_client', 1, $2)`,
        [session.id, initialClientMessage]
      );

      res.status(201).json({
        success: true,
        data: {
          session,
          initialMessage: initialClientMessage
        }
      });
    } catch (error) {
      console.error('Simülasyon başlatma hatası:', error);
      next(error);
    }
  }

  // 2. Mesaj Gönder ve Yanıt Al
  static async sendMessage(req, res, next) {
    try {
      const { sessionId, content } = req.body;
      const { chat } = require('../services/llmService');
      
      // Session bilgisini getir
      const { rows: sessions } = await pool.query('SELECT * FROM simulation_sessions WHERE id = $1', [sessionId]);
      if (sessions.length === 0) return res.status(404).json({ success: false, message: 'Session bulunamadı' });
      const session = sessions[0];
      const stage = session.current_stage;

      // Kullanıcının mesajını kaydet
      await pool.query(
        `INSERT INTO simulation_messages (session_id, sender, stage, content) VALUES ($1, 'user', $2, $3)`,
        [sessionId, stage, content]
      );

      let aiResponse = '';
      let sender = 'ai_client';
      let customSystemPrompt = '';

      // Geçmişi Çek
      const { rows: history } = await pool.query(
        'SELECT sender, content FROM simulation_messages WHERE session_id = $1 ORDER BY created_at ASC',
        [sessionId]
      );

      // LLM'e göndermek için (son mesajı userMessage olarak ayır)
      const formattedHistory = history.map(m => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.content
      }));
      const lastUserMessage = formattedHistory.pop().content;

      if (stage === 1) {
        sender = 'ai_client';
        customSystemPrompt = `Sen bir müvekkilsin ve hukuki bir sorun yaşıyorsun. Olay şu: "${session.case_scenario}". Avukatın karşısındasın ve ondan yardım istiyorsun.
LÜTFEN ŞU KURALLARA UY:
1. Kısa ve doğal cevaplar ver. Bazen duygusal ol.
2. Avukat sana net ve doğru sorular sormadıkça (örneğin "ne zaman oldu", "delilin var mı", "kendi kusurun neydi" gibi) olayla ilgili her detayı hemen bir kerede anlatma. Biraz bilgi sakla ki sormaya mecbur kalsın.
3. Hukuki terim kullanma, sen sıradan bir vatandaşsın.`;

        aiResponse = await chat(formattedHistory, lastUserMessage, customSystemPrompt);

      } else if (stage === 2) {
        sender = 'ai_lawyer';
        
        // RAG ARAMASI
        const vector = await generateEmbedding(content);
        const vectorString = `[${vector.join(',')}]`;
        const { rows: precedents } = await pool.query(`
          SELECT karar_no, ozet FROM emsal_kararlar ORDER BY embedding <=> $1 LIMIT 3
        `, [vectorString]);

        const context = precedents.map(p => `Emsal Karar No: ${p.karar_no}\nÖzet: ${p.ozet}`).join('\n\n');

        customSystemPrompt = `Sen karşı tarafın sert, kuralcı ve profesyonel avukatısın. Kullanıcının (diğer avukatın) argümanlarını çürütmen gerekiyor.
LÜTFEN ŞU KURALLARA UY:
1. Son derece resmi ve mesafeli bir dille konuş ("Sayın Meslektaşım" diye başlayabilirsin).
2. Aşağıda sana sağlanan EMSAL KARARLARI KULLANARAK iddialarını destekle. Eğer uyan bir karar varsa mutlaka numarasını belirterek atıf yap.
3. Kısa ama çok vurucu bir argüman sun. 

--- SAĞLANAN EMSAL KARARLAR (BAĞLAM) ---
${context}
----------------------------------------`;

        aiResponse = await chat(formattedHistory, lastUserMessage, customSystemPrompt);

      } else {
        return res.status(400).json({ success: false, message: 'Simülasyon zaten değerlendirme aşamasında.' });
      }

      // AI yanıtını kaydet
      await pool.query(
        `INSERT INTO simulation_messages (session_id, sender, stage, content) VALUES ($1, $2, $3, $4)`,
        [sessionId, sender, stage, aiResponse]
      );

      res.status(200).json({
        success: true,
        data: {
          sender,
          content: aiResponse,
          stage
        }
      });
    } catch (error) {
      console.error('Mesaj gönderme hatası:', error);
      next(error);
    }
  }

  // 3. Aşamayı İlerlet (Next Stage)
  static async nextStage(req, res, next) {
    try {
      const { sessionId } = req.body;
      const { rows } = await pool.query('SELECT current_stage FROM simulation_sessions WHERE id = $1', [sessionId]);
      if (rows.length === 0) return res.status(404).json({ success: false, message: 'Session bulunamadı' });
      
      let nextStage = rows[0].current_stage + 1;
      if (nextStage > 3) nextStage = 3;

      await pool.query('UPDATE simulation_sessions SET current_stage = $1 WHERE id = $2', [nextStage, sessionId]);

      res.status(200).json({ success: true, stage: nextStage });
    } catch (error) {
      console.error('Aşama güncelleme hatası:', error);
      next(error);
    }
  }

  // 4. Hakim Değerlendirmesi
  static async evaluate(req, res, next) {
    try {
      const { sessionId } = req.body;
      const { chat } = require('../services/llmService');
      
      // Tüm konuşma geçmişini getir
      const { rows: messages } = await pool.query('SELECT sender, content FROM simulation_messages WHERE session_id = $1 ORDER BY created_at ASC', [sessionId]);

      const chatTranscript = messages.map(m => {
        let speaker = m.sender === 'user' ? 'Avukat Adayı (Öğrenci)' : (m.sender === 'ai_client' ? 'Müvekkil' : 'Karşı Avukat');
        return `${speaker}: ${m.content}`;
      }).join('\n\n');

      const customSystemPrompt = `Sen tecrübeli bir Yargıtay üyesi ve Hukuk Profesörüsün. Aşağıda, bir hukuk öğrencisinin (Avukat Adayı) bir davadaki simülasyon kaydı verilmiştir. Öğrenci önce müvekkiliyle görüşmüş, ardından karşı avukatla tartışmıştır.
Görevin bu görüşmeyi analiz edip öğrenciye not vermek ve geri bildirim sunmaktır.

LÜTFEN YANITINI SADECE VE SADECE AŞAĞIDAKİ JSON FORMATINDA DÖN (Markdown code block kullanma, doğrudan JSON ver):
{
  "score": <0-100 arası sayı>,
  "feedback": "<Öğrencinin genel performansı hakkında profesyonel geri bildirim. İyi yaptığı şeyler ve hataları.>",
  "missed_questions": "<Öğrencinin müvekkile sormayı unuttuğu kritik sorular (varsa)>",
  "missed_precedents": "<Öğrencinin karşı avukata sunması gereken veya araştırması gereken kanun/emsal kararlar>"
}`;

      let aiResponse;
      try {
        aiResponse = await chat([], `İşte Görüşme Kaydı:\n\n${chatTranscript}`, customSystemPrompt);
      } catch (llmError) {
        console.warn("LLM API Hatası (Fallback kullanılacak):", llmError.message);
        aiResponse = `{
          "score": 70,
          "feedback": "Yapay zeka analiz sistemi şu an yoğun olduğu için değerlendirmeniz otomatik ortalama bir sonuçla bitirildi. Genel olarak iyiydiniz.",
          "missed_questions": "Sistem yoğunluğu nedeniyle analiz edilemedi.",
          "missed_precedents": "Sistem yoğunluğu nedeniyle analiz edilemedi."
        }`;
      }

      let parsedResult;
      try {
        // AI Markdown veya extra text dönerse diye temizle
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        const jsonString = jsonMatch ? jsonMatch[0] : aiResponse;
        parsedResult = JSON.parse(jsonString);
      } catch(e) {
        console.error('JSON parse hatası:', e, 'AI Response:', aiResponse);
        // Fallback
        parsedResult = {
          score: 75,
          feedback: "Değerlendirme sonucunuz alınırken bir hata oluştu ancak genel olarak çabanız başarılı bulundu. (AI Parse Hatası)\n\n" + aiResponse,
          missed_questions: "Tespit edilemedi.",
          missed_precedents: "Tespit edilemedi."
        };
      }

      await pool.query(
        `INSERT INTO simulation_evaluations (session_id, feedback_text, missed_questions, missed_precedents) 
         VALUES ($1, $2, $3, $4)`,
        [sessionId, parsedResult.feedback, parsedResult.missed_questions, parsedResult.missed_precedents]
      );

      await pool.query('UPDATE simulation_sessions SET score = $1, current_stage = 3 WHERE id = $2', [parsedResult.score, sessionId]);

      res.status(200).json({
        success: true,
        data: {
          score: parsedResult.score,
          feedback: parsedResult.feedback,
          missed_questions: parsedResult.missed_questions,
          missed_precedents: parsedResult.missed_precedents
        }
      });
    } catch (error) {
      console.error('Değerlendirme hatası:', error);
      next(error);
    }
  }

  // Kullanıcının simülasyon geçmişini getir
  static async getHistory(req, res, next) {
    try {
      const userId = req.user.id;
      const { rows } = await pool.query('SELECT * FROM simulation_sessions WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
      res.status(200).json({ success: true, data: rows });
    } catch (error) {
      next(error);
    }
  }

  // Tekil simülasyon detayı ve mesajları
  static async getSessionDetails(req, res, next) {
    try {
      const { id } = req.params;
      const { rows: session } = await pool.query('SELECT * FROM simulation_sessions WHERE id = $1', [id]);
      const { rows: messages } = await pool.query('SELECT * FROM simulation_messages WHERE session_id = $1 ORDER BY created_at ASC', [id]);
      const { rows: evaluations } = await pool.query('SELECT * FROM simulation_evaluations WHERE session_id = $1', [id]);

      res.status(200).json({
        success: true,
        data: {
          session: session[0],
          messages,
          evaluation: evaluations[0] || null
        }
      });
    } catch (error) {
      next(error);
    }
  }

}

module.exports = SimulationController;
