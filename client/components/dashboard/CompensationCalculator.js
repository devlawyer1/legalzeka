"use client";

import { useState } from "react";

/* ============================================================
   Emsal Atlası - Tazminat ve Sigorta Hesaplama
   ============================================================ */

export default function CompensationCalculator() {
  const [activeTab, setActiveTab] = useState("destekten_yoksun"); // destekten_yoksun, arac_deger_kaybi, is_goremezlik
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Destekten Yoksun Kalma Formu
  const [dykForm, setDykForm] = useState({
    deceasedAge: "35",
    dependantAge: "10",
    dependantType: "cocuk", // es, cocuk, anne_baba
    monthlyIncome: "20000",
    faultRate: "100" // Kusur Oranı %
  });

  // Araç Değer Kaybı Formu
  const [adkForm, setAdkForm] = useState({
    vehicleValue: "1000000",
    mileage: "50000",
    damageAmount: "50000",
    faultRate: "0" // Kusur Oranı (Karşı tarafın kusuru veya tam tersi. Biz mağdurun zararını hesaplıyoruz. Kendi kusuru %0 ise tam alır)
  });

  // İş Göremezlik Formu
  const [igForm, setIgForm] = useState({
    age: "30",
    monthlyIncome: "20000",
    incapacityRate: "10", // İş göremezlik oranı %
    faultRate: "0" // Kendi kusuru %
  });

  const [result, setResult] = useState(null);

  // Destekten Yoksun Kalma Basit (MVP) Yargıtay / TRH 2010 Yaklaşımı
  const calculateDyk = (e) => {
    e.preventDefault();
    const dAge = parseInt(dykForm.deceasedAge) || 0;
    const depAge = parseInt(dykForm.dependantAge) || 0;
    const income = parseFloat(dykForm.monthlyIncome) || 0;
    const fault = parseFloat(dykForm.faultRate) || 100;

    // Yaşam Süresi Beklentisi (Basitleştirilmiş: TRH 2010 ortalama 78 yaş üzerinden)
    const lifeExpectancy = 78 - dAge;
    if (lifeExpectancy <= 0) {
      showToast("Vefat edenin yaş tahmini yaşam süresini (78) aşmaktadır.");
      return;
    }

    let supportYears = 0;
    let payRate = 0; // Pay oranı (Eş: %50, Çocuk: %25, Anne/Baba: %15)

    if (dykForm.dependantType === "es") {
      supportYears = lifeExpectancy; // Eş ömür boyu destek alır
      payRate = 0.50;
    } else if (dykForm.dependantType === "cocuk") {
      // Erkek çocuk 18, kız 22, okuyan 25'e kadar. Ortalama 22 alıyoruz.
      supportYears = 22 - depAge;
      if (supportYears < 0) supportYears = 0;
      payRate = 0.25;
    } else {
      supportYears = lifeExpectancy;
      payRate = 0.15;
    }

    if (supportYears > lifeExpectancy) supportYears = lifeExpectancy;

    const yearlyIncome = income * 12;
    const totalSupport = yearlyIncome * supportYears * payRate;
    
    // Kusur indirimi
    const faultMultiplier = fault / 100;
    const netCompensation = totalSupport * faultMultiplier;

    setResult({
      type: "dyk",
      supportYears,
      totalSupport,
      netCompensation,
      payRate: payRate * 100,
      faultRate: fault
    });
  };

  // Araç Değer Kaybı (Anayasa Mahkemesi sonrası serbest piyasa - Yargıtay kriterleri yaklaşımı)
  // Basitleştirilmiş formül: Temel Değer Kaybı = Araç Rayiç Değeri * %x + Hasar * %y
  const calculateAdk = (e) => {
    e.preventDefault();
    const val = parseFloat(adkForm.vehicleValue) || 0;
    const km = parseFloat(adkForm.mileage) || 0;
    const damage = parseFloat(adkForm.damageAmount) || 0;
    const fault = parseFloat(adkForm.faultRate) || 0; // Kendi kusuru

    // KM'ye göre değer kaybı çarpanı
    let kmMultiplier = 1;
    if (km < 15000) kmMultiplier = 0.90;
    else if (km < 30000) kmMultiplier = 0.80;
    else if (km < 60000) kmMultiplier = 0.60;
    else if (km < 100000) kmMultiplier = 0.40;
    else if (km < 150000) kmMultiplier = 0.20;
    else kmMultiplier = 0.10;

    // Hasarın büyüklüğü etkisi
    const damageRatio = damage / val;
    let damageMultiplier = damageRatio < 0.05 ? 0.05 : damageRatio > 0.20 ? 0.20 : damageRatio;

    // Tahmini Değer Kaybı
    const baseLoss = val * damageMultiplier * kmMultiplier;
    
    // Kusur Oranı (Kendi kusuru % ise onu düş, kalanını karşı taraftan ister)
    const liabilityMultiplier = (100 - fault) / 100;
    const netLoss = baseLoss * liabilityMultiplier;

    setResult({
      type: "adk",
      baseLoss,
      netLoss,
      kmMultiplier: kmMultiplier * 100,
      liabilityMultiplier: liabilityMultiplier * 100
    });
  };

  // İş Göremezlik (Geçici ve Sürekli)
  const calculateIg = (e) => {
    e.preventDefault();
    const age = parseInt(igForm.age) || 0;
    const income = parseFloat(igForm.monthlyIncome) || 0;
    const incapacity = parseFloat(igForm.incapacityRate) || 0;
    const fault = parseFloat(igForm.faultRate) || 0;

    // Aktif çalışma süresi (65 yaşa kadar)
    let activeYears = 65 - age;
    if (activeYears < 0) activeYears = 0;
    
    // Pasif dönem (65-78 arası yaşlılık/emeklilik dönemi)
    let passiveYears = 78 - Math.max(age, 65);
    if (passiveYears < 0) passiveYears = 0;

    const yearlyIncome = income * 12;
    // Aktif dönem zararı
    const activeLoss = yearlyIncome * activeYears * (incapacity / 100);
    // Pasif dönem zararı (Asgari ücret üzerinden alınır genelde ama basitleştirmek için aynı gelir veya yarısı diyelim)
    const passiveLoss = (yearlyIncome * 0.7) * passiveYears * (incapacity / 100);

    const totalLoss = activeLoss + passiveLoss;
    const liabilityMultiplier = (100 - fault) / 100;
    const netCompensation = totalLoss * liabilityMultiplier;

    setResult({
      type: "ig",
      activeYears,
      passiveYears,
      activeLoss,
      passiveLoss,
      totalLoss,
      netCompensation,
      liabilityMultiplier: liabilityMultiplier * 100
    });
  };

  const formatCurrency = (val) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(val || 0);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Tazminat ve Sigorta Hesaplayıcı</h3>
        <p style={styles.desc}>Destekten Yoksun Kalma, Araç Değer Kaybı ve İş Göremezlik Tazminatları için yaklaşık hesaplamalar.</p>
      </div>

      <div style={styles.tabContainer}>
        <button style={activeTab === "destekten_yoksun" ? styles.activeTab : styles.tab} onClick={() => {setActiveTab("destekten_yoksun"); setResult(null);}}>Destekten Yoksun Kalma</button>
        <button style={activeTab === "arac_deger_kaybi" ? styles.activeTab : styles.tab} onClick={() => {setActiveTab("arac_deger_kaybi"); setResult(null);}}>Araç Değer Kaybı</button>
        <button style={activeTab === "is_goremezlik" ? styles.activeTab : styles.tab} onClick={() => {setActiveTab("is_goremezlik"); setResult(null);}}>İş Göremezlik Tazminatı</button>
      </div>

      <div style={styles.grid}>
        {/* Form Alanı */}
        <div style={styles.card}>
          {activeTab === "destekten_yoksun" && (
            <form onSubmit={calculateDyk} style={styles.form}>
              <div style={styles.inputGroup}><label style={styles.label}>Vefat Edenin Yaşı</label><input type="number" style={styles.input} value={dykForm.deceasedAge} onChange={(e) => setDykForm({...dykForm, deceasedAge: e.target.value})} required /></div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Destek Görenin Yakınlığı</label>
                <select style={styles.select} value={dykForm.dependantType} onChange={(e) => setDykForm({...dykForm, dependantType: e.target.value})}>
                  <option value="es">Eşi</option>
                  <option value="cocuk">Çocuğu</option>
                  <option value="anne_baba">Anne / Babası</option>
                </select>
              </div>
              <div style={styles.inputGroup}><label style={styles.label}>Destek Görenin Yaşı</label><input type="number" style={styles.input} value={dykForm.dependantAge} onChange={(e) => setDykForm({...dykForm, dependantAge: e.target.value})} required /></div>
              <div style={styles.inputGroup}><label style={styles.label}>Aylık Gelir (Net)</label><input type="number" style={styles.input} value={dykForm.monthlyIncome} onChange={(e) => setDykForm({...dykForm, monthlyIncome: e.target.value})} required /></div>
              <div style={styles.inputGroup}><label style={styles.label}>Vefat Edenin Kusur Oranı (%)</label><input type="number" min="0" max="100" style={styles.input} value={dykForm.faultRate} onChange={(e) => setDykForm({...dykForm, faultRate: e.target.value})} /></div>
              <button type="submit" style={styles.calcBtn}>Tazminat Hesapla</button>
            </form>
          )}

          {activeTab === "arac_deger_kaybi" && (
            <form onSubmit={calculateAdk} style={styles.form}>
              <div style={styles.inputGroup}><label style={styles.label}>Aracın Kaza Tarihindeki Rayiç Değeri</label><input type="number" style={styles.input} value={adkForm.vehicleValue} onChange={(e) => setAdkForm({...adkForm, vehicleValue: e.target.value})} required /></div>
              <div style={styles.inputGroup}><label style={styles.label}>Aracın Kilometresi (KM)</label><input type="number" style={styles.input} value={adkForm.mileage} onChange={(e) => setAdkForm({...adkForm, mileage: e.target.value})} required /></div>
              <div style={styles.inputGroup}><label style={styles.label}>Hasar (Onarım) Tutarı</label><input type="number" style={styles.input} value={adkForm.damageAmount} onChange={(e) => setAdkForm({...adkForm, damageAmount: e.target.value})} required /></div>
              <div style={styles.inputGroup}><label style={styles.label}>Kendi Kusur Oranınız (%)</label><input type="number" min="0" max="100" style={styles.input} value={adkForm.faultRate} onChange={(e) => setAdkForm({...adkForm, faultRate: e.target.value})} required /></div>
              <button type="submit" style={styles.calcBtn}>Değer Kaybı Hesapla</button>
            </form>
          )}

          {activeTab === "is_goremezlik" && (
            <form onSubmit={calculateIg} style={styles.form}>
              <div style={styles.inputGroup}><label style={styles.label}>Mağdurun Yaşı</label><input type="number" style={styles.input} value={igForm.age} onChange={(e) => setIgForm({...igForm, age: e.target.value})} required /></div>
              <div style={styles.inputGroup}><label style={styles.label}>Aylık Gelir (Net)</label><input type="number" style={styles.input} value={igForm.monthlyIncome} onChange={(e) => setIgForm({...igForm, monthlyIncome: e.target.value})} required /></div>
              <div style={styles.inputGroup}><label style={styles.label}>Sürekli İş Göremezlik Oranı (%)</label><input type="number" min="0" max="100" style={styles.input} value={igForm.incapacityRate} onChange={(e) => setIgForm({...igForm, incapacityRate: e.target.value})} required /></div>
              <div style={styles.inputGroup}><label style={styles.label}>Kendi Kusur Oranınız (%)</label><input type="number" min="0" max="100" style={styles.input} value={igForm.faultRate} onChange={(e) => setIgForm({...igForm, faultRate: e.target.value})} required /></div>
              <button type="submit" style={styles.calcBtn}>İş Göremezlik Tazminatı Hesapla</button>
            </form>
          )}
        </div>

        {/* Sonuç Alanı */}
        <div style={styles.card}>
          <div style={styles.sectionTitle}>Hesaplama Sonucu</div>
          
          {result ? (
            <div style={styles.resultContainer} className="animate-fade-in">
              <div style={styles.resultMain}>
                <span style={styles.resultMainLabel}>Tahmini Net Tazminat Tutarı</span>
                <span style={styles.resultMainValue}>{formatCurrency(result.netCompensation || result.netLoss)}</span>
              </div>
              
              <div style={styles.resultList}>
                {result.type === "dyk" && (
                  <>
                    <div style={styles.resultItem}><span style={styles.resultItemLabel}>Destek Süresi</span><span style={styles.resultItemValue}>{result.supportYears} Yıl</span></div>
                    <div style={styles.resultItem}><span style={styles.resultItemLabel}>Pay Oranı</span><span style={styles.resultItemValue}>%{result.payRate}</span></div>
                    <div style={styles.resultItem}><span style={styles.resultItemLabel}>Kusur Oranı Çarpanı</span><span style={styles.resultItemValue}>%{result.faultRate}</span></div>
                    <div style={styles.resultItem}><span style={styles.resultItemLabel}>Toplam Brüt Destek</span><span style={styles.resultItemValue}>{formatCurrency(result.totalSupport)}</span></div>
                  </>
                )}
                {result.type === "adk" && (
                  <>
                    <div style={styles.resultItem}><span style={styles.resultItemLabel}>Baz Değer Kaybı</span><span style={styles.resultItemValue}>{formatCurrency(result.baseLoss)}</span></div>
                    <div style={styles.resultItem}><span style={styles.resultItemLabel}>KM Yıpranma Çarpanı</span><span style={styles.resultItemValue}>%{result.kmMultiplier}</span></div>
                    <div style={styles.resultItem}><span style={styles.resultItemLabel}>Sorumluluk (Haklılık) Oranı</span><span style={styles.resultItemValue}>%{result.liabilityMultiplier}</span></div>
                  </>
                )}
                {result.type === "ig" && (
                  <>
                    <div style={styles.resultItem}><span style={styles.resultItemLabel}>Aktif Çalışma Dönemi</span><span style={styles.resultItemValue}>{result.activeYears} Yıl</span></div>
                    <div style={styles.resultItem}><span style={styles.resultItemLabel}>Pasif (Emeklilik) Dönemi</span><span style={styles.resultItemValue}>{result.passiveYears} Yıl</span></div>
                    <div style={styles.resultItem}><span style={styles.resultItemLabel}>Aktif Dönem Kaybı</span><span style={styles.resultItemValue}>{formatCurrency(result.activeLoss)}</span></div>
                    <div style={styles.resultItem}><span style={styles.resultItemLabel}>Pasif Dönem Kaybı</span><span style={styles.resultItemValue}>{formatCurrency(result.passiveLoss)}</span></div>
                    <div style={styles.resultItem}><span style={styles.resultItemLabel}>Sorumluluk Oranı</span><span style={styles.resultItemValue}>%{result.liabilityMultiplier}</span></div>
                  </>
                )}
              </div>

              <div style={styles.infoBox}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" style={{flexShrink: 0}}>
                  <circle cx="10" cy="10" r="9"/>
                  <path d="M10 14V10M10 6h.01"/>
                </svg>
                <p>
                  <strong>Uyarı:</strong> Bu hesaplama yöntemi basitleştirilmiş Yargıtay kriterlerine dayanmaktadır (TRH 2010 yaşam tabloları, lineer aktüerya vs). Gerçek mahkeme veya tahkim komisyonu hesaplamaları, PMF 1931 / TRH 2010 peşin sermaye değeri, progresif rant hesaplaması ve teknik faiz indirimleri ile farklılık gösterebilir.
                </p>
              </div>
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
