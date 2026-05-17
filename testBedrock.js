// ============================================================
// Emsal Atlası - AWS Bedrock Test Dosyası
// İş kazası manevi tazminat sorusu ile Claude 3.5 Haiku testi
// ============================================================

const { invokeBedrockClaude } = require('./src/services/bedrockService');

// ── Renk kodları (konsol çıktısı için) ───────────────────────
const COLORS = {
  GREEN:  '\x1b[32m',
  CYAN:   '\x1b[36m',
  YELLOW: '\x1b[33m',
  RED:    '\x1b[31m',
  RESET:  '\x1b[0m',
  BOLD:   '\x1b[1m',
};

async function testBedrock() {
  console.log(`\n${COLORS.CYAN}${'═'.repeat(60)}${COLORS.RESET}`);
  console.log(`${COLORS.BOLD}${COLORS.CYAN}  ⚖️  Emsal Atlası — AWS Bedrock Test${COLORS.RESET}`);
  console.log(`${COLORS.CYAN}${'═'.repeat(60)}${COLORS.RESET}\n`);

  const testQuestion = `Bir işçi, çalıştığı inşaat şantiyesinde iş güvenliği önlemlerinin 
alınmaması nedeniyle iskele çökmesi sonucu ağır yaralanmıştır. 
İşçi, işverene karşı manevi tazminat davası açmak istemektedir.

Bu konuda şu soruları yanıtlar mısın:
1. Manevi tazminat talebi için hangi hukuki dayanaklara başvurulmalıdır?
2. Yargıtay'ın iş kazasından kaynaklanan manevi tazminat konusundaki güncel yaklaşımı nedir?
3. Manevi tazminat miktarının belirlenmesinde hangi kriterler dikkate alınır?`;

  console.log(`${COLORS.YELLOW}📝 Soru:${COLORS.RESET}`);
  console.log(`${testQuestion}\n`);
  console.log(`${COLORS.YELLOW}⏳ AWS Bedrock'a istek gönderiliyor...${COLORS.RESET}\n`);

  const startTime = Date.now();

  try {
    const response = await invokeBedrockClaude(testQuestion);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`${COLORS.GREEN}✅ Yanıt başarıyla alındı! (${elapsed} saniye)${COLORS.RESET}\n`);
    console.log(`${COLORS.CYAN}${'─'.repeat(60)}${COLORS.RESET}`);
    console.log(response);
    console.log(`${COLORS.CYAN}${'─'.repeat(60)}${COLORS.RESET}\n`);
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`\n${COLORS.RED}❌ Hata oluştu (${elapsed} saniye):${COLORS.RESET}`);
    console.error(`${COLORS.RED}   ${error.message}${COLORS.RESET}\n`);

    // Yaygın sorunlar için yardım
    console.log(`${COLORS.YELLOW}💡 Kontrol Listesi:${COLORS.RESET}`);
    console.log(`   1. .env dosyasında AWS_ACCESS_KEY_ID ve AWS_SECRET_ACCESS_KEY doğru mu?`);
    console.log(`   2. IAM kullanıcınızda "bedrock:InvokeModel" izni var mı?`);
    console.log(`   3. AWS Bedrock konsolunda Claude 3.5 Haiku modeline erişim aktif mi?`);
    console.log(`   4. Bölge (region) us-east-1 olarak ayarlı mı?\n`);
  }
}

testBedrock();
