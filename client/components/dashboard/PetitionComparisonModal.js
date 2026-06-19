"use client";

import { useState } from "react";

export default function PetitionComparisonModal({ petitions, onClose, onCompare }) {
  const [p1Id, setP1Id] = useState("");
  const [p2Id, setP2Id] = useState("");
  const [comparing, setComparing] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!p1Id || !p2Id) {
      return alert("Lütfen karşılaştırmak için iki dilekçe seçin.");
    }
    if (p1Id === p2Id) {
      return alert("Lütfen iki farklı dilekçe seçin.");
    }

    setComparing(true);
    await onCompare(p1Id, p2Id);
    setComparing(false);
  };

  return (
    <div style={modalOverlay}>
      <div style={modalContent}>
        <h3>Dilekçeleri Karşılaştır (AI)</h3>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 15 }}>
          Yapay zeka, seçeceğiniz iki dilekçeyi çapraz analize tabi tutarak çelişkileri, hukuki zayıflıkları ve güçlü argümanları raporlar.
        </p>

        {petitions.length < 2 ? (
          <div>
            <p style={{ color: 'var(--color-text-tertiary)', marginBottom: 20 }}>
              Karşılaştırma yapabilmek için bu davada en az 2 dilekçe bulunmalıdır.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={secondaryBtnStyle}>Kapat</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 13, fontWeight: 500 }}>Birinci Dilekçe (Örn: Davacı)</label>
              <select 
                value={p1Id} 
                onChange={e => setP1Id(e.target.value)} 
                style={inputStyle}
                required
              >
                <option value="">Seçiniz...</option>
                {petitions.map(p => (
                  <option key={p.id} value={p.id}>{p.title} ({p.type})</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 13, fontWeight: 500 }}>İkinci Dilekçe (Örn: Davalı)</label>
              <select 
                value={p2Id} 
                onChange={e => setP2Id(e.target.value)} 
                style={inputStyle}
                required
              >
                <option value="">Seçiniz...</option>
                {petitions.map(p => (
                  <option key={p.id} value={p.id}>{p.title} ({p.type})</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} style={secondaryBtnStyle} disabled={comparing}>İptal</button>
              <button type="submit" style={btnStyle} disabled={comparing}>
                {comparing ? "Analiz Ediliyor..." : "Karşılaştır"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

const modalOverlay = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 };
const modalContent = { background: 'var(--color-background)', padding: 32, borderRadius: 16, width: 500, border: '1px solid var(--color-border)', boxShadow: '0 24px 48px -12px rgba(0,0,0,0.3)' };
const inputStyle = { padding: "12px 16px", fontSize: 14, background: "var(--color-surface)", border: "1px solid var(--color-border)", borderBottom: "2px solid var(--color-border)", borderRadius: 8, color: "var(--color-text-primary)", outline: "none" };
const btnStyle = { padding: "10px 20px", fontSize: 13, fontWeight: 600, background: "var(--color-accent)", color: "var(--color-text-inverse)", border: "none", borderRadius: 8, cursor: "pointer", transition: "all 0.2s ease" };
const secondaryBtnStyle = { padding: "10px 20px", fontSize: 13, fontWeight: 500, background: "transparent", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)", borderBottom: "2px solid var(--color-border)", borderRadius: 8, cursor: "pointer", transition: "all 0.2s ease" };
