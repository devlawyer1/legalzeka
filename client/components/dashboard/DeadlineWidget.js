"use client";

import { useState, useEffect } from "react";

export default function DeadlineWidget({ firmId }) {
  const [deadlines, setDeadlines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (firmId) loadDeadlines();
    else { setDeadlines([]); setLoading(false); }
  }, [firmId]);

  const loadDeadlines = async () => {
    try {
      const { getActiveDeadlines } = await import("@/lib/api");
      const res = await getActiveDeadlines(firmId);
      setDeadlines(res.data || []);
    } catch (err) {
      console.error("Deadline yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledge = async (id) => {
    try {
      const { acknowledgeDeadline } = await import("@/lib/api");
      await acknowledgeDeadline(id);
      setDeadlines(deadlines.filter(d => d.id !== id));
    } catch (err) {
      console.error("Onaylama hatası:", err);
    }
  };

  const getDaysLeft = (deadline) => {
    const now = new Date();
    const target = new Date(deadline);
    const diff = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const getUrgencyStyle = (daysLeft) => {
    if (daysLeft <= 0) return { bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.3)", color: "#EF4444", label: "SÜRESİ DOLDU" };
    if (daysLeft <= 3) return { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.2)", color: "#EF4444", label: `${daysLeft} gün kaldı` };
    if (daysLeft <= 7) return { bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.2)", color: "#F59E0B", label: `${daysLeft} gün kaldı` };
    return { bg: "rgba(34,197,94,0.06)", border: "rgba(34,197,94,0.15)", color: "#22C55E", label: `${daysLeft} gün kaldı` };
  };

  if (loading) return null;

  if (deadlines.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            <span style={styles.headerTitle}>Yaklaşan Süreler</span>
            <span style={styles.badge}>0</span>
          </div>
        </div>
        <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-secondary)" }}>
          <p>Şu an yaklaşan veya süresi dolan bir işlem bulunmuyor.</p>
        </div>
      </div>
    );
  }

  const visible = showAll ? deadlines : deadlines.slice(0, 3);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          <span style={styles.headerTitle}>Yaklaşan Süreler</span>
          <span style={styles.badge}>{deadlines.length}</span>
        </div>
        {deadlines.length > 3 && (
          <button onClick={() => setShowAll(!showAll)} style={styles.toggleBtn}>
            {showAll ? "Küçült" : "Tümünü Gör"}
          </button>
        )}
      </div>

      <div style={styles.list}>
        {visible.map((d) => {
          const daysLeft = getDaysLeft(d.deadline_date);
          const urgency = getUrgencyStyle(daysLeft);

          return (
            <div key={d.id} style={{ ...styles.item, background: urgency.bg, borderColor: urgency.border }}>
              <div style={styles.itemLeft}>
                <div style={styles.itemTitle}>{d.title}</div>
                <div style={styles.itemMeta}>
                  {d.esas_no && <span>{d.esas_no} · </span>}
                  {d.mahkeme && <span>{d.mahkeme} · </span>}
                  <span>{new Date(d.deadline_date).toLocaleDateString("tr-TR")}</span>
                </div>
                {d.description && <div style={styles.itemDesc}>{d.description.split('\n')[0]}</div>}
              </div>
              <div style={styles.itemRight}>
                <div style={{ ...styles.countdown, color: urgency.color }}>
                  {daysLeft <= 0 ? (
                    <span style={{ fontWeight: 700, fontSize: 11 }}>⚠ GEÇTİ</span>
                  ) : (
                    <>
                      <span style={styles.countdownNum}>{daysLeft}</span>
                      <span style={styles.countdownLabel}>gün</span>
                    </>
                  )}
                </div>
                <button onClick={() => handleAcknowledge(d.id)} style={styles.ackBtn} title="Görüldü olarak işaretle">
                  ✓
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  container: {
    background: "var(--color-bg-elevated)",
    borderRadius: 12,
    border: "1px solid var(--color-border-subtle)",
    overflow: "hidden",
    marginBottom: 20,
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "12px 16px", borderBottom: "1px solid var(--color-border-subtle)",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 8 },
  headerTitle: { fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" },
  badge: {
    background: "rgba(239,68,68,0.15)", color: "#EF4444", fontSize: 11,
    fontWeight: 700, padding: "2px 7px", borderRadius: 999,
  },
  toggleBtn: {
    background: "none", border: "none", color: "var(--color-accent)",
    fontSize: 12, fontWeight: 500, cursor: "pointer",
  },
  list: { display: "flex", flexDirection: "column", gap: 1 },
  item: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "12px 16px", border: "1px solid transparent",
    transition: "all 0.15s ease",
  },
  itemLeft: { flex: 1, overflow: "hidden" },
  itemTitle: { fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" },
  itemMeta: { fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2 },
  itemDesc: { fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  itemRight: { display: "flex", alignItems: "center", gap: 12, flexShrink: 0 },
  countdown: { textAlign: "center", minWidth: 40 },
  countdownNum: { fontSize: 20, fontWeight: 800, lineHeight: 1 },
  countdownLabel: { fontSize: 10, display: "block" },
  ackBtn: {
    width: 28, height: 28, borderRadius: "50%", border: "1px solid var(--color-border)",
    background: "var(--color-bg-subtle)", color: "var(--color-text-tertiary)",
    cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center",
    justifyContent: "center",
  },
};
