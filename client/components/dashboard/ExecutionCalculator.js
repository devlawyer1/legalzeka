"use client";

import { useState } from "react";

/* ============================================================
   Emsal Atlası - Criminal Execution (Ceza İnfaz & Karar) Calculator
   ============================================================ */

export default function ExecutionCalculator() {
  const [form, setForm] = useState({
    // Temel Ceza
    baseYears: "0",
    baseMonths: "0",
    baseDays: "0",
    
    // Artırım & İndirimler (TCK 61 Sırası)
    attemptAttempt: "none", // Teşebbüs (TCK 35)
    successiveCrime: "none", // Zincirleme (TCK 43)
    provocation: "none", // Haksız Tahrik (TCK 29)
    minority: "adult", // Yaş Küçüklüğü (TCK 31)
    goodConduct: false, // Takdiri İndirim (TCK 62) - 1/6
    
    // İnfaz Parametreleri
    crimeType: "general", // general (1/2), exception (2/3), terror (3/4)
    recidivism: "none", // none, single, multiple
    detentionDays: "0", // Gözaltı/Tutukluluk
  });
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const [result, setResult] = useState(null);

  const calculate = (e) => {
    e.preventDefault();
    
    let y = parseInt(form.baseYears) || 0;
    let m = parseInt(form.baseMonths) || 0;
    let d = parseInt(form.baseDays) || 0;

    let totalDays = (y * 360) + (m * 30) + d; // Ceza hukukunda 1 yıl 360 gün, 1 ay 30 gün sayılır (TCK 61/6)

    if (totalDays <= 0) {
      showToast("Lütfen geçerli bir temel ceza miktarı giriniz.");
      return;
    }

    let calculationSteps = [];
    calculationSteps.push({ title: "Temel Ceza", days: totalDays });

    // 1. Teşebbüs İndirimi (TCK 35)
    if (form.attemptAttempt === "1/4") totalDays = Math.floor(totalDays * (3/4));
    else if (form.attemptAttempt === "1/2") totalDays = Math.floor(totalDays * (1/2));
    else if (form.attemptAttempt === "3/4") totalDays = Math.floor(totalDays * (1/4));
    if (form.attemptAttempt !== "none") calculationSteps.push({ title: "Teşebbüs İndirimi", days: totalDays });

    // 2. Zincirleme Suç Artırımı (TCK 43)
    if (form.successiveCrime === "1/4") totalDays = Math.floor(totalDays * (5/4));
    else if (form.successiveCrime === "1/2") totalDays = Math.floor(totalDays * (3/2));
    else if (form.successiveCrime === "3/4") totalDays = Math.floor(totalDays * (7/4));
    if (form.successiveCrime !== "none") calculationSteps.push({ title: "Zincirleme Suç Artırımı", days: totalDays });

    // 3. Haksız Tahrik İndirimi (TCK 29)
    if (form.provocation === "1/4") totalDays = Math.floor(totalDays * (3/4));
    else if (form.provocation === "1/2") totalDays = Math.floor(totalDays * (1/2));
    else if (form.provocation === "3/4") totalDays = Math.floor(totalDays * (1/4));
    if (form.provocation !== "none") calculationSteps.push({ title: "Haksız Tahrik İndirimi", days: totalDays });

    // 4. Yaş Küçüklüğü İndirimi (TCK 31)
    if (form.minority === "12-15") totalDays = Math.floor(totalDays * (1/2));
    else if (form.minority === "15-18") totalDays = Math.floor(totalDays * (2/3));
    if (form.minority !== "adult") calculationSteps.push({ title: "Yaş Küçüklüğü İndirimi", days: totalDays });

    // 5. Takdiri İndirim (TCK 62)
    if (form.goodConduct) {
      totalDays = Math.floor(totalDays * (5/6)); // 1/6 indirim
      calculationSteps.push({ title: "Takdiri İndirim (İyi Hal)", days: totalDays });
    }

    const finalSentenceDays = totalDays;

    // İNFAZ HESAPLAMA (Müddetname)
    let rate = 1/2; // Genel kural 1/2
    if (form.crimeType === "exception") rate = 2/3;
    if (form.crimeType === "terror") rate = 3/4;
    
    // Tekerrür
    if (form.recidivism === "single") rate = Math.max(rate, 2/3);
    else if (form.recidivism === "multiple") rate = Math.max(rate, 3/4);

    let conditionalReleaseDays = Math.floor(finalSentenceDays * rate);
    
    // Mahsup (Tutukluluk vb.)
    let detentionToDeduct = parseInt(form.detentionDays) || 0;
    if (form.minority === "12-15") detentionToDeduct *= 2; // 15 yaşından küçükler için 1 gün 2 gün sayılır

    let remainingToServe = conditionalReleaseDays - detentionToDeduct;
    if (remainingToServe < 0) remainingToServe = 0;

    // Denetimli Serbestlik (Genel olarak 1 yıl)
    // TCK/CGTİHK istisnaları çok fazladır ancak MVP için 1 yıl (365 gün) alıyoruz.
    // İstisna: Ağır hapis, terör ve ikinci defa tekerrürde farklılıklar vardır.
    let probationDays = 365;
    if (remainingToServe <= 365) {
      probationDays = remainingToServe;
    }
    
    let actualPrisonDays = remainingToServe - probationDays;
    if (actualPrisonDays < 0) actualPrisonDays = 0;

    setResult({
      calculationSteps,
      finalSentenceDays,
      conditionalReleaseDays,
      remainingToServe,
      probationDays,
      actualPrisonDays,
      rateText: rate === 1/2 ? "1/2" : rate === 2/3 ? "2/3" : rate === 3/4 ? "3/4" : `${rate}`,
      isAdliParaCezasi: finalSentenceDays <= 360 && form.crimeType === "general" && form.recidivism === "none"
    });
  };

  const formatDays = (totalDays) => {
    if (totalDays === 0) return "Yok";
    const y = Math.floor(totalDays / 360); // Ceza infazda 1 yıl 360 gün
    const m = Math.floor((totalDays % 360) / 30);
    const d = (totalDays % 360) % 30;
    
    let parts = [];
    if (y > 0) parts.push(`${y} Yıl`);
    if (m > 0) parts.push(`${m} Ay`);
    if (d > 0) parts.push(`${d} Gün`);
    
    return parts.join(" ") || "0 Gün";
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Ceza Karar & İnfaz (Müddetname) Hesaplayıcı</h3>
        <p style={styles.desc}>TCK 61'e göre artırım/indirim sırasıyla net cezayı ve güncel infaz yasasına göre yatar süresini hesaplayın.</p>
      </div>

      <div style={styles.grid}>
        {/* Left: Form */}
        <div style={styles.card}>
          <form onSubmit={calculate} style={styles.form}>
            
            <div style={styles.sectionTitle}>1. Temel Ceza (TCK 61)</div>
            <div style={styles.durationGrid}>
              <div style={styles.inputGroup}><label style={styles.label}>Yıl</label><input type="number" min="0" style={styles.input} value={form.baseYears} onChange={(e) => setForm({...form, baseYears: e.target.value})} /></div>
              <div style={styles.inputGroup}><label style={styles.label}>Ay</label><input type="number" min="0" max="11" style={styles.input} value={form.baseMonths} onChange={(e) => setForm({...form, baseMonths: e.target.value})} /></div>
              <div style={styles.inputGroup}><label style={styles.label}>Gün</label><input type="number" min="0" max="29" style={styles.input} value={form.baseDays} onChange={(e) => setForm({...form, baseDays: e.target.value})} /></div>
            </div>

            <div style={styles.sectionTitle}>2. Artırım ve İndirimler (Sıralı)</div>
            
            <div style={styles.inputGroup}>
              <label style={styles.label}>Teşebbüs (TCK 35)</label>
              <select style={styles.select} value={form.attemptAttempt} onChange={(e) => setForm({...form, attemptAttempt: e.target.value})}>
                <option value="none">Yok</option>
                <option value="1/4">1/4 Oranında İndirim</option>
                <option value="1/2">1/2 Oranında İndirim</option>
                <option value="3/4">3/4 Oranında İndirim</option>
              </select>
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>Zincirleme Suç (TCK 43)</label>
              <select style={styles.select} value={form.successiveCrime} onChange={(e) => setForm({...form, successiveCrime: e.target.value})}>
                <option value="none">Yok</option>
                <option value="1/4">1/4 Oranında Artırım</option>
                <option value="1/2">1/2 Oranında Artırım</option>
                <option value="3/4">3/4 Oranında Artırım</option>
              </select>
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>Haksız Tahrik (TCK 29)</label>
              <select style={styles.select} value={form.provocation} onChange={(e) => setForm({...form, provocation: e.target.value})}>
                <option value="none">Yok</option>
                <option value="1/4">1/4 Oranında İndirim</option>
                <option value="1/2">1/2 Oranında İndirim</option>
                <option value="3/4">3/4 Oranında İndirim</option>
              </select>
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>Yaş Küçüklüğü (TCK 31)</label>
              <select style={styles.select} value={form.minority} onChange={(e) => setForm({...form, minority: e.target.value})}>
                <option value="adult">18 Yaşını Doldurmuş (İndirim Yok)</option>
                <option value="15-18">15-18 Yaş Arası (1/3 İndirim)</option>
                <option value="12-15">12-15 Yaş Arası (1/2 İndirim)</option>
              </select>
            </div>

            <div style={styles.inputGroup}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                <input type="checkbox" checked={form.goodConduct} onChange={(e) => setForm({...form, goodConduct: e.target.checked})} style={{ width: 16, height: 16 }} />
                Takdiri İndirim / İyi Hal (TCK 62) - 1/6 İndirim
              </label>
            </div>

            <div style={styles.sectionTitle}>3. İnfaz ve Müddetname Detayları</div>
            
            <div style={styles.inputGroup}>
              <label style={styles.label}>Suç Türü</label>
              <select style={styles.select} value={form.crimeType} onChange={(e) => setForm({...form, crimeType: e.target.value})}>
                <option value="general">Genel Suçlar (1/2 İnfaz)</option>
                <option value="exception">İstisnai Suçlar (Öldürme, Cinsel vb. - 2/3 İnfaz)</option>
                <option value="terror">Terör ve Örgütlü Suçlar (3/4 İnfaz)</option>
              </select>
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>Tekerrür Durumu</label>
              <select style={styles.select} value={form.recidivism} onChange={(e) => setForm({...form, recidivism: e.target.value})}>
                <option value="none">Yok (İlk Suç)</option>
                <option value="single">Tekerrür Var (Mükerrir - 2/3 İnfaz)</option>
                <option value="multiple">İkinci Defa Tekerrür (3/4 İnfaz)</option>
              </select>
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>Mahsup Edilecek Tutukluluk Süresi (Gün)</label>
              <input type="number" min="0" style={styles.input} value={form.detentionDays} onChange={(e) => setForm({...form, detentionDays: e.target.value})} />
            </div>

            <button type="submit" style={styles.calcBtn}>Karar ve İnfazı Hesapla</button>
          </form>
        </div>

        {/* Right: Result */}
        <div style={styles.card}>
          <div style={styles.sectionTitle}>Sonuç & Müddetname</div>
          
          {result ? (
            <div style={styles.resultContainer} className="animate-fade-in">
              <div style={styles.resultMain}>
                <span style={styles.resultMainLabel}>Net Hapis Cezası (Karar)</span>
                <span style={styles.resultMainValue}>{formatDays(result.finalSentenceDays)}</span>
              </div>

              {result.isAdliParaCezasi && (
                <div style={{...styles.infoBox, background: "rgba(16, 185, 129, 0.1)", color: "var(--color-success)", borderColor: "rgba(16, 185, 129, 0.2)"}}>
                  <strong>Bilgi:</strong> Verilen net ceza 1 yıl veya daha az olduğu için hakim takdiriyle Adli Para Cezasına (TCK 50) çevrilebilir.
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                <h4 style={{ fontSize: 13, color: "var(--color-text-tertiary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Karar Aşamaları</h4>
                <div style={styles.resultList}>
                  {result.calculationSteps.map((step, idx) => (
                    <div key={idx} style={styles.resultItem}>
                      <span style={styles.resultItemLabel}>{step.title}</span>
                      <span style={styles.resultItemValue}>{formatDays(step.days)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <h4 style={{ fontSize: 13, color: "var(--color-text-tertiary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>İnfaz (Müddetname) Hesaplaması</h4>
                <div style={styles.resultList}>
                  <div style={styles.resultItem}>
                    <span style={styles.resultItemLabel}>İnfaz Oranı</span>
                    <span style={styles.resultItemValue}>{result.rateText}</span>
                  </div>
                  <div style={styles.resultItem}>
                    <span style={styles.resultItemLabel}>Koşullu Salıverilme Tarihi İçin Yatar</span>
                    <span style={styles.resultItemValue}>{formatDays(result.conditionalReleaseDays)}</span>
                  </div>
                  {parseInt(form.detentionDays) > 0 && (
                    <div style={styles.resultItem}>
                      <span style={styles.resultItemLabel}>Mahsup Edilen Tutukluluk</span>
                      <span style={{...styles.resultItemValue, color: "var(--color-error)"}}>- {form.detentionDays} Gün</span>
                    </div>
                  )}
                  <div style={styles.resultItem}>
                    <span style={styles.resultItemLabel}>Denetimli Serbestlik Süresi</span>
                    <span style={styles.resultItemValue}>{formatDays(result.probationDays)}</span>
                  </div>
                </div>
              </div>

              <div style={{...styles.resultMain, background: "linear-gradient(135deg, #111, #333)", marginTop: 16}}>
                <span style={styles.resultMainLabel}>Kapalı/Açık Cezaevi Yatar Süresi</span>
                <span style={styles.resultMainValue}>{formatDays(result.actualPrisonDays)}</span>
              </div>

            </div>
          ) : (
            <div style={styles.emptyResult}>
              <p>Sonucu görmek için soldaki formu doldurup "Hesapla" butonuna tıklayın.</p>
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
  container: { maxWidth: 960, width: "100%", margin: "0 auto", paddingBottom: 40 },
  header: { marginBottom: 24, borderBottom: "1px solid var(--color-border-subtle)", paddingBottom: 16 },
  title: { fontSize: 22, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 8 },
  desc: { fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.5 },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" },
  card: { background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)", borderRadius: "var(--radius-lg)", padding: 24 },
  sectionTitle: { fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 16, borderBottom: "1px solid var(--color-border-subtle)", paddingBottom: 8 },
  form: { display: "flex", flexDirection: "column", gap: 20 },
  durationGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 },
  inputGroup: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 13, fontWeight: 500, color: "var(--color-text-secondary)" },
  input: { padding: "10px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: 14, color: "var(--color-text-primary)", outline: "none" },
  select: { padding: "10px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-bg)", fontSize: 14, color: "var(--color-text-primary)", outline: "none" },
  calcBtn: { marginTop: 8, padding: "12px", background: "var(--color-text-primary)", color: "var(--color-bg)", border: "none", borderRadius: "var(--radius-md)", fontSize: 15, fontWeight: 600, cursor: "pointer" },
  resultContainer: { display: "flex", flexDirection: "column", gap: 16 },
  resultMain: { background: "linear-gradient(135deg, #1E3A8A, #2563EB)", color: "#fff", padding: 20, borderRadius: "var(--radius-md)", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
  resultMainLabel: { fontSize: 13, fontWeight: 500, opacity: 0.9 },
  resultMainValue: { fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" },
  resultList: { display: "flex", flexDirection: "column", gap: 8 },
  resultItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px dashed var(--color-border-subtle)" },
  resultItemLabel: { fontSize: 13, color: "var(--color-text-secondary)" },
  resultItemValue: { fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" },
  infoBox: { padding: 12, borderRadius: "var(--radius-sm)", fontSize: 13, lineHeight: 1.5, marginTop: 8 },
  emptyResult: { display: "flex", justifyContent: "center", padding: "48px 20px", color: "var(--color-text-tertiary)", textAlign: "center", fontSize: 14 }
};
