const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { pool } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// Bütün route'lar authentication gerektirir
router.use(authenticate);

/**
 * @route   GET /api/collections
 * @desc    Kullanıcının koleksiyonlarını getirir
 */
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM collections WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Koleksiyon getirme hatası:', error);
    next(error);
  }
});

/**
 * @route   POST /api/collections
 * @desc    Yeni koleksiyon oluşturur
 */
router.post('/', async (req, res, next) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Koleksiyon adı zorunludur.' });
    }

    const id = uuidv4();
    const { rows } = await pool.query(
      'INSERT INTO collections (id, user_id, name, description) VALUES ($1, $2, $3, $4) RETURNING *',
      [id, req.user.id, name, description || null]
    );

    res.status(201).json({ success: true, message: 'Koleksiyon oluşturuldu.', data: rows[0] });
  } catch (error) {
    console.error('Koleksiyon oluşturma hatası:', error);
    next(error);
  }
});

/**
 * @route   DELETE /api/collections/:id
 * @desc    Koleksiyonu siler
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM collections WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Koleksiyon bulunamadı veya yetkiniz yok.' });
    }

    res.json({ success: true, message: 'Koleksiyon başarıyla silindi.' });
  } catch (error) {
    console.error('Koleksiyon silme hatası:', error);
    next(error);
  }
});

/**
 * @route   GET /api/collections/:id/items
 * @desc    Koleksiyon içindeki emsal kararları getirir
 */
router.get('/:id/items', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Önce yetki kontrolü
    const collectionCheck = await pool.query(
      'SELECT id FROM collections WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    if (collectionCheck.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Koleksiyon bulunamadı veya yetkiniz yok.' });
    }

    const { rows } = await pool.query(`
      SELECT ek.*, ci.added_at, ci.id as collection_item_id
      FROM collection_items ci
      JOIN emsal_kararlar ek ON ci.emsal_karar_id = ek.id
      WHERE ci.collection_id = $1
      ORDER BY ci.added_at DESC
    `, [id]);

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Koleksiyon öğelerini getirme hatası:', error);
    next(error);
  }
});

/**
 * @route   POST /api/collections/:id/items
 * @desc    Koleksiyona emsal karar ekler
 */
router.post('/:id/items', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { emsal_karar_id } = req.body;

    if (!emsal_karar_id) {
      return res.status(400).json({ success: false, message: 'Emsal karar ID zorunludur.' });
    }

    const collectionCheck = await pool.query(
      'SELECT id FROM collections WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    if (collectionCheck.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Koleksiyon bulunamadı veya yetkiniz yok.' });
    }

    const itemId = uuidv4();
    const { rows } = await pool.query(
      'INSERT INTO collection_items (id, collection_id, emsal_karar_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING *',
      [itemId, id, emsal_karar_id]
    );

    if (rows.length === 0) {
      return res.status(200).json({ success: true, message: 'Bu karar zaten koleksiyonda mevcut.' });
    }

    res.status(201).json({ success: true, message: 'Karar koleksiyona eklendi.', data: rows[0] });
  } catch (error) {
    console.error('Koleksiyona ekleme hatası:', error);
    next(error);
  }
});

/**
 * @route   DELETE /api/collections/:id/items/:emsal_karar_id
 * @desc    Koleksiyondan emsal kararı çıkarır
 */
router.delete('/:id/items/:emsal_karar_id', async (req, res, next) => {
  try {
    const { id, emsal_karar_id } = req.params;

    const collectionCheck = await pool.query(
      'SELECT id FROM collections WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    if (collectionCheck.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Koleksiyon bulunamadı veya yetkiniz yok.' });
    }

    const result = await pool.query(
      'DELETE FROM collection_items WHERE collection_id = $1 AND emsal_karar_id = $2 RETURNING id',
      [id, emsal_karar_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Kayıt bulunamadı.' });
    }

    res.json({ success: true, message: 'Karar koleksiyondan çıkarıldı.' });
  } catch (error) {
    console.error('Koleksiyondan çıkarma hatası:', error);
    next(error);
  }
});

module.exports = router;
