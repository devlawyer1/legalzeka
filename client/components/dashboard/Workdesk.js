"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckSquare,
  Clock,
  FileText,
  FolderOpen,
  RefreshCw,
  Search,
} from "lucide-react";
import { getWorkdeskOverview } from "@/lib/api";

function formatDate(value, withTime = false) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function daysUntil(value) {
  if (!value) return null;
  const diff = new Date(value).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function EmptyLine({ text }) {
  return <div style={styles.emptyLine}>{text}</div>;
}

function Section({ title, icon, action, children }) {
  return (
    <section style={styles.section}>
      <div style={styles.sectionHeader}>
        <div style={styles.sectionTitle}>
          {icon}
          <h3>{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, icon, tone }) {
  return (
    <div style={{ ...styles.stat, borderColor: tone }}>
      <span style={{ ...styles.statIcon, color: tone }}>{icon}</span>
      <div>
        <strong>{value ?? 0}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

export default function Workdesk({ activeFirm, user, onNavigate }) {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const firmId = activeFirm?.id;

  const loadOverview = async () => {
    if (!firmId) return;
    setLoading(true);
    setError("");
    try {
      const res = await getWorkdeskOverview(firmId);
      setOverview(res.data);
    } catch (err) {
      setError(err.message || "Çalışma masası yüklenemedi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, [firmId]);

  const criticalDeadlines = useMemo(() => {
    return (overview?.upcomingDeadlines || []).filter((item) => {
      const days = daysUntil(item.deadline_date);
      return days !== null && days <= 7;
    });
  }, [overview]);

  if (!firmId) {
    return (
      <div style={styles.emptyState}>
        <FolderOpen size={42} />
        <h2>Çalışma Masası</h2>
        <p>Günlük dosya, süre ve görev akışını görmek için bir büro oluşturun veya seçin.</p>
        <button style={styles.primaryButton} onClick={() => onNavigate?.("firm_management")}>
          <FolderOpen size={16} />
          Büro Yönetimine Git
        </button>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      <header style={styles.header}>
        <div>
          <span style={styles.eyebrow}>{activeFirm?.name || "Legal Zeka"}</span>
          <h1>Bugünkü Çalışma Masası</h1>
          <p>{user?.firstName ? `${user.firstName}, ` : ""}dosyalar, süreler ve riskler tek ekranda.</p>
        </div>
        <button style={styles.secondaryButton} onClick={loadOverview} disabled={loading}>
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Yenile
        </button>
      </header>

      {error && (
        <div style={styles.errorBox}>
          <AlertTriangle size={17} />
          {error}
        </div>
      )}

      <div style={styles.statsGrid}>
        <Stat label="Aktif dosya" value={overview?.stats?.activeCases} icon={<FolderOpen size={19} />} tone="#2563EB" />
        <Stat label="Bugünkü görev" value={overview?.stats?.tasksDueToday} icon={<CheckSquare size={19} />} tone="#16A34A" />
        <Stat label="Yaklaşan süre" value={overview?.stats?.upcomingDeadlines} icon={<Clock size={19} />} tone="#D97706" />
        <Stat label="AI risk uyarısı" value={overview?.stats?.openRisks} icon={<AlertTriangle size={19} />} tone="#DC2626" />
      </div>

      <div style={styles.mainGrid}>
        <Section
          title="Yaklaşan Süreler"
          icon={<Clock size={17} />}
          action={<button style={styles.linkButton} onClick={() => onNavigate?.("deadline_tracker")}>Tümü</button>}
        >
          {(overview?.upcomingDeadlines || []).length === 0 ? (
            <EmptyLine text="Yaklaşan süre bulunmuyor." />
          ) : (
            <div style={styles.list}>
              {(overview?.upcomingDeadlines || []).slice(0, 6).map((item) => {
                const days = daysUntil(item.deadline_date);
                const urgent = days !== null && days <= 3;
                return (
                  <button key={item.id} style={styles.rowButton} onClick={() => onNavigate?.("deadline_tracker")}>
                    <div style={styles.rowMain}>
                      <strong>{item.title}</strong>
                      <span>{item.esas_no || item.mahkeme || item.konu || "Dosya bağlantısı yok"}</span>
                    </div>
                    <span style={{ ...styles.datePill, ...(urgent ? styles.datePillDanger : {}) }}>
                      {days <= 0 ? "Bugün/Geçti" : `${days} gün`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Section>

        <Section
          title="Bugünkü Görevler"
          icon={<CheckSquare size={17} />}
          action={<button style={styles.linkButton} onClick={() => onNavigate?.("tasks")}>Kanban</button>}
        >
          {(overview?.tasksToday || []).length === 0 ? (
            <EmptyLine text="Bugüne düşen görev yok." />
          ) : (
            <div style={styles.list}>
              {(overview?.tasksToday || []).slice(0, 6).map((item) => (
                <button key={item.id} style={styles.rowButton} onClick={() => onNavigate?.("tasks")}>
                  <div style={styles.rowMain}>
                    <strong>{item.baslik}</strong>
                    <span>{item.esas_no || item.konu || item.durum}</span>
                  </div>
                  <span style={styles.priority}>{item.oncelik || "Normal"}</span>
                </button>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Dava Dosyaları"
          icon={<FolderOpen size={17} />}
          action={<button style={styles.linkButton} onClick={() => onNavigate?.("cases")}>Dosyalar</button>}
        >
          {(overview?.cases || []).length === 0 ? (
            <EmptyLine text="Aktif dava dosyası bulunmuyor." />
          ) : (
            <div style={styles.list}>
              {(overview?.cases || []).slice(0, 6).map((item) => (
                <button key={item.id} style={styles.rowButton} onClick={() => onNavigate?.("cases")}>
                  <div style={styles.rowMain}>
                    <strong>{item.esas_no || item.konu || "Dosya"}</strong>
                    <span>{item.mahkeme || `${item.taraf_davaci || ""} / ${item.taraf_davali || ""}`}</span>
                  </div>
                  <span style={styles.statusPill}>{item.durum || "Açık"}</span>
                </button>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Duruşmalar"
          icon={<CalendarDays size={17} />}
          action={<button style={styles.linkButton} onClick={() => onNavigate?.("cases")}>Takvim</button>}
        >
          {(overview?.hearings || []).length === 0 ? (
            <EmptyLine text="Yaklaşan duruşma bulunmuyor." />
          ) : (
            <div style={styles.list}>
              {(overview?.hearings || []).slice(0, 5).map((item) => (
                <button key={item.id} style={styles.rowButton} onClick={() => onNavigate?.("cases")}>
                  <div style={styles.rowMain}>
                    <strong>{item.esas_no || item.konu}</strong>
                    <span>{item.mahkeme || item.notes || "Duruşma"}</span>
                  </div>
                  <span style={styles.dateText}>{formatDate(item.hearing_date, true)}</span>
                </button>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Son Belgeler"
          icon={<FileText size={17} />}
          action={<button style={styles.linkButton} onClick={() => onNavigate?.("cases")}>Dosya Odası</button>}
        >
          {(overview?.recentDocuments || []).length === 0 ? (
            <EmptyLine text="Henüz belge yüklenmemiş." />
          ) : (
            <div style={styles.list}>
              {(overview?.recentDocuments || []).slice(0, 5).map((item) => (
                <button key={item.id} style={styles.rowButton} onClick={() => onNavigate?.("cases")}>
                  <div style={styles.rowMain}>
                    <strong>{item.document_name}</strong>
                    <span>{item.esas_no || item.konu || item.document_type}</span>
                  </div>
                  <span style={styles.statusPill}>{item.analysis_status || "pending"}</span>
                </button>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="AI Risk Uyarıları"
          icon={<AlertTriangle size={17} />}
          action={<span style={styles.countText}>{criticalDeadlines.length} kritik süre</span>}
        >
          {(overview?.aiRisks || []).length === 0 ? (
            <EmptyLine text="Açık AI risk uyarısı yok." />
          ) : (
            <div style={styles.list}>
              {(overview?.aiRisks || []).slice(0, 5).map((item) => {
                const firstWarning = Array.isArray(item.warnings) ? item.warnings[0] : null;
                return (
                  <button key={item.id} style={styles.rowButton} onClick={() => onNavigate?.("cases")}>
                    <div style={styles.rowMain}>
                      <strong>{firstWarning?.label || item.document_name || "Risk uyarısı"}</strong>
                      <span>{firstWarning?.message || item.esas_no || item.konu}</span>
                    </div>
                    <span style={styles.dangerDot} />
                  </button>
                );
              })}
            </div>
          )}
        </Section>

        <Section
          title="Son Araştırmalar"
          icon={<Search size={17} />}
          action={<button style={styles.linkButton} onClick={() => onNavigate?.("search")}>Araştır</button>}
        >
          {(overview?.recentResearch || []).length === 0 ? (
            <EmptyLine text="Henüz kayıtlı araştırma yok." />
          ) : (
            <div style={styles.list}>
              {(overview?.recentResearch || []).slice(0, 5).map((item) => (
                <button key={item.id} style={styles.rowButton} onClick={() => onNavigate?.("search")}>
                  <div style={styles.rowMain}>
                    <strong>{item.query}</strong>
                    <span>{item.search_type === "semantic" ? "Semantik arama" : "Kelime araması"}</span>
                  </div>
                  <span style={styles.dateText}>{formatDate(item.created_at)}</span>
                </button>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    maxWidth: 1280,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 18,
    color: "var(--color-text-primary)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: 800,
    color: "var(--color-text-tertiary)",
    textTransform: "uppercase",
    letterSpacing: 0,
  },
  secondaryButton: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    border: "1px solid var(--color-border)",
    background: "var(--color-bg-elevated)",
    color: "var(--color-text-primary)",
    borderRadius: 8,
    padding: "9px 12px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  primaryButton: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    border: "none",
    background: "var(--color-accent)",
    color: "var(--color-text-inverse)",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 12,
  },
  stat: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: 14,
    background: "var(--color-bg-elevated)",
    border: "1px solid var(--color-border-subtle)",
    borderLeftWidth: 3,
    borderRadius: 8,
  },
  statIcon: {
    display: "flex",
    alignItems: "center",
  },
  mainGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 14,
  },
  section: {
    background: "var(--color-bg-elevated)",
    border: "1px solid var(--color-border-subtle)",
    borderRadius: 8,
    overflow: "hidden",
    minHeight: 190,
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "13px 14px",
    borderBottom: "1px solid var(--color-border-subtle)",
  },
  sectionTitle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  list: {
    display: "flex",
    flexDirection: "column",
  },
  rowButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    width: "100%",
    border: "none",
    borderBottom: "1px solid var(--color-border-subtle)",
    background: "transparent",
    color: "var(--color-text-primary)",
    padding: "11px 14px",
    textAlign: "left",
    cursor: "pointer",
  },
  rowMain: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    minWidth: 0,
  },
  datePill: {
    fontSize: 11,
    fontWeight: 800,
    color: "#92400E",
    background: "#FEF3C7",
    padding: "4px 7px",
    borderRadius: 999,
    whiteSpace: "nowrap",
  },
  datePillDanger: {
    color: "#991B1B",
    background: "#FEE2E2",
  },
  priority: {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--color-text-secondary)",
  },
  statusPill: {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--color-accent)",
    background: "rgba(37,99,235,0.08)",
    padding: "4px 7px",
    borderRadius: 999,
    whiteSpace: "nowrap",
  },
  dateText: {
    fontSize: 12,
    color: "var(--color-text-tertiary)",
    whiteSpace: "nowrap",
  },
  linkButton: {
    border: "none",
    background: "transparent",
    color: "var(--color-accent)",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  },
  countText: {
    fontSize: 12,
    fontWeight: 700,
    color: "var(--color-text-tertiary)",
  },
  dangerDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
    background: "#DC2626",
    flexShrink: 0,
  },
  emptyLine: {
    padding: 18,
    color: "var(--color-text-tertiary)",
    fontSize: 13,
  },
  emptyState: {
    minHeight: 460,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    gap: 14,
    textAlign: "center",
    color: "var(--color-text-secondary)",
  },
  errorBox: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    background: "#FEE2E2",
    color: "#991B1B",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
  },
};
