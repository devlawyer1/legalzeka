const fs = require('fs');
const path = require('path');

const mockDataPath = path.join(__dirname, 'src', 'utils', 'mockData.json');
const baseData = JSON.parse(fs.readFileSync(mockDataPath, 'utf8'));

let expandedData = [...baseData];

// Mevcut 20 kararı kullanarak varyasyonlarla 500'den fazla karar oluşturalım
for (let i = 0; i < 25; i++) {
  for (const item of baseData) {
    const yil = 2015 + Math.floor(Math.random() * 9); // 2015-2023 arası
    const no = Math.floor(Math.random() * 10000) + 1;
    
    expandedData.push({
      karar_no: `${yil}/${no}`,
      mahkeme: item.mahkeme,
      karar_yili: yil,
      konu: item.konu,
      ozet: item.ozet + ` Ayrıca bu karar, benzer hukuki uyuşmazlıklarda emsal teşkil edebilecek niteliktedir (İçtihat varyasyonu ${i+1}).`,
      anahtar_kelimeler: item.anahtar_kelimeler
    });
  }
}

fs.writeFileSync(mockDataPath, JSON.stringify(expandedData, null, 2));
console.log(`${expandedData.length} adet emsal karar mockData.json dosyasına kaydedildi.`);
