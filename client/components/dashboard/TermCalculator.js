"use client";

import { useState } from "react";

/* ============================================================
   Emsal Atlası - Hukuki Süre, Zamanaşımı ve Arabuluculuk Hesaplama
   ============================================================ */

export default function TermCalculator() {
  const [activeTab, setActiveTab] = useState("adli"); // adli, zamanasimi, arabuluculuk
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Adli Süre Formu
  const [form, setForm] = useState({
    lawType: "hmk", // hmk, cmk, iyuk
    termType: "gun", // gun, hafta, ay
    termValue: "",
    startDate: "",
    subjectToHoliday: true, // Adli tatile tabi mi?
  });

  // Zamanaşımı Formu
  const [zamanForm, setZamanForm] = useState({
    lawArea: "tck", // tck, tbk_genel, haksiz_fiil, is_hukuku
    penaltyMax: "5", // for tck: max penalty in years
    startDate: ""
  });

  // Arabuluculuk Formu
  const [arabuluculukForm, setArabuluculukForm] = useState({
    caseType: "ise_iade", // ise_iade, isci_alacagi, ticari, tuketici
    startDate: ""
  });

  const [result, setResult] = useState(null);

  // Sabit Resmi Tatiller (MM-DD)
  const publicHolidays = ["01-01", "04-23", "05-01", "05-19", "07-15", "08-30", "10-29"];
  // Dini Bayramlar (Tahmini - 2024, 2025, 2026) YYYY-MM-DD
  const religiousHolidays = [
    "2024-04-09", "2024-04-10", "2024-04-11", "2024-04-12",
    "2024-06-15", "2024-06-16", "2024-06-17", "2024-06-18", "2024-06-19",
    "2025-03-29", "2025-03-30", "2025-03-31", "2025-04-01",
    "2025-06-05", "2025-06-06", "2025-06-07", "2025-06-08", "2025-06-09",
  ];

  const isHoliday = (dateObj) => {
    const day = dateObj.getDay();
    if (day === 0 || day === 6) return true;
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    const yyyy = dateObj.getFullYear();
    if (publicHolidays.includes(`${mm}-${dd}`)) return true;
    if (religiousHolidays.includes(`${yyyy}-${mm}-${dd}`)) return true;
    return false;
  };

  const getNextWorkingDay = (dateObj) => {
    let current = new Date(dateObj);
    while (isHoliday(current)) {
      current.setDate(current.getDate() + 1);
    }
    return current;
  };

  const isAdliTatil = (dateObj) => {
    const m = dateObj.getMonth() + 1;
    const d = dateObj.getDate();
    if (m === 7 && d >= 20) return true;
    if (m === 8) return true;
    return false;
  };

  const calculateAdli = (e) => {
    if (e) e.preventDefault();
    if (!form.startDate || !form.termValue) {
      showToast("Lütfen tebliğ/tefhim tarihi ve süre giriniz.");
      return;
    }

    const value = parseInt(form.termValue);
    if (isNaN(value) || value <= 0) {
      showToast("Lütfen geçerli bir süre giriniz.");
      return;
    }

    let baseDate = new Date(form.startDate);

    if (form.termType === "gun") {
      baseDate.setDate(baseDate.getDate() + value);
    } else if (form.termType === "hafta") {
      baseDate.setDate(baseDate.getDate() + (value * 7));
    } else if (form.termType === "ay") {
      const currentMonth = baseDate.getMonth();
      const targetMonth = currentMonth + value;
      baseDate.setMonth(targetMonth);
      if (baseDate.getMonth() !== (targetMonth % 12)) {
        baseDate.setDate(0); 
      }
    }

    let adliTatilUzatma = false;
    if (form.subjectToHoliday && isAdliTatil(baseDate)) {
      const year = baseDate.getFullYear();
      let extensionDays = 7; 
      if (form.lawType === "cmk") extensionDays = 3;
      baseDate = new Date(year, 8, extensionDays);
      adliTatilUzatma = true;
    }

    const finalDate = getNextWorkingDay(baseDate);
    const tatilNedeniyleUzadi = finalDate.getTime() !== baseDate.getTime() && !adliTatilUzatma;

    setResult({
      type: "adli",
      endDate: finalDate,
      isAdliTatilApplied: adliTatilUzatma,
      isHolidayApplied: tatilNedeniyleUzadi,
      startDate: new Date(form.startDate),
      termValue: value,
      termType: form.termType,
      lawType: form.lawType
    });
  };

  const calculateZamanasimi = (e) => {
    if (e) e.preventDefault();
    if (!zamanForm.startDate) {
      showToast("Lütfen suç/öğrenme tarihi giriniz.");
      return;
    }

    let baseDate = new Date(zamanForm.startDate);
    let yearsToAdd = 0;
    let description = "";

    if (zamanForm.lawArea === "tck") {
      const p = parseInt(zamanForm.penaltyMax);
      if (p < 5) yearsToAdd = 8;
      else if (p >= 5 && p < 20) yearsToAdd = 15;
      else if (p >= 20 && p < 36) yearsToAdd = 20; // ağırlaştırılmış müebbet harici
      else if (p >= 36) yearsToAdd = 30; // ağırlaştırılmış
      
      description = `TCK m. 66'ya göre temel dava zamanaşımı süresi (${yearsToAdd} yıl). Kesme sebepleri varsa süre yarı oranında uzayabilir.`;
    } else if (zamanForm.lawArea === "tbk_genel") {
      yearsToAdd = 10;
      description = "TBK m. 146 Genel Zamanaşımı Süresi (10 Yıl).";
    } else if (zamanForm.lawArea === "haksiz_fiil") {
      yearsToAdd = 2; // Öğrenmeden itibaren 2 yıl, fiilden itibaren 10 yıl
      description = "TBK m. 72 Haksız Fiil Tazminatı Zamanaşımı (Öğrenmeden itibaren 2 Yıl, her halde 10 Yıl). Sonuç 2 yıla göre hesaplanmıştır.";
    } else if (zamanForm.lawArea === "is_hukuku") {
      yearsToAdd = 5;
      description = "İş Kanunu (Ek M.3) gereği işçi alacakları (kıdem, ihbar vb.) için zamanaşımı süresi (5 Yıl).";
    }

    baseDate.setFullYear(baseDate.getFullYear() + yearsToAdd);

    setResult({
      type: "zamanasimi",
      endDate: baseDate,
      startDate: new Date(zamanForm.startDate),
      years: yearsToAdd,
      description
    });
  };

  const calculateArabuluculuk = (e) => {
    if (e) e.preventDefault();
    if (!arabuluculukForm.startDate) {
      showToast("Lütfen tarih giriniz.");
      return;
    }

    let baseDate = new Date(arabuluculukForm.startDate);
    let term = 0;
    let termType = "hafta";
    let desc = "";

    if (arabuluculukForm.caseType === "ise_iade") {
      baseDate.setMonth(baseDate.getMonth() + 1); // 1 ay
      termType = "ay";
      term = 1;
      desc = "İşe İade Talebiyle Arabuluculuğa Başvuru Süresi: Fesih bildiriminin tebliğinden itibaren 1 AY (İşK m. 20). Hak düşürücü süredir.";
    } else if (arabuluculukForm.caseType === "isci_alacagi") {
      // Zamanaşımı süresi içinde başvurulur, ama sonuçlanma süresi için
      desc = "İşçi/İşveren Alacağı: Arabulucu 3 hafta + 1 hafta içinde karar verir.";
      baseDate.setDate(baseDate.getDate() + 28);
      termType = "hafta";
      term = 4;
    } else if (arabuluculukForm.caseType === "ticari") {
      desc = "Ticari Uyuşmazlıklar: Arabulucu 6 hafta + 2 hafta içinde karar verir.";
      baseDate.setDate(baseDate.getDate() + 56);
      termType = "hafta";
      term = 8;
    } else if (arabuluculukForm.caseType === "tuketici") {
      desc = "Tüketici Uyuşmazlıkları: Arabulucu 3 hafta + 1 hafta içinde karar verir.";
      baseDate.setDate(baseDate.getDate() + 28);
      termType = "hafta";
      term = 4;
    }

    setResult({
      type: "arabuluculuk",
      endDate: getNextWorkingDay(baseDate),
      startDate: new Date(arabuluculukForm.startDate),
      term,
      termType,
      description: desc
    });
  };

  const formatDate = (dateObj) => {
    return dateObj.toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Adli Süre, Zamanaşımı ve Arabuluculuk Hesaplayıcı</h3>
        <p style={styles.desc}>Dava süreleri, ceza/borçlar zamanaşımı süreleri ve dava şartı arabuluculuk sürelerini hesaplayın.</p>
      </div>

      <div style={styles.tabContainer}>
        <button style={activeTab === "adli" ? styles.activeTab : styles.tab} onClick={() => {setActiveTab("adli"); setResult(null);}}>Adli Süre (HMK/CMK/İYUK)</button>
        <button style={activeTab === "zamanasimi" ? styles.activeTab : styles.tab} onClick={() => {setActiveTab("zamanasimi"); setResult(null);}}>Zamanaşımı Hesapla</button>
        <button style={activeTab === "arabuluculuk" ? styles.activeTab : styles.tab} onClick={() => {setActiveTab("arabuluculuk"); setResult(null);}}>Arabuluculuk Süreleri</button>
      </div>

      <div style={styles.grid}>
        {/* Sol Taraf: Form */}
        <div style={styles.card}>
          {activeTab === "adli" && (
            <form onSubmit={calculateAdli} style={styles.form}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>İlgili Kanun</label>
                <select style={styles.select} value={form.lawType} onChange={(e) => setForm({...form, lawType: e.target.value})}>
                  <option value="hmk">HMK (Hukuk Muhakemeleri)</option>
                  <option value="cmk">CMK (Ceza Muhakemesi)</option>
                  <option value="iyuk">İYUK (İdari Yargılama)</option>
                </select>
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Tebliğ / Tefhim Tarihi</label>
                <input type="date" style={styles.input} value={form.startDate} onChange={(e) => setForm({...form, startDate: e.target.value})} required />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Süre</label>
                  <input type="number" min="1" style={styles.input} value={form.termValue} onChange={(e) => setForm({...form, termValue: e.target.value})} required />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Birim</label>
                  <select style={styles.select} value={form.termType} onChange={(e) => setForm({...form, termType: e.target.value})}>
                    <option value="gun">Gün</option>
                    <option value="hafta">Hafta</option>
                    <option value="ay">Ay</option>
                  </select>
                </div>
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.checkboxLabel}>
                  <input type="checkbox" checked={form.subjectToHoliday} onChange={(e) => setForm({...form, subjectToHoliday: e.target.checked})} style={styles.checkbox} />
                  Dava/İşlem Adli Tatile Tabi
                </label>
              </div>
              <button type="submit" style={styles.calcBtn}>Adli Süreyi Hesapla</button>
            </form>
          )}

          {activeTab === "zamanasimi" && (
            <form onSubmit={calculateZamanasimi} style={styles.form}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Hukuk Dalı / Tür</label>
                <select style={styles.select} value={zamanForm.lawArea} onChange={(e) => setZamanForm({...zamanForm, lawArea: e.target.value})}>
                  <option value="tck">Ceza Hukuku (TCK) - Dava Zamanaşımı</option>
                  <option value="tbk_genel">Borçlar Hukuku (Genel) - 10 Yıl</option>
                  <option value="haksiz_fiil">Haksız Fiil (TBK 72) - 2 Yıl</option>
                  <option value="is_hukuku">İşçi Alacakları (Kıdem, İhbar vb.) - 5 Yıl</option>
                </select>
              </div>
              {zamanForm.lawArea === "tck" && (
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Suçun Kanundaki Üst Sınırı (Yıl)</label>
                  <input type="number" min="1" style={styles.input} value={zamanForm.penaltyMax} onChange={(e) => setZamanForm({...zamanForm, penaltyMax: e.target.value})} required />
                </div>
              )}
              <div style={styles.inputGroup}>
                <label style={styles.label}>Suç / Fiil / Öğrenme Tarihi</label>
                <input type="date" style={styles.input} value={zamanForm.startDate} onChange={(e) => setZamanForm({...zamanForm, startDate: e.target.value})} required />
              </div>
              <button type="submit" style={styles.calcBtn}>Zamanaşımı Hesapla</button>
            </form>
          )}

          {activeTab === "arabuluculuk" && (
            <form onSubmit={calculateArabuluculuk} style={styles.form}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Uyuşmazlık / Başvuru Türü</label>
                <select style={styles.select} value={arabuluculukForm.caseType} onChange={(e) => setArabuluculukForm({...arabuluculukForm, caseType: e.target.value})}>
                  <option value="ise_iade">İşe İade Davası (Başvuru Süresi - 1 Ay)</option>
                  <option value="isci_alacagi">İşçi/İşveren Alacağı (Azami Süre - 4 Hafta)</option>
                  <option value="ticari">Ticari Dava Şartı (Azami Süre - 8 Hafta)</option>
                  <option value="tuketici">Tüketici Dava Şartı (Azami Süre - 4 Hafta)</option>
                </select>
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Fesih Tarihi / Başvuru Tarihi</label>
                <input type="date" style={styles.input} value={arabuluculukForm.startDate} onChange={(e) => setArabuluculukForm({...arabuluculukForm, startDate: e.target.value})} required />
              </div>
              <button type="submit" style={styles.calcBtn}>Arabuluculuk Süresi Hesapla</button>
            </form>
          )}
        </div>

        {/* Sağ Taraf: Sonuç */}
        <div style={styles.card}>
          <div style={styles.sectionTitle}>Süre Sonu / Son Gün</div>
          
          {result ? (
            <div style={styles.resultContainer} className="animate-fade-in">
              <div style={styles.resultMain}>
                <span style={styles.resultMainLabel}>{result.type === "zamanasimi" ? "Zamanaşımı Dolma Tarihi" : "Son Tarih"}</span>
                <span style={styles.resultMainValue}>{formatDate(result.endDate)}</span>
              </div>
              
              <div style={styles.resultList}>
                <div style={styles.resultItem}>
                  <span style={styles.resultItemLabel}>Başlangıç Tarihi</span>
                  <span style={styles.resultItemValue}>{formatDate(result.startDate)}</span>
                </div>
                {result.type === "adli" && (
                  <>
                    <div style={styles.resultItem}><span style={styles.resultItemLabel}>İlgili Kanun</span><span style={styles.resultItemValue}>{result.lawType.toUpperCase()}</span></div>
                    <div style={styles.resultItem}><span style={styles.resultItemLabel}>Süre</span><span style={styles.resultItemValue}>{result.termValue} {result.termType}</span></div>
                  </>
                )}
                {result.type === "zamanasimi" && (
                  <div style={styles.resultItem}><span style={styles.resultItemLabel}>Eklenen Süre</span><span style={styles.resultItemValue}>{result.years} Yıl</span></div>
                )}
              </div>

              {result.description && (
                <div style={styles.infoBox}>
                  <p><strong>Açıklama:</strong> {result.description}</p>
                </div>
              )}

              {result.isAdliTatilApplied && (
                <div style={{...styles.infoBox, background: "rgba(245, 158, 11, 0.1)", borderColor: "rgba(245, 158, 11, 0.2)", color: "var(--color-text-primary)"}}>
                  <div>
                    <strong style={{color: "var(--color-warning)", display: "block", marginBottom: 4}}>Adli Tatil Uygulandı</strong>
                    Sürenin son günü adli tatile (20 Temmuz - 31 Ağustos) rastladığı için, yasa uyarınca süre Eylül ayına sarkmıştır.
                  </div>
                </div>
              )}

              {result.isHolidayApplied && (
                <div style={{...styles.infoBox, background: "rgba(59, 130, 246, 0.1)", borderColor: "rgba(59, 130, 246, 0.2)", color: "var(--color-text-primary)"}}>
                  <div>
                    <strong style={{color: "var(--color-accent)", display: "block", marginBottom: 4}}>Tatil Günü Nedeniyle Uzama</strong>
                    Sürenin son günü resmi tatile/hafta sonuna denk geldiği için, ilk mesai gününe uzamıştır.
                  </div>
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
  resultMainValue: { fontSize: 20, fontWeight: 700 },
  resultList: { display: "flex", flexDirection: "column", gap: 12 },
  resultItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px dashed var(--color-border-subtle)" },
  resultItemLabel: { fontSize: 13, color: "var(--color-text-secondary)" },
  resultItemValue: { fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" },
  infoBox: { padding: 12, borderRadius: "var(--radius-sm)", fontSize: 13, lineHeight: 1.5, marginTop: 8, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border-subtle)" },
  emptyResult: { display: "flex", justifyContent: "center", padding: "48px 20px", color: "var(--color-text-tertiary)", textAlign: "center", fontSize: 14 },
  checkboxLabel: { display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer", fontWeight: 500 },
  checkbox: { width: 18, height: 18, cursor: "pointer" }
};
