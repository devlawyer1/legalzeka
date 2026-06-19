"use client";

import { useState } from "react";

/* ============================================================
   Emsal Atlası - Aile Hukuku Hesaplama (Nafaka & Mal Rejimi)
   ============================================================ */

export default function FamilyLawCalculator() {
  const [activeTab, setActiveTab] = useState("nafaka"); // nafaka, mal_rejimi, deger_artis
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Nafaka Formu
  const [nafakaForm, setNafakaForm] = useState({
    nafakaType: "istirak", // istirak, yoksulluk
    payerIncome: "30000",
    receiverIncome: "0",
    childCount: "1",
    faultRate: "Esit" // Esit, AgirKusurlu, TamKusurlu
  });

  // Mal Rejimi (Katılma Alacağı) Formu
  const [malForm, setMalForm] = useState({
    edinilmisMallar: "2000000",
    kisiselMallar: "0",
    borclar: "500000",
    eklenecekDegerler: "0", // TMK 229 (karşılıksız kazandırmalar vb.)
    denklestirme: "0" // TMK 230
  });

  // Değer Artış Payı Formu (TMK 227)
  const [dapForm, setDapForm] = useState({
    initialValue: "500000", // Malın ilk değeri
    contribution: "100000", // Yapılan katkı miktarı
    currentValue: "2000000" // Malın tasfiye anındaki sürüm değeri
  });

  const [result, setResult] = useState(null);

  // Nafaka (Tahmini Oranlar)
  // Yargıtay uygulamalarında iştirak nafakası genelde ebeveynin net gelirinin %15-25'i arası bir çocuğa verilebilir.
  const calculateNafaka = (e) => {
    e.preventDefault();
    const payer = parseFloat(nafakaForm.payerIncome) || 0;
    const receiver = parseFloat(nafakaForm.receiverIncome) || 0;
    const children = parseInt(nafakaForm.childCount) || 0;

    let suggestedAmount = 0;
    let description = "";

    if (nafakaForm.nafakaType === "istirak") {
      // Çocuk başına %15-20 gibi bir oran
      let rate = 0.15;
      if (children === 1) rate = 0.20;
      else if (children === 2) rate = 0.35;
      else if (children >= 3) rate = 0.45;

      suggestedAmount = payer * rate;
      description = `İştirak nafakası çocuğun yaşına, eğitim durumuna ve ödeyicinin gelirine göre değişir. Yargıtay uygulamalarına göre ${children} çocuk için ödeyicinin gelirinin %${(rate * 100).toFixed(0)} civarı hakkaniyete uygun olabilir.`;
    } else {
      // Yoksulluk nafakası
      if (nafakaForm.faultRate === "AgirKusurlu" || nafakaForm.faultRate === "TamKusurlu") {
        description = "TMK m. 175 uyarınca, yoksulluk nafakası talep eden tarafın kusuru daha ağır olmamalıdır. Eğer talep eden taraf daha ağır kusurluysa nafaka bağlanmaz.";
        suggestedAmount = 0;
      } else {
        // Genelde ödeyicinin gelirinin %20-30'u
        suggestedAmount = payer * 0.25;
        if (receiver > 0 && receiver > payer) {
          suggestedAmount = 0;
          description = "Talep edenin geliri, ödeyiciden fazla olduğu için yoksulluk nafakası şartları (yoksulluğa düşme) oluşmayabilir.";
        } else {
          description = "Yoksulluk nafakası, talep edenin yoksulluğa düşecek olması ve ağır kusurlu olmaması şartıyla bağlanır. Tahmini tutar ödeyicinin gelirinin ~%25'i olarak hesaplanmıştır.";
        }
      }
    }

    setResult({
      type: "nafaka",
      amount: suggestedAmount,
      description
    });
  };

  // Katılma Alacağı (Artık Değerin Yarısı - TMK 231/236)
  // Artık Değer = (Edinilmiş Mallar + Eklenecek Değerler + Denkleştirme) - Borçlar
  // Katılma Alacağı = Artık Değer / 2
  const calculateMalRejimi = (e) => {
    e.preventDefault();
    const edinilmis = parseFloat(malForm.edinilmisMallar) || 0;
    const borc = parseFloat(malForm.borclar) || 0;
    const eklenecek = parseFloat(malForm.eklenecekDegerler) || 0;
    const denklestirme = parseFloat(malForm.denklestirme) || 0;

    let artikDeger = (edinilmis + eklenecek + denklestirme) - borc;
    if (artikDeger < 0) artikDeger = 0; // Eksi çıkarsa 0 kabul edilir.

    const katilmaAlacagi = artikDeger / 2;

    setResult({
      type: "mal_rejimi",
      artikDeger,
      katilmaAlacagi,
      description: "Katılma alacağı, eşlerin evlilik birliği içinde edindiği 'Artık Değer'in yarısıdır (TMK m. 236)."
    });
  };

  // Değer Artış Payı (TMK 227)
  // Katkı Oranı = Katkı Miktarı / Malın İlk Değeri
  // Değer Artış Payı Alacağı = Malın Güncel Değeri * Katkı Oranı
  const calculateDap = (e) => {
    e.preventDefault();
    const initial = parseFloat(dapForm.initialValue) || 0;
    const contribution = parseFloat(dapForm.contribution) || 0;
    const current = parseFloat(dapForm.currentValue) || 0;

    if (initial <= 0) {
      showToast("Malın ilk değeri 0'dan büyük olmalıdır.");
      return;
    }

    const ratio = contribution / initial;
    const dapAmount = current * ratio;

    setResult({
      type: "deger_artis",
      ratio: ratio * 100,
      dapAmount,
      description: `Eşlerden biri diğerine ait bir malın edinilmesine, iyileştirilmesine veya korunmasına hiç ya da uygun bir karşılık almaksızın katkıda bulunmuşsa, tasfiye sırasında bu malda ortaya çıkan değer artışı için katkısı oranında alacak hakkına sahip olur. (TMK m. 227)`
    });
  };

  const formatCurrency = (val) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(val || 0);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Aile Hukuku Hesaplayıcı</h3>
        <p style={styles.desc}>Nafaka, Mal Rejimi Tasfiyesi (Katılma Alacağı) ve Değer Artış Payı tahmini hesaplamaları.</p>
      </div>

      <div style={styles.tabContainer}>
        <button style={activeTab === "nafaka" ? styles.activeTab : styles.tab} onClick={() => {setActiveTab("nafaka"); setResult(null);}}>Nafaka Hesapla</button>
        <button style={activeTab === "mal_rejimi" ? styles.activeTab : styles.tab} onClick={() => {setActiveTab("mal_rejimi"); setResult(null);}}>Katılma Alacağı (Mal Rejimi)</button>
        <button style={activeTab === "deger_artis" ? styles.activeTab : styles.tab} onClick={() => {setActiveTab("deger_artis"); setResult(null);}}>Değer Artış Payı</button>
      </div>

      <div style={styles.grid}>
        {/* Form Alanı */}
        <div style={styles.card}>
          {activeTab === "nafaka" && (
            <form onSubmit={calculateNafaka} style={styles.form}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Nafaka Türü</label>
                <select style={styles.select} value={nafakaForm.nafakaType} onChange={(e) => setNafakaForm({...nafakaForm, nafakaType: e.target.value})}>
                  <option value="istirak">İştirak Nafakası (Çocuk için)</option>
                  <option value="yoksulluk">Yoksulluk Nafakası (Eş için)</option>
                </select>
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Nafaka Yükümlüsünün (Ödeyecek Olanın) Aylık Net Geliri</label>
                <input type="number" style={styles.input} value={nafakaForm.payerIncome} onChange={(e) => setNafakaForm({...nafakaForm, payerIncome: e.target.value})} required />
              </div>
              {nafakaForm.nafakaType === "istirak" && (
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Müşterek Çocuk Sayısı</label>
                  <input type="number" min="1" style={styles.input} value={nafakaForm.childCount} onChange={(e) => setNafakaForm({...nafakaForm, childCount: e.target.value})} required />
                </div>
              )}
              {nafakaForm.nafakaType === "yoksulluk" && (
                <>
                  <div style={styles.inputGroup}>
                    <label style={styles.label}>Nafaka Alacaklısının Aylık Net Geliri</label>
                    <input type="number" style={styles.input} value={nafakaForm.receiverIncome} onChange={(e) => setNafakaForm({...nafakaForm, receiverIncome: e.target.value})} required />
                  </div>
                  <div style={styles.inputGroup}>
                    <label style={styles.label}>Alacaklı Eşin Kusur Durumu</label>
                    <select style={styles.select} value={nafakaForm.faultRate} onChange={(e) => setNafakaForm({...nafakaForm, faultRate: e.target.value})}>
                      <option value="Kusursuz">Kusursuz veya Daha Az Kusurlu</option>
                      <option value="Esit">Eşit Kusurlu</option>
                      <option value="AgirKusurlu">Daha Ağır Kusurlu</option>
                      <option value="TamKusurlu">Tam Kusurlu</option>
                    </select>
                  </div>
                </>
              )}
              <button type="submit" style={styles.calcBtn}>Nafaka Hesapla</button>
            </form>
          )}

          {activeTab === "mal_rejimi" && (
            <form onSubmit={calculateMalRejimi} style={styles.form}>
              <div style={styles.inputGroup}><label style={styles.label}>Edinilmiş Malların Toplam Değeri (Aktif)</label><input type="number" style={styles.input} value={malForm.edinilmisMallar} onChange={(e) => setMalForm({...malForm, edinilmisMallar: e.target.value})} required /></div>
              <div style={styles.inputGroup}><label style={styles.label}>Borçlar (Pasif)</label><input type="number" style={styles.input} value={malForm.borclar} onChange={(e) => setMalForm({...malForm, borclar: e.target.value})} required /></div>
              <div style={styles.inputGroup}><label style={styles.label}>Eklenecek Değerler (TMK 229 - Karşılıksız kazandırmalar vb.)</label><input type="number" style={styles.input} value={malForm.eklenecekDegerler} onChange={(e) => setMalForm({...malForm, eklenecekDegerler: e.target.value})} required /></div>
              <div style={styles.inputGroup}><label style={styles.label}>Denkleştirme (TMK 230 - Kişisel mallara giden değerler vb.)</label><input type="number" style={styles.input} value={malForm.denklestirme} onChange={(e) => setMalForm({...malForm, denklestirme: e.target.value})} required /></div>
              <button type="submit" style={styles.calcBtn}>Katılma Alacağı Hesapla</button>
            </form>
          )}

          {activeTab === "deger_artis" && (
            <form onSubmit={calculateDap} style={styles.form}>
              <div style={styles.inputGroup}><label style={styles.label}>Katkı Yapılan Malın İlk Değeri (Katkı tarihindeki sürüm değeri)</label><input type="number" style={styles.input} value={dapForm.initialValue} onChange={(e) => setDapForm({...dapForm, initialValue: e.target.value})} required /></div>
              <div style={styles.inputGroup}><label style={styles.label}>Davacı Eşin Yaptığı Katkı Miktarı</label><input type="number" style={styles.input} value={dapForm.contribution} onChange={(e) => setDapForm({...dapForm, contribution: e.target.value})} required /></div>
              <div style={styles.inputGroup}><label style={styles.label}>Malın Tasfiye Anındaki (Güncel) Sürüm Değeri</label><input type="number" style={styles.input} value={dapForm.currentValue} onChange={(e) => setDapForm({...dapForm, currentValue: e.target.value})} required /></div>
              <button type="submit" style={styles.calcBtn}>Değer Artış Payı Hesapla</button>
            </form>
          )}
        </div>

        {/* Sonuç Alanı */}
        <div style={styles.card}>
          <div style={styles.sectionTitle}>Hesaplama Sonucu</div>
          
          {result ? (
            <div style={styles.resultContainer} className="animate-fade-in">
              <div style={styles.resultMain}>
                <span style={styles.resultMainLabel}>
                  {result.type === "nafaka" ? "Önerilen Aylık Nafaka Tutarı" : result.type === "mal_rejimi" ? "Katılma Alacağı" : "Değer Artış Payı Alacağı"}
                </span>
                <span style={styles.resultMainValue}>
                  {result.type === "nafaka" ? formatCurrency(result.amount) : result.type === "mal_rejimi" ? formatCurrency(result.katilmaAlacagi) : formatCurrency(result.dapAmount)}
                </span>
              </div>
              
              <div style={styles.resultList}>
                {result.type === "mal_rejimi" && (
                  <div style={styles.resultItem}><span style={styles.resultItemLabel}>Hesaplanan Artık Değer</span><span style={styles.resultItemValue}>{formatCurrency(result.artikDeger)}</span></div>
                )}
                {result.type === "deger_artis" && (
                  <div style={styles.resultItem}><span style={styles.resultItemLabel}>Katkı Oranı</span><span style={styles.resultItemValue}>%{result.ratio.toFixed(2)}</span></div>
                )}
              </div>

              {result.description && (
                <div style={styles.infoBox}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" style={{flexShrink: 0}}>
                    <circle cx="10" cy="10" r="9"/>
                    <path d="M10 14V10M10 6h.01"/>
                  </svg>
                  <p>{result.description}</p>
                </div>
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
