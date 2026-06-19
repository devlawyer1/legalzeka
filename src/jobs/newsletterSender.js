const nodemailer = require('nodemailer');
const { pool } = require('../config/db');

// Brevo / SendGrid vb. için SMTP ayarları
// .env dosyasında SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS olmalı
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
    port: process.env.SMTP_PORT || 587,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

/**
 * Son 7 günün Resmi Gazete ve önemli içtihatlarını toplayarak
 * bülten abonelerine şık bir e-posta gönderir.
 */
async function sendWeeklyNewsletter() {
    console.log('[NewsletterSender] Preparing weekly newsletter...');

    try {
        // 1. Son 7 günün kayıtlarını al
        const recentEntries = await pool.query(`
            SELECT * FROM gazette_entries 
            WHERE created_at >= NOW() - INTERVAL '7 days'
            ORDER BY publish_date DESC
        `);

        if (recentEntries.rows.length === 0) {
            console.log('[NewsletterSender] No new entries this week. Skipping newsletter.');
            return;
        }

        // 2. Aboneleri al
        const subscribers = await pool.query(`
            SELECT email FROM newsletter_subscribers WHERE is_active = true
        `);

        if (subscribers.rows.length === 0) {
            console.log('[NewsletterSender] No active subscribers. Skipping.');
            return;
        }

        console.log(`[NewsletterSender] Found ${recentEntries.rows.length} entries. Sending to ${subscribers.rows.length} subscribers.`);

        // 3. HTML Şablonunu oluştur
        let contentHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                <h1 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px;">Haftanın Hukuk Özeti - Legal Zeka</h1>
                <p>Değerli meslektaşımız,</p>
                <p>Geçtiğimiz hafta Resmi Gazete'de yayımlanan hukuki gelişmelerin ve önemli değişikliklerin kısa özetlerini aşağıda bulabilirsiniz:</p>
        `;

        recentEntries.rows.forEach(entry => {
            contentHtml += `
                <div style="margin-bottom: 25px; padding: 15px; background: #f8fafc; border-left: 4px solid #3b82f6; border-radius: 4px;">
                    <h3 style="margin-top: 0; color: #1e293b;">
                        <a href="${entry.url}" style="text-decoration: none; color: #1d4ed8;">${entry.title}</a>
                    </h3>
                    <span style="display: inline-block; background: #e2e8f0; padding: 2px 8px; border-radius: 12px; font-size: 12px; margin-bottom: 10px;">${entry.category || 'Diğer'}</span>
                    <p style="font-size: 14px; line-height: 1.5; margin-bottom: 0;">${entry.summary}</p>
                </div>
            `;
        });

        contentHtml += `
                <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
                <p style="font-size: 12px; color: #64748b; text-align: center;">
                    Bu e-postayı Legal Zeka Haftalık Bültenine abone olduğunuz için alıyorsunuz.
                    <br/><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/newsletter/unsubscribe" style="color: #64748b;">Abonelikten Çık</a>
                </p>
            </div>
        `;

        // 4. Gönderim işlemi (BCC ile toplu veya tek tek)
        // Profesyonel sistemlerde her kullanıcıya tek tek isme özel mail atılır,
        // Biz burada basitlik açısından BCC kullanıyoruz veya döngü kuruyoruz.
        const emails = subscribers.rows.map(sub => sub.email);

        const mailOptions = {
            from: `"Legal Zeka" <${process.env.SMTP_FROM_EMAIL || 'noreply@legalzeka.com'}>`,
            to: process.env.SMTP_FROM_EMAIL || 'noreply@legalzeka.com', // Kendi adresimize TO
            bcc: emails, // Abonelere BCC
            subject: 'Haftalık Hukuk Özeti ve Yeni İçtihatlar',
            html: contentHtml
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('[NewsletterSender] Email sent successfully:', info.messageId);

        // 5. Raporu kaydet
        await pool.query(
            `INSERT INTO newsletters (content_html, recipient_count) VALUES ($1, $2)`,
            [contentHtml, emails.length]
        );

    } catch (error) {
        console.error('[NewsletterSender] Error sending newsletter:', error);
    }
}

module.exports = {
    sendWeeklyNewsletter
};
