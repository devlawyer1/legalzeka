"use client";

import { useState, useEffect } from "react";
import { getTasks, createTask, updateTask, deleteTask, getFirmMembers } from "@/lib/api";

export default function TaskBoard({ firmId }) {
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ baslik: "", aciklama: "", oncelik: "Normal", durum: "Yapılacak", atananId: "" });
  const [message, setMessage] = useState({ type: "", text: "" });
  const [draggedTaskId, setDraggedTaskId] = useState(null);

  useEffect(() => {
    if (firmId) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [firmId]);

  const showToast = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: "", text: "" }), 3000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [tasksRes, membersRes] = await Promise.all([
        getTasks(firmId),
        getFirmMembers(firmId).catch(() => ({ data: [] }))
      ]);
      setTasks(tasksRes.data || []);
      const firmMembers = Array.isArray(membersRes.data?.members) ? membersRes.data.members : (Array.isArray(membersRes.data) ? membersRes.data : []);
      setMembers(firmMembers.filter(m => m.is_active !== false));
    } catch (err) {
      console.error("Görevler yüklenirken hata:", err);
      showToast("error", "Görev panosu yüklenirken bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...formData };
      if (!payload.atananId) delete payload.atananId;

      await createTask(firmId, payload);
      showToast("success", "Görev başarıyla eklendi.");
      setShowModal(false);
      setFormData({ baslik: "", aciklama: "", oncelik: "Normal", durum: "Yapılacak", atananId: "" });
      if (firmId) loadData();
    } catch (err) {
      showToast("error", err.message || "Görev oluşturulamadı.");
    }
  };

  const handleDelete = async (e, taskId) => {
    e.stopPropagation();
    if (!window.confirm("Bu görevi silmek istediğinize emin misiniz?")) return;
    try {
      await deleteTask(firmId, taskId);
      setTasks(prev => prev.filter(t => t.id !== taskId));
      showToast("success", "Görev silindi.");
    } catch (err) {
      showToast("error", "Silinemedi: " + err.message);
    }
  };

  const handleDragStart = (e, taskId) => {
    e.dataTransfer.setData("taskId", taskId);
    setDraggedTaskId(taskId);
    setTimeout(() => {
      // Small delay to let the drag ghost render before adding the 'dragging' class
      e.target.classList.add('dragging');
    }, 0);
  };

  const handleDragEnd = (e) => {
    e.target.classList.remove('dragging');
    setDraggedTaskId(null);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
  };

  const handleDragLeave = (e) => {
    e.currentTarget.classList.remove('drag-over');
  };

  const handleDrop = async (e, durum) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    
    const taskId = e.dataTransfer.getData("taskId");
    if (!taskId) return;

    const task = tasks.find(t => t.id === taskId);
    if (!task || task.durum === durum) return;

    // Optimistik güncelleme
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, durum } : t));

    try {
      await updateTask(firmId, taskId, { durum });
    } catch (err) {
      showToast("error", "Durum güncellenemedi: " + err.message);
      loadData(); // Hata olursa geri al
    }
  };

  const getTasksByStatus = (status) => tasks.filter(t => t.durum === status);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300 }}>
        <div style={{ width: 32, height: 32, border: "3px solid var(--color-border)", borderTopColor: "var(--color-accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  if (!firmId) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px", background: "var(--color-bg-elevated)", borderRadius: 16, border: "1px solid var(--color-border-subtle)", margin: "40px auto", maxWidth: 600 }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <h3 style={{ fontSize: 18, marginBottom: 12, color: "var(--color-text-primary)", fontWeight: 600 }}>Lütfen önce bir büro oluşturun veya seçin</h3>
        <p style={{ color: "var(--color-text-tertiary)", fontSize: 14, lineHeight: 1.6 }}>Görev panosunu kullanabilmek için bir hukuk bürosuna dahil olmanız gerekmektedir. Sol menüden <strong>Büro Yönetimi</strong> sekmesine giderek yeni bir büro oluşturabilirsiniz.</p>
      </div>
    );
  }

  const columns = ["Yapılacak", "Devam Ediyor", "Tamamlandı"];

  return (
    <div style={{ padding: "0", maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      {message.text && (
        <div style={{ ...s.toast, background: message.type === "success" ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)", color: message.type === "success" ? "var(--color-success)" : "var(--color-error)" }}>
          {message.text}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "var(--color-text-primary)" }}>Görev Panosu</h2>
          <p style={{ margin: "4px 0 0", color: "var(--color-text-tertiary)", fontSize: 13 }}>Ekibinizin iş akışını kanban formatında yönetin ve takip edin.</p>
        </div>
        <button onClick={() => setShowModal(true)} style={s.primaryBtn}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Yeni Görev
        </button>
      </div>

      <div style={{ display: 'flex', gap: 24, overflowX: 'auto', paddingBottom: 24, minHeight: "70vh", alignItems: "flex-start" }}>
        {columns.map(col => {
          const colTasks = getTasksByStatus(col);
          return (
            <div 
              key={col} 
              className="kanban-column"
              style={{ flex: 1, minWidth: 320, background: 'var(--color-bg-subtle)', borderRadius: 12, padding: 16, border: '1px solid var(--color-border-subtle)', display: 'flex', flexDirection: 'column', transition: "all 0.2s" }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 13, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>
                  {col}
                </h3>
                <span style={{ background: "var(--color-border)", color: "var(--color-text-secondary)", fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 999 }}>
                  {colTasks.length}
                </span>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 150 }}>
                {colTasks.map(t => (
                  <div 
                    key={t.id} 
                    className="kanban-card"
                    draggable
                    onDragStart={(e) => handleDragStart(e, t.id)}
                    onDragEnd={handleDragEnd}
                    style={{ background: 'var(--color-bg-elevated)', padding: 16, borderRadius: 10, border: '1px solid var(--color-border)', cursor: 'grab', position: 'relative', boxShadow: "0 2px 4px rgba(0,0,0,0.02)", transition: "all 0.2s ease" }}
                  >
                    <button 
                      onClick={(e) => handleDelete(e, t.id)}
                      className="delete-btn"
                      style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 4, opacity: 0, transition: "opacity 0.2s" }}
                      title="Sil"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                    <div style={{ fontWeight: '600', marginBottom: 6, fontSize: 14, color: 'var(--color-text-primary)', paddingRight: 20 }}>{t.baslik}</div>
                    {t.aciklama && <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{t.aciklama}</div>}
                    
                    <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, fontWeight: 600, background: t.oncelik === 'Acil' ? 'rgba(239,68,68,0.1)' : t.oncelik === 'Yüksek' ? 'rgba(245,158,11,0.1)' : 'var(--color-border)', color: t.oncelik === 'Acil' ? 'var(--color-error)' : t.oncelik === 'Yüksek' ? 'var(--color-warning)' : 'var(--color-text-secondary)' }}>
                        {t.oncelik}
                      </span>
                      {(t.atanan_isim || t.atanan_soyisim) ? (
                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--color-accent)', color: 'var(--color-text-inverse)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }} title={`${t.atanan_isim} ${t.atanan_soyisim}`}>
                          {t.atanan_isim?.charAt(0)}{t.atanan_soyisim?.charAt(0)}
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>Atanmadı</span>
                      )}
                    </div>
                  </div>
                ))}
                {colTasks.length === 0 && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, padding: 20, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13, border: '2px dashed var(--color-border-subtle)', borderRadius: 10, background: "rgba(255,255,255,0.02)" }}>
                    Sürükleyip bırakın
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showModal && (
        <div style={s.overlay} onClick={() => setShowModal(false)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>Yeni Görev Oluştur</h3>
              <button onClick={() => setShowModal(false)} style={s.closeBtn}>✕</button>
            </div>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', padding: 24, gap: 16 }}>
              <div>
                <label style={s.label}>Görev Başlığı *</label>
                <input placeholder="Örn: Dilekçe taslağı hazırlanacak" value={formData.baslik} onChange={e => setFormData({...formData, baslik: e.target.value})} style={s.input} required />
              </div>
              <div>
                <label style={s.label}>Açıklama</label>
                <textarea placeholder="Görev detayları..." value={formData.aciklama} onChange={e => setFormData({...formData, aciklama: e.target.value})} style={{...s.input, height: 100, resize: 'vertical'}} />
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <label style={s.label}>Öncelik</label>
                  <select value={formData.oncelik} onChange={e => setFormData({...formData, oncelik: e.target.value})} style={s.select}>
                    <option value="Düşük">Düşük</option>
                    <option value="Normal">Normal</option>
                    <option value="Yüksek">Yüksek</option>
                    <option value="Acil">Acil</option>
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <label style={s.label}>Atanacak Kişi</label>
                  <select value={formData.atananId} onChange={e => setFormData({...formData, atananId: e.target.value})} style={s.select}>
                    <option value="">Atanmadı</option>
                    {members.map(m => (
                      <option key={m.user_id || m.id} value={m.user_id || m.id}>{m.first_name} {m.last_name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowModal(false)} style={s.ghostBtn}>İptal</button>
                <button type="submit" style={s.primaryBtn}>Kaydet</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        .kanban-card:hover .delete-btn { opacity: 1 !important; }
        .kanban-card.dragging { opacity: 0.5; transform: scale(0.95); }
        .kanban-column.drag-over { background: var(--color-bg-elevated) !important; border-color: var(--color-accent) !important; }
      `}} />
    </div>
  );
}

const s = {
  primaryBtn: { padding: "9px 16px", fontSize: 13, fontWeight: 600, background: "var(--color-accent)", color: "var(--color-text-inverse)", border: "none", borderRadius: 8, cursor: "pointer", transition: "all 0.2s ease", display: "flex", alignItems: "center", gap: 6 },
  ghostBtn: { padding: "9px 16px", fontSize: 13, fontWeight: 500, background: "transparent", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)", borderRadius: 8, cursor: "pointer", transition: "all 0.2s ease" },
  input: { width: "100%", padding: "10px 14px", fontSize: 14, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-text-primary)", outline: "none", boxSizing: "border-box" },
  select: { width: "100%", padding: "10px 14px", fontSize: 14, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-text-primary)", outline: "none", cursor: "pointer", boxSizing: "border-box" },
  label: { fontSize: 11, fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 },
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 },
  modal: { background: 'var(--color-bg-elevated)', borderRadius: 16, width: "100%", maxWidth: 500, border: '1px solid var(--color-border-subtle)', boxShadow: '0 24px 48px -12px rgba(0,0,0,0.3)', display: "flex", flexDirection: "column" },
  modalHeader: { padding: "20px 24px", borderBottom: "1px solid var(--color-border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" },
  closeBtn: { background: "none", border: "none", color: "var(--color-text-tertiary)", fontSize: 18, cursor: "pointer", padding: 4 },
  toast: { position: "fixed", top: 24, right: 24, padding: "12px 20px", borderRadius: 8, fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", zIndex: 9999, boxShadow: "0 10px 25px rgba(0,0,0,0.1)", animation: "slideIn 0.3s ease forwards" },
};
