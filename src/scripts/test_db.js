require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { pool } = require('../config/db');

async function check() {
  const res = await pool.query("SELECT id, karar_no, hukuk_dali, konu FROM emsal_kararlar");
  console.log("DB Rows:", res.rows);
  process.exit(0);
}

check();
