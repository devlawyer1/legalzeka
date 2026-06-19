const REVIEW_MARKERS = [
  {
    code: '[DOĞRULA]',
    label: 'Kaynak doğrulama',
    description: 'Kaynağı bulunmayan veya pinpoint kontrol isteyen hukuki/faktüel iddia.',
  },
  {
    code: '[VAKA GEREKİYOR]',
    label: 'Eksik vakıa',
    description: 'Sonuç için dosyadan, müvekkilden veya resmi kayıttan tamamlanması gereken bilgi.',
  },
  {
    code: '[UZMAN İNCELEMESİ]',
    label: 'Mesleki kanaat',
    description: 'Avukat, hakim, savcı veya akademisyen tarafından nihai kontrol isteyen değerlendirme.',
  },
];

const WORKFLOWS = [
  {
    id: 'case_strategy',
    title: 'Dava Strateji Ajanı',
    shortTitle: 'Dava Stratejisi',
    role: 'avukat',
    category: 'litigation',
    purpose: 'Dava dosyasını uyuşmazlık, ispat, usul, risk ve strateji ekseninde analiz eder.',
    inputHint: 'Dava özeti, taraflar, iddia-savunma, deliller, aşama ve hedef sonucu yazın.',
    sourcePlan: ['emsal', 'mevzuat', 'case_context', 'firm_templates'],
    outputSections: [
      'Dosya özeti',
      'Uyuşmazlık ve ispat matrisi',
      'Güçlü/zayıf noktalar',
      'Eksik vakıa ve delil listesi',
      'Usul ve süre riskleri',
      'Strateji önerisi ve sonraki adımlar',
    ],
    caution:
      'Sonuç veya kazanma garantisi üretmez; strateji avukat incelemesiyle kesinleşir.',
  },
  {
    id: 'petition_review',
    title: 'Dilekçe İnceleyici',
    shortTitle: 'Dilekçe İnceleme',
    role: 'avukat',
    category: 'drafting',
    purpose: 'Dilekçe, cevap dilekçesi, beyan veya iddianame taslağını yapı, delil, mevzuat ve emsal bakımından denetler.',
    inputHint: 'Dilekçe metnini yapıştırın veya dosya yükleyin. Özellikle hangi taraf için inceleme istediğinizi belirtin.',
    sourcePlan: ['emsal', 'mevzuat', 'firm_templates'],
    outputSections: [
      'Hızlı kalite notu',
      'Eksik/çelişkili vakıalar',
      'Hukuki dayanak kontrolü',
      'Emsal ve mevzuat uyumu',
      'Revizyon önerileri',
      'Mahkemeye sunmadan önce kontrol listesi',
    ],
    caution:
      'Metni doğrudan kesin dilekçe saymaz; her revizyon avukat tarafından dosyaya göre uyarlanmalıdır.',
  },
  {
    id: 'contract_review',
    title: 'Sözleşme İnceleyici',
    shortTitle: 'Sözleşme Riskleri',
    role: 'avukat',
    category: 'commercial',
    purpose: 'Sözleşme hükümlerini Türk borçlar, ticaret, tüketici, iş ve KVKK perspektifiyle risklere ayırır.',
    inputHint: 'Sözleşme metni, taraf pozisyonu, sektör ve kabul edilemez riskleri yazın.',
    sourcePlan: ['mevzuat', 'firm_templates'],
    outputSections: [
      'Risk haritası',
      'Tek taraflı/asimetrik hükümler',
      'Eksik maddeler',
      'Revizyon dili önerileri',
      'Müzakere öncelikleri',
      'İmza öncesi onay kapıları',
    ],
    caution:
      'İmza, fesih veya bağlayıcı işlem önerileri açık insan onayı olmadan nihai işlem sayılmaz.',
  },
  {
    id: 'student_coach',
    title: 'Hukuk Öğrencisi Çalışma Koçu',
    shortTitle: 'Öğrenci Koçu',
    role: 'ogrenci',
    category: 'education',
    purpose: 'Sokratik soru, IRAC geri bildirimi, olay çözümü ve sınav çalışması üretir; cevabı öğrencinin yerine yazmaz.',
    inputHint: 'Ders, konu, olay metni, deneme cevabı veya çalışmak istediğiniz sınav tipini yazın.',
    sourcePlan: ['mevzuat', 'emsal'],
    outputSections: [
      'Öğrenme hedefi',
      'Sokratik sorular',
      'IRAC/olay çözüm çerçevesi',
      'Yanlış anlaşılabilecek noktalar',
      'Çalışma planı',
      'Kendi cevabını kontrol listesi',
    ],
    caution:
      'Graded ödev veya sınav yerine geçecek nihai cevap üretmez; öğrenme iskelesi kurar.',
  },
  {
    id: 'academic_research',
    title: 'Akademik Araştırma Asistanı',
    shortTitle: 'Akademik Araştırma',
    role: 'akademisyen',
    category: 'research',
    purpose: 'Tez, makale ve derin araştırma için araştırma haritası, argüman matrisi ve kaynak doğrulama planı çıkarır.',
    inputHint: 'Araştırma başlığı, hipotez, anahtar kavramlar, yöntem ve beklenen kapsamı yazın.',
    sourcePlan: ['mevzuat', 'emsal', 'regulatory_sources'],
    outputSections: [
      'Araştırma sorusu ve sınırlar',
      'Kavram/kurum haritası',
      'Mevzuat ve içtihat rotası',
      'Argüman ve karşı argüman matrisi',
      'Literatür boşluğu önerileri',
      'Dipnot ve doğrulama planı',
    ],
    caution:
      'Akademik metni kullanıcı adına ghostwrite etmez; araştırmayı yapılandırır ve doğrulama planı üretir.',
  },
  {
    id: 'bench_support',
    title: 'Hakim/Savcı Karar Destek',
    shortTitle: 'Karar Destek',
    role: 'hakim_savci',
    category: 'bench',
    purpose: 'Dosya özetini, iddia-savunma-delil matrisini, uyuşmazlık noktalarını ve gerekçe kontrol listesini tarafsız şekilde hazırlar.',
    inputHint: 'Dosya özeti, suç/uyuşmazlık tipi, taraf iddiaları, deliller ve karar aşamasını yazın.',
    sourcePlan: ['emsal', 'mevzuat'],
    outputSections: [
      'Tarafsız dosya özeti',
      'İddia-savunma-delil matrisi',
      'Uyuşmazlık noktaları',
      'Mevzuat ve emsal kontrol listesi',
      'Gerekçe taslağı kontrolü',
      'Eksik inceleme ve usul riskleri',
    ],
    caution:
      'Hüküm, iddianame veya nihai kanaat üretmez; karar vericinin tarafsız incelemesini destekler.',
  },
];

function getWorkflowById(id) {
  return WORKFLOWS.find((workflow) => workflow.id === id);
}

module.exports = {
  REVIEW_MARKERS,
  WORKFLOWS,
  getWorkflowById,
};
