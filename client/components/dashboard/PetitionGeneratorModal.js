"use client";

import { useState } from "react";

export default function PetitionGeneratorModal({ onClose, onGenerate }) {
  const [formData, setFormData] = useState({
    petitionType: "Davacı Dilekçesi",
    parties: "",
    evidence: "",
    additionalNotes: ""
  });
  const [generating, setGenerating] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGenerating(true);
    await onGenerate(formData);
    setGenerating(false);
  };

  return (
    <div style={modalOverlay}>
      <div style={modalContent}>
        <h3>Yeni Dilekçe Üret (AI)</h3>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 15 }}>
          Yapay zeka, vereceğiniz bilgiler ve davanın ana detayları doğrultusunda profesyonel bir taslak hazırlayacaktır.
        </p>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 13, fontWeight: 500 }}>Dilekçe Türü</label>
            <select 
              value={formData.petitionType} 
              onChange={e => setFormData({...formData, petitionType: e.target.value})} 
              style={inputStyle}
            >
              <option>Davacı Dilekçesi</option>
              <option>Cevap Dilekçesi</option>
              <option>Cevaba Cevap (Replik)</option>
              <option>İkinci Cevap (Düplik)</option>
              <option>İstinaf Dilekçesi</option>
              <option>Temyiz Dilekçesi</option>
              <option>Beyan Dilekçesi</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 13, fontWeight: 500 }}>Taraflar (Davacı / Davalı / Vekiller)</label>
            <textarea 
              placeholder="Örn: Davacı: Ahmet Yılmaz (TC: 123...), Davalı: ABC Ltd. Şti." 
              value={formData.parties} 
              onChange={e => setFormData({...formData, parties: e.target.value})} 
              style={{ ...inputStyle, minHeight: 60 }} 
              required 
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 13, fontWeight: 500 }}>Deliller</label>
            <textarea 
              placeholder="Sözleşmeler, tanıklar, bilirkişi raporu, ihtarname vb." 
              value={formData.evidence} 
              onChange={e => setFormData({...formData, evidence: e.target.value})} 
              style={{ ...inputStyle, minHeight: 60 }} 
              required 
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 13, fontWeight: 500 }}>Ek Notlar / Olayın Özeti / Talepler</label>
            <textarea 
              placeholder="Tazminat talebi, olayın gelişimi, vurgulanmak istenen hukuki dayanaklar..." 
              value={formData.additionalNotes} 
              onChange={e => setFormData({...formData, additionalNotes: e.target.value})} 
              style={{ ...inputStyle, minHeight: 80 }} 
              required 
            />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={secondaryBtnStyle} disabled={generating}>İptal</button>
            <button type="submit" style={btnStyle} disabled={generating}>
              {generating ? "Üretiliyor..." : "Üret ve Kaydet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const modalOverlay = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 };
const modalContent = { background: 'var(--color-background)', padding: 32, borderRadius: 16, width: 600, border: '1px solid var(--color-border)', boxShadow: '0 24px 48px -12px rgba(0,0,0,0.3)' };
const inputStyle = { padding: "12px 16px", fontSize: 14, background: "var(--color-surface)", border: "1px solid var(--color-border)", borderBottom: "2px solid var(--color-border)", borderRadius: 8, color: "var(--color-text-primary)", outline: "none", resize: 'vertical' };
const btnStyle = { padding: "10px 20px", fontSize: 13, fontWeight: 600, background: "var(--color-accent)", color: "var(--color-text-inverse)", border: "none", borderRadius: 8, cursor: "pointer", transition: "all 0.2s ease" };
const secondaryBtnStyle = { padding: "10px 20px", fontSize: 13, fontWeight: 500, background: "transparent", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)", borderBottom: "2px solid var(--color-border)", borderRadius: 8, cursor: "pointer", transition: "all 0.2s ease" };
