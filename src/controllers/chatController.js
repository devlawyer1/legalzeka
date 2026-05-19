// ============================================================
// Emsal Atlası - Chat Controller
// Sohbet oluşturma, mesaj gönderme, geçmiş yönetimi
// ============================================================

const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/db');
const { chat } = require('../services/llmService');

/**
 * Yeni sohbet başlat
 * POST /api/chat/conversations
 */
async function createConversation(req, res) {
  try {
    const id = uuidv4();
    const userId = req.user?.id || null;
    const guestIp = !userId ? (req.ip || req.connection.remoteAddress) : null;

    await pool.query(
      'INSERT INTO conversations (id, user_id, guest_ip) VALUES ($1, $2, $3)',
      [id, userId, guestIp]
    );

    res.status(201).json({
      success: true,
      data: { id, title: 'Yeni Sohbet', created_at: new Date() }
    });
  } catch (error) {
    console.error('Sohbet oluşturma hatası:', error);
    res.status(500).json({ success: false, message: 'Sohbet oluşturulamadı.' });
  }
}

/**
 * Sohbet listesini getir
 * GET /api/chat/conversations
 */
async function getConversations(req, res) {
  try {
    const userId = req.user?.id || null;
    const guestIp = !userId ? (req.ip || req.connection.remoteAddress) : null;

    let rows;
    if (userId) {
      const result = await pool.query(
        'SELECT id, title, created_at, updated_at FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 50',
        [userId]
      );
      rows = result.rows;
    } else {
      const result = await pool.query(
        'SELECT id, title, created_at, updated_at FROM conversations WHERE guest_ip = $1 AND user_id IS NULL ORDER BY updated_at DESC LIMIT 10',
        [guestIp]
      );
      rows = result.rows;
    }

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Sohbet listesi hatası:', error);
    res.status(500).json({ success: false, message: 'Sohbetler yüklenemedi.' });
  }
}

/**
 * Sohbet mesajlarını getir
 * GET /api/chat/conversations/:id/messages
 */
async function getMessages(req, res) {
  try {
    const { id } = req.params;

    const { rows: messages } = await pool.query(
      'SELECT id, role, content, tool_used, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [id]
    );

    res.json({ success: true, data: messages });
  } catch (error) {
    console.error('Mesaj getirme hatası:', error);
    res.status(500).json({ success: false, message: 'Mesajlar yüklenemedi.' });
  }
}

/**
 * Mesaj gönder ve AI yanıtı al
 * POST /api/chat/conversations/:id/messages
 */
async function sendMessage(req, res) {
  try {
    const { id } = req.params;
    const { message } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Mesaj boş olamaz.' });
    }

    // 1. Sohbetin var olduğunu kontrol et
    const { rows: convs } = await pool.query('SELECT id FROM conversations WHERE id = $1', [id]);
    if (convs.length === 0) {
      return res.status(404).json({ success: false, message: 'Sohbet bulunamadı.' });
    }

    // 2. Kullanıcı mesajını kaydet
    await pool.query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [id, 'user', message.trim()]
    );

    // 3. Önceki mesaj geçmişini al (son 20 mesaj — bağlam penceresi)
    const { rows: history } = await pool.query(
      'SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 20',
      [id]
    );

    // Son eklenen user mesajını geçmişten çıkar (chat fonksiyonuna ayrıca veriyoruz)
    const conversationHistory = history.slice(0, -1);

    // 4. LLM'den yanıt al
    const aiResponse = await chat(conversationHistory, message.trim());

    // 5. AI yanıtını kaydet
    await pool.query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [id, 'assistant', aiResponse]
    );

    // 6. Sohbet başlığını ilk mesajdan otomatik güncelle
    const { rows: msgCount } = await pool.query(
      'SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = $1',
      [id]
    );
    if (msgCount[0].cnt <= 2) {
      // İlk mesajsa, başlığı kısalt
      const title = message.trim().length > 60 
        ? message.trim().substring(0, 60) + '...' 
        : message.trim();
      await pool.query(
        'UPDATE Conversations SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [title, id]
      );
    } else {
      await pool.query(
        'UPDATE Conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [id]
      );
    }

    res.json({
      success: true,
      data: {
        role: 'assistant',
        content: aiResponse,
        created_at: new Date()
      }
    });
  } catch (error) {
    console.error('Mesaj gönderme hatası:', error);
    res.status(500).json({ 
      success: false, 
      message: 'AI yanıt üretemedi: ' + (error.message || 'Bilinmeyen hata')
    });
  }
}

/**
 * Sohbeti sil
 * DELETE /api/chat/conversations/:id
 */
async function deleteConversation(req, res) {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM conversations WHERE id = $1', [id]);
    res.json({ success: true, message: 'Sohbet silindi.' });
  } catch (error) {
    console.error('Sohbet silme hatası:', error);
    res.status(500).json({ success: false, message: 'Sohbet silinemedi.' });
  }
}

/**
 * Mesaj gönder ve AI yanıtını STREAM olarak al (SSE)
 * POST /api/chat/conversations/:id/messages/stream
 * 
 * ChatGPT gibi kelime kelime akıtır.
 * Ollama modelinin streaming yanıtını doğrudan istemciye yönlendirir.
 */
async function sendMessageStream(req, res) {
  try {
    const { id } = req.params;
    const { message } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Mesaj boş olamaz.' });
    }

    // 1. Sohbetin var olduğunu kontrol et
    const { rows: convs } = await pool.query('SELECT id FROM conversations WHERE id = $1', [id]);
    if (convs.length === 0) {
      return res.status(404).json({ success: false, message: 'Sohbet bulunamadı.' });
    }

    // 2. Kullanıcı mesajını kaydet
    await pool.query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [id, 'user', message.trim()]
    );

    // 3. Önceki mesaj geçmişini al
    const { rows: history } = await pool.query(
      'SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 20',
      [id]
    );
    const conversationHistory = history.slice(0, -1);

    // 4. SSE header'larını ayarla
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const provider = (process.env.LLM_PROVIDER || 'bedrock').toLowerCase();

    let fullResponse = '';

    if (provider === 'ollama') {
      // ── Ollama: Gerçek streaming ──────────────────────────
      res.write(`data: ${JSON.stringify({ content: "*(Sistem belleği hazırlanıyor, bu ilk seferde 1-2 dakika sürebilir...)*\n\n", done: false })}\n\n`);

      const keepAliveInterval = setInterval(() => {
        res.write(': keepalive\n\n');
      }, 15000);

      const { callOllamaStream, SYSTEM_PROMPT } = require('../services/llmService');
      
      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...conversationHistory,
        { role: 'user', content: message.trim() }
      ];

      let ollamaResponse;
      try {
        ollamaResponse = await callOllamaStream(messages);
      } finally {
        clearInterval(keepAliveInterval);
      }
      
      const reader = ollamaResponse.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        
        const lines = chunk.split('\n').filter(l => l.trim());
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.message?.content) {
              fullResponse += parsed.message.content;
              res.write(`data: ${JSON.stringify({ content: parsed.message.content, done: false })}\n\n`);
            }
            if (parsed.done) {
              res.write(`data: ${JSON.stringify({ content: '', done: true })}\n\n`);
            }
          } catch (e) {
            // JSON parse hatası — devam et
          }
        }
      }
    } else {
      // ── Bedrock / Gemini / OpenAI / Claude: Normal yanıt → SSE yazma animasyonu ──
      const aiResponse = await chat(conversationHistory, message.trim());
      fullResponse = aiResponse;

      // Kelime kelime SSE ile gönder (Gemini tarzı yazma animasyonu)
      const words = aiResponse.split(/(\s+)/); // Boşlukları da koru
      for (let i = 0; i < words.length; i++) {
        res.write(`data: ${JSON.stringify({ content: words[i], done: false })}\n\n`);
        // Her kelime arası kısa gecikme — doğal yazma hissi
        if (i < words.length - 1) {
          await new Promise(r => setTimeout(r, 30));
        }
      }
      
      res.write(`data: ${JSON.stringify({ content: '', done: true })}\n\n`);
    }

    // 6. AI yanıtını DB'ye kaydet
    if (fullResponse.trim()) {
      await pool.query(
        'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
        [id, 'assistant', fullResponse.trim()]
      );
    }

    // 7. Sohbet başlığını güncelle (ilk mesajsa)
    const { rows: msgCount } = await pool.query(
      'SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = $1',
      [id]
    );
    if (msgCount[0].cnt <= 2) {
      const title = message.trim().length > 60 
        ? message.trim().substring(0, 60) + '...' 
        : message.trim();
      await pool.query(
        'UPDATE Conversations SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [title, id]
      );
    } else {
      await pool.query(
        'UPDATE Conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [id]
      );
    }

    res.end();
  } catch (error) {
    console.error('Stream mesaj hatası:', error);
    // Eğer SSE header'ları zaten gönderildiyse hata mesajını SSE ile gönder
    try {
      res.write(`data: ${JSON.stringify({ error: error.message || 'Stream hatası', done: true })}\n\n`);
      res.end();
    } catch (e) {
      // Response zaten kapatılmış olabilir
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'AI yanıt üretemedi.' });
      }
    }
  }
}

module.exports = {
  createConversation,
  getConversations,
  getMessages,
  sendMessage,
  sendMessageStream,
  deleteConversation,
};
