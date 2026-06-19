"use client";

import { useState } from "react";

/* ============================================================
   Emsal Atlası - Miras Hukuku Hesaplayıcı
   ============================================================ */

export default function InheritanceCalculator() {
  const [activeTab, setActiveTab] = useState("paylar"); // paylar, tenkis
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Miras Payları Formu
  const [shareForm, setShareForm] = useState({
    tereke: "1000000",
    esHayatta: "evet", // evet, hayir
    zumre: "1", // 1: Altsoy, 2: Anne-Baba, 3: Büyükanne-Büyükbaba
    kisiSayisi: "2" // İlgili zümredeki kişi sayısı (örn 2 çocuk)
  });

  // Tenkis (Saklı Pay) Formu
  const [tenkisForm, setTenkisForm] = useState({
    tereke: "1000000", // Net tereke + eklenebilir kazandırmalar (Tenkise Tabi Tereke)
    esHayatta: "evet",
    zumre: "1", 
    kisiSayisi: "2",
    bagislamalar: "300000" // Muris sağlığında yaptığı tasarruflar
  });

  const [result, setResult] = useState(null);

  // Yasal Miras Payları Hesaplama
  const calculateShares = (e) => {
    e.preventDefault();
    const t = parseFloat(shareForm.tereke) || 0;
    
    if (t <= 0) {
      showToast("Lütfen geçerli bir tereke değeri giriniz.");
      return;
    }

    const es = shareForm.esHayatta === "evet";
    const z = parseInt(shareForm.zumre);
    const n = parseInt(shareForm.kisiSayisi) || 1;

    let esPayOrani = 0;
    let zumrePayOrani = 0;
    let desc = "";

    if (es) {
      if (z === 1) { esPayOrani = 1/4; zumrePayOrani = 3/4; desc = "Eşin payı 1/4, Altsoyun (Çocukların) payı 3/4'tür."; }
      else if (z === 2) { esPayOrani = 1/2; zumrePayOrani = 1/2; desc = "Eşin payı 1/2, Anne-Babanın (veya onların altsoyunun) payı 1/2'dir."; }
      else if (z === 3) { esPayOrani = 3/4; zumrePayOrani = 1/4; desc = "Eşin payı 3/4, Büyükana/Büyükbabanın payı 1/4'tür."; }
    } else {
      zumrePayOrani = 1;
      desc = "Eş hayatta olmadığından mirasın tamamı (1/1) ilgili zümreye kalır.";
    }

    const esTutar = t * esPayOrani;
    const zumreToplamTutar = t * zumrePayOrani;
    const kisiBasiTutar = zumreToplamTutar / n;

    setResult({
      type: "paylar",
      esPayOrani,
      zumrePayOrani,
      esTutar,
      zumreToplamTutar,
      kisiBasiTutar,
      n,
      desc
    });
  };

  // Tenkis (Saklı Pay) Hesaplama (TMK 505, 506)
  const calculateTenkis = (e) => {
    e.preventDefault();
    const t = parseFloat(tenkisForm.tereke) || 0;
    
    if (t <= 0) {
      showToast("Lütfen geçerli bir tereke değeri giriniz.");
      return;
    }

    const bagislamalar = parseFloat(tenkisForm.bagislamalar) || 0;
    const es = tenkisForm.esHayatta === "evet";
    const z = parseInt(tenkisForm.zumre);
    const n = parseInt(tenkisForm.kisiSayisi) || 1;

    // Tenkise esas tereke = Net tereke + tenkise tabi bağışlamalar
    const esasTereke = t + bagislamalar;

    let esYasal = 0;
    let zumreYasal = 0;

    if (es) {
      if (z === 1) { esYasal = 1/4; zumreYasal = 3/4; }
      else if (z === 2) { esYasal = 1/2; zumreYasal = 1/2; }
      else if (z === 3) { esYasal = 3/4; zumreYasal = 1/4; }
    } else {
      zumreYasal = 1;
    }

    // Saklı Pay Oranları
    // Eş: 1. ve 2. zümre ile beraberse yasal payın tamamı, 3. zümre ile yasal payın 3/4'ü
    let esSakli = 0;
    if (es) {
      if (z === 1 || z === 2) esSakli = esYasal;
      else if (z === 3) esSakli = esYasal * (3/4);
    }

    // Altsoy: yasal payın 1/2'si
    // Anne/Baba: yasal payın 1/4'ü
    // Kardeşlerin saklı payı KALDIRILDI (2007)
    let zumreSakli = 0;
    if (z === 1) zumreSakli = zumreYasal * (1/2);
    else if (z === 2) zumreSakli = zumreYasal * (1/4); // Sadece anne babanın var, kardeşlerin yok ama hesaplamayı basitleştirmek için zümre başlarına göre alıyoruz.
    else if (z === 3) zumreSakli = 0; // 3. zümrenin saklı payı yoktur

    const esSakliTutar = esasTereke * esSakli;
    const zumreSakliToplamTutar = esasTereke * zumreSakli;
    const toplamSakliPay = esSakliTutar + zumreSakliToplamTutar;
    
    // Tasarruf Edilebilir Kısım
    const tasarrufEdilebilir = esasTereke - toplamSakliPay;

    // Tenkis gerekliliği: Eğer tasarruflar (bağışlamalar) > tasarruf edilebilir kısım ise tenkis davası açılabilir.
    const tenkisMiktari = bagislamalar > tasarrufEdilebilir ? (bagislamalar - tasarrufEdilebilir) : 0;

    setResult({
      type: "tenkis",
      esasTereke,
      esSakliTutar,
      zumreSakliToplamTutar,
      toplamSakliPay,
      tasarrufEdilebilir,
      bagislamalar,
      tenkisMiktari,
      desc: tenkisMiktari > 0 
        ? `Murisin yaptığı bağışlamalar (${formatCurrency(bagislamalar)}), tasarruf edilebilir kısmı (${formatCurrency(tasarrufEdilebilir)}) aşmaktadır. ${formatCurrency(tenkisMiktari)} tutarında tenkis davası açılabilir.`
        : `Murisin yaptığı bağışlamalar tasarruf edilebilir kısım içindedir. Saklı paylara tecavüz yoktur.`
    });
  };

  const formatCurrency = (val) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(val || 0);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Miras Hukuku Hesaplayıcı</h3>
        <p style={styles.desc}>Yasal Miras Payları ve Saklı Pay / Tenkis (İndirim) hesaplamaları.</p>
      </div>

      <div style={styles.tabContainer}>
        <button style={activeTab === "paylar" ? styles.activeTab : styles.tab} onClick={() => {setActiveTab("paylar"); setResult(null);}}>Yasal Miras Payları</button>
        <button style={activeTab === "tenkis" ? styles.activeTab : styles.tab} onClick={() => {setActiveTab("tenkis"); setResult(null);}}>Saklı Pay & Tenkis</button>
      </div>

      <div style={styles.grid}>
        {/* Form Alanı */}
        <div style={styles.card}>
          {activeTab === "paylar" && (
            <form onSubmit={calculateShares} style={styles.form}>
              <div style={styles.inputGroup}><label style={styles.label}>Tereke Değeri (Net)</label><input type="number" style={styles.input} value={shareForm.tereke} onChange={(e) => setShareForm({...shareForm, tereke: e.target.value})} required /></div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Sağ Kalan Eş Var mı?</label>
                <select style={styles.select} value={shareForm.esHayatta} onChange={(e) => setShareForm({...shareForm, esHayatta: e.target.value})}>
                  <option value="evet">Evet</option>
                  <option value="hayir">Hayır</option>
                </select>
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Mirasçı Zümresi (Eş dışındaki)</label>
                <select style={styles.select} value={shareForm.zumre} onChange={(e) => setShareForm({...shareForm, zumre: e.target.value})}>
                  <option value="1">1. Zümre: Altsoy (Çocuklar, Torunlar)</option>
                  <option value="2">2. Zümre: Anne, Baba ve Onların Altsoyu (Kardeşler)</option>
                  <option value="3">3. Zümre: Büyükkanne, Büyükbaba ve Altsoyu (Amca, Hala vb)</option>
                </select>
              </div>
              <div style={styles.inputGroup}><label style={styles.label}>Seçilen Zümredeki Mirasçı (Kök) Sayısı</label><input type="number" min="1" style={styles.input} value={shareForm.kisiSayisi} onChange={(e) => setShareForm({...shareForm, kisiSayisi: e.target.value})} required /></div>
              <button type="submit" style={styles.calcBtn}>Miras Paylarını Hesapla</button>
            </form>
          )}

          {activeTab === "tenkis" && (
            <form onSubmit={calculateTenkis} style={styles.form}>
              <div style={styles.inputGroup}><label style={styles.label}>Mevcut Net Tereke (Ölüm anındaki mallar eksi borçlar)</label><input type="number" style={styles.input} value={tenkisForm.tereke} onChange={(e) => setTenkisForm({...tenkisForm, tereke: e.target.value})} required /></div>
              <div style={styles.inputGroup}><label style={styles.label}>Tenkise Tabi Kazandırmalar (Örn: Sağlığında yaptığı bağışlar)</label><input type="number" style={styles.input} value={tenkisForm.bagislamalar} onChange={(e) => setTenkisForm({...tenkisForm, bagislamalar: e.target.value})} required /></div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Sağ Kalan Eş Var mı?</label>
                <select style={styles.select} value={tenkisForm.esHayatta} onChange={(e) => setTenkisForm({...tenkisForm, esHayatta: e.target.value})}>
                  <option value="evet">Evet</option>
                  <option value="hayir">Hayır</option>
                </select>
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Mirasçı Zümresi</label>
                <select style={styles.select} value={tenkisForm.zumre} onChange={(e) => setTenkisForm({...tenkisForm, zumre: e.target.value})}>
                  <option value="1">1. Zümre: Altsoy</option>
                  <option value="2">2. Zümre: Anne, Baba</option>
                  <option value="3">3. Zümre: Büyükkanne, Büyükbaba (Saklı payları yoktur)</option>
                </select>
              </div>
              <button type="submit" style={styles.calcBtn}>Saklı Pay ve Tenkis Hesapla</button>
            </form>
          )}
        </div>

        {/* Sonuç Alanı */}
        <div style={styles.card}>
          <div style={styles.sectionTitle}>Hesaplama Sonucu</div>
          
          {result ? (
            <div style={styles.resultContainer} className="animate-fade-in">
              
              {result.type === "paylar" && (
                <>
                  <div style={styles.resultList}>
                    {result.esPayOrani > 0 && (
                      <div style={styles.resultItem}>
                        <div>
                          <span style={styles.resultItemLabel}>Sağ Kalan Eşin Payı</span>
                          <span style={{display: "block", fontSize: 12, color: "var(--color-text-tertiary)"}}>Oran: %{(result.esPayOrani * 100).toFixed(0)}</span>
                        </div>
                        <span style={styles.resultItemValue}>{formatCurrency(result.esTutar)}</span>
                      </div>
                    )}
                    {result.zumrePayOrani > 0 && (
                      <div style={styles.resultItem}>
                        <div>
                          <span style={styles.resultItemLabel}>İlgili Zümrenin Toplam Payı</span>
                          <span style={{display: "block", fontSize: 12, color: "var(--color-text-tertiary)"}}>Oran: %{(result.zumrePayOrani * 100).toFixed(0)}</span>
                        </div>
                        <span style={styles.resultItemValue}>{formatCurrency(result.zumreToplamTutar)}</span>
                      </div>
                    )}
                    {result.zumrePayOrani > 0 && result.n > 0 && (
                      <div style={styles.resultItem}>
                        <div>
                          <span style={styles.resultItemLabel}>Zümre İçi Kişi Başına Düşen Pay</span>
                          <span style={{display: "block", fontSize: 12, color: "var(--color-text-tertiary)"}}>({result.n} Kişi Arasında Eşit Paylaşıldığında)</span>
                        </div>
                        <span style={styles.resultItemValue}>{formatCurrency(result.kisiBasiTutar)}</span>
                      </div>
                    )}
                  </div>
                  <div style={styles.infoBox}>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" style={{flexShrink: 0}}><circle cx="10" cy="10" r="9"/><path d="M10 14V10M10 6h.01"/></svg>
                    <p>{result.desc}</p>
                  </div>
                </>
              )}

              {result.type === "tenkis" && (
                <>
                  <div style={styles.resultMain}>
                    <span style={styles.resultMainLabel}>İhlal Edilen Saklı Pay (Tenkis Miktarı)</span>
                    <span style={{...styles.resultMainValue, color: result.tenkisMiktari > 0 ? "var(--color-error)" : "var(--color-success)"}}>
                      {formatCurrency(result.tenkisMiktari)}
                    </span>
                  </div>

                  <div style={styles.resultList}>
                    <div style={styles.resultItem}><span style={styles.resultItemLabel}>Tenkise Esas (Farazi) Tereke</span><span style={styles.resultItemValue}>{formatCurrency(result.esasTereke)}</span></div>
                    <div style={styles.resultItem}><span style={styles.resultItemLabel}>Tasarruf Edilebilir Kısım</span><span style={styles.resultItemValue}>{formatCurrency(result.tasarrufEdilebilir)}</span></div>
                    <div style={styles.resultItem}><span style={styles.resultItemLabel}>Eşin Saklı Pay Tutarı</span><span style={styles.resultItemValue}>{formatCurrency(result.esSakliTutar)}</span></div>
                    <div style={styles.resultItem}><span style={styles.resultItemLabel}>Diğer Mirasçıların Toplam Saklı Payı</span><span style={styles.resultItemValue}>{formatCurrency(result.zumreSakliToplamTutar)}</span></div>
                    <div style={styles.resultItem}><span style={styles.resultItemLabel}>Toplam Saklı Pay</span><span style={styles.resultItemValue}>{formatCurrency(result.toplamSakliPay)}</span></div>
                  </div>

                  <div style={{...styles.infoBox, borderColor: result.tenkisMiktari > 0 ? "var(--color-error)" : "var(--color-border-subtle)", background: result.tenkisMiktari > 0 ? "rgba(239, 68, 68, 0.1)" : "var(--color-bg-subtle)"}}>
                    <p style={{color: result.tenkisMiktari > 0 ? "var(--color-error)" : "var(--color-text-secondary)"}}>{result.desc}</p>
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
