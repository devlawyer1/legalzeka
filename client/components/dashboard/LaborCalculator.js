"use client";

import React, { useState } from "react";

/* ============================================================
   Emsal Atlası - Advanced Labor Calculator Component
   ============================================================ */

export default function LaborCalculator() {
  const [formData, setFormData] = useState({
    startDate: "",
    endDate: "",
    grossSalary: "",
    benefits: "0",
    unusedVacationDays: "0",
    severanceCeiling: "41828.42",
    taxRate: "15",
    includeNoticePay: true,
    overtimeHours: "0",
    ubgtDays: "0",
    weekendDays: "0",
    badFaith: false,
    unionIndemnityMonths: "0",
    nonReinstatementMonths: "0",
    idleTimeMonths: "0"
  });

  const [toast, setToast] = useState(null);
  const showToast = (msg, type = "error") => {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const [results, setResults] = useState(null);

  const calculateLaborDues = () => {
    if (!formData.startDate || !formData.endDate || !formData.grossSalary) {
      showToast("Lütfen işe başlama, işten ayrılma tarihi ve brüt ücret alanlarını doldurun.");
      return;
    }

    const start = new Date(formData.startDate);
    const end = new Date(formData.endDate);
    
    if (end <= start) {
      showToast("İşten ayrılma tarihi, işe başlama tarihinden sonra olmalıdır.");
      return;
    }

    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();
    let days = end.getDate() - start.getDate();

    if (days < 0) {
      months--;
      const prevMonth = new Date(end.getFullYear(), end.getMonth(), 0).getDate();
      days += prevMonth;
    }
    if (months < 0) {
      years--;
      months += 12;
    }

    const totalDays = Math.floor((end - start) / (1000 * 60 * 60 * 24));
    const totalYearsFraction = totalDays / 365.25;
    
    const grossSalary = parseFloat(formData.grossSalary) || 0;
    const benefits = parseFloat(formData.benefits) || 0;
    const dressedWage = grossSalary + benefits;
    const ceiling = parseFloat(formData.severanceCeiling) || 41828.42;
    const taxRate = parseFloat(formData.taxRate) / 100 || 0.15;
    
    const dailyGross = grossSalary / 30;
    const hourlyGross = grossSalary / 225;
    const stampTaxRate = 0.00759;

    // 1. Kıdem Tazminatı
    const severanceBaseWage = Math.min(dressedWage, ceiling);
    let grossSeverance = 0;
    if (years >= 1) {
      grossSeverance = (years * severanceBaseWage) + ((months * severanceBaseWage) / 12) + ((days * severanceBaseWage) / 365);
    }
    const severanceStampTax = grossSeverance * stampTaxRate;
    const netSeverance = grossSeverance - severanceStampTax;

    // 2. İhbar Tazminatı
    let noticeWeeks = 0;
    if (totalYearsFraction < 0.5) noticeWeeks = 2;
    else if (totalYearsFraction >= 0.5 && totalYearsFraction < 1.5) noticeWeeks = 4;
    else if (totalYearsFraction >= 1.5 && totalYearsFraction < 3) noticeWeeks = 6;
    else if (totalYearsFraction >= 3) noticeWeeks = 8;

    const noticeDays = noticeWeeks * 7;
    let grossNotice = 0, noticeIncomeTax = 0, noticeStampTax = 0, netNotice = 0;
    if (formData.includeNoticePay) {
      grossNotice = (dressedWage / 30) * noticeDays;
      noticeIncomeTax = grossNotice * taxRate;
      noticeStampTax = grossNotice * stampTaxRate;
      netNotice = grossNotice - noticeIncomeTax - noticeStampTax;
    }

    // 3. Yıllık İzin Ücreti
    const unusedDays = parseFloat(formData.unusedVacationDays) || 0;
    const grossVacation = dailyGross * unusedDays;
    const { net: netVacation, sgk: vacSgk, unemploy: vacUnemploy, it: vacIt, st: vacSt } = calculateWageDeductions(grossVacation, taxRate);

    // 4. Fazla Mesai
    const otHours = parseFloat(formData.overtimeHours) || 0;
    const grossOT = otHours * (hourlyGross * 1.5);
    const { net: netOT, sgk: otSgk, unemploy: otUnemploy, it: otIt, st: otSt } = calculateWageDeductions(grossOT, taxRate);

    // 5. UBGT Ücreti
    const ubgtDays = parseFloat(formData.ubgtDays) || 0;
    const grossUbgt = ubgtDays * dailyGross;
    const { net: netUbgt, sgk: ubgtSgk, unemploy: ubgtUnemploy, it: ubgtIt, st: ubgtSt } = calculateWageDeductions(grossUbgt, taxRate);

    // 6. Hafta Tatili Ücreti
    const weekendDays = parseFloat(formData.weekendDays) || 0;
    const grossWeekend = weekendDays * (dailyGross * 1.5);
    const { net: netWeekend, sgk: wkSgk, unemploy: wkUnemploy, it: wkIt, st: wkSt } = calculateWageDeductions(grossWeekend, taxRate);

    // 7. Kötüniyet Tazminatı (İhbar süresinin 3 katı, çıplak brüt üzerinden)
    let grossBadFaith = 0, netBadFaith = 0, bfIt = 0, bfSt = 0;
    if (formData.badFaith) {
      grossBadFaith = (dailyGross * noticeDays) * 3;
      bfIt = grossBadFaith * taxRate;
      bfSt = grossBadFaith * stampTaxRate;
      netBadFaith = grossBadFaith - bfIt - bfSt;
    }

    // 8. Sendikal Tazminat (Sadece Damga Vergisi kesilir)
    const unionMonths = parseFloat(formData.unionIndemnityMonths) || 0;
    let grossUnion = unionMonths * grossSalary;
    let unionSt = grossUnion * stampTaxRate;
    let netUnion = grossUnion - unionSt;

    // 9. İşe Başlatmama Tazminatı (Sadece Damga Vergisi kesilir)
    const nonReinstatementM = parseFloat(formData.nonReinstatementMonths) || 0;
    let grossNonReinstatement = nonReinstatementM * grossSalary;
    let nonReinstatementSt = grossNonReinstatement * stampTaxRate;
    let netNonReinstatement = grossNonReinstatement - nonReinstatementSt;

    // 10. Boşta Geçen Süre Ücreti (En çok 4 ay, giydirilmiş brüt)
    const idleM = parseFloat(formData.idleTimeMonths) || 0;
    let grossIdle = idleM * dressedWage;
    const { net: netIdle, sgk: idleSgk, unemploy: idleUnemploy, it: idleIt, st: idleSt } = calculateWageDeductions(grossIdle, taxRate);

    setResults({
      period: { years, months, days, totalDays },
      severance: { base: severanceBaseWage, gross: grossSeverance, stampTax: severanceStampTax, net: netSeverance },
      notice: { weeks: noticeWeeks, days: noticeDays, gross: grossNotice, incomeTax: noticeIncomeTax, stampTax: noticeStampTax, net: netNotice },
      vacation: { gross: grossVacation, sgk: vacSgk, unemploy: vacUnemploy, incomeTax: vacIt, stampTax: vacSt, net: netVacation },
      overtime: { gross: grossOT, net: netOT },
      ubgt: { gross: grossUbgt, net: netUbgt },
      weekend: { gross: grossWeekend, net: netWeekend },
      badFaith: { gross: grossBadFaith, net: netBadFaith },
      union: { gross: grossUnion, net: netUnion },
      nonReinstatement: { gross: grossNonReinstatement, net: netNonReinstatement },
      idleTime: { gross: grossIdle, net: netIdle },
      totalNet: netSeverance + netNotice + netVacation + netOT + netUbgt + netWeekend + netBadFaith + netUnion + netNonReinstatement + netIdle
    });
  };

  const calculateWageDeductions = (gross, taxRate) => {
    if (gross <= 0) return { net: 0, sgk: 0, unemploy: 0, it: 0, st: 0 };
    const sgk = gross * 0.14;
    const unemploy = gross * 0.01;
    const base = gross - sgk - unemploy;
    const it = base * taxRate;
    const st = gross * 0.00759;
    return { net: gross - sgk - unemploy - it - st, sgk, unemploy, it, st };
  };

  const getCeilingForDate = (dateStr) => {
    if (!dateStr) return "41828.42";
    const d = new Date(dateStr);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    if (year === 2024) return month <= 6 ? "35058.58" : "41828.42";
    if (year === 2023) return month <= 6 ? "19982.83" : "23489.83";
    if (year === 2022) return month <= 6 ? "10848.59" : "15371.40";
    return "41828.42"; // Default fallback
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => {
      const updated = {
        ...prev,
        [name]: type === "checkbox" ? checked : value
      };
      
      // Auto-update severance ceiling when endDate changes
      if (name === "endDate") {
        updated.severanceCeiling = getCeilingForDate(value);
      }
      
      return updated;
    });
  };

  const formatCurrency = (val) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(val || 0);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>İş ve Tazminat Hesaplayıcı (Gelişmiş)</h2>
        <p style={styles.subtitle}>Kıdem, İhbar, Fazla Mesai, UBGT, Sendikal Tazminat, İşe Başlatmama ve daha fazlası.</p>
      </div>

      <div style={styles.content}>
        <div style={styles.formSection}>
          <div style={styles.formGrid}>
            <div style={styles.formGroup}><label style={styles.label}>İşe Başlama Tarihi</label><input type="date" name="startDate" value={formData.startDate} onChange={handleInputChange} style={styles.input} /></div>
            <div style={styles.formGroup}><label style={styles.label}>İşten Ayrılma Tarihi</label><input type="date" name="endDate" value={formData.endDate} onChange={handleInputChange} style={styles.input} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Aylık Brüt Ücret</label><div style={styles.inputWrapper}><span style={styles.inputPrefix}>₺</span><input type="number" name="grossSalary" value={formData.grossSalary} onChange={handleInputChange} style={{...styles.input, paddingLeft: 30}} /></div></div>
            <div style={styles.formGroup}><label style={styles.label}>Yan Haklar (Aylık Brüt)</label><div style={styles.inputWrapper}><span style={styles.inputPrefix}>₺</span><input type="number" name="benefits" value={formData.benefits} onChange={handleInputChange} style={{...styles.input, paddingLeft: 30}} /></div></div>
            <div style={styles.formGroup}><label style={styles.label}>Kullanılmayan İzin (Gün)</label><input type="number" name="unusedVacationDays" value={formData.unusedVacationDays} onChange={handleInputChange} style={styles.input} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Kıdem Tavanı</label><div style={styles.inputWrapper}><span style={styles.inputPrefix}>₺</span><input type="number" name="severanceCeiling" value={formData.severanceCeiling} onChange={handleInputChange} style={{...styles.input, paddingLeft: 30}} /></div></div>
            <div style={styles.formGroup}><label style={styles.label}>Gelir Vergisi (%)</label><input type="number" name="taxRate" value={formData.taxRate} onChange={handleInputChange} style={styles.input} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Toplam Fazla Mesai (Saat)</label><input type="number" name="overtimeHours" value={formData.overtimeHours} onChange={handleInputChange} style={styles.input} /></div>
            <div style={styles.formGroup}><label style={styles.label}>UBGT Çalışması (Gün)</label><input type="number" name="ubgtDays" value={formData.ubgtDays} onChange={handleInputChange} style={styles.input} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Hafta Tatili Çalışması (Gün)</label><input type="number" name="weekendDays" value={formData.weekendDays} onChange={handleInputChange} style={styles.input} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Sendikal Tazminat (Ay)</label><input type="number" name="unionIndemnityMonths" value={formData.unionIndemnityMonths} onChange={handleInputChange} style={styles.input} /></div>
            <div style={styles.formGroup}><label style={styles.label}>İşe Başlatmama Taz. (Ay)</label><select name="nonReinstatementMonths" value={formData.nonReinstatementMonths} onChange={handleInputChange} style={styles.input}><option value="0">Yok</option><option value="4">4 Ay</option><option value="5">5 Ay</option><option value="6">6 Ay</option><option value="7">7 Ay</option><option value="8">8 Ay</option></select></div>
            <div style={styles.formGroup}><label style={styles.label}>Boşta Geçen Süre (Ay)</label><select name="idleTimeMonths" value={formData.idleTimeMonths} onChange={handleInputChange} style={styles.input}><option value="0">Yok</option><option value="1">1 Ay</option><option value="2">2 Ay</option><option value="3">3 Ay</option><option value="4">4 Ay</option></select></div>
          </div>
          
          <div style={{display: "flex", gap: 20, marginTop: 16}}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}><input type="checkbox" name="includeNoticePay" checked={formData.includeNoticePay} onChange={handleInputChange} /> İhbar Tazminatı Hesapla</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}><input type="checkbox" name="badFaith" checked={formData.badFaith} onChange={handleInputChange} /> Kötüniyet Tazminatı</label>
          </div>

          <button onClick={calculateLaborDues} style={styles.calcButton}>Hesapla</button>
        </div>

        {results && (
          <div style={styles.resultSection}>
            <div style={styles.summaryCard}>
              <div style={styles.summaryTitle}>Toplam Net Alacak</div>
              <div style={styles.summaryValue}>{formatCurrency(results.totalNet)}</div>
              <div style={styles.summarySub}>Çalışma Süresi: {results.period.years} Yıl, {results.period.months} Ay, {results.period.days} Gün</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {results.severance.gross > 0 && <ResultCard title="Kıdem Tazminatı" gross={results.severance.gross} net={results.severance.net} />}
              {results.notice.gross > 0 && <ResultCard title={`İhbar Tazminatı (${results.notice.weeks} Hafta)`} gross={results.notice.gross} net={results.notice.net} />}
              {results.vacation.gross > 0 && <ResultCard title={`Yıllık İzin (${formData.unusedVacationDays} Gün)`} gross={results.vacation.gross} net={results.vacation.net} />}
              {results.overtime.gross > 0 && <ResultCard title="Fazla Mesai Ücreti" gross={results.overtime.gross} net={results.overtime.net} />}
              {results.ubgt.gross > 0 && <ResultCard title="UBGT Ücreti" gross={results.ubgt.gross} net={results.ubgt.net} />}
              {results.weekend.gross > 0 && <ResultCard title="Hafta Tatili Ücreti" gross={results.weekend.gross} net={results.weekend.net} />}
              {results.badFaith.gross > 0 && <ResultCard title="Kötüniyet Tazminatı" gross={results.badFaith.gross} net={results.badFaith.net} />}
              {results.union.gross > 0 && <ResultCard title={`Sendikal Tazminat (${formData.unionIndemnityMonths} Ay)`} gross={results.union.gross} net={results.union.net} />}
              {results.nonReinstatement.gross > 0 && <ResultCard title={`İşe Başlatmama Taz. (${formData.nonReinstatementMonths} Ay)`} gross={results.nonReinstatement.gross} net={results.nonReinstatement.net} />}
              {results.idleTime.gross > 0 && <ResultCard title={`Boşta Geçen Süre Ücreti (${formData.idleTimeMonths} Ay)`} gross={results.idleTime.gross} net={results.idleTime.net} />}
            </div>
          </div>
        )}
      </div>

      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24,
          background: toast.type === "success" ? "var(--color-success)" : "var(--color-error)",
          color: "#fff", padding: "12px 24px", borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-lg)", fontSize: 14, fontWeight: 500, zIndex: 9999,
          animation: "slideIn 0.3s ease-out"
        }}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

const ResultCard = ({ title, gross, net }) => (
  <div style={styles.detailCard}>
    <h4 style={styles.detailTitle}>{title}</h4>
    <div style={styles.table}>
      <div style={styles.tableRow}><span>Brüt Tutar:</span><span>{new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(gross)}</span></div>
      <div style={{...styles.tableRow, ...styles.tableRowBold}}><span>Net Tutar:</span><span>{new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(net)}</span></div>
    </div>
  </div>
);

const styles = {
  container: { maxWidth: 900, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 },
  header: { paddingBottom: 16, borderBottom: "1px solid var(--color-border)" },
  title: { fontSize: 24, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 6 },
  subtitle: { fontSize: 14, color: "var(--color-text-secondary)" },
  content: { display: "grid", gridTemplateColumns: "1fr", gap: 24 },
  formSection: { background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)", borderRadius: "var(--radius-md)", padding: 24 },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 },
  formGroup: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 13, fontWeight: 500, color: "var(--color-text-secondary)" },
  inputWrapper: { position: "relative", display: "flex", alignItems: "center" },
  inputPrefix: { position: "absolute", left: 12, fontSize: 14, color: "var(--color-text-tertiary)", pointerEvents: "none" },
  input: { width: "100%", height: 40, padding: "0 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-primary)", fontSize: 14, outline: "none" },
  calcButton: { marginTop: 24, width: "100%", height: 44, background: "var(--color-text-primary)", color: "var(--color-bg)", border: "none", borderRadius: "var(--radius-sm)", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  resultSection: { display: "flex", flexDirection: "column", gap: 16 },
  summaryCard: { background: "linear-gradient(135deg, #111, #333)", borderRadius: "var(--radius-md)", padding: 24, color: "#fff", textAlign: "center" },
  summaryTitle: { fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.8)", marginBottom: 8 },
  summaryValue: { fontSize: 36, fontWeight: 700, marginBottom: 8 },
  summarySub: { fontSize: 13, color: "rgba(255,255,255,0.7)" },
  detailCard: { background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)", borderRadius: "var(--radius-md)", padding: 16 },
  detailTitle: { fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid var(--color-border-subtle)" },
  table: { display: "flex", flexDirection: "column", gap: 8 },
  tableRow: { display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--color-text-secondary)" },
  tableRowBold: { fontWeight: 600, color: "var(--color-text-primary)", paddingTop: 8, borderTop: "1px dashed var(--color-border-subtle)" }
};
