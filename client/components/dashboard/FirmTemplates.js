"use client";

import { useState, useEffect } from "react";
import { getFirmTemplates, createFirmTemplate, deleteFirmTemplate } from "@/lib/api";

export default function FirmTemplates({ firmId }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ title: "", template_type: "Dilekçe", content: "", tags: "" });
  const [searchTerm, setSearchTerm] = useState("");
  const [message, setMessage] = useState({ type: "", text: "" });

  useEffect(() => {
    if (firmId) loadTemplates();
    else setLoading(false);
  }, [firmId]);

  const showToast = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: "", text: "" }), 3000);
  };

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await getFirmTemplates(firmId);
      setTemplates(res.data || []);
    } catch (err) {
      console.error(err);
      showToast("error", "Şablonlar yüklenirken bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      await createFirmTemplate(firmId, formData);
      showToast("success", "Şablon başarıyla oluşturuldu.");
      setShowModal(false);
      setFormData({ title: "", template_type: "Dilekçe", content: "", tags: "" });
      loadTemplates();
    } catch (err) {
      showToast("error", err.message || "Şablon kaydedilemedi.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Bu şablonu silmek istediğinize emin misiniz?")) return;
    try {
      await deleteFirmTemplate(firmId, id);
      showToast("success", "Şablon başarıyla silindi.");
      loadTemplates();
    } catch (err) {
      showToast("error", err.message || "Şablon silinemedi.");
    }
  };

  const filteredTemplates = templates.filter(t => 
    t.title?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    t.content?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.tags?.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (!firmId) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px", background: "var(--color-bg-elevated)", borderRadius: 16, border: "1px solid var(--color-border-subtle)", margin: "40px auto", maxWidth: 600 }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }}>
          <path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4" />
          <polyline points="14 2 14 8 20 8" />
          <path d="M3 15h6" /><path d="M3 18h6" />
        </svg>
        <h3 style={{ fontSize: 18, marginBottom: 12, color: "var(--color-text-primary)", fontWeight: 600 }}>Lütfen önce bir büro oluşturun veya seçin</h3>
        <p style={{ color: "var(--color-text-tertiary)", fontSize: 14, lineHeight: 1.6 }}>Kurumsal şablonları kullanabilmek için bir hukuk bürosuna dahil olmanız gerekmektedir. Sol menüden <strong>Büro Yönetimi</strong> sekmesine giderek yeni bir büro oluşturabilirsiniz.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      {message.text && (
        <div style={{ ...s.toast, background: message.type === "success" ? "#DCFCE7" : "#FEE2E2", color: message.type === "success" ? "#16A34A" : "#DC2626" }}>
          {message.text}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--color-text-primary)" }}>Kurumsal Şablonlar (RAG)</h2>
          <p style={{ margin: "6px 0 0", color: "var(--color-text-tertiary)", fontSize: 13, maxWidth: 500, lineHeight: 1.5 }}>
            Büronuzun geçmiş dilekçe ve metin formatlarını buradan ekleyerek yapay zekanın kurum kültürünüzü öğrenmesini sağlayın.
          </p>
        </div>
        <button onClick={() => setShowModal(true)} style={s.primaryBtn}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Yeni Şablon
        </button>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 400 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input 
            type="text" 
            placeholder="Şablonlarda ara..." 
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
      ) : templates.length === 0 ? (
        <div style={{ padding: "60px 20px", textAlign: "center", background: "var(--color-bg-subtle)", borderRadius: 16, border: "1px dashed var(--color-border)" }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" />
          </svg>
          <p style={{ color: "var(--color-text-secondary)", fontSize: 14, fontWeight: 500, marginBottom: 16 }}>Henüz hiç şablon eklenmemiş.</p>
          <button onClick={() => setShowModal(true)} style={s.ghostBtn}>İlk Şablonu Ekle</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {filteredTemplates.map(t => (
            <div key={t.id} style={s.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)", lineHeight: 1.4 }}>{t.title}</h3>
                <span style={s.badge}>{t.template_type}</span>
              </div>
              <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--color-text-tertiary)", flexGrow: 1, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", lineHeight: 1.5 }}>
                {t.content}
              </p>
              {t.tags && t.tags.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                  {t.tags.map((tag, i) => <span key={i} style={s.tag}>#{tag}</span>)}
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", borderTop: "1px solid var(--color-border-subtle)", paddingTop: 12, marginTop: "auto" }}>
                <button onClick={() => handleDelete(t.id)} style={s.dangerBtn}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                  Sil
                </button>
              </div>
            </div>
          ))}
          {filteredTemplates.length === 0 && searchTerm && (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: 40, color: "var(--color-text-tertiary)", fontSize: 14 }}>
              Aramanızla eşleşen şablon bulunamadı.
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div style={s.overlay} onClick={() => setShowModal(false)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>Yeni Kurumsal Şablon Ekle</h3>
              <button onClick={() => setShowModal(false)} style={s.closeBtn}>✕</button>
            </div>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', padding: 24, gap: 16, overflowY: "auto", maxHeight: "calc(100vh - 120px)" }}>
              <div>
                <label style={s.label}>Şablon Başlığı *</label>
                <input 
                  placeholder="Örn: İşe İade Davası Örnek Dilekçesi" 
                  value={formData.title} 
                  onChange={e => setFormData({...formData, title: e.target.value})} 
                  style={s.input} 
                  required 
                />
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label style={s.label}>Şablon Tipi</label>
                  <select 
                    value={formData.template_type} 
                    onChange={e => setFormData({...formData, template_type: e.target.value})} 
                    style={s.select}
                  >
                    <option>Dilekçe</option>
                    <option>Sözleşme</option>
                    <option>İhtarname</option>
                    <option>Tutanak</option>
                    <option>Diğer</option>
                  </select>
                </div>
                <div style={{ flex: 2, minWidth: 200 }}>
                  <label style={s.label}>Etiketler</label>
                  <input 
                    placeholder="Örn: is-hukuku, dilekce, ihtar (Virgülle ayırın)" 
                    value={formData.tags} 
                    onChange={e => setFormData({...formData, tags: e.target.value})} 
                    style={s.input} 
                  />
                </div>
              </div>
              <div>
                <label style={s.label}>Şablon İçeriği *</label>
                <div style={{ position: "relative" }}>
                  <textarea 
                    placeholder="Şablon içeriğini (tam metin veya iskelet) buraya yapıştırın..." 
                    value={formData.content} 
                    onChange={e => setFormData({...formData, content: e.target.value})} 
                    style={{ ...s.input, minHeight: 300, resize: "vertical", fontFamily: "'SF Mono', Consolas, Menlo, monospace", fontSize: 13, lineHeight: 1.6, background: "var(--color-bg-elevated)", color: "var(--color-text-secondary)" }} 
                    required 
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowModal(false)} style={s.ghostBtn}>İptal</button>
                <button type="submit" style={s.primaryBtn}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
                  Kaydet ve Eğit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  primaryBtn: { padding: "9px 16px", fontSize: 13, fontWeight: 600, background: "var(--color-accent)", color: "var(--color-text-inverse)", border: "none", borderRadius: 8, cursor: "pointer", transition: "all 0.2s ease", display: "flex", alignItems: "center", gap: 6 },
  ghostBtn: { padding: "9px 16px", fontSize: 13, fontWeight: 500, background: "transparent", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)", borderRadius: 8, cursor: "pointer", transition: "all 0.2s ease", display: "flex", alignItems: "center", gap: 6 },
  dangerBtn: { padding: "6px 12px", fontSize: 12, fontWeight: 500, background: "rgba(239,68,68,0.05)", color: "var(--color-error)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "background 0.2s" },
  input: { width: "100%", padding: "10px 14px", fontSize: 14, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-text-primary)", outline: "none", boxSizing: "border-box" },
  select: { width: "100%", padding: "10px 14px", fontSize: 14, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-text-primary)", outline: "none", cursor: "pointer", boxSizing: "border-box" },
  label: { fontSize: 11, fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 },
  card: { background: "var(--color-bg-elevated)", padding: 20, borderRadius: 12, border: "1px solid var(--color-border-subtle)", display: "flex", flexDirection: "column", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" },
  badge: { fontSize: 11, fontWeight: 600, padding: "4px 10px", background: "var(--color-bg-muted)", borderRadius: 999, color: "var(--color-text-secondary)" },
  tag: { fontSize: 11, fontWeight: 500, color: "var(--color-accent)", background: "rgba(37,99,235,0.05)", padding: "2px 8px", borderRadius: 4 },
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 },
  modal: { background: 'var(--color-bg-elevated)', borderRadius: 16, width: "100%", maxWidth: 700, border: '1px solid var(--color-border-subtle)', boxShadow: '0 24px 48px -12px rgba(0,0,0,0.3)', display: "flex", flexDirection: "column" },
  modalHeader: { padding: "20px 24px", borderBottom: "1px solid var(--color-border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" },
  closeBtn: { background: "none", border: "none", color: "var(--color-text-tertiary)", fontSize: 18, cursor: "pointer", padding: 4 },
  toast: { position: "fixed", top: 24, right: 24, padding: "12px 20px", borderRadius: 8, fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", zIndex: 9999, boxShadow: "0 10px 25px rgba(0,0,0,0.1)", animation: "slideIn 0.3s ease forwards" },
};
