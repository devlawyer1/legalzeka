"use client";

import React, { useState, useEffect } from "react";

/* ============================================================
   Emsal Atlası - Labor (Kıdem & İhbar) Calculator Component
   ============================================================ */

export default function LaborCalculator() {
  const [formData, setFormData] = useState({
    startDate: "",
    endDate: "",
    grossSalary: "",
    benefits: "0", // Aylık yan haklar toplamı (yemek, yol vs.)
    unusedVacationDays: "0",
    severanceCeiling: "41828.42", // Default 2024 2. yarıyıl tavanı (Kullanıcı değiştirebilir)
    taxRate: "15", // Gelir Vergisi oranı %
    includeNoticePay: true, // İhbar süresi kullandırılmadıysa tazminat ödenir
  });

  const [results, setResults] = useState(null);

  const calculateLaborDues = () => {
    if (!formData.startDate || !formData.endDate || !formData.grossSalary) {
      return;
    }

    const start = new Date(formData.startDate);
    const end = new Date(formData.endDate);
    
    if (end <= start) {
      alert("İşten ayrılma tarihi, işe başlama tarihinden sonra olmalıdır.");
      return;
    }

    // Tarih farkı hesabı (Yıl, Ay, Gün) - Yargıtay pratiğine uygun
    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();
    let days = end.getDate() - start.getDate();

    if (days < 0) {
      months--;
      // Önceki ayın gün sayısını bul
      const prevMonth = new Date(end.getFullYear(), end.getMonth(), 0).getDate();
      days += prevMonth;
    }
    if (months < 0) {
      years--;
      months += 12;
    }

    const totalDays = Math.floor((end - start) / (1000 * 60 * 60 * 24));
    const totalYearsFraction = totalDays / 365.25; // Tam doğru olmasa da süre aralıkları için yeterli
    
    const grossSalary = parseFloat(formData.grossSalary) || 0;
    const benefits = parseFloat(formData.benefits) || 0;
    const dressedWage = grossSalary + benefits;
    const ceiling = parseFloat(formData.severanceCeiling) || 41828.42;
    const taxRate = parseFloat(formData.taxRate) / 100 || 0.15;
    const unusedDays = parseFloat(formData.unusedVacationDays) || 0;

    // 1. Kıdem Tazminatı
    // Kıdem tazminatına esas ücret, tavanı geçemez.
    const severanceBaseWage = Math.min(dressedWage, ceiling);
    
    // Kıdem tazminatı formülü: (Esas Ücret / 365) * Toplam Gün (veya Yıl + Ay/12 + Gün/365)
    // Standart pratik: Yıl * Ücret + (Ay * Ücret / 12) + (Gün * Ücret / 365)
    let grossSeverance = 0;
    if (years >= 1) {
      grossSeverance = (years * severanceBaseWage) + 
                       ((months * severanceBaseWage) / 12) + 
                       ((days * severanceBaseWage) / 365);
    }

    const severanceStampTax = grossSeverance * 0.00759;
    const netSeverance = grossSeverance - severanceStampTax;

    // 2. İhbar Tazminatı
    let noticeWeeks = 0;
    if (totalYearsFraction < 0.5) noticeWeeks = 2;
    else if (totalYearsFraction >= 0.5 && totalYearsFraction < 1.5) noticeWeeks = 4;
    else if (totalYearsFraction >= 1.5 && totalYearsFraction < 3) noticeWeeks = 6;
    else if (totalYearsFraction >= 3) noticeWeeks = 8;

    const noticeDays = noticeWeeks * 7;
    let grossNotice = 0;
    let noticeIncomeTax = 0;
    let noticeStampTax = 0;
    let netNotice = 0;

    if (formData.includeNoticePay) {
      // İhbar tazminatı giydirilmiş brüt ücret üzerinden (günlük ücret * ihbar günü)
      grossNotice = (dressedWage / 30) * noticeDays;
      noticeIncomeTax = grossNotice * taxRate;
      noticeStampTax = grossNotice * 0.00759;
      netNotice = grossNotice - noticeIncomeTax - noticeStampTax;
    }

    // 3. Yıllık İzin Ücreti
    // Çıplak brüt ücret üzerinden hesaplanır.
    const grossVacation = (grossSalary / 30) * unusedDays;
    // Kesintiler: SGK (%14), İşsizlik (%1), Gelir Vergisi, Damga Vergisi (%0.759)
    const sgkDeduction = grossVacation * 0.14;
    const unemployDeduction = grossVacation * 0.01;
    const incomeTaxBase = grossVacation - sgkDeduction - unemployDeduction;
    const vacationIncomeTax = incomeTaxBase * taxRate;
    const vacationStampTax = grossVacation * 0.00759;
    const netVacation = grossVacation - sgkDeduction - unemployDeduction - vacationIncomeTax - vacationStampTax;

    setResults({
      period: { years, months, days, totalDays },
      severance: {
        base: severanceBaseWage,
        gross: grossSeverance,
        stampTax: severanceStampTax,
        net: netSeverance
      },
      notice: {
        weeks: noticeWeeks,
        days: noticeDays,
        gross: grossNotice,
        incomeTax: noticeIncomeTax,
        stampTax: noticeStampTax,
        net: netNotice
      },
      vacation: {
        gross: grossVacation,
        sgk: sgkDeduction,
        unemploy: unemployDeduction,
        incomeTax: vacationIncomeTax,
        stampTax: vacationStampTax,
        net: netVacation
      },
      totalNet: netSeverance + netNotice + netVacation
    });
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value
    }));
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(val || 0);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Kıdem ve İhbar Tazminatı Hesaplayıcı</h2>
        <p style={styles.subtitle}>Güncel mevzuata ve Yargıtay kararlarına uygun işçi alacağı hesaplaması.</p>
      </div>

      <div style={styles.content}>
        {/* Form Alanı */}
        <div style={styles.formSection}>
          <div style={styles.formGrid}>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>İşe Başlama Tarihi</label>
              <input 
                type="date" 
                name="startDate"
                value={formData.startDate}
                onChange={handleInputChange}
                style={styles.input} 
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>İşten Ayrılma Tarihi</label>
              <input 
                type="date" 
                name="endDate"
                value={formData.endDate}
                onChange={handleInputChange}
                style={styles.input} 
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Aylık Brüt Ücret (Çıplak)</label>
              <div style={styles.inputWrapper}>
                <span style={styles.inputPrefix}>₺</span>
                <input 
                  type="number" 
                  name="grossSalary"
                  value={formData.grossSalary}
                  onChange={handleInputChange}
                  placeholder="0.00"
                  style={{...styles.input, paddingLeft: 30}} 
                />
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Aylık Yan Haklar (Yol, Yemek vb. Brüt)</label>
              <div style={styles.inputWrapper}>
                <span style={styles.inputPrefix}>₺</span>
                <input 
                  type="number" 
                  name="benefits"
                  value={formData.benefits}
                  onChange={handleInputChange}
                  placeholder="0.00"
                  style={{...styles.input, paddingLeft: 30}} 
                />
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Kullanılmayan İzin (Gün)</label>
              <input 
                type="number" 
                name="unusedVacationDays"
                value={formData.unusedVacationDays}
                onChange={handleInputChange}
                placeholder="0"
                style={styles.input} 
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Kıdem Tazminatı Tavanı</label>
              <div style={styles.inputWrapper}>
                <span style={styles.inputPrefix}>₺</span>
                <input 
                  type="number" 
                  name="severanceCeiling"
                  value={formData.severanceCeiling}
                  onChange={handleInputChange}
                  style={{...styles.input, paddingLeft: 30}} 
                />
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Gelir Vergisi Oranı (%)</label>
              <div style={styles.inputWrapper}>
                <span style={styles.inputPrefix}>%</span>
                <input 
                  type="number" 
                  name="taxRate"
                  value={formData.taxRate}
                  onChange={handleInputChange}
                  style={{...styles.input, paddingLeft: 30}} 
                />
              </div>
            </div>
          </div>

          <div style={{...styles.formGroup, marginTop: 16}}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: 'var(--color-text-primary)' }}>
              <input 
                type="checkbox"
                name="includeNoticePay"
                checked={formData.includeNoticePay}
                onChange={handleInputChange}
                style={{ width: 16, height: 16, accentColor: 'var(--color-text-primary)' }}
              />
              İhbar süresi kullandırılmadı (İhbar tazminatı hesapla)
            </label>
          </div>

          <button onClick={calculateLaborDues} style={styles.calcButton}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
              <line x1="8" y1="6" x2="16" y2="6" />
              <line x1="16" y1="14" x2="16" y2="14.01" />
              <line x1="12" y1="14" x2="12" y2="14.01" />
              <line x1="8" y1="14" x2="8" y2="14.01" />
              <line x1="16" y1="18" x2="16" y2="18.01" />
              <line x1="12" y1="18" x2="12" y2="18.01" />
              <line x1="8" y1="18" x2="8" y2="18.01" />
            </svg>
            Hesapla
          </button>
        </div>

        {/* Sonuç Alanı */}
        {results && (
          <div style={styles.resultSection}>
            
            <div style={styles.summaryCard}>
              <div style={styles.summaryTitle}>Toplam Net Alacak</div>
              <div style={styles.summaryValue}>{formatCurrency(results.totalNet)}</div>
              <div style={styles.summarySub}>
                Çalışma Süresi: {results.period.years} Yıl, {results.period.months} Ay, {results.period.days} Gün
              </div>
            </div>

            {/* Kıdem Detayları */}
            <div style={styles.detailCard}>
              <h4 style={styles.detailTitle}>Kıdem Tazminatı Detayı</h4>
              {results.period.years < 1 ? (
                <p style={styles.errorText}>Çalışma süresi 1 yıldan az olduğu için kıdem tazminatına hak kazanılamaz.</p>
              ) : (
                <div style={styles.table}>
                  <div style={styles.tableRow}>
                    <span>Kıdeme Esas Giydirilmiş Brüt</span>
                    <span>{formatCurrency(results.severance.base)}</span>
                  </div>
                  <div style={styles.tableRow}>
                    <span>Brüt Kıdem Tazminatı</span>
                    <span>{formatCurrency(results.severance.gross)}</span>
                  </div>
                  <div style={styles.tableRow}>
                    <span>Damga Vergisi Kesintisi (‰7.59)</span>
                    <span style={styles.deduction}>-{formatCurrency(results.severance.stampTax)}</span>
                  </div>
                  <div style={{...styles.tableRow, ...styles.tableRowBold}}>
                    <span>Net Kıdem Tazminatı</span>
                    <span>{formatCurrency(results.severance.net)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* İhbar Detayları */}
            {formData.includeNoticePay && (
              <div style={styles.detailCard}>
                <h4 style={styles.detailTitle}>İhbar Tazminatı Detayı</h4>
                <div style={styles.table}>
                  <div style={styles.tableRow}>
                    <span>İhbar Süresi</span>
                    <span>{results.notice.weeks} Hafta ({results.notice.days} Gün)</span>
                  </div>
                  <div style={styles.tableRow}>
                    <span>Brüt İhbar Tazminatı</span>
                    <span>{formatCurrency(results.notice.gross)}</span>
                  </div>
                  <div style={styles.tableRow}>
                    <span>Gelir Vergisi Kesintisi (%{formData.taxRate})</span>
                    <span style={styles.deduction}>-{formatCurrency(results.notice.incomeTax)}</span>
                  </div>
                  <div style={styles.tableRow}>
                    <span>Damga Vergisi Kesintisi (‰7.59)</span>
                    <span style={styles.deduction}>-{formatCurrency(results.notice.stampTax)}</span>
                  </div>
                  <div style={{...styles.tableRow, ...styles.tableRowBold}}>
                    <span>Net İhbar Tazminatı</span>
                    <span>{formatCurrency(results.notice.net)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Yıllık İzin Detayları */}
            {parseFloat(formData.unusedVacationDays) > 0 && (
              <div style={styles.detailCard}>
                <h4 style={styles.detailTitle}>Yıllık İzin Ücreti Detayı</h4>
                <div style={styles.table}>
                  <div style={styles.tableRow}>
                    <span>Brüt İzin Ücreti ({formData.unusedVacationDays} Gün)</span>
                    <span>{formatCurrency(results.vacation.gross)}</span>
                  </div>
                  <div style={styles.tableRow}>
                    <span>SGK Kesintisi (%14)</span>
                    <span style={styles.deduction}>-{formatCurrency(results.vacation.sgk)}</span>
                  </div>
                  <div style={styles.tableRow}>
                    <span>İşsizlik Primi (%1)</span>
                    <span style={styles.deduction}>-{formatCurrency(results.vacation.unemploy)}</span>
                  </div>
                  <div style={styles.tableRow}>
                    <span>Gelir Vergisi Kesintisi (%{formData.taxRate})</span>
                    <span style={styles.deduction}>-{formatCurrency(results.vacation.incomeTax)}</span>
                  </div>
                  <div style={styles.tableRow}>
                    <span>Damga Vergisi Kesintisi (‰7.59)</span>
                    <span style={styles.deduction}>-{formatCurrency(results.vacation.stampTax)}</span>
                  </div>
                  <div style={{...styles.tableRow, ...styles.tableRowBold}}>
                    <span>Net İzin Ücreti</span>
                    <span>{formatCurrency(results.vacation.net)}</span>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: 900,
    width: "100%",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 24,
  },
  header: {
    paddingBottom: 16,
    borderBottom: "1px solid var(--color-border)",
  },
  title: {
    fontSize: 24,
    fontWeight: 600,
    color: "var(--color-text-primary)",
    letterSpacing: "-0.02em",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: "var(--color-text-secondary)",
  },
  content: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 24,
  },
  formSection: {
    background: "var(--color-bg-elevated)",
    border: "1px solid var(--color-border-subtle)",
    borderRadius: "var(--radius-md)",
    padding: 24,
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 16,
  },
  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: 500,
    color: "var(--color-text-secondary)",
  },
  inputWrapper: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },
  inputPrefix: {
    position: "absolute",
    left: 12,
    fontSize: 14,
    color: "var(--color-text-tertiary)",
    pointerEvents: "none",
  },
  input: {
    width: "100%",
    height: 40,
    padding: "0 12px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--color-border)",
    background: "var(--color-bg)",
    color: "var(--color-text-primary)",
    fontSize: 14,
    outline: "none",
    transition: "border-color 0.2s",
  },
  calcButton: {
    marginTop: 24,
    width: "100%",
    height: 44,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    background: "var(--color-text-primary)",
    color: "var(--color-bg)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    transition: "opacity 0.2s",
  },
  resultSection: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  summaryCard: {
    background: "linear-gradient(135deg, #111, #333)",
    borderRadius: "var(--radius-md)",
    padding: 24,
    color: "#fff",
    textAlign: "center",
    boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: 500,
    color: "rgba(255,255,255,0.8)",
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 36,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    marginBottom: 8,
  },
  summarySub: {
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
  },
  detailCard: {
    background: "var(--color-bg-elevated)",
    border: "1px solid var(--color-border-subtle)",
    borderRadius: "var(--radius-md)",
    padding: 20,
  },
  detailTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: "var(--color-text-primary)",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: "1px solid var(--color-border-subtle)",
  },
  table: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  tableRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 14,
    color: "var(--color-text-secondary)",
  },
  tableRowBold: {
    fontWeight: 600,
    color: "var(--color-text-primary)",
    paddingTop: 12,
    borderTop: "1px dashed var(--color-border-subtle)",
  },
  deduction: {
    color: "#DC2626",
  },
  errorText: {
    fontSize: 14,
    color: "#DC2626",
    background: "#FEE2E2",
    padding: 12,
    borderRadius: "var(--radius-sm)",
  }
};
