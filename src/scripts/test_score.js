require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { pool } = require('../config/db');
const { generateEmbedding } = require('../utils/embedding');

async function checkScores() {
  const query = "Kıdem Tazminatı";
  const queryVector = await generateEmbedding(query);
  const vectorString = `[${queryVector.join(',')}]`;

  const { rows } = await pool.query(`
    SELECT karar_no, konu,
           1 - (embedding <=> $1) as score
    FROM emsal_kararlar
    ORDER BY score DESC
    LIMIT 10
  `, [vectorString]);
  
  console.log("Scores for 'Kıdem Tazminatı':");
  rows.forEach(r => console.log(r.karar_no, r.konu, r.score));
  process.exit(0);
}

checkScores();
