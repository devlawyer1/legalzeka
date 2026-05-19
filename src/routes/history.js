// ============================================================
// Emsal Atlası - History Routes
// Kullanıcı arama geçmişi endpoint'leri
// ============================================================

const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { authenticate } = require('../middleware/auth');

/**
 * @route   GET /api/history
 * @desc    Kullanıcının kendi arama geçmişini getirir
 * @access  Private
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, query, search_type, created_at FROM search_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );

    res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/history
 * @desc    Kullanıcının tüm arama geçmişini temizler
 * @access  Private
 */
router.delete('/', authenticate, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM search_history WHERE user_id = $1', [req.user.id]);

    res.status(200).json({
      success: true,
      message: 'Arama geçmişi tamamen temizlendi.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/history/:id
 * @desc    Kullanıcının belirli bir arama geçmişini siler
 * @access  Private
 */
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rowCount } = await pool.query(
      'DELETE FROM search_history WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Geçmiş kaydı bulunamadı veya yetkiniz yok.' });
    }

    res.status(200).json({
      success: true,
      message: 'Geçmiş kaydı silindi.',
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
