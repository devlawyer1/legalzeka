"use client";

import { useState, useEffect, useCallback } from "react";
import { ClipboardList, AlertTriangle, AlertCircle, Folder, Landmark, Calendar, RefreshCw, Plus, Check, Trash2, Clock, X } from "lucide-react";

export default function DeadlineTracker({ firmId }) {
  const [deadlines, setDeadlines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("active"); // active | all
  const [showForm, setShowForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    deadline_date: "",
    esas_no: "",
    mahkeme: "",
    priority: "normal",
  });

  const loadDeadlines = useCallback(async () => {
    if (!firmId) { setLoading(false); return; }
    setLoading(true);
    try {
      if (filter === "active") {
        const { getActiveDeadlines } = await import("@/lib/api");
        const res = await getActiveDeadlines(firmId);
        setDeadlines(res.data || []);
      } else {
        const { getAllDeadlines } = await import("@/lib/api");
        const res = await getAllDeadlines(firmId, { limit: 100 });
        setDeadlines(res.data || []);
      }
    } catch (err) {
      console.error("Süreler yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  }, [firmId, filter]);

  useEffect(() => {
    loadDeadlines();
  }, [loadDeadlines]);

  const handleAcknowledge = async (id) => {
    try {
      const { acknowledgeDeadline } = await import("@/lib/api");
      await acknowledgeDeadline(id);
      setDeadlines((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      console.error("Onaylama hatası:", err);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Bu süreyi silmek istediğinize emin misiniz?")) return;
    try {
      const { deleteDeadline } = await import("@/lib/api");
      await deleteDeadline(id);
      setDeadlines((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      console.error("Silme hatası:", err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.deadline_date) return;
    setFormLoading(true);
    try {
      const { createDeadline } = await import("@/lib/api");
      await createDeadline({
        firmId,
        title: formData.title,
        description: formData.description,
        deadlineDate: formData.deadline_date,
        esas_no: formData.esas_no,
        mahkeme: formData.mahkeme,
        priority: formData.priority,
      });
      setFormData({ title: "", description: "", deadline_date: "", esas_no: "", mahkeme: "", priority: "normal" });
      setShowForm(false);
      await loadDeadlines();
    } catch (err) {
      console.error("Süre oluşturma hatası:", err);
    } finally {
      setFormLoading(false);
    }
  };

  const getDaysLeft = (date) => {
    const now = new Date();
    const target = new Date(date);
    return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
  };

  const getUrgencyStyle = (daysLeft) => {
    if (daysLeft <= 0) return { bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.25)", color: "var(--color-error)", label: "SÜRESİ DOLDU" };
    if (daysLeft <= 3) return { bg: "rgba(239,68,68,0.06)", border: "rgba(239,68,68,0.18)", color: "var(--color-error)", label: `${daysLeft} gün kaldı` };
    if (daysLeft <= 7) return { bg: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.18)", color: "var(--color-warning)", label: `${daysLeft} gün kaldı` };
    return { bg: "rgba(34,197,94,0.05)", border: "rgba(34,197,94,0.12)", color: "var(--color-success)", label: `${daysLeft} gün kaldı` };
  };

  if (!firmId) {
    return (
      <div style={s.container}>
        <div style={s.emptyState}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
          <h3 style={{ fontSize: 18, fontWeight: 600, color: "var(--color-text-primary)", marginTop: 16 }}>Süre Takibi</h3>
          <p style={{ fontSize: 14, color: "var(--color-text-tertiary)", maxWidth: 400 }}>Lütfen önce bir büro seçin veya oluşturun.</p>
        </div>
      </div>
    );
  }

  const urgentCount = deadlines.filter((d) => getDaysLeft(d.deadline_date) <= 3).length;
  const overdueCount = deadlines.filter((d) => getDaysLeft(d.deadline_date) <= 0).length;

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <h2 style={s.title}>
            <Clock size={22} />
            Süre Takibi & Hatırlatmalar
          </h2>
          <p style={s.subtitle}>Dava sürelerini, zamanaşımlarını ve kritik tarihleri takip edin.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={s.addBtn}>
          {showForm ? <span style={{display: 'flex', alignItems: 'center', gap: 6}}><X size={16} /> İptal</span> : <span style={{display: 'flex', alignItems: 'center', gap: 6}}><Plus size={16} /> Yeni Süre Ekle</span>}
        </button>
      </div>

      {/* Stats */}
      <div style={s.statsRow}>
        <div style={s.statCard}>
          <div style={{ ...s.statIcon, background: "rgba(59,130,246,0.1)", color: "var(--color-accent)" }}><ClipboardList size={20} /></div>
          <div><div style={s.statValue}>{deadlines.length}</div><div style={s.statLabel}>Toplam Süre</div></div>
        </div>
        <div style={s.statCard}>
          <div style={{ ...s.statIcon, background: "rgba(245,158,11,0.1)", color: "var(--color-warning)" }}><AlertTriangle size={20} /></div>
          <div><div style={s.statValue}>{urgentCount}</div><div style={s.statLabel}>Acil (≤3 gün)</div></div>
        </div>
        <div style={s.statCard}>
          <div style={{ ...s.statIcon, background: "rgba(239,68,68,0.1)", color: "var(--color-error)" }}><AlertCircle size={20} /></div>
          <div><div style={s.statValue}>{overdueCount}</div><div style={s.statLabel}>Süresi Geçen</div></div>
        </div>
      </div>

      {/* Add Form */}
      {showForm && (
        <form onSubmit={handleSubmit} style={s.form}>
          <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>Yeni Süre Ekle</h3>
          <div style={s.formGrid}>
            <div style={s.formGroup}>
              <label style={s.label}>Başlık *</label>
              <input style={s.input} value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Örn: Cevap dilekçesi süresi" required />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Son Tarih *</label>
              <input type="date" style={s.input} value={formData.deadline_date} onChange={(e) => setFormData({ ...formData, deadline_date: e.target.value })} required />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Esas No</label>
              <input style={s.input} value={formData.esas_no} onChange={(e) => setFormData({ ...formData, esas_no: e.target.value })} placeholder="2024/1234" />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Mahkeme</label>
              <input style={s.input} value={formData.mahkeme} onChange={(e) => setFormData({ ...formData, mahkeme: e.target.value })} placeholder="Ankara 5. Asliye Hukuk" />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Öncelik</label>
              <select style={s.input} value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: e.target.value })}>
                <option value="normal">Normal</option>
                <option value="high">Yüksek</option>
                <option value="urgent">Acil</option>
              </select>
            </div>
            <div style={{ ...s.formGroup, gridColumn: "1 / -1" }}>
              <label style={s.label}>Açıklama</label>
              <textarea style={{ ...s.input, minHeight: 60, resize: "vertical" }} value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="İsteğe bağlı açıklama..." />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
            <button type="button" onClick={() => setShowForm(false)} style={s.cancelBtn}>İptal</button>
            <button type="submit" disabled={formLoading} style={s.submitBtn}>{formLoading ? "Kaydediliyor..." : "Kaydet"}</button>
          </div>
        </form>
      )}

      {/* Filter Tabs */}
      <div style={s.filterRow}>
        <div style={s.filterGroup}>
          {[
            { id: "active", label: "Aktif Süreler" },
            { id: "all", label: "Tüm Süreler" },
          ].map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{ ...s.filterBtn, ...(filter === f.id ? s.filterBtnActive : {}) }}>{f.label}</button>
          ))}
        </div>
        <button onClick={loadDeadlines} style={s.refreshBtn} disabled={loading}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><RefreshCw size={14} /> Yenile</span>
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div style={s.loadingState}>
          <div style={s.spinner} />
          <span>Yükleniyor...</span>
        </div>
      ) : deadlines.length === 0 ? (
        <div style={s.emptyState}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", marginTop: 16 }}>Süre Bulunamadı</h3>
          <p style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>{filter === "active" ? "Şu an yaklaşan veya aktif süre bulunmuyor." : "Henüz süre kaydı oluşturulmamış."}</p>
        </div>
      ) : (
        <div style={s.list}>
          {deadlines.map((d) => {
            const daysLeft = getDaysLeft(d.deadline_date);
            const urgency = getUrgencyStyle(daysLeft);
            return (
              <div key={d.id} style={{ ...s.card, background: urgency.bg, borderColor: urgency.border }}>
                <div style={s.cardMain}>
                  <div style={s.cardLeft}>
                    <div style={s.cardTitle}>{d.title}</div>
                    <div style={s.cardMeta}>
                      {d.esas_no && <span style={s.metaPill}><Folder size={12} style={{marginRight: 4}} /> {d.esas_no}</span>}
                      {d.mahkeme && <span style={s.metaPill}><Landmark size={12} style={{marginRight: 4}} /> {d.mahkeme}</span>}
                      <span style={s.metaPill}><Calendar size={12} style={{marginRight: 4}} /> {new Date(d.deadline_date).toLocaleDateString("tr-TR")}</span>
                    </div>
                    {d.description && <div style={s.cardDesc}>{d.description.split("\n")[0]}</div>}
                  </div>
                  <div style={s.cardRight}>
                    <div style={{ ...s.countdown, color: urgency.color }}>
                      {daysLeft <= 0 ? (
                        <span style={{ fontWeight: 700, fontSize: 13 }}>⚠ GEÇTİ</span>
                      ) : (
                        <>
                          <span style={s.countdownNum}>{daysLeft}</span>
                          <span style={s.countdownLabel}>gün</span>
                        </>
                      )}
                    </div>
                    <div style={s.cardActions}>
                      <button onClick={() => handleAcknowledge(d.id)} style={s.ackBtn} title="Görüldü olarak işaretle"><Check size={14} /></button>
                      <button onClick={() => handleDelete(d.id)} style={s.delBtn} title="Sil">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const s = {
  container: { padding: 24, maxWidth: 900, margin: "0 auto", width: "100%" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 },
  title: { fontSize: 22, fontWeight: 700, color: "var(--color-text-primary)", margin: 0, display: "flex", alignItems: "center", gap: 10 },
  subtitle: { fontSize: 13, color: "var(--color-text-tertiary)", marginTop: 4 },
  addBtn: { padding: "10px 20px", fontSize: 14, fontWeight: 600, background: "var(--color-accent)", color: "var(--color-text-inverse)", border: "none", borderRadius: 10, cursor: "pointer" },

  statsRow: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 },
  statCard: { display: "flex", alignItems: "center", gap: 14, padding: 16, background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)", borderRadius: 12 },
  statIcon: { width: 44, height: 44, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 },
  statValue: { fontSize: 22, fontWeight: 700, color: "var(--color-text-primary)", lineHeight: 1.2 },
  statLabel: { fontSize: 12, color: "var(--color-text-tertiary)", fontWeight: 500 },

  form: { background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)", borderRadius: 14, padding: 24, marginBottom: 24 },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  formGroup: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.03em" },
  input: { padding: "10px 14px", fontSize: 14, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-text-primary)", outline: "none", boxSizing: "border-box" },
  cancelBtn: { padding: "8px 16px", fontSize: 13, background: "transparent", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-text-secondary)", cursor: "pointer" },
  submitBtn: { padding: "8px 20px", fontSize: 13, fontWeight: 600, background: "var(--color-accent)", color: "var(--color-text-inverse)", border: "none", borderRadius: 8, cursor: "pointer" },

  filterRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  filterGroup: { display: "flex", gap: 4, background: "var(--color-bg-subtle)", padding: 4, borderRadius: 10 },
  filterBtn: { padding: "8px 16px", fontSize: 13, fontWeight: 500, background: "transparent", border: "none", borderRadius: 8, color: "var(--color-text-secondary)", cursor: "pointer" },
  filterBtnActive: { background: "var(--color-bg-elevated)", color: "var(--color-text-primary)", fontWeight: 600, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" },
  refreshBtn: { padding: "6px 14px", fontSize: 12, fontWeight: 500, background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-text-secondary)", cursor: "pointer" },

  loadingState: { display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: 60, color: "var(--color-text-tertiary)" },
  spinner: { width: 32, height: 32, border: "3px solid var(--color-border)", borderTop: "3px solid var(--color-accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  emptyState: { display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 20px", textAlign: "center" },

  list: { display: "flex", flexDirection: "column", gap: 8 },
  card: { padding: "16px 20px", borderRadius: 12, border: "1px solid transparent", transition: "all 0.15s ease" },
  cardMain: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 },
  cardLeft: { flex: 1, overflow: "hidden" },
  cardTitle: { fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)" },
  cardMeta: { display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" },
  metaPill: { fontSize: 11, fontWeight: 500, background: "rgba(0,0,0,0.04)", padding: "3px 8px", borderRadius: 6, color: "var(--color-text-secondary)" },
  cardDesc: { fontSize: 13, color: "var(--color-text-secondary)", marginTop: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  cardRight: { display: "flex", alignItems: "center", gap: 16, flexShrink: 0 },
  countdown: { textAlign: "center", minWidth: 48 },
  countdownNum: { fontSize: 24, fontWeight: 800, lineHeight: 1, display: "block" },
  countdownLabel: { fontSize: 11, display: "block" },
  cardActions: { display: "flex", flexDirection: "column", gap: 6 },
  ackBtn: { width: 30, height: 30, borderRadius: "50%", border: "1px solid var(--color-border)", background: "var(--color-bg-subtle)", color: "var(--color-text-tertiary)", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" },
  delBtn: { width: 30, height: 30, borderRadius: "50%", border: "1px solid var(--color-border)", background: "var(--color-bg-subtle)", color: "var(--color-text-tertiary)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
};
