"use client";

import { useState } from "react";

/* ============================================================
   Emsal Atlası - Hukuki Süre Hesaplama Motoru (HMK, CMK, İYUK)
   ============================================================ */

export default function TermCalculator() {
  const [form, setForm] = useState({
    lawType: "hmk", // hmk, cmk, iyuk
    termType: "gun", // gun, hafta, ay
    termValue: "",
    startDate: "",
    subjectToHoliday: true, // Adli tatile tabi mi?
  });

  const [result, setResult] = useState(null);

  // Sabit Resmi Tatiller (MM-DD)
  const publicHolidays = [
    "01-01", // Yılbaşı
    "04-23", // Ulusal Egemenlik ve Çocuk Bayramı
    "05-01", // Emek ve Dayanışma Günü
    "05-19", // Atatürk'ü Anma, Gençlik ve Spor Bayramı
    "07-15", // Demokrasi ve Milli Birlik Günü
    "08-30", // Zafer Bayramı
    "10-29", // Cumhuriyet Bayramı
  ];

  // Dini Bayramlar (Tahmini - 2024, 2025, 2026) YYYY-MM-DD
  const religiousHolidays = [
    // 2024
    "2024-04-09", "2024-04-10", "2024-04-11", "2024-04-12", // Ramazan (Arife dahil)
    "2024-06-15", "2024-06-16", "2024-06-17", "2024-06-18", "2024-06-19", // Kurban (Arife dahil)
    // 2025
    "2025-03-29", "2025-03-30", "2025-03-31", "2025-04-01", // Ramazan
    "2025-06-05", "2025-06-06", "2025-06-07", "2025-06-08", "2025-06-09", // Kurban
    // 2026
    "2026-03-19", "2026-03-20", "2026-03-21", "2026-03-22", // Ramazan
    "2026-05-26", "2026-05-27", "2026-05-28", "2026-05-29", "2026-05-30"  // Kurban
  ];

  const isHoliday = (dateObj) => {
    const day = dateObj.getDay();
    if (day === 0 || day === 6) return true; // Pazar(0) veya Cumartesi(6)

    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    const yyyy = dateObj.getFullYear();

    const mmdd = `${mm}-${dd}`;
    const yyyymmdd = `${yyyy}-${mm}-${dd}`;

    if (publicHolidays.includes(mmdd)) return true;
    if (religiousHolidays.includes(yyyymmdd)) return true;

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
    // 20 Temmuz - 31 Ağustos
    if (m === 7 && d >= 20) return true;
    if (m === 8) return true;
    return false;
  };

  const calculate = (e) => {
    e.preventDefault();
    if (!form.startDate || !form.termValue) return;

    const value = parseInt(form.termValue);
    if (isNaN(value) || value <= 0) return;

    let baseDate = new Date(form.startDate);

    if (form.termType === "gun") {
      baseDate.setDate(baseDate.getDate() + value);
    } else if (form.termType === "hafta") {
      baseDate.setDate(baseDate.getDate() + (value * 7));
    } else if (form.termType === "ay") {
      const currentMonth = baseDate.getMonth();
      const targetMonth = currentMonth + value;
      
      baseDate.setMonth(targetMonth);
      
      // Eğer ay sonu taşması olduysa (örn: 31 Ocak + 1 Ay = 3 Mart -> Şubat'ın son gününe çekilmeli)
      if (baseDate.getMonth() !== (targetMonth % 12)) {
        baseDate.setDate(0); 
      }
    }

    let adliTatilUzatma = false;

    // Adli tatil kontrolü
    if (form.subjectToHoliday && isAdliTatil(baseDate)) {
      const year = baseDate.getFullYear();
      let extensionDays = 7; // HMK ve İYUK için 7 Eylül
      
      if (form.lawType === "cmk") {
        extensionDays = 3; // CMK m. 331/4 uyarınca 3 gün (3 Eylül)
      }
      
      baseDate = new Date(year, 8, extensionDays); // 8 = Eylül
      adliTatilUzatma = true;
    }

    // Hafta sonu ve resmi tatil kontrolü
    const finalDate = getNextWorkingDay(baseDate);
    const tatilNedeniyleUzadi = finalDate.getTime() !== baseDate.getTime() && !adliTatilUzatma;

    setResult({
      endDate: finalDate,
      isAdliTatilApplied: adliTatilUzatma,
      isHolidayApplied: tatilNedeniyleUzadi,
      originalDate: baseDate,
      startDate: new Date(form.startDate),
      termValue: value,
      termType: form.termType,
      lawType: form.lawType
    });
  };

  const formatDate = (dateObj) => {
    return dateObj.toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Hukuki Süre Hesaplama Motoru</h3>
        <p style={styles.desc}>
          HMK, CMK ve İYUK&apos;a göre dava, itiraz, istinaf ve temyiz sürelerini resmi tatiller ile adli tatil kurallarını gözeterek hesaplayın.
        </p>
      </div>

      <div style={styles.grid}>
        {/* Sol Taraf: Form */}
        <div style={styles.card}>
          <form onSubmit={calculate} style={styles.form}>
            
            <div style={styles.sectionTitle}>Dosya Detayları</div>
            
            <div style={styles.inputGroup}>
              <label style={styles.label}>İlgili Kanun</label>
              <select 
                style={styles.select}
                value={form.lawType}
                onChange={(e) => setForm({...form, lawType: e.target.value})}
              >
                <option value="hmk">Hukuk Muhakemeleri Kanunu (HMK)</option>
                <option value="cmk">Ceza Muhakemesi Kanunu (CMK)</option>
                <option value="iyuk">İdari Yargılama Usulü Kanunu (İYUK)</option>
              </select>
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>Tebliğ / Tefhim / Öğrenme Tarihi</label>
              <input 
                type="date" 
                style={styles.input}
                value={form.startDate}
                onChange={(e) => setForm({...form, startDate: e.target.value})}
                required
              />
              <span style={{fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4}}>
                * Süre, belirtilen bu tarihin ertesi gününden itibaren işlemeye başlar.
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Süre</label>
                <input 
                  type="number" 
                  min="1"
                  style={styles.input}
                  value={form.termValue}
                  onChange={(e) => setForm({...form, termValue: e.target.value})}
                  placeholder="Örn: 15"
                  required
                />
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Süre Birimi</label>
                <select 
                  style={styles.select}
                  value={form.termType}
                  onChange={(e) => setForm({...form, termType: e.target.value})}
                >
                  <option value="gun">Gün</option>
                  <option value="hafta">Hafta</option>
                  <option value="ay">Ay</option>
                </select>
              </div>
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.checkboxLabel}>
                <input 
                  type="checkbox" 
                  checked={form.subjectToHoliday}
                  onChange={(e) => setForm({...form, subjectToHoliday: e.target.checked})}
                  style={styles.checkbox}
                />
                Dava/İşlem Adli Tatile Tabi
              </label>
              <span style={{fontSize: 12, color: 'var(--color-text-tertiary)', marginLeft: 28}}>
                Adli tatilde sürelerin uzaması için işaretli bırakın. İvedi işler veya adli tatile tabi olmayan takipler için işareti kaldırın.
              </span>
            </div>

            <button type="submit" style={styles.calcBtn}>Hesapla</button>
          </form>
        </div>

        {/* Sağ Taraf: Sonuç */}
        <div style={styles.card}>
          <div style={styles.sectionTitle}>Süre Sonu / Son Gün</div>
          
          {result ? (
            <div style={styles.resultContainer} className="animate-fade-in">
              <div style={styles.resultMain}>
                <span style={styles.resultMainLabel}>Son İşlem Tarihi</span>
                <span style={styles.resultMainValue} className={result.isAdliTatilApplied || result.isHolidayApplied ? "text-accent" : ""}>
                  {formatDate(result.endDate)}
                </span>
              </div>
              
              <div style={styles.resultList}>
                <div style={styles.resultItem}>
                  <span style={styles.resultItemLabel}>İlgili Kanun</span>
                  <span style={styles.resultItemValue}>{result.lawType.toUpperCase()}</span>
                </div>
                <div style={styles.resultItem}>
                  <span style={styles.resultItemLabel}>Başlangıç Tarihi</span>
                  <span style={styles.resultItemValue}>{formatDate(result.startDate)}</span>
                </div>
                <div style={styles.resultItem}>
                  <span style={styles.resultItemLabel}>Süre</span>
                  <span style={styles.resultItemValue}>{result.termValue} {result.termType === "gun" ? "Gün" : result.termType === "hafta" ? "Hafta" : "Ay"}</span>
                </div>
              </div>

              {result.isAdliTatilApplied && (
                <div style={{...styles.infoBox, background: "rgba(234, 179, 8, 0.1)", borderColor: "rgba(234, 179, 8, 0.2)", color: "var(--color-text-primary)"}}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#EAB308" strokeWidth="1.5" style={{flexShrink: 0}}>
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <div>
                    <strong style={{color: "#EAB308", display: "block", marginBottom: 4}}>Adli Tatil Uygulandı</strong>
                    Sürenin son günü adli tatile (20 Temmuz - 31 Ağustos) rastladığı için, {result.lawType.toUpperCase()} uyarınca süre Eylül ayının uzatılmış gününe sarkmıştır.
                  </div>
                </div>
              )}

              {result.isHolidayApplied && (
                <div style={{...styles.infoBox, background: "rgba(59, 130, 246, 0.1)", borderColor: "rgba(59, 130, 246, 0.2)", color: "var(--color-text-primary)"}}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="1.5" style={{flexShrink: 0}}>
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <div>
                    <strong style={{color: "#3B82F6", display: "block", marginBottom: 4}}>Tatil Günü Nedeniyle Uzama</strong>
                    Sürenin son günü hafta sonu veya resmi tatile denk geldiği için, süre kanunen izleyen ilk mesai gününe uzamıştır.
                  </div>
                </div>
              )}

              {!result.isAdliTatilApplied && !result.isHolidayApplied && (
                <div style={styles.infoBox}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" style={{flexShrink: 0}}>
                    <circle cx="10" cy="10" r="9"/>
                    <path d="M10 14V10M10 6h.01"/>
                  </svg>
                  <p>
                    Sürenin son günü mesai gününe denk gelmektedir. İlgili işlemin saat 23:59'a kadar (UYAP üzerinden) veya mesai bitimine kadar fiziken yapılması gerekmektedir.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div style={styles.emptyResult}>
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="8" y="10" width="32" height="28" rx="4" />
                <path d="M14 18h20M14 26h10M30 26h4M14 30h4M22 30h12" />
              </svg>
              <p>Sonucu görmek için soldaki formu doldurup "Hesapla" butonuna tıklayın.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: 960,
    width: "100%",
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: 600,
    color: "var(--color-text-primary)",
    marginBottom: 8,
  },
  desc: {
    fontSize: 14,
    color: "var(--color-text-tertiary)",
    lineHeight: 1.5,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 24,
    alignItems: "start",
  },
  card: {
    background: "var(--color-bg-elevated)",
    border: "1px solid var(--color-border-subtle)",
    borderRadius: "var(--radius-lg)",
    padding: "24px",
    boxShadow: "var(--shadow-xs)",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: "var(--color-text-primary)",
    marginBottom: 16,
    borderBottom: "1px solid var(--color-border-subtle)",
    paddingBottom: 8,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },
  inputGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: 500,
    color: "var(--color-text-secondary)",
  },
  input: {
    padding: "10px 12px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--color-border)",
    background: "var(--color-bg)",
    fontSize: 14,
    color: "var(--color-text-primary)",
    outline: "none",
  },
  select: {
    padding: "10px 12px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--color-border)",
    background: "var(--color-bg)",
    fontSize: 14,
    color: "var(--color-text-primary)",
    outline: "none",
    appearance: "none",
    backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%24%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M7%2010l5%205%205-5%22%20stroke%3D%22%239CA3AF%22%20stroke-width%3D%222%22%20fill%3D%22none%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%2F%3E%3C%2Fsvg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 12px center",
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
    color: "var(--color-text-primary)",
    cursor: "pointer",
    fontWeight: 500,
  },
  checkbox: {
    width: 18,
    height: 18,
    cursor: "pointer",
  },
  calcBtn: {
    marginTop: 8,
    padding: "12px",
    background: "var(--color-accent)",
    color: "#000",
    border: "none",
    borderRadius: "var(--radius-md)",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    transition: "opacity 0.2s",
  },
  
  resultContainer: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },
  resultMain: {
    background: "linear-gradient(135deg, #18181B, #27272A)",
    color: "#fff",
    padding: "20px",
    borderRadius: "var(--radius-md)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.2)",
    textAlign: "center",
  },
  resultMainLabel: {
    fontSize: 14,
    fontWeight: 500,
    opacity: 0.9,
  },
  resultMainValue: {
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: "-0.01em",
  },
  resultList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  resultItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 0",
    borderBottom: "1px dashed var(--color-border-subtle)",
  },
  resultItemLabel: {
    fontSize: 13,
    color: "var(--color-text-secondary)",
  },
  resultItemValue: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--color-text-primary)",
  },
  infoBox: {
    display: "flex",
    gap: 12,
    background: "var(--color-bg-subtle)",
    border: "1px solid var(--color-border-subtle)",
    padding: "16px",
    borderRadius: "var(--radius-md)",
    color: "var(--color-text-secondary)",
    fontSize: 13,
    lineHeight: 1.5,
    marginTop: 8,
  },
  emptyResult: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: "48px 20px",
    color: "var(--color-text-tertiary)",
    textAlign: "center",
    fontSize: 14,
    lineHeight: 1.5,
  },
};
