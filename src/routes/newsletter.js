const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { body, validationResult } = require('express-validator');

// Abone Olma Endpoint'i
router.post('/subscribe', 
    body('email').isEmail().withMessage('Geçerli bir e-posta adresi giriniz.'),
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, categories } = req.body;
        const preferredCategories = Array.isArray(categories) ? categories : ['Tümü'];

        try {
            // Zaten abone mi kontrolü
            const existing = await pool.query('SELECT * FROM newsletter_subscribers WHERE email = $1', [email]);
            
            if (existing.rows.length > 0) {
                if (!existing.rows[0].is_active) {
                    // Yeniden aktif et
                    await pool.query('UPDATE newsletter_subscribers SET is_active = true, preferred_categories = $1 WHERE email = $2', [preferredCategories, email]);
                    return res.json({ message: 'Aboneliğiniz yeniden aktifleştirildi.' });
                }
                return res.status(400).json({ message: 'Bu e-posta adresi zaten bültene kayıtlı.' });
            }

            // Yeni abone
            await pool.query(
                'INSERT INTO newsletter_subscribers (email, preferred_categories, is_active) VALUES ($1, $2, true)',
                [email, preferredCategories]
            );

            res.status(201).json({ message: 'Bültene başarıyla abone oldunuz.' });

        } catch (error) {
            console.error('Newsletter Subscribe Error:', error);
            res.status(500).json({ message: 'Sunucu hatası oluştu.' });
        }
    }
);

// Abonelikten Çıkma Endpoint'i
router.post('/unsubscribe', 
    body('email').isEmail().withMessage('Geçerli bir e-posta adresi giriniz.'),
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email } = req.body;

        try {
            await pool.query('UPDATE newsletter_subscribers SET is_active = false WHERE email = $1', [email]);
            res.json({ message: 'Abonelikten başarıyla çıktınız.' });
        } catch (error) {
            console.error('Newsletter Unsubscribe Error:', error);
            res.status(500).json({ message: 'Sunucu hatası oluştu.' });
        }
    }
);

module.exports = router;
