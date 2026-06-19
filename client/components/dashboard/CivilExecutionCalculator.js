"use client";

import React, { useState } from "react";

/* ============================================================
   Emsal Atlası - Civil Execution (İcra) Calculator Component
   ============================================================ */

export default function CivilExecutionCalculator() {
  const [formData, setFormData] = useState({
    principalAmount: "",
    defaultDate: "",
    paymentDate: "",
    interestRate: "9",
    interestType: "yasal",
    hasLawyer: true,
    includePrisonFee: true,
    collectionFeeRate: "4.55", // %4.55 hacizden önce vb.
    applicationFee: "427.60",
    advanceFeePaid: false
  });

  const [toast, setToast] = useState(null);
  const showToast = (msg, type = "error") => {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const [results, setResults] = useState(null);

  const calculateExecution = () => {
    if (!formData.principalAmount || !formData.defaultDate || !formData.paymentDate) {
      showToast("Lütfen asıl alacak, temerrüt ve ödeme tarihlerini giriniz.");
      return;
    }

    const start = new Date(formData.defaultDate);
    const end = new Date(formData.paymentDate);
    
    if (end <= start) {
      showToast("Ödeme/Kapak tarihi, temerrüt tarihinden sonra olmalıdır.");
      return;
    }

    const days = Math.floor((end - start) / (1000 * 60 * 60 * 24));
    const principal = parseFloat(formData.principalAmount) || 0;
    const rate = parseFloat(formData.interestRate) || 0;
    
    // 1. İşlemiş Faiz
    const totalInterest = (principal * rate * days) / 36500;
    const executionBase = principal + totalInterest;

    // 2. İcra Vekalet Ücreti (2024 AAÜT Basitleştirilmiş - ilk dilim %16, asgari maktu 4.000)
    let lawyerFee = 0;
    if (formData.hasLawyer) {
      lawyerFee = executionBase * 0.16;
      if (lawyerFee < 4000) lawyerFee = 4000;
    }

    // 3. Harçlar
    const appFee = parseFloat(formData.applicationFee) || 0;
    let advanceFee = 0;
    if (!formData.advanceFeePaid) {
      advanceFee = executionBase * 0.005; // binde 5
    }

    const collFeeRate = parseFloat(formData.collectionFeeRate) / 100;
    const collectionFee = executionBase * collFeeRate;
    
    const prisonFee = formData.includePrisonFee ? (principal * 0.02) : 0; // %2

    const totalFees = appFee + advanceFee + collectionFee + prisonFee;
    const totalDebt = executionBase + lawyerFee + totalFees;

    setResults({
      days,
      principal,
      totalInterest,
      executionBase,
      lawyerFee,
      appFee,
      advanceFee,
      collectionFee,
      prisonFee,
      totalFees,
      totalDebt
    });
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    let newVal = type === "checkbox" ? checked : value;
    
    if (name === "interestType") {
      setFormData(prev => ({
        ...prev,
        [name]: newVal,
        interestRate: newVal === "yasal" ? "24" : newVal === "avans" ? "50.75" : "24"
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: newVal
      }));
    }
  };

  const formatCurrency = (val) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(val || 0);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>İcra Dosyası Kapak & Faiz Hesaplayıcı</h2>
        <p style={styles.subtitle}>Takip öncesi ve sonrası faiz, harçlar, cezaevi harcı ve vekalet ücreti detaylı hesabı.</p>
      </div>

      <div style={styles.content}>
        <div style={styles.formSection}>
          <div style={styles.formGrid}>
            <div style={styles.formGroup}><label style={styles.label}>Asıl Alacak Tutarı</label><div style={styles.inputWrapper}><span style={styles.inputPrefix}>₺</span><input type="number" name="principalAmount" value={formData.principalAmount} onChange={handleInputChange} style={{...styles.input, paddingLeft: 30}} /></div></div>
            <div style={styles.formGroup}><label style={styles.label}>Temerrüt / Takip Tarihi</label><input type="date" name="defaultDate" value={formData.defaultDate} onChange={handleInputChange} style={styles.input} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Ödeme / Kapak Tarihi</label><input type="date" name="paymentDate" value={formData.paymentDate} onChange={handleInputChange} style={styles.input} /></div>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Faiz Türü</label>
              <select name="interestType" value={formData.interestType} onChange={handleInputChange} style={styles.input}>
                <option value="yasal">Yasal Faiz (%24)</option>
                <option value="avans">Avans / Ticari Temerrüt (%50.75)</option>
                <option value="custom">Özel Oran</option>
              </select>
            </div>
            
            <div style={styles.formGroup}><label style={styles.label}>Uygulanacak Faiz Oranı (%)</label><input type="number" name="interestRate" value={formData.interestRate} onChange={handleInputChange} disabled={formData.interestType !== "custom"} style={styles.input} /></div>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Tahsil Harcı Oranı</label>
              <select name="collectionFeeRate" value={formData.collectionFeeRate} onChange={handleInputChange} style={styles.input}>
                <option value="4.55">Hacizden Önce (%4.55)</option>
                <option value="9.10">Hacizden Sonra (%9.10)</option>
                <option value="11.38">Satıştan Sonra (%11.38)</option>
              </select>
            </div>
            
            <div style={styles.formGroup}><label style={styles.label}>Başvurma Harcı (Maktu)</label><input type="number" name="applicationFee" value={formData.applicationFee} onChange={handleInputChange} style={styles.input} /></div>
          </div>
          
          <div style={{display: "flex", flexWrap: "wrap", gap: 20, marginTop: 16}}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}><input type="checkbox" name="hasLawyer" checked={formData.hasLawyer} onChange={handleInputChange} /> İcra Vekalet Ücreti Hesaplansın</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}><input type="checkbox" name="includePrisonFee" checked={formData.includePrisonFee} onChange={handleInputChange} /> Cezaevi Harcı (%2)</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}><input type="checkbox" name="advanceFeePaid" checked={formData.advanceFeePaid} onChange={handleInputChange} /> Peşin Harç Yatırıldı</label>
          </div>

          <button onClick={calculateExecution} style={styles.calcButton}>Kapak Hesabını Oluştur</button>
        </div>

        {results && (
          <div style={styles.resultSection}>
            <div style={styles.summaryCard}>
              <div style={styles.summaryTitle}>Toplam Ödenecek Kapak Tutarı</div>
              <div style={styles.summaryValue}>{formatCurrency(results.totalDebt)}</div>
              <div style={styles.summarySub}>Gecikme Süresi: {results.days} Gün</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              
              <div style={styles.detailCard}>
                <h4 style={styles.detailTitle}>Alacak ve Faiz Detayı</h4>
                <div style={styles.table}>
                  <div style={styles.tableRow}><span>Asıl Alacak</span><span>{formatCurrency(results.principal)}</span></div>
                  <div style={styles.tableRow}><span>İşlemiş Faiz ({results.days} gün)</span><span>{formatCurrency(results.totalInterest)}</span></div>
                  <div style={{...styles.tableRow, ...styles.tableRowBold}}><span>Takip / Tahsil Matrahı</span><span>{formatCurrency(results.executionBase)}</span></div>
                </div>
              </div>

              <div style={styles.detailCard}>
                <h4 style={styles.detailTitle}>Harçlar ve Masraflar</h4>
                <div style={styles.table}>
                  <div style={styles.tableRow}><span>Başvurma Harcı</span><span>{formatCurrency(results.appFee)}</span></div>
                  {!formData.advanceFeePaid && <div style={styles.tableRow}><span>Peşin Harç (Binde 5)</span><span>{formatCurrency(results.advanceFee)}</span></div>}
                  <div style={styles.tableRow}><span>Tahsil Harcı (%{formData.collectionFeeRate})</span><span>{formatCurrency(results.collectionFee)}</span></div>
                  {formData.includePrisonFee && <div style={styles.tableRow}><span>Cezaevi Harcı (%2)</span><span>{formatCurrency(results.prisonFee)}</span></div>}
                  <div style={{...styles.tableRow, ...styles.tableRowBold}}><span>Toplam Harç</span><span>{formatCurrency(results.totalFees)}</span></div>
                </div>
              </div>

              {formData.hasLawyer && (
                <div style={styles.detailCard}>
                  <h4 style={styles.detailTitle}>İcra Vekalet Ücreti</h4>
                  <div style={styles.table}>
                    <div style={styles.tableRow}><span>Vekalet Ücreti (AAÜT)</span><span>{formatCurrency(results.lawyerFee)}</span></div>
                  </div>
                </div>
              )}

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
  summaryCard: { background: "linear-gradient(135deg, #0f172a, #1e293b)", borderRadius: "var(--radius-md)", padding: 24, color: "#fff", textAlign: "center" },
  summaryTitle: { fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.8)", marginBottom: 8 },
  summaryValue: { fontSize: 36, fontWeight: 700, marginBottom: 8 },
  summarySub: { fontSize: 13, color: "rgba(255,255,255,0.7)" },
  detailCard: { background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)", borderRadius: "var(--radius-md)", padding: 16 },
  detailTitle: { fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid var(--color-border-subtle)" },
  table: { display: "flex", flexDirection: "column", gap: 8 },
  tableRow: { display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--color-text-secondary)" },
  tableRowBold: { fontWeight: 600, color: "var(--color-text-primary)", paddingTop: 8, borderTop: "1px dashed var(--color-border-subtle)" }
};
