const axios = require('axios');
const cheerio = require('cheerio');
const { pool } = require('../config/db');
const { chat } = require('../services/llmService');

const GAZETTE_BASE_URL = 'https://www.resmigazete.gov.tr';

/**
 * Resmi Gazete'nin bugünkü fihristini çeker ve önemli gördüğü
 * kanun, yönetmelik ve AYM kararlarını veritabanına kaydeder.
 */
async function scrapeTodayGazette() {
    console.log('[GazetteScraper] Scraping today\'s Resmi Gazete...');
    try {
        const response = await axios.get(GAZETTE_BASE_URL);
        const $ = cheerio.load(response.data);
        
        // Bu örnek basit bir HTML parse yapısıdır. 
        // Gerçekte Resmi Gazete'nin güncel HTML yapısına göre revize edilebilir.
        const entries = [];
        
        // Örnek: Yürütme ve İdare Bölümü, Yargı Bölümü vs. 
        // class="fihrist-item" gibi genel bir seçici kullanıyoruz.
        // Güncel DOM yapısına göre uyarlanmalı.
        $('.fihrist-item, .fihrist-liste li').each((i, el) => {
            const title = $(el).text().trim();
            const link = $(el).find('a').attr('href');
            
            if (title && link) {
                // Sadece hukuki açıdan önemli olabilecek başlıkları filtrele
                if (
                    title.toLowerCase().includes('kanun') || 
                    title.toLowerCase().includes('yönetmelik') || 
                    title.toLowerCase().includes('anayasa mahkemesi') ||
                    title.toLowerCase().includes('karar') ||
                    title.toLowerCase().includes('tebliğ')
                ) {
                    entries.push({
                        title,
                        url: link.startsWith('http') ? link : `${GAZETTE_BASE_URL}${link.startsWith('/') ? link : '/' + link}`
                    });
                }
            }
        });

        console.log(`[GazetteScraper] Found ${entries.length} important entries.`);

        for (const entry of entries) {
            // DB'de var mı kontrol et
            const existing = await pool.query('SELECT id FROM gazette_entries WHERE url = $1', [entry.url]);
            if (existing.rows.length > 0) {
                continue; // Zaten eklenmiş
            }

            console.log(`[GazetteScraper] Processing new entry: ${entry.title}`);
            
            // Linkin içine girip içeriği çekelim (Basitçe)
            let rawContent = '';
            try {
                const detailResp = await axios.get(entry.url);
                const $detail = cheerio.load(detailResp.data);
                rawContent = $detail('body').text().trim().substring(0, 10000); // çok uzun olmasın diye kesiyoruz
            } catch (err) {
                console.error(`[GazetteScraper] Error fetching detail for ${entry.url}`, err.message);
                rawContent = entry.title; 
            }

            // AI ile özetle
            const summaryPrompt = `Aşağıda Resmi Gazete'de yayımlanan bir kararın/kanunun ham metni verilmiştir. 
Bunu bir avukatın veya hukukçunun okuyup hızlıca anlayabileceği şekilde, en önemli noktalarını vurgulayarak 2-3 paragraf şeklinde özetle. Başlığını ve konusunu belirt.

Metin:
${rawContent.substring(0, 5000)}...`;

            let summary = 'Özet çıkartılamadı.';
            try {
                // llmService'deki chat fonksiyonunu kullanıyoruz (Ollama/Bedrock vs)
                summary = await chat([], summaryPrompt);
            } catch (err) {
                console.error('[GazetteScraper] AI summarization failed:', err.message);
                summary = 'Özet yapay zeka tarafından oluşturulurken hata oluştu.';
            }

            // Veritabanına kaydet
            const category = entry.title.toLowerCase().includes('kanun') ? 'Kanun' : 
                             entry.title.toLowerCase().includes('yönetmelik') ? 'Yönetmelik' : 
                             entry.title.toLowerCase().includes('anayasa mahkemesi') ? 'AYM Kararı' : 'Diğer';

            await pool.query(
                `INSERT INTO gazette_entries (publish_date, title, summary, raw_content, category, url) 
                 VALUES (CURRENT_DATE, $1, $2, $3, $4, $5)`,
                [entry.title, summary, rawContent, category, entry.url]
            );

            console.log(`[GazetteScraper] Saved: ${entry.title}`);
            
            // API rate limitlerine takılmamak için bekle
            await new Promise(r => setTimeout(r, 2000));
        }

        console.log('[GazetteScraper] Done.');

    } catch (error) {
        console.error('[GazetteScraper] Error scraping gazette:', error);
    }
}

module.exports = {
    scrapeTodayGazette
};
