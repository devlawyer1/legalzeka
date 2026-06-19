"use client";

import { useState } from "react";

/* ============================================================
   Emsal Atlası - Harç ve Vekalet Ücreti Hesaplama
   Güncel AAÜT ve Harçlar Kanunu verileriyle çalışır.
   ============================================================ */

export default function FeeCalculator() {
  const [form, setForm] = useState({
    calcType: "vekalet", // vekalet, harc
    courtType: "asliye", // asliye, sulh, icra, idare, tuketici
    amount: "", // Dava değeri (TL)
    partyCount: 2, // Davalı/Davacı taraf sayısı (Gider avansı için)
  });

  const [toast, setToast] = useState(null);

  const showToast = (message, type = "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const [result, setResult] = useState(null);

  const calculate = (e) => {
    e.preventDefault();
    const amountVal = parseFloat(form.amount) || 0;

    if (amountVal < 0) {
      showToast("Dava değeri negatif olamaz.");
      return;
    }

    if (form.calcType === "vekalet") {
      let maktu = 0;
      let nispi = 0;

      // 2024 Eylül - 2025 Güncel Tahmini Maktu Vekalet Ücretleri
      switch (form.courtType) {
        case "sulh": maktu = 18000; break;
        case "asliye": maktu = 30000; break;
        case "idare": maktu = 30000; break;
        case "tuketici": maktu = 15000; break;
        case "icra": maktu = 8000; break;
        default: maktu = 30000;
      }

      if (amountVal > 0) {
        // Kademeli Nispi Vekalet Ücreti Hesaplama (Güncel AAÜT Yaklaşık)
        let remaining = amountVal;
        
        const tiers = [
          { limit: 200000, rate: 0.16 },
          { limit: 200000, rate: 0.15 },
          { limit: 400000, rate: 0.14 },
          { limit: 600000, rate: 0.11 },
          { limit: 800000, rate: 0.08 },
          { limit: 1000000, rate: 0.05 },
          { limit: 1000000, rate: 0.03 },
          { limit: 1000000, rate: 0.02 },
          { limit: Infinity, rate: 0.01 }
        ];

        for (const tier of tiers) {
          if (remaining > 0) {
            const amountInTier = Math.min(remaining, tier.limit);
            nispi += amountInTier * tier.rate;
            remaining -= amountInTier;
          } else {
            break;
          }
        }
      }

      // Karşı taraf vekalet ücreti maktunun altında kalamaz (genel kural)
      // Tabi dava değerinin kendisini de geçemez ama basit tutuyoruz.
      let finalFee = Math.max(maktu, nispi);
      if (amountVal > 0 && finalFee > amountVal) {
          finalFee = amountVal; // Dava değerini geçemez istisnası (örneğin kısmi kabul/ret durumları hariç genel kural)
      }

      setResult({
        type: "vekalet",
        maktu: maktu,
        nispi: nispi,
        finalFee: finalFee,
        amount: amountVal
      });

    } else {
      // Harç ve Masraf Hesaplama
      // Başvurma Harcı (Ortalama)
      const basvurmaHarci = 427.60;
      
      // Nispi Harç (Binde 68.31, 1/4'ü peşin)
      let pesinHarc = 0;
      let maktuHarc = 427.60; // Dava konusu para değilse maktu harç
      
      if (amountVal > 0) {
        pesinHarc = amountVal * 0.06831 * 0.25;
      }

      // Gider Avansı (Taraf sayısı * tebligat + posta + bilirkişi vs. avansı)
      // Standart 2 taraf için ortalama 1500-2500 TL civarı
      const tebligatGideri = form.partyCount * 140; // 140 TL güncel tebligat
      const digerGiderler = 1500; // Keşif, bilirkişi öncesi temel avans
      const giderAvansi = tebligatGideri + digerGiderler;

      let totalMasraf = basvurmaHarci + (amountVal > 0 ? pesinHarc : maktuHarc) + giderAvansi;

      setResult({
        type: "harc",
        basvurmaHarci: basvurmaHarci,
        pesinHarc: amountVal > 0 ? pesinHarc : maktuHarc,
        giderAvansi: giderAvansi,
        totalMasraf: totalMasraf,
        amount: amountVal
      });
    }
  };

  const formatTL = (val) => {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(val);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Harç & Vekalet Ücreti Hesaplama</h3>
        <p style={styles.desc}>
          Güncel Avukatlık Asgari Ücret Tarifesi (AAÜT) ve Harçlar Kanunu çerçevesinde dava masraflarını ve karşı taraf vekalet ücretlerini hesaplayın.
        </p>
      </div>

      <div style={styles.grid}>
        {/* Left: Form */}
        <div style={styles.card}>
          <form onSubmit={calculate} style={styles.form}>
            
            <div style={styles.sectionTitle}>Hesaplama Türü</div>
            <div style={styles.inputGroup}>
              <select 
                style={styles.select}
                value={form.calcType}
                onChange={(e) => {
                  setForm({...form, calcType: e.target.value});
                  setResult(null);
                }}
              >
                <option value="vekalet">Karşı Taraf Vekalet Ücreti Hesapla</option>
                <option value="harc">Dava Açılış Harç ve Masrafı Hesapla</option>
              </select>
            </div>

            <div style={styles.sectionTitle}>Dosya Detayları</div>
            
            <div style={styles.inputGroup}>
              <label style={styles.label}>Mahkeme / İşlem Türü</label>
              <select 
                style={styles.select}
                value={form.courtType}
                onChange={(e) => setForm({...form, courtType: e.target.value})}
              >
                <option value="asliye">Asliye Hukuk Mahkemesi</option>
                <option value="sulh">Sulh Hukuk Mahkemesi</option>
                <option value="tuketici">Tüketici Mahkemesi</option>
                <option value="icra">İcra Takibi</option>
                <option value="idare">İdare Mahkemesi</option>
              </select>
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>Dava / Takip Değeri (TL) - İsteğe Bağlı</label>
              <input 
                type="number" 
                min="0"
                step="0.01"
                style={styles.input}
                value={form.amount}
                onChange={(e) => setForm({...form, amount: e.target.value})}
                placeholder="Örn: 500000"
              />
              <span style={{fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4}}>
                * Maktu hesaplama yapmak istiyorsanız boş bırakın.
              </span>
            </div>

            {form.calcType === "harc" && (
              <div style={styles.inputGroup}>
                <label style={styles.label}>Taraf Sayısı (Davacı + Davalılar)</label>
                <input 
                  type="number" 
                  min="2"
                  max="50"
                  style={styles.input}
                  value={form.partyCount}
                  onChange={(e) => setForm({...form, partyCount: parseInt(e.target.value) || 2})}
                />
              </div>
            )}

            <button type="submit" style={styles.calcBtn}>Hesapla</button>
          </form>
        </div>

        {/* Right: Result */}
        <div style={styles.card}>
          <div style={styles.sectionTitle}>Hesaplama Sonucu</div>
          
          {result ? (
            <div style={styles.resultContainer} className="animate-fade-in">
              {result.type === "vekalet" ? (
                <>
                  <div style={styles.resultMain}>
                    <span style={styles.resultMainLabel}>Hükmedilecek Vekalet Ücreti</span>
                    <span style={styles.resultMainValue}>{formatTL(result.finalFee)}</span>
                  </div>
                  
                  <div style={styles.resultList}>
                    <div style={styles.resultItem}>
                      <span style={styles.resultItemLabel}>Dava / Takip Değeri</span>
                      <span style={styles.resultItemValue}>{result.amount > 0 ? formatTL(result.amount) : "Belirtilmedi"}</span>
                    </div>
                    <div style={styles.resultItem}>
                      <span style={styles.resultItemLabel}>Asgari Maktu Ücret</span>
                      <span style={styles.resultItemValue}>{formatTL(result.maktu)}</span>
                    </div>
                    {result.amount > 0 && (
                      <div style={styles.resultItem}>
                        <span style={styles.resultItemLabel}>Hesaplanan Nispi Ücret</span>
                        <span style={styles.resultItemValue}>{formatTL(result.nispi)}</span>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div style={styles.resultMain}>
                    <span style={styles.resultMainLabel}>Toplam Dava Açılış Masrafı</span>
                    <span style={styles.resultMainValue}>{formatTL(result.totalMasraf)}</span>
                  </div>
                  
                  <div style={styles.resultList}>
                    <div style={styles.resultItem}>
                      <span style={styles.resultItemLabel}>Dava Değeri</span>
                      <span style={styles.resultItemValue}>{result.amount > 0 ? formatTL(result.amount) : "Belirtilmedi"}</span>
                    </div>
                    <div style={styles.resultItem}>
                      <span style={styles.resultItemLabel}>Başvurma Harcı</span>
                      <span style={styles.resultItemValue}>{formatTL(result.basvurmaHarci)}</span>
                    </div>
                    <div style={styles.resultItem}>
                      <span style={styles.resultItemLabel}>{result.amount > 0 ? "Peşin Harç (1/4)" : "Maktu Harç"}</span>
                      <span style={styles.resultItemValue}>{formatTL(result.pesinHarc)}</span>
                    </div>
                    <div style={styles.resultItem}>
                      <span style={styles.resultItemLabel}>Gider Avansı (Tahmini)</span>
                      <span style={styles.resultItemValue}>{formatTL(result.giderAvansi)}</span>
                    </div>
                  </div>
                </>
              )}

              <div style={styles.infoBox}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="10" cy="10" r="9"/>
                  <path d="M10 14V10M10 6h.01"/>
                </svg>
                <p>
                  <strong>Not:</strong> Bu hesaplama yaklaşık değerler ve güncel tarife üzerinden referans niteliğinde yapılmıştır. Kesin masraflar mahkeme veznesi tarafından dava açılışında belirlenir.
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
