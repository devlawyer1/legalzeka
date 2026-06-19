"use client";

import { useState } from "react";

/* ============================================================
   Emsal Atlası - Mali ve SMM Hesaplayıcı
   ============================================================ */

export default function FinancialCalculator() {
  const [activeTab, setActiveTab] = useState("smm"); // smm, noter, arabuluculuk
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Serbest Meslek Makbuzu (SMM) Formu
  const [smmForm, setSmmForm] = useState({
    hesapTuru: "netten_brute", // netten_brute, brutten_nete, tahsilattan_brute
    tutar: "10000",
    kdvOrani: "20",
    stopajOrani: "20",
    tevkifatOrani: "0" // KDV tevkifatı (0, 2/10, 5/10 vb. temsil edebilir. Şimdilik yüzde veya kesir gibi düşüneceğiz, 0 veya % üzerinden)
  });

  // Noter Hesaplama Formu (Tahmini)
  const [noterForm, setNoterForm] = useState({
    islemTuru: "ihtarname", // ihtarname, vekaletname
    sayfaSayisi: "1",
    kelimeSayisi: "150"
  });

  // Arabuluculuk Ücreti Formu
  const [arabForm, setArabForm] = useState({
    uyusmazlikTuru: "aile", // aile, ticari, is, tuketici
    tarafSayisi: "2",
    anlasilanMiktar: "" // Eğer anlaşıldıysa nispi ücret
  });

  const [result, setResult] = useState(null);

  // SMM Hesaplama (Stopaj: %20, KDV: %20 genel)
  const calculateSmm = (e) => {
    e.preventDefault();
    const tutar = parseFloat(smmForm.tutar) || 0;
    
    if (tutar <= 0) {
      showToast("Lütfen hesaplanacak geçerli bir tutar giriniz.");
      return;
    }

    const kdvRate = parseFloat(smmForm.kdvOrani) / 100;
    const stopajRate = parseFloat(smmForm.stopajOrani) / 100;
    const tevkifatRate = parseFloat(smmForm.tevkifatOrani) / 10; // Örn: 5/10 -> 0.5 KDV Tevkifatı

    let brutUcret = 0;
    
    // Tahsilat = Net Ücret + KDV - KDV Tevkifatı
    // Net Ücret = Brüt Ücret - Stopaj

    if (smmForm.hesapTuru === "brutten_nete") {
      brutUcret = tutar;
    } else if (smmForm.hesapTuru === "netten_brute") {
      // Tutar = Brüt - Stopaj => Brüt = Tutar / (1 - Stopaj)
      brutUcret = tutar / (1 - stopajRate);
    } else if (smmForm.hesapTuru === "tahsilattan_brute") {
      // Tahsilat = Brüt - Stopaj + (KDV - KDV*Tevkifat)
      // Tahsilat = Brüt * (1 - Stopaj + KDV * (1 - Tevkifat))
      const divisor = 1 - stopajRate + (kdvRate * (1 - tevkifatRate));
      brutUcret = tutar / divisor;
    }

    const stopajTutari = brutUcret * stopajRate;
    const netUcret = brutUcret - stopajTutari;
    const kdvTutari = brutUcret * kdvRate;
    const tevkifatTutari = kdvTutari * tevkifatRate;
    const tahsilEdilenKdv = kdvTutari - tevkifatTutari;
    const tahsilatTutari = netUcret + tahsilEdilenKdv;

    setResult({
      type: "smm",
      brutUcret,
      stopajTutari,
      netUcret,
      kdvTutari,
      tevkifatTutari,
      tahsilatTutari
    });
  };

  // Noter Harcı (Çok Tahmini)
  const calculateNoter = (e) => {
    e.preventDefault();
    const sayfa = parseInt(noterForm.sayfaSayisi) || 0;
    
    if (sayfa <= 0) {
      showToast("Sayfa sayısı en az 1 olmalıdır.");
      return;
    }

    const kelime = parseInt(noterForm.kelimeSayisi) || 150;
    
    // 2024 yılı yaklaşık noter tarifesine göre
    let maktuHarc = 0;
    let yaziUcreti = 0;
    let tasdikUcreti = 0;

    if (noterForm.islemTuru === "ihtarname") {
      maktuHarc = 250; // sayfa başı harç
      yaziUcreti = (kelime / 100) * 45; // 100 kelime başı
      tasdikUcreti = sayfa * 350;
    } else {
      // Vekaletname
      maktuHarc = 150;
      yaziUcreti = 0;
      tasdikUcreti = sayfa * 400; // Standart avukatlık vekaletnamesi ~800-1000 TL
    }

    const matrah = (maktuHarc * sayfa) + yaziUcreti + tasdikUcreti;
    const kdv = matrah * 0.20;
    const vergiResimHarc = 80;
    const total = matrah + kdv + vergiResimHarc;

    setResult({
      type: "noter",
      total,
      sayfa,
      islem: noterForm.islemTuru === "ihtarname" ? "İhtarname" : "Vekaletname",
      desc: "Noter ücretleri, ilgili yıla ait Harçlar Kanunu ve Noterlik Ücret Tarifesi'ne göre değişiklik gösterir. Bu hesaplama yalnızca fikir vermek amaçlıdır."
    });
  };

  // Arabuluculuk Ücreti (2024 Tarifesi Yaklaşık)
  const calculateArab = (e) => {
    e.preventDefault();
    const miktar = parseFloat(arabForm.anlasilanMiktar);
    const taraf = parseInt(arabForm.tarafSayisi) || 2;
    const islem = arabForm.uyusmazlikTuru;

    let saatlikUcret = 0;
    let maktuUcret = 0;
    let nispiUcret = 0;

    // Saatlik ücretler (2 kişi için)
    if (islem === "aile") saatlikUcret = 800;
    else if (islem === "ticari") saatlikUcret = 1500;
    else if (islem === "is") saatlikUcret = 900;
    else if (islem === "tuketici") saatlikUcret = 800;

    // Taraf sayısı 2'den fazlaysa artış
    if (taraf > 2) {
      saatlikUcret += (taraf - 2) * (saatlikUcret * 0.2); // Her bir taraf için %20 artış (tahmini kurgu)
    }

    // İlk 2 saatlik maktu ücret asgarisi
    maktuUcret = saatlikUcret * 2;

    if (miktar && miktar > 0) {
      // Nispi Ücret (Kademeli %6'dan başlar 1. Taraf için %3, 2. Taraf için %3)
      let kalan = miktar;
      let oran = 0.06; // İlk dilim %6
      let hesaplanan = 0;

      // 1. Dilim (ilk 200.000 TL %6)
      let dilim = Math.min(kalan, 200000);
      hesaplanan += dilim * 0.06;
      kalan -= dilim;

      // 2. Dilim (sonraki 300.000 TL %5)
      if (kalan > 0) {
        dilim = Math.min(kalan, 300000);
        hesaplanan += dilim * 0.05;
        kalan -= dilim;
      }

      // 3. Dilim (sonraki 500.000 TL %4) vb...
      if (kalan > 0) {
        hesaplanan += kalan * 0.04;
      }

      nispiUcret = hesaplanan;

      // Maktu ücretin altına düşemez
      if (nispiUcret < maktuUcret) {
        nispiUcret = maktuUcret;
      }
    }

    const sonUcret = miktar > 0 ? nispiUcret : maktuUcret;
    const kisiBasi = sonUcret / taraf;

    setResult({
      type: "arab",
      sonUcret,
      kisiBasi,
      islem: islem.toUpperCase(),
      miktar,
      desc: "Arabuluculuk Asgari Ücret Tarifesi (AÜT) doğrultusunda hesaplanmıştır. Konusu para ile değerlendirilemeyen işlerde maktu saatlik ücret, değerlendirilebilenlerde nispi ücret uygulanır."
    });
  };

  const formatCurrency = (val) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(val || 0);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Mali ve SMM Hesaplayıcı</h3>
        <p style={styles.desc}>Avukatlık Serbest Meslek Makbuzu (SMM), Noter Harçları ve Arabuluculuk Asgari Ücret hesaplamaları.</p>
      </div>

      <div style={styles.tabContainer}>
        <button style={activeTab === "smm" ? styles.activeTab : styles.tab} onClick={() => {setActiveTab("smm"); setResult(null);}}>Serbest Meslek Makbuzu</button>
        <button style={activeTab === "noter" ? styles.activeTab : styles.tab} onClick={() => {setActiveTab("noter"); setResult(null);}}>Noter Masrafları</button>
        <button style={activeTab === "arabuluculuk" ? styles.activeTab : styles.tab} onClick={() => {setActiveTab("arabuluculuk"); setResult(null);}}>Arabuluculuk Ücreti</button>
      </div>

      <div style={styles.grid}>
        {/* Form Alanı */}
        <div style={styles.card}>
          {activeTab === "smm" && (
            <form onSubmit={calculateSmm} style={styles.form}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Hesaplama Yönü</label>
                <select style={styles.select} value={smmForm.hesapTuru} onChange={(e) => setSmmForm({...smmForm, hesapTuru: e.target.value})}>
                  <option value="netten_brute">Net Ücretten Brüte</option>
                  <option value="brutten_nete">Brüt Ücretten Nete</option>
                  <option value="tahsilattan_brute">Tahsil Edilen (Cebe Giren) Tutardan Brüte</option>
                </select>
              </div>
              <div style={styles.inputGroup}><label style={styles.label}>Tutar (TL)</label><input type="number" style={styles.input} value={smmForm.tutar} onChange={(e) => setSmmForm({...smmForm, tutar: e.target.value})} required /></div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>KDV Oranı (%)</label>
                <select style={styles.select} value={smmForm.kdvOrani} onChange={(e) => setSmmForm({...smmForm, kdvOrani: e.target.value})}>
                  <option value="20">%20</option>
                  <option value="10">%10 (Aile, Tüketici vb.)</option>
                </select>
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Stopaj Oranı (%)</label>
                <select style={styles.select} value={smmForm.stopajOrani} onChange={(e) => setSmmForm({...smmForm, stopajOrani: e.target.value})}>
                  <option value="20">%20</option>
                  <option value="0">%0</option>
                </select>
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>KDV Tevkifatı (Örn. Kamu kurumlarına)</label>
                <select style={styles.select} value={smmForm.tevkifatOrani} onChange={(e) => setSmmForm({...smmForm, tevkifatOrani: e.target.value})}>
                  <option value="0">Tevkifat Yok</option>
                  <option value="5">5/10</option>
                  <option value="2">2/10</option>
                </select>
              </div>
              <button type="submit" style={styles.calcBtn}>SMM Hesapla</button>
            </form>
          )}

          {activeTab === "noter" && (
            <form onSubmit={calculateNoter} style={styles.form}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>İşlem Türü</label>
                <select style={styles.select} value={noterForm.islemTuru} onChange={(e) => setNoterForm({...noterForm, islemTuru: e.target.value})}>
                  <option value="ihtarname">İhtarname / İhbarname</option>
                  <option value="vekaletname">Vekaletname Düzenleme</option>
                </select>
              </div>
              <div style={styles.inputGroup}><label style={styles.label}>Sayfa Sayısı</label><input type="number" min="1" style={styles.input} value={noterForm.sayfaSayisi} onChange={(e) => setNoterForm({...noterForm, sayfaSayisi: e.target.value})} required /></div>
              {noterForm.islemTuru === "ihtarname" && (
                <div style={styles.inputGroup}><label style={styles.label}>Ortalama Kelime Sayısı</label><input type="number" min="50" style={styles.input} value={noterForm.kelimeSayisi} onChange={(e) => setNoterForm({...noterForm, kelimeSayisi: e.target.value})} required /></div>
              )}
              <button type="submit" style={styles.calcBtn}>Yaklaşık Noter Harcını Hesapla</button>
            </form>
          )}

          {activeTab === "arabuluculuk" && (
            <form onSubmit={calculateArab} style={styles.form}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Uyuşmazlık Türü</label>
                <select style={styles.select} value={arabForm.uyusmazlikTuru} onChange={(e) => setArabForm({...arabForm, uyusmazlikTuru: e.target.value})}>
                  <option value="is">İş Hukuku (İşçi-İşveren)</option>
                  <option value="ticari">Ticari Uyuşmazlık</option>
                  <option value="tuketici">Tüketici Uyuşmazlığı</option>
                  <option value="aile">Aile Hukuku</option>
                </select>
              </div>
              <div style={styles.inputGroup}><label style={styles.label}>Taraf Sayısı</label><input type="number" min="2" style={styles.input} value={arabForm.tarafSayisi} onChange={(e) => setArabForm({...arabForm, tarafSayisi: e.target.value})} required /></div>
              <div style={styles.inputGroup}><label style={styles.label}>Anlaşılan Bedel (TL) - (Anlaşma olmadıysa boş bırakın)</label><input type="number" style={styles.input} value={arabForm.anlasilanMiktar} onChange={(e) => setArabForm({...arabForm, anlasilanMiktar: e.target.value})} /></div>
              <button type="submit" style={styles.calcBtn}>Arabuluculuk Ücreti Hesapla</button>
            </form>
          )}
        </div>

        {/* Sonuç Alanı */}
        <div style={styles.card}>
          <div style={styles.sectionTitle}>Hesaplama Sonucu</div>
          
          {result ? (
            <div style={styles.resultContainer} className="animate-fade-in">
              
              {result.type === "smm" && (
                <>
                  <div style={styles.resultMain}>
                    <span style={styles.resultMainLabel}>Müşteriden Tahsil Edilecek Toplam Tutar</span>
                    <span style={styles.resultMainValue}>{formatCurrency(result.tahsilatTutari)}</span>
                  </div>

                  <div style={styles.resultList}>
                    <div style={styles.resultItem}><span style={styles.resultItemLabel}>Brüt Ücret</span><span style={styles.resultItemValue}>{formatCurrency(result.brutUcret)}</span></div>
                    <div style={styles.resultItem}><span style={styles.resultItemLabel}>Stopaj Kesintisi (-)</span><span style={{...styles.resultItemValue, color: "var(--color-error)"}}>{formatCurrency(result.stopajTutari)}</span></div>
                    <div style={styles.resultItem}><span style={styles.resultItemLabel}>Net Ücret (Avukata Kalan)</span><span style={{...styles.resultItemValue, color: "var(--color-success)"}}>{formatCurrency(result.netUcret)}</span></div>
                    <div style={styles.resultItem}><span style={styles.resultItemLabel}>Hesaplanan KDV (+)</span><span style={styles.resultItemValue}>{formatCurrency(result.kdvTutari)}</span></div>
                    {result.tevkifatTutari > 0 && (
                      <div style={styles.resultItem}><span style={styles.resultItemLabel}>KDV Tevkifatı (Müşteri Öder) (-)</span><span style={{...styles.resultItemValue, color: "var(--color-error)"}}>{formatCurrency(result.tevkifatTutari)}</span></div>
                    )}
                  </div>
                </>
              )}

              {result.type === "noter" && (
                <>
                  <div style={styles.resultMain}>
                    <span style={styles.resultMainLabel}>Tahmini Noter Masrafı ({result.islem})</span>
                    <span style={styles.resultMainValue}>{formatCurrency(result.total)}</span>
                  </div>
                  <div style={styles.infoBox}>
                    <p>{result.desc}</p>
                  </div>
                </>
              )}

              {result.type === "arab" && (
                <>
                  <div style={styles.resultMain}>
                    <span style={styles.resultMainLabel}>Toplam Arabuluculuk Ücreti</span>
                    <span style={styles.resultMainValue}>{formatCurrency(result.sonUcret)}</span>
                  </div>
                  <div style={styles.resultList}>
                    <div style={styles.resultItem}><span style={styles.resultItemLabel}>Taraf Başına Düşen Tutar (Eşit Ödenirse)</span><span style={styles.resultItemValue}>{formatCurrency(result.kisiBasi)}</span></div>
                    {result.miktar > 0 && (
                      <div style={styles.resultItem}><span style={styles.resultItemLabel}>Anlaşılan Bedel Üzerinden Nispi Hesap</span><span style={styles.resultItemValue}>{formatCurrency(result.sonUcret)}</span></div>
                    )}
                  </div>
                  <div style={styles.infoBox}>
                    <p>{result.desc}</p>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div style={styles.emptyResult}>
              <p>Sonucu görmek için soldaki formu doldurup hesapla butonuna tıklayın.</p>
            </div>
          )}
        </div>
      </div>

      {/* Toast Bildirimi */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, padding: "12px 20px",
          background: toast.type === "error" ? "var(--color-error)" : "var(--color-success)",
          color: "#fff", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          zIndex: 9999, animation: "slideIn 0.3s ease-out"
        }}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { maxWidth: 960, width: "100%", margin: "0 auto" },
  header: { marginBottom: 20 },
  title: { fontSize: 20, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 8 },
  desc: { fontSize: 14, color: "var(--color-text-tertiary)" },
  tabContainer: { display: "flex", gap: 8, marginBottom: 24, borderBottom: "1px solid var(--color-border-subtle)" },
  tab: { padding: "10px 16px", background: "none", border: "none", borderBottom: "2px solid transparent", cursor: "pointer", fontSize: 14, fontWeight: 500, color: "var(--color-text-secondary)" },
  activeTab: { padding: "10px 16px", background: "none", border: "none", borderBottom: "2px solid var(--color-text-primary)", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" },
  card: { background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)", borderRadius: "var(--radius-lg)", padding: "24px", boxShadow: "var(--shadow-xs)" },
  sectionTitle: { fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 16, borderBottom: "1px solid var(--color-border-subtle)", paddingBottom: 8 },
  form: { display: "flex", flexDirection: "column", gap: 20 },
  inputGroup: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 13, fontWeight: 500, color: "var(--color-text-secondary)" },
  input: { padding: "10px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: 14, color: "var(--color-text-primary)", outline: "none" },
  select: { padding: "10px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: 14, color: "var(--color-text-primary)", outline: "none" },
  calcBtn: { marginTop: 8, padding: "12px", background: "var(--color-text-primary)", color: "var(--color-bg)", border: "none", borderRadius: "var(--radius-md)", fontSize: 15, fontWeight: 600, cursor: "pointer" },
  resultContainer: { display: "flex", flexDirection: "column", gap: 20 },
  resultMain: { background: "linear-gradient(135deg, #18181B, #27272A)", color: "#fff", padding: "20px", borderRadius: "var(--radius-md)", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" },
  resultMainLabel: { fontSize: 14, fontWeight: 500, opacity: 0.9 },
  resultMainValue: { fontSize: 24, fontWeight: 700 },
  resultList: { display: "flex", flexDirection: "column", gap: 12 },
  resultItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px dashed var(--color-border-subtle)" },
  resultItemLabel: { fontSize: 13, color: "var(--color-text-secondary)" },
  resultItemValue: { fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" },
  infoBox: { display: "flex", gap: 12, padding: 12, borderRadius: "var(--radius-sm)", fontSize: 13, lineHeight: 1.5, marginTop: 8, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border-subtle)", color: "var(--color-text-secondary)" },
  emptyResult: { display: "flex", justifyContent: "center", padding: "48px 20px", color: "var(--color-text-tertiary)", textAlign: "center", fontSize: 14 }
};
