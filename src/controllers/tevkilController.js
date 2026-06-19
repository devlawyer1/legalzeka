const { pool } = require('../config/db');
const { chat } = require('../services/llmService');

// Yeni İlan Oluştur
exports.createAd = async (req, res, next) => {
  try {
    const { title, description, case_type, city, courthouse, case_side, hearing_date, hearing_time, fee } = req.body;
    const author_id = req.user.id;

    const query = `
      INSERT INTO tevkil_ads 
      (author_id, title, description, case_type, city, courthouse, case_side, hearing_date, hearing_time, fee)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    const values = [author_id, title, description, case_type, city, courthouse, case_side, hearing_date, hearing_time, fee];
    
    const { rows } = await pool.query(query, values);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    next(error);
  }
};

// Açık İlanları Listele (Tevkil Pazarı)
exports.getAds = async (req, res, next) => {
  try {
    // Tüm açık ilanları ve ilanı açanın adını getir
    const query = `
      SELECT t.*, u.first_name, u.last_name 
      FROM tevkil_ads t
      JOIN users u ON t.author_id = u.id
      WHERE t.status = 'open'
      ORDER BY t.created_at DESC
    `;
    const { rows } = await pool.query(query);
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

// Benim Açtığım İlanlar (ve gelen başvurular)
exports.getMyAds = async (req, res, next) => {
  try {
    const user_id = req.user.id;
    
    const query = `
      SELECT t.*, 
        (
          SELECT json_agg(json_build_object(
            'id', a.id,
            'applicant_id', a.applicant_id,
            'message', a.message,
            'status', a.status,
            'created_at', a.created_at,
            'applicant_name', u.first_name || ' ' || u.last_name
          ))
          FROM tevkil_applications a
          JOIN users u ON a.applicant_id = u.id
          WHERE a.ad_id = t.id
        ) as applications
      FROM tevkil_ads t
      WHERE t.author_id = $1
      ORDER BY t.created_at DESC
    `;
    
    const { rows } = await pool.query(query, [user_id]);
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

// Bir İlana Başvur
exports.applyToAd = async (req, res, next) => {
  try {
    const { ad_id, message } = req.body;
    const applicant_id = req.user.id;

    // Kendi ilanına başvuramazsın kontrolü
    const adCheck = await pool.query('SELECT author_id FROM tevkil_ads WHERE id = $1', [ad_id]);
    if (adCheck.rows.length === 0) return res.status(404).json({ success: false, message: 'İlan bulunamadı.' });
    if (adCheck.rows[0].author_id === applicant_id) return res.status(400).json({ success: false, message: 'Kendi ilanınıza başvuramazsınız.' });

    // Daha önce başvurulmuş mu?
    const appCheck = await pool.query('SELECT id FROM tevkil_applications WHERE ad_id = $1 AND applicant_id = $2', [ad_id, applicant_id]);
    if (appCheck.rows.length > 0) return res.status(400).json({ success: false, message: 'Bu ilana zaten başvurdunuz.' });

    const query = `
      INSERT INTO tevkil_applications (ad_id, applicant_id, message)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const { rows } = await pool.query(query, [ad_id, applicant_id, message]);
    
    res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    next(error);
  }
};

// Benim Yaptığım Başvurular (Başvurularım sekmesi)
exports.getMyApplications = async (req, res, next) => {
  try {
    const user_id = req.user.id;
    
    const query = `
      SELECT a.*, 
        t.title, t.city, t.courthouse, t.hearing_date, t.hearing_time, t.fee, t.status as ad_status,
        u.first_name as author_first_name, u.last_name as author_last_name
      FROM tevkil_applications a
      JOIN tevkil_ads t ON a.ad_id = t.id
      JOIN users u ON t.author_id = u.id
      WHERE a.applicant_id = $1
      ORDER BY a.created_at DESC
    `;
    
    const { rows } = await pool.query(query, [user_id]);
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

// Başvuruyu Onayla / Reddet
exports.handleApplication = async (req, res, next) => {
  try {
    const { application_id, action } = req.body; // action: 'accept' or 'reject'
    const user_id = req.user.id; // ilanı açan kişi

    // Başvuruyu ve İlanı bul
    const appQuery = `
      SELECT a.id, a.ad_id, t.author_id 
      FROM tevkil_applications a
      JOIN tevkil_ads t ON a.ad_id = t.id
      WHERE a.id = $1
    `;
    const { rows: appRows } = await pool.query(appQuery, [application_id]);
    
    if (appRows.length === 0) return res.status(404).json({ success: false, message: 'Başvuru bulunamadı.' });
    if (appRows[0].author_id !== user_id) return res.status(403).json({ success: false, message: 'Bu ilanın sahibi değilsiniz.' });

    const newStatus = action === 'accept' ? 'accepted' : 'rejected';
    
    // Başvuru durumunu güncelle
    await pool.query('UPDATE tevkil_applications SET status = $1 WHERE id = $2', [newStatus, application_id]);

    // Eğer onaylandıysa, ilanı kapat ve diğer bekleyen başvuruları reddet
    if (action === 'accept') {
      const ad_id = appRows[0].ad_id;
      await pool.query("UPDATE tevkil_ads SET status = 'closed' WHERE id = $1", [ad_id]);
      await pool.query("UPDATE tevkil_applications SET status = 'rejected' WHERE ad_id = $1 AND id != $2", [ad_id, application_id]);
    }

    res.status(200).json({ success: true, message: `Başvuru ${action === 'accept' ? 'onaylandı' : 'reddedildi'}.` });
  } catch (error) {
    next(error);
  }
};

// AI ile İlan Açıklaması Zenginleştirme
exports.improveDescriptionWithAI = async (req, res, next) => {
  try {
    const { description } = req.body;
    
    const prompt = `Aşağıdaki metin, bir avukatın meslektaşına duruşma veya iş tevkil etmek için yazdığı kısa bir taslaktır. Lütfen bunu daha profesyonel, hukuki dile uygun, net ve eksiksiz bir "Tevkil İlan Açıklaması" haline getir. Sadece zenginleştirilmiş metni dön, ekstra yorum yapma.
    
Metin: "${description}"`;

    const systemPrompt = "Sen profesyonel bir avukat asistanısın.";
    let improvedText = await chat([], prompt, systemPrompt);
    
    res.status(200).json({ success: true, data: improvedText });
  } catch (error) {
    console.error("AI Zenginleştirme hatası:", error);
    // Rate limit vs olursa eski metni geri dön
    res.status(200).json({ success: true, data: req.body.description });
  }
};
