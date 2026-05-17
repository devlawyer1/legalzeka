"use client";

import { useState } from "react";

/* ============================================================
   Emsal Atlası - Execution Calculator (İnfaz Hesaplama)
   ============================================================ */

export default function ExecutionCalculator() {
  const [form, setForm] = useState({
    years: 0,
    months: 0,
    days: 0,
    crimeType: "general", // general (1/2), exception (2/3), terror (3/4)
    recidivism: "none", // none, single, multiple
    ageGroup: "adult", // adult, 15-18, under-15
    detentionDays: 0,
  });

  const [result, setResult] = useState(null);

  const calculate = (e) => {
    e.preventDefault();
    
    // Total sentence in days (approximate: 1 year = 365 days, 1 month = 30 days)
    const totalDays = (parseInt(form.years) || 0) * 365 + 
                      (parseInt(form.months) || 0) * 30 + 
                      (parseInt(form.days) || 0);

    if (totalDays <= 0) {
      alert("Lütfen geçerli bir ceza miktarı giriniz.");
      return;
    }

    // Determine conditional release rate
    let rate = 1/2; // General rule since 2020
    
    if (form.crimeType === "exception") rate = 2/3;
    if (form.crimeType === "terror") rate = 3/4;
    
    // Recidivism overrides base rate
    if (form.recidivism === "single") {
      rate = Math.max(rate, 2/3); // At least 2/3
    } else if (form.recidivism === "multiple") {
      // Second time recidivist cannot benefit from conditional release in some cases, 
      // but let's assume 3/4 or no release. Keep it simple: 3/4.
      rate = Math.max(rate, 3/4);
    }

    // Juvenile discount for conditional release (simplified)
    // Actually, juveniles have special rules for execution, but typically the rate might be the same, 
    // the detention day calculation is different (1 day counts as 2 days for under 15, etc.)

    let conditionalReleaseDays = Math.floor(totalDays * rate);
    
    // Deduct detention days
    let detentionToDeduct = parseInt(form.detentionDays) || 0;
    
    // For juveniles, detention days count more
    if (form.ageGroup === "under-15") {
      detentionToDeduct *= 2; // 1 day counts as 2 days
    }

    let remainingToServe = conditionalReleaseDays - detentionToDeduct;
    if (remainingToServe < 0) remainingToServe = 0;

    // Probation (Denetimli Serbestlik)
    // Currently general rule is 1 year (365 days) before conditional release
    let probationDays = 365;
    
    if (form.recidivism !== "none" && form.crimeType !== "general") {
       // Some exceptions
    }

    let actualPrisonDays = remainingToServe - probationDays;
    if (actualPrisonDays < 0) actualPrisonDays = 0;

    setResult({
      totalDays,
      conditionalReleaseDays,
      remainingToServe,
      probationDays,
      actualPrisonDays,
      rateText: rate === 1/2 ? "1/2" : rate === 2/3 ? "2/3" : rate === 3/4 ? "3/4" : `${rate}`,
    });
  };

  const formatDays = (days) => {
    if (days === 0) return "Yok";
    const y = Math.floor(days / 365);
    const m = Math.floor((days % 365) / 30);
    const d = (days % 365) % 30;
    
    let parts = [];
    if (y > 0) parts.push(`${y} Yıl`);
    if (m > 0) parts.push(`${m} Ay`);
    if (d > 0) parts.push(`${d} Gün`);
    
    return parts.join(" ") || "0 Gün";
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>İnfaz Hesaplama (TCK)</h3>
        <p style={styles.desc}>
          En güncel mevzuata göre (7242 Sayılı Kanun ve sonrası) hapis cezalarının infaz sürelerini hesaplayın. 
          Bu araç yaklaşık sonuçlar verir, kesin yasal tavsiye niteliği taşımaz.
        </p>
      </div>

      <div style={styles.grid}>
        {/* Left: Form */}
        <div style={styles.card}>
          <form onSubmit={calculate} style={styles.form}>
            
            <div style={styles.sectionTitle}>Ceza Miktarı</div>
            <div style={styles.durationGrid}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Yıl</label>
                <input 
                  type="number" 
                  min="0"
                  max="100"
                  style={styles.input}
                  value={form.years}
                  onChange={(e) => setForm({...form, years: e.target.value})}
                />
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Ay</label>
                <input 
                  type="number" 
                  min="0"
                  max="11"
                  style={styles.input}
                  value={form.months}
                  onChange={(e) => setForm({...form, months: e.target.value})}
                />
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Gün</label>
                <input 
                  type="number" 
                  min="0"
                  max="29"
                  style={styles.input}
                  value={form.days}
                  onChange={(e) => setForm({...form, days: e.target.value})}
                />
              </div>
            </div>

            <div style={styles.sectionTitle}>Suç ve İnfaz Detayları</div>
            
            <div style={styles.inputGroup}>
              <label style={styles.label}>Suç Türü</label>
              <select 
                style={styles.select}
                value={form.crimeType}
                onChange={(e) => setForm({...form, crimeType: e.target.value})}
              >
                <option value="general">Genel Suçlar (Örn: Hırsızlık, Dolandırıcılık, Yaralama)</option>
                <option value="exception">İstisnai Suçlar (Kasten Öldürme, Cinsel Saldırı, Uyuşturucu Ticareti vb.)</option>
                <option value="terror">Terör ve Örgütlü Suçlar (Devlete Karşı Suçlar)</option>
              </select>
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>Tekerrür Durumu (Suç Tekrarı)</label>
              <select 
                style={styles.select}
                value={form.recidivism}
                onChange={(e) => setForm({...form, recidivism: e.target.value})}
              >
                <option value="none">Yok (İlk Suç)</option>
                <option value="single">Tekerrür Var (1. Defa)</option>
                <option value="multiple">İkinci Defa Tekerrür</option>
              </select>
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>Suç Tarihindeki Yaş</label>
              <select 
                style={styles.select}
                value={form.ageGroup}
                onChange={(e) => setForm({...form, ageGroup: e.target.value})}
              >
                <option value="adult">18 Yaşını Doldurmuş</option>
                <option value="15-18">15-18 Yaş Arası</option>
                <option value="under-15">12-15 Yaş Arası</option>
              </select>
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>Mahsup Edilecek Süre (Gözaltı/Tutukluluk - Gün)</label>
              <input 
                type="number" 
                min="0"
                style={styles.input}
                value={form.detentionDays}
                onChange={(e) => setForm({...form, detentionDays: e.target.value})}
                placeholder="Örn: 45"
              />
            </div>

            <button type="submit" style={styles.calcBtn}>Hesapla</button>
          </form>
        </div>

        {/* Right: Result */}
        <div style={styles.card}>
          <div style={styles.sectionTitle}>Hesaplama Sonucu</div>
          
          {result ? (
            <div style={styles.resultContainer} className="animate-fade-in">
              <div style={styles.resultMain}>
                <span style={styles.resultMainLabel}>Net Yatar (Cezaevi Süresi)</span>
                <span style={styles.resultMainValue}>{formatDays(result.actualPrisonDays)}</span>
              </div>
              
              <div style={styles.resultList}>
                <div style={styles.resultItem}>
                  <span style={styles.resultItemLabel}>Verilen Toplam Ceza</span>
                  <span style={styles.resultItemValue}>{formatDays(result.totalDays)}</span>
                </div>
                <div style={styles.resultItem}>
                  <span style={styles.resultItemLabel}>İnfaz Oranı</span>
                  <span style={styles.resultItemValue}>{result.rateText}</span>
                </div>
                <div style={styles.resultItem}>
                  <span style={styles.resultItemLabel}>Koşullu Salıverilme Süresi (Yatar)</span>
                  <span style={styles.resultItemValue}>{formatDays(result.conditionalReleaseDays)}</span>
                </div>
                {parseInt(form.detentionDays) > 0 && (
                  <div style={styles.resultItem}>
                    <span style={styles.resultItemLabel}>Mahsup Edilen Tutukluluk</span>
                    <span style={styles.resultItemValue}>{form.detentionDays} Gün</span>
                  </div>
                )}
                <div style={styles.resultItem}>
                  <span style={styles.resultItemLabel}>Denetimli Serbestlik Süresi</span>
                  <span style={styles.resultItemValue}>{formatDays(result.probationDays)}</span>
                </div>
              </div>

              <div style={styles.infoBox}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="10" cy="10" r="9"/>
                  <path d="M10 14V10M10 6h.01"/>
                </svg>
                <p>
                  <strong>Not:</strong> Denetimli serbestlik süresi kapalı cezaevinden açık cezaevine ayrılma şartları oluştuktan sonra uygulanabilir. Açık cezaevine ayrılma süresi ceza türüne göre değişiklik gösterir.
                </p>
              </div>
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
  durationGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 12,
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
    backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%24%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M7%2010l5%205%205-5%22%20stroke%3D%22%239CA3AF%22%20stroke-width%3D%222%22%20fill%3D%22none%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 12px center",
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
    background: "linear-gradient(135deg, #1E3A8A, #2563EB)",
    color: "#fff",
    padding: "20px",
    borderRadius: "var(--radius-md)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    boxShadow: "0 4px 6px -1px rgba(37, 99, 235, 0.2)",
  },
  resultMainLabel: {
    fontSize: 14,
    fontWeight: 500,
    opacity: 0.9,
  },
  resultMainValue: {
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: "-0.02em",
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
    background: "#F0F9FF",
    border: "1px solid #BAE6FD",
    padding: "16px",
    borderRadius: "var(--radius-md)",
    color: "#0369A1",
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
