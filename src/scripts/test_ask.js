const fetch = require('node-fetch') || global.fetch;

async function testAsk() {
  console.log("Sending request to /api/search/ask...");
  try {
    // Attempting a direct local API call. This might fail if JWT is required, 
    // but the route has `optionalAuthenticate`, so it might allow guest access.
    const res = await fetch('http://localhost:3001/api/search/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'Kıdem Tazminatı' })
    });
    const text = await res.text();
    console.log("Response:", res.status, text);
  } catch (err) {
    console.error("Test error:", err);
  }
}

testAsk();
