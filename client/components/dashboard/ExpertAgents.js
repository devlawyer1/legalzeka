"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpenCheck,
  BrainCircuit,
  FileCheck2,
  Gavel,
  GraduationCap,
  Loader2,
  Play,
  Save,
  Scale,
  Search,
  ShieldCheck,
  Upload,
} from "lucide-react";
import {
  getCases,
  getLegalWorkflowCatalog,
  getLegalWorkflowProfile,
  runLegalWorkflow,
  updateLegalWorkflowProfile,
} from "@/lib/api";

const roleLabels = {
  avukat: "Avukat",
  ogrenci: "Öğrenci",
  akademisyen: "Akademisyen",
  hakim_savci: "Hakim / Savcı",
};

const workflowIcons = {
  case_strategy: Gavel,
  petition_review: FileCheck2,
  contract_review: ShieldCheck,
  student_coach: GraduationCap,
  academic_research: BookOpenCheck,
  bench_support: Scale,
};

function splitCsv(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinList(value) {
  return Array.isArray(value) ? value.join(", ") : value || "";
}

function SourceBadge({ source }) {
  const tone =
    source.type === "emsal"
      ? styles.sourceBadgeBlue
      : source.type === "mevzuat" || source.type === "resmi_mevzuat"
        ? styles.sourceBadgeGreen
        : styles.sourceBadgeNeutral;

  return <span style={{ ...styles.sourceBadge, ...tone }}>{source.type}</span>;
}

export default function ExpertAgents({ activeFirmId, onSaveNote }) {
  const [workflows, setWorkflows] = useState([]);
  const [markers, setMarkers] = useState([]);
  const [profileDraft, setProfileDraft] = useState(null);
  const [cases, setCases] = useState([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [selectedRole, setSelectedRole] = useState("all");
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [task, setTask] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [includeLiveSources, setIncludeLiveSources] = useState(true);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadInitialData() {
      setLoading(true);
      setError("");
      try {
        const [catalogRes, profileRes] = await Promise.all([
          getLegalWorkflowCatalog(),
          getLegalWorkflowProfile(),
        ]);

        if (!mounted) return;
        const catalogWorkflows = catalogRes.data?.workflows || [];
        const activeProfile = profileRes.data;

        setWorkflows(catalogWorkflows);
        setMarkers(catalogRes.data?.markers || []);
        setProfileDraft({
          roleFocus: activeProfile?.roleFocus || "avukat",
          practiceAreas: joinList(activeProfile?.practiceAreas || []),
          jurisdictionFocus: activeProfile?.jurisdictionFocus || "Türkiye",
          houseStyle: activeProfile?.houseStyle || "",
          riskPosture: activeProfile?.riskPosture || "dengeli",
          reviewPolicy: activeProfile?.reviewPolicy || "",
          sourcePreferences: joinList(activeProfile?.sourcePreferences || []),
        });
        setSelectedRole(activeProfile?.roleFocus || "all");
        setSelectedWorkflowId(catalogWorkflows[0]?.id || "");
      } catch (err) {
        if (mounted) setError(err.message || "Uzman ajanlar yüklenemedi.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadInitialData();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!activeFirmId) return;

    getCases(activeFirmId)
      .then((res) => setCases(res.data || []))
      .catch(() => setCases([]));
  }, [activeFirmId]);

  const filteredWorkflows = useMemo(() => {
    if (selectedRole === "all") return workflows;
    return workflows.filter((workflow) => workflow.role === selectedRole);
  }, [workflows, selectedRole]);

  const selectedWorkflow = useMemo(
    () => workflows.find((workflow) => workflow.id === selectedWorkflowId) || filteredWorkflows[0],
    [filteredWorkflows, selectedWorkflowId, workflows]
  );

  const validSelectedCaseId = useMemo(() => {
    if (!activeFirmId || !selectedCaseId) return "";
    return cases.some((item) => item.id === selectedCaseId) ? selectedCaseId : "";
  }, [activeFirmId, cases, selectedCaseId]);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setError("");
    try {
      const payload = {
        roleFocus: profileDraft.roleFocus,
        practiceAreas: splitCsv(profileDraft.practiceAreas || ""),
        jurisdictionFocus: profileDraft.jurisdictionFocus,
        houseStyle: profileDraft.houseStyle,
        riskPosture: profileDraft.riskPosture,
        reviewPolicy: profileDraft.reviewPolicy,
        sourcePreferences: splitCsv(profileDraft.sourcePreferences || ""),
      };
      const res = await updateLegalWorkflowProfile(payload);
      setSelectedRole(res.data.roleFocus || "all");
    } catch (err) {
      setError(err.message || "Profil kaydedilemedi.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleRunWorkflow = async (event) => {
    event.preventDefault();
    if (!selectedWorkflow) return;

    setRunning(true);
    setResult(null);
    setError("");

    try {
      const formData = new FormData();
      formData.append("workflowId", selectedWorkflow.id);
      formData.append("task", task);
      formData.append("text", text);
      formData.append("includeLiveSources", includeLiveSources ? "true" : "false");
      if (activeFirmId) formData.append("firmId", activeFirmId);
      if (activeFirmId && validSelectedCaseId) formData.append("caseId", validSelectedCaseId);
      if (file) formData.append("document", file);

      const res = await runLegalWorkflow(formData);
      setResult(res.data);
    } catch (err) {
      setError(err.message || "Uzman ajan çalıştırılamadı.");
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.loadingState}>
        <Loader2 size={24} className="animate-spin" />
        <span>Uzman ajanlar hazırlanıyor...</span>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.header}>
        <div>
          <div style={styles.eyebrow}>Legal Zeka workflow layer</div>
          <h2 style={styles.title}>Uzman Ajanlar</h2>
          <p style={styles.subtitle}>
            Türk hukuk kaynaklarıyla çalışan, doğrulama işaretleri ve insan incelemesi kapıları olan rol bazlı iş akışları.
          </p>
        </div>
        <div style={styles.headerBadge}>
          <BrainCircuit size={18} />
          <span>Kaynaklı taslak modu</span>
        </div>
      </div>

      {error && (
        <div style={styles.errorBox}>
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      <div style={styles.layout}>
        <section style={styles.leftPanel}>
          <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>Ajan seçimi</h3>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              style={styles.compactSelect}
            >
              <option value="all">Tüm roller</option>
              {Object.entries(roleLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div style={styles.workflowList}>
            {filteredWorkflows.map((workflow) => {
              const Icon = workflowIcons[workflow.id] || BrainCircuit;
              const active = selectedWorkflow?.id === workflow.id;
              return (
                <button
                  key={workflow.id}
                  onClick={() => setSelectedWorkflowId(workflow.id)}
                  style={{
                    ...styles.workflowButton,
                    ...(active ? styles.workflowButtonActive : {}),
                  }}
                >
                  <span style={{ ...styles.workflowIcon, ...(active ? styles.workflowIconActive : {}) }}>
                    <Icon size={18} />
                  </span>
                  <span style={styles.workflowText}>
                    <span style={styles.workflowTitle}>{workflow.shortTitle || workflow.title}</span>
                    <span style={styles.workflowDesc}>{workflow.purpose}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div style={styles.profilePanel}>
            <div style={styles.sectionHeader}>
              <h3 style={styles.sectionTitle}>Pratik profili</h3>
              <button onClick={handleSaveProfile} style={styles.iconButton} disabled={savingProfile}>
                {savingProfile ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                <span>{savingProfile ? "Kaydediliyor" : "Kaydet"}</span>
              </button>
            </div>

            {profileDraft && (
              <div style={styles.profileGrid}>
                <label style={styles.field}>
                  <span>Rol odağı</span>
                  <select
                    value={profileDraft.roleFocus}
                    onChange={(e) => setProfileDraft({ ...profileDraft, roleFocus: e.target.value })}
                    style={styles.input}
                  >
                    {Object.entries(roleLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <label style={styles.field}>
                  <span>Çalışma alanları</span>
                  <input
                    value={profileDraft.practiceAreas}
                    onChange={(e) => setProfileDraft({ ...profileDraft, practiceAreas: e.target.value })}
                    style={styles.input}
                    placeholder="İş hukuku, ceza, ticaret"
                  />
                </label>
                <label style={styles.field}>
                  <span>Yargı çevresi</span>
                  <input
                    value={profileDraft.jurisdictionFocus}
                    onChange={(e) => setProfileDraft({ ...profileDraft, jurisdictionFocus: e.target.value })}
                    style={styles.input}
                    placeholder="Türkiye"
                  />
                </label>
                <label style={styles.field}>
                  <span>Risk yaklaşımı</span>
                  <select
                    value={profileDraft.riskPosture}
                    onChange={(e) => setProfileDraft({ ...profileDraft, riskPosture: e.target.value })}
                    style={styles.input}
                  >
                    <option value="temkinli">Temkinli</option>
                    <option value="dengeli">Dengeli</option>
                    <option value="atak">Atak</option>
                  </select>
                </label>
                <label style={styles.fieldWide}>
                  <span>Üslup ve çıktı tercihi</span>
                  <textarea
                    value={profileDraft.houseStyle}
                    onChange={(e) => setProfileDraft({ ...profileDraft, houseStyle: e.target.value })}
                    style={styles.smallTextarea}
                    placeholder="Kısa yönetici özeti, ardından kaynaklı kontrol listesi..."
                  />
                </label>
                <label style={styles.fieldWide}>
                  <span>Kaynak tercihleri</span>
                  <input
                    value={profileDraft.sourcePreferences}
                    onChange={(e) => setProfileDraft({ ...profileDraft, sourcePreferences: e.target.value })}
                    style={styles.input}
                    placeholder="Bedesten, UYAP Emsal, Resmi Gazete"
                  />
                </label>
              </div>
            )}
          </div>
        </section>

        <section style={styles.mainPanel}>
          <form onSubmit={handleRunWorkflow} style={styles.runForm}>
            <div style={styles.selectedHeader}>
              <div>
                <h3 style={styles.selectedTitle}>{selectedWorkflow?.title || "Uzman ajan"}</h3>
                <p style={styles.selectedDesc}>{selectedWorkflow?.inputHint}</p>
              </div>
              <span style={styles.rolePill}>{roleLabels[selectedWorkflow?.role] || "Rol"}</span>
            </div>

            <div style={styles.formRow}>
              <label style={styles.fieldWide}>
                <span>Görev</span>
                <input
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  style={styles.input}
                  placeholder="Örn. işe iade davasında cevap dilekçesini risk ve delil yönünden incele"
                />
              </label>
              <label style={styles.field}>
                <span>Dava dosyası</span>
                <select
                  value={validSelectedCaseId}
                  onChange={(e) => setSelectedCaseId(e.target.value)}
                  style={styles.input}
                  disabled={!cases.length}
                >
                  <option value="">Bağlama</option>
                  {(activeFirmId ? cases : []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.esas_no || item.konu || item.mahkeme}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label style={styles.fieldWide}>
              <span>Metin veya dosya özeti</span>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                style={styles.textarea}
                placeholder="Dava özeti, dilekçe, sözleşme metni, araştırma başlığı veya olay çözümü metnini buraya yazın."
              />
            </label>

            <div style={styles.actionsRow}>
              <label style={styles.uploadBox}>
                <Upload size={17} />
                <span>{file ? file.name : "Belge yükle"}</span>
                <input
                  type="file"
                  accept=".pdf,.txt,.doc,.docx,.png,.jpg,.jpeg"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  style={{ display: "none" }}
                />
              </label>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={includeLiveSources}
                  onChange={(e) => setIncludeLiveSources(e.target.checked)}
                />
                <span>Canlı Türkiye kaynaklarını kullan</span>
              </label>
              <button type="submit" style={styles.primaryButton} disabled={running}>
                {running ? <Loader2 size={17} className="animate-spin" /> : <Play size={17} />}
                <span>{running ? "Çalışıyor" : "Ajanı çalıştır"}</span>
              </button>
            </div>
          </form>

          {markers.length > 0 && (
            <div style={styles.markerStrip}>
              {markers.map((marker) => (
                <span key={marker.code} style={styles.markerPill}>
                  {marker.code}
                </span>
              ))}
            </div>
          )}

          {result && (
            <div style={styles.resultGrid}>
              <div style={styles.answerPanel}>
                <div style={styles.resultHeader}>
                  <div>
                    <div style={styles.eyebrow}>Uzman ajan çıktısı</div>
                    <h3 style={styles.resultTitle}>{result.workflow?.title}</h3>
                  </div>
                  <button
                    onClick={() => onSaveNote?.(result.answer)}
                    style={styles.secondaryButton}
                    type="button"
                  >
                    <Save size={15} />
                    <span>Notlara ekle</span>
                  </button>
                </div>
                <div style={styles.answerText}>{result.answer}</div>
              </div>

              <aside style={styles.sourcesPanel}>
                <div style={styles.sourcesHeader}>
                  <Search size={17} />
                  <span>Kaynaklar</span>
                </div>
                {result.sources?.length ? (
                  <div style={styles.sourcesList}>
                    {result.sources.map((source, index) => (
                      <div key={`${source.type}-${source.title}-${index}`} style={styles.sourceItem}>
                        <div style={styles.sourceTop}>
                          <SourceBadge source={source} />
                          <span style={styles.sourceIndex}>S{index + 1}</span>
                        </div>
                        <strong style={styles.sourceTitle}>{source.title}</strong>
                        {source.citation && <span style={styles.sourceCitation}>{source.citation}</span>}
                        <p style={styles.sourceExcerpt}>{source.excerpt}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={styles.emptyText}>Kaynak bulunamadı; çıktıdaki iddialar doğrulama etiketiyle incelenmeli.</p>
                )}
              </aside>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    width: "100%",
    maxWidth: 1420,
    margin: "0 auto",
    color: "var(--color-text-primary)",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 20,
    marginBottom: 20,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0,
    textTransform: "uppercase",
    color: "var(--color-text-tertiary)",
    marginBottom: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    margin: 0,
  },
  subtitle: {
    fontSize: 14,
    color: "var(--color-text-secondary)",
    margin: "8px 0 0",
    maxWidth: 760,
    lineHeight: 1.55,
  },
  headerBadge: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 12px",
    border: "1px solid var(--color-border-subtle)",
    borderRadius: 8,
    background: "var(--color-bg-elevated)",
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "360px minmax(0, 1fr)",
    gap: 18,
    alignItems: "start",
  },
  leftPanel: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  mainPanel: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    minWidth: 0,
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 700,
    margin: 0,
  },
  workflowList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  workflowButton: {
    display: "flex",
    gap: 10,
    width: "100%",
    padding: 12,
    borderRadius: 8,
    border: "1px solid var(--color-border-subtle)",
    background: "var(--color-bg-elevated)",
    color: "var(--color-text-primary)",
    cursor: "pointer",
    textAlign: "left",
  },
  workflowButtonActive: {
    borderColor: "var(--color-accent)",
    background: "rgba(37, 99, 235, 0.08)",
  },
  workflowIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--color-bg-muted)",
    color: "var(--color-text-secondary)",
    flexShrink: 0,
  },
  workflowIconActive: {
    background: "var(--color-accent)",
    color: "var(--color-text-inverse)",
  },
  workflowText: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
  },
  workflowTitle: {
    fontSize: 14,
    fontWeight: 700,
  },
  workflowDesc: {
    fontSize: 12,
    lineHeight: 1.45,
    color: "var(--color-text-secondary)",
  },
  profilePanel: {
    padding: 14,
    borderRadius: 8,
    border: "1px solid var(--color-border-subtle)",
    background: "var(--color-bg-elevated)",
  },
  profileGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  runForm: {
    padding: 18,
    borderRadius: 8,
    border: "1px solid var(--color-border-subtle)",
    background: "var(--color-bg-elevated)",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  selectedHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
  },
  selectedTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 700,
  },
  selectedDesc: {
    margin: "6px 0 0",
    color: "var(--color-text-secondary)",
    fontSize: 13,
  },
  rolePill: {
    alignSelf: "flex-start",
    padding: "6px 10px",
    borderRadius: 999,
    background: "var(--color-bg-muted)",
    color: "var(--color-text-secondary)",
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  formRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 240px",
    gap: 12,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontSize: 12,
    fontWeight: 700,
    color: "var(--color-text-secondary)",
  },
  fieldWide: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontSize: 12,
    fontWeight: 700,
    color: "var(--color-text-secondary)",
    gridColumn: "1 / -1",
  },
  input: {
    width: "100%",
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    padding: "10px 11px",
    background: "var(--color-bg)",
    color: "var(--color-text-primary)",
    fontSize: 13,
    outline: "none",
  },
  compactSelect: {
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    padding: "8px 10px",
    background: "var(--color-bg-elevated)",
    color: "var(--color-text-primary)",
    fontSize: 12,
    outline: "none",
  },
  textarea: {
    minHeight: 190,
    width: "100%",
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    padding: 12,
    background: "var(--color-bg)",
    color: "var(--color-text-primary)",
    fontSize: 14,
    lineHeight: 1.55,
    resize: "vertical",
    outline: "none",
  },
  smallTextarea: {
    minHeight: 72,
    width: "100%",
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    padding: 10,
    background: "var(--color-bg)",
    color: "var(--color-text-primary)",
    fontSize: 13,
    lineHeight: 1.45,
    resize: "vertical",
    outline: "none",
  },
  actionsRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  uploadBox: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 12px",
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    background: "var(--color-bg)",
    color: "var(--color-text-secondary)",
    fontSize: 13,
    cursor: "pointer",
    maxWidth: 260,
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "var(--color-text-secondary)",
  },
  primaryButton: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    borderRadius: 8,
    border: "none",
    background: "var(--color-accent)",
    color: "var(--color-text-inverse)",
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryButton: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid var(--color-border)",
    background: "var(--color-bg)",
    color: "var(--color-text-primary)",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  iconButton: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    padding: "7px 9px",
    background: "var(--color-bg)",
    color: "var(--color-text-primary)",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  markerStrip: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  markerPill: {
    padding: "6px 9px",
    borderRadius: 999,
    background: "#FEF3C7",
    color: "#92400E",
    fontSize: 12,
    fontWeight: 800,
  },
  resultGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 320px",
    gap: 14,
    alignItems: "start",
  },
  answerPanel: {
    borderRadius: 8,
    border: "1px solid var(--color-border-subtle)",
    background: "var(--color-bg-elevated)",
    overflow: "hidden",
  },
  resultHeader: {
    padding: 16,
    borderBottom: "1px solid var(--color-border-subtle)",
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
  },
  resultTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
  },
  answerText: {
    padding: 18,
    whiteSpace: "pre-wrap",
    lineHeight: 1.65,
    fontSize: 14,
    color: "var(--color-text-primary)",
  },
  sourcesPanel: {
    borderRadius: 8,
    border: "1px solid var(--color-border-subtle)",
    background: "var(--color-bg-elevated)",
    overflow: "hidden",
  },
  sourcesHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: 14,
    borderBottom: "1px solid var(--color-border-subtle)",
    fontSize: 14,
    fontWeight: 700,
  },
  sourcesList: {
    display: "flex",
    flexDirection: "column",
  },
  sourceItem: {
    padding: 14,
    borderBottom: "1px solid var(--color-border-subtle)",
  },
  sourceTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sourceBadge: {
    padding: "4px 7px",
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 800,
    textTransform: "uppercase",
  },
  sourceBadgeBlue: {
    background: "#DBEAFE",
    color: "#1D4ED8",
  },
  sourceBadgeGreen: {
    background: "#DCFCE7",
    color: "#15803D",
  },
  sourceBadgeNeutral: {
    background: "var(--color-bg-muted)",
    color: "var(--color-text-secondary)",
  },
  sourceIndex: {
    color: "var(--color-text-tertiary)",
    fontSize: 11,
    fontWeight: 800,
  },
  sourceTitle: {
    display: "block",
    fontSize: 13,
    lineHeight: 1.35,
    marginBottom: 5,
  },
  sourceCitation: {
    display: "block",
    fontSize: 11,
    color: "var(--color-text-tertiary)",
    marginBottom: 8,
  },
  sourceExcerpt: {
    margin: 0,
    fontSize: 12,
    lineHeight: 1.45,
    color: "var(--color-text-secondary)",
  },
  emptyText: {
    padding: 14,
    margin: 0,
    fontSize: 13,
    color: "var(--color-text-secondary)",
  },
  errorBox: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 8,
    background: "#FEE2E2",
    color: "#991B1B",
    marginBottom: 14,
    fontSize: 13,
    fontWeight: 600,
  },
  loadingState: {
    minHeight: 360,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    color: "var(--color-text-secondary)",
  },
};
