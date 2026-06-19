require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { fetchFromEmsalGovTr } = require('../services/emsalScraper');

async function test() {
  console.log("Starting test for fetchFromEmsalGovTr...");
  try {
    const results = await fetchFromEmsalGovTr("Kıdem Tazminatı");
    console.log("Test completed. Found:", results.length, "decisions.");
    console.log(JSON.stringify(results.slice(0, 1), null, 2));
  } catch (error) {
    console.error("Test error:", error);
  } finally {
    process.exit(0);
  }
}

test();
