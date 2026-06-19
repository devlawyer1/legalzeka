require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { pool } = require('../config/db');

async function run() {
  try {
    console.log("Adding hukuk_dali column if it doesn't exist...");
    await pool.query(`
      ALTER TABLE emsal_kararlar 
      ADD COLUMN IF NOT EXISTS hukuk_dali VARCHAR(255) DEFAULT 'Genel Hukuk';
    `);

    console.log("Backfilling hukuk_dali values...");
    await pool.query(`
      UPDATE emsal_kararlar
      SET hukuk_dali = CASE
        WHEN mahkeme ILIKE '%Danıştay%' OR mahkeme ILIKE '%Danistay%' OR konu ILIKE '%idare%' OR konu ILIKE '%disiplin%' THEN 'İdare Hukuku'
        WHEN konu ILIKE '%kira%' OR konu ILIKE '%tahliye%' OR konu ILIKE '%sözleşme%' OR konu ILIKE '%sozlesme%' THEN 'Borçlar Hukuku'
        WHEN konu ILIKE '%iş%' OR konu ILIKE '%is %' OR konu ILIKE '%mesai%' OR konu ILIKE '%fesih%' OR konu ILIKE '%mobbing%' THEN 'İş Hukuku'
        WHEN konu ILIKE '%kasten%' OR konu ILIKE '%ceza%' OR konu ILIKE '%dolandırıcılık%' OR konu ILIKE '%dolandiricilik%' OR konu ILIKE '%öldür%' OR konu ILIKE '%oldur%' THEN 'Ceza Hukuku'
        WHEN konu ILIKE '%boşanma%' OR konu ILIKE '%bosanma%' OR konu ILIKE '%velayet%' OR konu ILIKE '%miras%' OR konu ILIKE '%vasiyet%' THEN 'Medeni Hukuk'
        WHEN konu ILIKE '%marka%' OR konu ILIKE '%haksız rekabet%' OR konu ILIKE '%haksiz rekabet%' OR konu ILIKE '%ticari%' THEN 'Ticaret Hukuku'
        ELSE COALESCE(NULLIF(hukuk_dali, ''), 'Genel Hukuk')
      END
      WHERE hukuk_dali IS NULL OR hukuk_dali = '' OR hukuk_dali = 'Genel Hukuk';
    `);

    console.log("hukuk_dali migration completed.");
  } catch (error) {
    console.error("Error adding column:", error.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

run();
