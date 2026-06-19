"use client";

import { useState, useEffect } from "react";
import { getCases, createCase, updateCase, deleteCase } from "@/lib/api";
import PetitionManagement from "./PetitionManagement";
import CaseTimeline from "./CaseTimeline";
import CaseWorkspace from "./CaseWorkspace";

export default function CaseManagement({ firmId }) {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ esasNo: "", mahkeme: "", konu: "", tarafDavaci: "", tarafDavali: "", durum: "Açık", notlar: "" });
  const [message, setMessage] = useState({ type: "", text: "" });
  const [searchTerm, setSearchTerm] = useState("");

  const [activeCaseId, setActiveCaseId] = useState(null); // PetitionManagement için seçili dava
  const [activeTimelineCaseId, setActiveTimelineCaseId] = useState(null); // CaseTimeline için seçili dava
  const [activeWorkspaceCaseId, setActiveWorkspaceCaseId] = useState(null); // AI Dosya Odası için seçili dava

  useEffect(() => {
    if (firmId) {
      loadCases();
    } else {
      setLoading(false);
    }
  }, [firmId]);

  const showToast = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: "", text: "" }), 3000);
  };

  const loadCases = async () => {
    setLoading(true);
    try {
      const res = await getCases(firmId);
      setCases(res.data || []);
    } catch (err) {
      console.error(err);
      showToast("error", "Davalar yüklenirken bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      await createCase(firmId, formData);
      showToast("success", "Dava başarıyla eklendi.");
      setShowModal(false);
      setFormData({ esasNo: "", mahkeme: "", konu: "", tarafDavaci: "", tarafDavali: "", durum: "Açık", notlar: "" });
      if (firmId) loadCases();
    } catch (err) {
      showToast("error", err.message || "Dava kaydedilemedi.");
    }
  };

  const getStatusBadgeStyle = (status) => {
    switch(status?.toLowerCase()) {
      case 'açık': return { background: "rgba(34,197,94,0.1)", color: "var(--color-success)" };
      case 'kapalı': return { background: "rgba(107,114,128,0.1)", color: "var(--color-text-secondary)" };
      case 'beklemede': return { background: "rgba(245,158,11,0.1)", color: "var(--color-warning)" };
      default: return { background: "rgba(59,130,246,0.1)", color: "var(--color-accent)" };
    }
  };

  const filteredCases = cases.filter(c => 
    c.esas_no?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.mahkeme?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.taraf_davaci?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.taraf_davali?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!firmId) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px", background: "var(--color-bg-elevated)", borderRadius: 16, border: "1px solid var(--color-border-subtle)", margin: "40px auto", maxWidth: 600 }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }}>
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="21" x2="9" y2="9" />
        </svg>
        <h3 style={{ fontSize: 18, marginBottom: 12, color: "var(--color-text-primary)", fontWeight: 600 }}>Lütfen önce bir büro oluşturun veya seçin</h3>
        <p style={{ color: "var(--color-text-tertiary)", fontSize: 14, lineHeight: 1.6 }}>Dava yönetimini kullanabilmek için bir hukuk bürosuna dahil olmanız gerekmektedir. Sol menüden <strong>Büro Yönetimi</strong> sekmesine giderek yeni bir büro oluşturabilirsiniz.</p>
      </div>
    );
  }

  if (activeCaseId) {
    return <PetitionManagement firmId={firmId} caseId={activeCaseId} onBack={() => setActiveCaseId(null)} />;
  }

  if (activeWorkspaceCaseId) {
    return <CaseWorkspace firmId={firmId} caseId={activeWorkspaceCaseId} onBack={() => setActiveWorkspaceCaseId(null)} />;
  }

  if (activeTimelineCaseId) {
    return <CaseTimeline caseId={activeTimelineCaseId} onBack={() => setActiveTimelineCaseId(null)} />;
  }

  return (
    <div style={{ padding: "0", maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      {message.text && (
        <div style={{ ...s.toast, background: message.type === "success" ? "#DCFCE7" : "#FEE2E2", color: message.type === "success" ? "#16A34A" : "#DC2626" }}>
          {message.text}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "var(--color-text-primary)" }}>Dava Yönetimi</h2>
          <p style={{ margin: "4px 0 0", color: "var(--color-text-tertiary)", fontSize: 13 }}>Aktif ve geçmiş davalarınızı, ilgili dilekçeleri ve süreçleri buradan yönetin.</p>
        </div>
        <button onClick={() => setShowModal(true)} style={s.primaryBtn}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Yeni Dava
        </button>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 350 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input 
            type="text" 
            placeholder="Esas No, Mahkeme, Davacı/Davalı ara..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
            style={{ ...s.input, paddingLeft: 36 }}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
          <div style={{ width: 32, height: 32, border: "3px solid var(--color-border)", borderTopColor: "var(--color-accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        </div>
      ) : cases.length === 0 ? (
        <div style={{ padding: "60px 20px", textAlign: "center", background: "var(--color-bg-subtle)", borderRadius: 16, border: "1px dashed var(--color-border)" }}>
          <p style={{ color: "var(--color-text-secondary)", fontSize: 14, fontWeight: 500, marginBottom: 16 }}>Henüz dava dosyası eklenmemiş.</p>
          <button onClick={() => setShowModal(true)} style={s.ghostBtn}>İlk Davanızı Ekle</button>
        </div>
      ) : (
        <div style={{ overflowX: "auto", background: "var(--color-bg-elevated)", borderRadius: 12, border: "1px solid var(--color-border-subtle)", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', minWidth: 800 }}>
            <thead>
              <tr style={{ background: "var(--color-bg-subtle)", borderBottom: '1px solid var(--color-border-subtle)' }}>
                <th style={s.th}>Esas No</th>
                <th style={s.th}>Mahkeme</th>
                <th style={s.th}>Taraflar</th>
                <th style={s.th}>Durum</th>
                <th style={s.th}>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {filteredCases.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--color-border-subtle)', transition: "background 0.2s" }} className="hover-row">
                  <td style={{ ...s.td, fontWeight: 600, color: "var(--color-text-primary)" }}>{c.esas_no}</td>
                  <td style={{ ...s.td, color: "var(--color-text-secondary)" }}>{c.mahkeme}</td>
                  <td style={s.td}>
                    <div style={{ fontSize: 13, color: "var(--color-text-primary)", fontWeight: 500 }}>{c.taraf_davaci}</div>
                    <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 2 }}>vs. {c.taraf_davali}</div>
                  </td>
                  <td style={s.td}>
                    <span style={{ padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, ...getStatusBadgeStyle(c.durum) }}>
                      {c.durum}
                    </span>
                  </td>
                  <td style={s.td}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button onClick={() => setActiveWorkspaceCaseId(c.id)} style={{...s.actionBtn, background: "rgba(22,163,74,0.08)", color: "var(--color-success)", borderColor: "rgba(22,163,74,0.25)"}}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><path d="M8 13h8" /><path d="M8 16h5" /></svg>
                        Dosya Odası
                      </button>
                      <button onClick={() => setActiveCaseId(c.id)} style={s.actionBtn}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                        Dilekçeler
                      </button>
                      <button onClick={() => setActiveTimelineCaseId(c.id)} style={{...s.actionBtn, background: "rgba(107,114,128,0.05)", color: "var(--color-text-secondary)", borderColor: "var(--color-border)"}}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                        Süreç
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredCases.length === 0 && searchTerm && (
            <div style={{ textAlign: "center", padding: 40, color: "var(--color-text-tertiary)", fontSize: 14 }}>
              Aramanızla eşleşen dava bulunamadı.
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div style={s.overlay} onClick={() => setShowModal(false)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>Yeni Dava Dosyası Ekle</h3>
              <button onClick={() => setShowModal(false)} style={s.closeBtn}>✕</button>
            </div>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', padding: 24, gap: 16 }}>
              <div style={{ display: 'flex', gap: 16, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label style={s.label}>Esas No *</label>
                  <input placeholder="Örn: 2024/112 Esas" value={formData.esasNo} onChange={e => setFormData({...formData, esasNo: e.target.value})} style={s.input} required />
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label style={s.label}>Mahkeme *</label>
                  <input placeholder="Örn: İstanbul 1. İş Mahkemesi" value={formData.mahkeme} onChange={e => setFormData({...formData, mahkeme: e.target.value})} style={s.input} required />
                </div>
              </div>
              
              <div>
                <label style={s.label}>Dava Konusu *</label>
                <input placeholder="Örn: İşe İade ve Alacak" value={formData.konu} onChange={e => setFormData({...formData, konu: e.target.value})} style={s.input} required />
              </div>

              <div style={{ display: 'flex', gap: 16, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label style={s.label}>Davacı *</label>
                  <input placeholder="Davacı ad veya unvan" value={formData.tarafDavaci} onChange={e => setFormData({...formData, tarafDavaci: e.target.value})} style={s.input} required />
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label style={s.label}>Davalı *</label>
                  <input placeholder="Davalı ad veya unvan" value={formData.tarafDavali} onChange={e => setFormData({...formData, tarafDavali: e.target.value})} style={s.input} required />
                </div>
              </div>

              <div>
                <label style={s.label}>Durum</label>
                <select value={formData.durum} onChange={e => setFormData({...formData, durum: e.target.value})} style={s.select}>
                  <option value="Açık">Açık</option>
                  <option value="Kapalı">Kapalı</option>
                  <option value="Beklemede">Beklemede</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowModal(false)} style={s.ghostBtn}>İptal</button>
                <button type="submit" style={s.primaryBtn}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
                  Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <style dangerouslySetInnerHTML={{__html: `
        .hover-row:hover { background: var(--color-bg-subtle) !important; }
      `}} />
    </div>
  );
}

const s = {
  primaryBtn: { padding: "9px 16px", fontSize: 13, fontWeight: 600, background: "var(--color-accent)", color: "var(--color-text-inverse)", border: "none", borderRadius: 8, cursor: "pointer", transition: "all 0.2s ease", display: "flex", alignItems: "center", gap: 6 },
  ghostBtn: { padding: "9px 16px", fontSize: 13, fontWeight: 500, background: "transparent", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)", borderRadius: 8, cursor: "pointer", transition: "all 0.2s ease", display: "flex", alignItems: "center", gap: 6 },
  actionBtn: { padding: "6px 12px", fontSize: 12, fontWeight: 500, background: "rgba(37,99,235,0.05)", color: "var(--color-accent)", border: "1px solid rgba(37,99,235,0.2)", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "background 0.2s" },
  input: { width: "100%", padding: "10px 14px", fontSize: 14, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-text-primary)", outline: "none", boxSizing: "border-box" },
  select: { width: "100%", padding: "10px 14px", fontSize: 14, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-text-primary)", outline: "none", cursor: "pointer", boxSizing: "border-box" },
  label: { fontSize: 11, fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 },
  th: { padding: '14px 16px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: "uppercase", letterSpacing: "0.05em" },
  td: { padding: '16px', fontSize: 14 },
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 },
  modal: { background: 'var(--color-bg-elevated)', borderRadius: 16, width: "100%", maxWidth: 550, border: '1px solid var(--color-border-subtle)', boxShadow: '0 24px 48px -12px rgba(0,0,0,0.3)', display: "flex", flexDirection: "column" },
  modalHeader: { padding: "20px 24px", borderBottom: "1px solid var(--color-border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" },
  closeBtn: { background: "none", border: "none", color: "var(--color-text-tertiary)", fontSize: 18, cursor: "pointer", padding: 4 },
  toast: { position: "fixed", top: 24, right: 24, padding: "12px 20px", borderRadius: 8, fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", zIndex: 9999, boxShadow: "0 10px 25px rgba(0,0,0,0.1)", animation: "slideIn 0.3s ease forwards" },
};
