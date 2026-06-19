"use client";

import { useState, useEffect } from "react";
import { Scale, FileText, Calendar, Bell, Clock, Pin } from "lucide-react";

const SEVERITY_COLORS = {
  critical: { dot: "var(--color-error)", bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.2)" },
  warning: { dot: "var(--color-warning)", bg: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.15)" },
  info: { dot: "var(--color-accent)", bg: "rgba(59,130,246,0.06)", border: "rgba(59,130,246,0.12)" },
  success: { dot: "var(--color-success)", bg: "rgba(34,197,94,0.06)", border: "rgba(34,197,94,0.12)" },
};

const TYPE_ICONS = {
  case_open: <Scale size={16} />, document: <FileText size={16} />, hearing: <Calendar size={16} />, notification: <Bell size={16} />, deadline: <Clock size={16} />,
};

export default function CaseTimeline({ caseId, onBack }) {
  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (caseId) loadTimeline();
  }, [caseId]);

  const loadTimeline = async () => {
    setLoading(true);
    setError(null);
    try {
      const { getCaseTimeline } = await import("@/lib/api");
      const res = await getCaseTimeline(caseId);
      setTimeline(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300 }}>
        <div style={{ width: 32, height: 32, border: "3px solid var(--color-border)", borderTopColor: "var(--color-accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <p style={{ color: "var(--color-danger)" }}>{error}</p>
        {onBack && <button onClick={onBack} style={styles.backBtn}>← Geri Dön</button>}
      </div>
    );
  }

  if (!timeline || timeline.events.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <p style={{ color: "var(--color-text-tertiary)" }}>Bu dava için henüz süreç verisi bulunamadı.</p>
        {onBack && <button onClick={onBack} style={styles.backBtn}>← Geri Dön</button>}
      </div>
    );
  }

  const { caseInfo, events } = timeline;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        {onBack && (
          <button onClick={onBack} style={styles.backBtn}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            Geri
          </button>
        )}
        <div>
          <h2 style={styles.title}>Dava Süreç Haritası</h2>
          <div style={styles.subtitle}>
            {caseInfo.esas_no} · {caseInfo.mahkeme} · {events.length} olay
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div style={styles.timeline}>
        {events.map((event, idx) => {
          const colors = SEVERITY_COLORS[event.severity] || SEVERITY_COLORS.info;
          const icon = TYPE_ICONS[event.type] || <Pin size={16} />;
          const isLast = idx === events.length - 1;

          return (
            <div key={idx} style={styles.eventRow}>
              {/* Left: Date */}
              <div style={styles.dateCol}>
                <div style={styles.dateDay}>
                  {new Date(event.date).toLocaleDateString("tr-TR", { day: "2-digit" })}
                </div>
                <div style={styles.dateMonth}>
                  {new Date(event.date).toLocaleDateString("tr-TR", { month: "short", year: "numeric" })}
                </div>
              </div>

              {/* Center: Line + Dot */}
              <div style={styles.lineCol}>
                <div style={{ ...styles.dot, background: colors.dot, boxShadow: `0 0 0 4px ${colors.bg}` }} />
                {!isLast && <div style={styles.line} />}
              </div>

              {/* Right: Content */}
              <div style={{ ...styles.eventCard, background: colors.bg, borderColor: colors.border }}>
                <div style={styles.eventHeader}>
                  <span style={styles.eventIcon}>{icon}</span>
                  <span style={styles.eventTitle}>{event.title}</span>
                </div>
                {event.description && (
                  <div style={styles.eventDesc}>{event.description}</div>
                )}
                {event.meta?.esasNo && (
                  <div style={styles.eventMeta}>
                    Esas: {event.meta.esasNo} · Davacı: {event.meta.davaci} · Davalı: {event.meta.davali}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  container: { maxWidth: 800, margin: "0 auto", padding: 20 },
  header: {
    display: "flex", alignItems: "center", gap: 16, marginBottom: 32,
    paddingBottom: 20, borderBottom: "1px solid var(--color-border-subtle)",
  },
  title: { fontSize: 20, fontWeight: 700, color: "var(--color-text-primary)", margin: 0 },
  subtitle: { fontSize: 13, color: "var(--color-text-tertiary)", marginTop: 4 },
  backBtn: {
    display: "flex", alignItems: "center", gap: 4, padding: "6px 12px",
    fontSize: 13, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)",
    borderRadius: 8, color: "var(--color-text-secondary)", cursor: "pointer",
  },
  timeline: { display: "flex", flexDirection: "column" },
  eventRow: { display: "flex", gap: 16, minHeight: 80 },
  dateCol: { width: 60, textAlign: "right", flexShrink: 0, paddingTop: 2 },
  dateDay: { fontSize: 22, fontWeight: 800, color: "var(--color-text-primary)", lineHeight: 1 },
  dateMonth: { fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2, whiteSpace: "nowrap" },
  lineCol: { display: "flex", flexDirection: "column", alignItems: "center", width: 20, flexShrink: 0 },
  dot: { width: 14, height: 14, borderRadius: "50%", flexShrink: 0, zIndex: 1 },
  line: { width: 2, flex: 1, background: "var(--color-border-subtle)", marginTop: -2 },
  eventCard: {
    flex: 1, padding: "14px 16px", borderRadius: 10, border: "1px solid transparent",
    marginBottom: 12, transition: "all 0.15s ease",
  },
  eventHeader: { display: "flex", alignItems: "center", gap: 8 },
  eventIcon: { fontSize: 16 },
  eventTitle: { fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" },
  eventDesc: { fontSize: 13, color: "var(--color-text-secondary)", marginTop: 6, lineHeight: 1.5 },
  eventMeta: { fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 6 },
};
