"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FileSearch,
  FolderOpen,
  History,
  Loader2,
  Pencil,
  Plus,
  Save,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import {
  deleteLegalResearchSession,
  getAccessibleCases,
  getLegalResearchSession,
  getLegalResearchSessions,
  getLegalSource,
  renameLegalResearchSession,
  saveLegalResearchToMatter,
  submitLegalResearch,
} from "@/lib/api";

const SOURCE_TYPES = [
  ["COURT_DECISION", "Yargı kararı"],
  ["CONSTITUTIONAL_COURT_DECISION", "AYM kararı"],
  ["ADMINISTRATIVE_DECISION", "İdari yargı"],
  ["ECHR_DECISION", "AİHM kararı"],
  ["LEGISLATION_VERSION", "Mevzuat"],
];

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}

function splitList(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function latestAnswer(detail) {
  const answer = detail?.answers?.at(-1);
  if (!answer) return null;
  const structured = answer.structured_content || {};
  return {
    answerId: answer.id,
    sessionId: answer.session_id,
    status: answer.status,
    summary: answer.summary,
    analysis: structured.analysis || [],
    counterArguments: structured.counterArguments || [],
    missingInformation: structured.missingInformation || [],
    warnings: structured.warnings || [],
    confidence: structured.confidence || null,
    citations: answer.citations || [],
    usage: {
      model: answer.model,
      inputTokens: answer.input_tokens,
      outputTokens: answer.output_tokens,
      totalCost: Number(answer.total_cost || 0),
    },
    metrics: {
      durationMs: answer.duration_ms,
      cacheStatus: answer.search_cache_status,
    },
  };
}

function caseLabel(item) {
  return item.esas_no || item.konu || item.mahkeme || "Dava dosyası";
}

function sourceTypeLabel(value) {
  return SOURCE_TYPES.find(([type]) => type === value)?.[1]
    || (value === "LEGISLATION" ? "Mevzuat" : value || "Hukuk kaynağı");
}

function confidenceTone(level) {
  if (level === "HIGH") return styles.toneSuccess;
  if (level === "LOW") return styles.toneDanger;
  return styles.toneWarning;
}

export default function LegalResearchWorkspace({ initialCaseId = null, embedded = false }) {
  const [sessions, setSessions] = useState([]);
  const [cases, setCases] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [sessionDetail, setSessionDetail] = useState(null);
  const [answer, setAnswer] = useState(null);
  const [query, setQuery] = useState("");
  const [selectedCaseId, setSelectedCaseId] = useState(initialCaseId || "");
  const [effectiveAt, setEffectiveAt] = useState(new Date().toISOString().slice(0, 10));
  const [filtersOpen, setFiltersOpen] = useState(!embedded);
  const [filters, setFilters] = useState({
    courts: "",
    chambers: "",
    sourceTypes: [],
    dateFrom: "",
    dateTo: "",
    legalDomain: "",
  });
  const [loading, setLoading] = useState(true);
  const [answering, setAnswering] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sourceDetails, setSourceDetails] = useState({});
  const [expandedSourceId, setExpandedSourceId] = useState(null);

  const matterId = initialCaseId || selectedCaseId || null;

  const loadSessions = useCallback(async () => {
    const response = await getLegalResearchSessions({ caseId: initialCaseId || undefined });
    setSessions(response.data || []);
  }, [initialCaseId]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadSessions(), getAccessibleCases()])
      .then(([, caseResponse]) => {
        if (!cancelled) setCases(caseResponse.data || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Araştırma geçmişi yüklenemedi.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [loadSessions]);

  const openSession = useCallback(async (sessionId) => {
    setError("");
    setNotice("");
    setActiveSessionId(sessionId);
    try {
      const response = await getLegalResearchSession(sessionId);
      setSessionDetail(response.data);
      setAnswer(latestAnswer(response.data));
      setSelectedCaseId(response.data.case_id || initialCaseId || "");
      if (response.data.effective_at) setEffectiveAt(String(response.data.effective_at).slice(0, 10));
      if (response.data.legal_domain) {
        setFilters((current) => ({ ...current, legalDomain: response.data.legal_domain }));
      }
    } catch (err) {
      setError(err.message || "Araştırma açılamadı.");
    }
  }, [initialCaseId]);

  const newResearch = () => {
    setActiveSessionId(null);
    setSessionDetail(null);
    setAnswer(null);
    setQuery("");
    setError("");
    setNotice("");
    if (!initialCaseId) setSelectedCaseId("");
  };

  const submit = async (event) => {
    event.preventDefault();
    if (query.trim().length < 3 || answering) return;
    setAnswering(true);
    setError("");
    setNotice("");
    try {
      const response = await submitLegalResearch({
        query: query.trim(),
        sessionId: activeSessionId || null,
        caseId: matterId,
        effectiveAt: effectiveAt || null,
        filters: {
          courts: splitList(filters.courts),
          chambers: splitList(filters.chambers),
          sourceTypes: filters.sourceTypes,
          dateFrom: filters.dateFrom || null,
          dateTo: filters.dateTo || null,
          legalDomain: filters.legalDomain.trim() || null,
        },
      }, crypto.randomUUID());
      setAnswer(response.data);
      setActiveSessionId(response.data.sessionId);
      setQuery("");
      await loadSessions();
      const detail = await getLegalResearchSession(response.data.sessionId);
      setSessionDetail(detail.data);
    } catch (err) {
      setError(err.message || "Araştırma tamamlanamadı.");
    } finally {
      setAnswering(false);
    }
  };

  const renameSession = async (session, event) => {
    event.stopPropagation();
    const title = window.prompt("Araştırma başlığı", session.title);
    if (!title?.trim() || title.trim() === session.title) return;
    try {
      await renameLegalResearchSession(session.id, title.trim());
      await loadSessions();
    } catch (err) {
      setError(err.message || "Başlık değiştirilemedi.");
    }
  };

  const removeSession = async (session, event) => {
    event.stopPropagation();
    if (!window.confirm("Bu araştırmayı geçmişten kaldırmak istiyor musunuz?")) return;
    try {
      await deleteLegalResearchSession(session.id);
      if (activeSessionId === session.id) newResearch();
      await loadSessions();
    } catch (err) {
      setError(err.message || "Araştırma silinemedi.");
    }
  };

  const saveToMatter = async () => {
    if (!answer?.answerId || !answer?.sessionId || !matterId) return;
    try {
      await saveLegalResearchToMatter(answer.sessionId, answer.answerId, sessionDetail?.title);
      setNotice("Araştırma sonucu dosya notlarına kaydedildi.");
    } catch (err) {
      setError(err.message || "Dosya notu kaydedilemedi.");
    }
  };

  const toggleSource = async (citation) => {
    const sourceId = citation.source_id;
    if (expandedSourceId === sourceId) {
      setExpandedSourceId(null);
      return;
    }
    setExpandedSourceId(sourceId);
    if (sourceDetails[sourceId]) return;
    try {
      const response = await getLegalSource(sourceId);
      setSourceDetails((current) => ({ ...current, [sourceId]: response.data }));
    } catch (err) {
      setError(err.message || "Kaynak detayı açılamadı.");
    }
  };

  const selectedCase = useMemo(
    () => cases.find((item) => item.id === matterId),
    [cases, matterId]
  );

  const citationLink = (order) => (
    <button
      key={order}
      type="button"
      style={styles.citationLink}
      onClick={() => document.getElementById(`research-citation-${order}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
      title={`${order} numaralı kaynağa git`}
    >
      [{order}]
    </button>
  );

  return (
    <div className={`legal-research-workspace ${embedded ? "embedded" : ""}`} style={styles.workspace}>
      <aside style={styles.historyPane}>
        <div style={styles.historyHeader}>
          <div>
            <span style={styles.eyebrow}>Araştırma</span>
            <h2 style={styles.historyTitle}>{embedded ? "Dosya Araştırmaları" : "Geçmiş"}</h2>
          </div>
          <button type="button" style={styles.iconButton} onClick={newResearch} title="Yeni araştırma">
            <Plus size={17} />
          </button>
        </div>
        <div style={styles.sessionList}>
          {loading && <div style={styles.mutedRow}><Loader2 size={15} className="spin" /> Yükleniyor</div>}
          {!loading && sessions.length === 0 && <div style={styles.emptyHistory}>Henüz kayıt yok.</div>}
          {sessions.map((session) => (
            <div key={session.id} style={{ ...styles.sessionRow, ...(activeSessionId === session.id ? styles.sessionRowActive : {}) }}>
              <button type="button" onClick={() => openSession(session.id)} style={styles.sessionOpenButton}>
                <span style={styles.sessionMain}>
                  <strong>{session.title}</strong>
                  <span>{session.case_title || formatDate(session.updated_at)} · {session.message_count || 0} mesaj</span>
                </span>
              </button>
              <span style={styles.sessionActions}>
                <button type="button" style={styles.smallIcon} title="Başlığı değiştir" onClick={(event) => renameSession(session, event)}>
                  <Pencil size={13} />
                </button>
                <button type="button" style={styles.smallIcon} title="Araştırmayı sil" onClick={(event) => removeSession(session, event)}>
                  <Trash2 size={13} />
                </button>
              </span>
            </div>
          ))}
        </div>
      </aside>

      <main style={styles.mainPane}>
        <header style={styles.pageHeader}>
          <div>
            <span style={styles.eyebrow}>{embedded ? caseLabel(selectedCase || {}) : "Kaynak doğrulamalı çalışma alanı"}</span>
            <h1 style={styles.pageTitle}>Hukuk Araştırması</h1>
          </div>
          {activeSessionId && <span style={styles.sessionBadge}><History size={14} /> Takip sorusu</span>}
        </header>

        <form onSubmit={submit} style={styles.researchForm}>
          <textarea
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            style={styles.questionInput}
            placeholder="Hukuki sorunuzu yazın"
            maxLength={1000}
            rows={4}
          />
          <div style={styles.formToolbar}>
            <button type="button" style={styles.filterButton} onClick={() => setFiltersOpen((value) => !value)}>
              <SlidersHorizontal size={16} /> Filtreler <ChevronDown size={14} style={{ transform: filtersOpen ? "rotate(180deg)" : "none" }} />
            </button>
            <span style={styles.queryCount}>{query.length}/1000</span>
            <button type="submit" style={styles.primaryButton} disabled={answering || query.trim().length < 3}>
              {answering ? <Loader2 size={17} className="spin" /> : <Search size={17} />}
              {answering ? "Araştırılıyor" : "Araştır"}
            </button>
          </div>

          {filtersOpen && (
            <div className="research-filter-grid" style={styles.filterGrid}>
              {!initialCaseId && (
                <label style={styles.field}>
                  <span>Matter</span>
                  <select value={selectedCaseId} onChange={(event) => setSelectedCaseId(event.target.value)} style={styles.control}>
                    <option value="">Bağımsız araştırma</option>
                    {cases.map((item) => <option key={item.id} value={item.id}>{caseLabel(item)}</option>)}
                  </select>
                </label>
              )}
              <label style={styles.field}>
                <span>Olay tarihi</span>
                <input type="date" value={effectiveAt} onChange={(event) => setEffectiveAt(event.target.value)} style={styles.control} />
              </label>
              <label style={styles.field}>
                <span>Hukuk alanı</span>
                <input value={filters.legalDomain} onChange={(event) => setFilters({ ...filters, legalDomain: event.target.value })} style={styles.control} placeholder="İş Hukuku" />
              </label>
              <label style={styles.field}>
                <span>Mahkeme</span>
                <input value={filters.courts} onChange={(event) => setFilters({ ...filters, courts: event.target.value })} style={styles.control} placeholder="Yargıtay" />
              </label>
              <label style={styles.field}>
                <span>Daire</span>
                <input value={filters.chambers} onChange={(event) => setFilters({ ...filters, chambers: event.target.value })} style={styles.control} placeholder="9. Hukuk Dairesi" />
              </label>
              <label style={styles.field}>
                <span>Karar tarihi başlangıç</span>
                <input type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} style={styles.control} />
              </label>
              <label style={styles.field}>
                <span>Karar tarihi bitiş</span>
                <input type="date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} style={styles.control} />
              </label>
              <label style={{ ...styles.field, gridColumn: "1 / -1" }}>
                <span>Kaynak türleri</span>
                <span style={styles.sourceTypeRow}>
                  {SOURCE_TYPES.map(([value, label]) => {
                    const selected = filters.sourceTypes.includes(value);
                    return (
                      <button
                        type="button"
                        key={value}
                        style={{ ...styles.typeButton, ...(selected ? styles.typeButtonActive : {}) }}
                        onClick={() => setFilters({
                          ...filters,
                          sourceTypes: selected
                            ? filters.sourceTypes.filter((item) => item !== value)
                            : [...filters.sourceTypes, value],
                        })}
                      >
                        {label}
                      </button>
                    );
                  })}
                </span>
              </label>
            </div>
          )}
        </form>

        {error && <div style={styles.errorBox}><AlertTriangle size={17} /> {error}</div>}
        {notice && <div style={styles.successBox}><CheckCircle2 size={17} /> {notice}</div>}
        {answering && (
          <div style={styles.processing}><Loader2 size={20} className="spin" /><span>Kaynaklar aranıyor ve atıflar doğrulanıyor.</span></div>
        )}

        {!answering && !answer && (
          <div style={styles.blankState}>
            <FileSearch size={34} />
            <strong>Yeni araştırma</strong>
          </div>
        )}

        {answer && !answering && (
          <div style={styles.answerArea}>
            <section style={styles.answerHeader}>
              <div>
                <span style={styles.eyebrow}>Kaynaklı değerlendirme</span>
                <h2 style={styles.answerTitle}>{answer.summary}</h2>
              </div>
              <div style={styles.answerActions}>
                {answer.confidence && (
                  <span style={{ ...styles.confidence, ...confidenceTone(answer.confidence.level) }}>
                    {answer.confidence.level === "HIGH" ? "Yüksek" : answer.confidence.level === "LOW" ? "Düşük" : "Orta"} güven
                  </span>
                )}
                {matterId && (
                  <button type="button" style={styles.secondaryButton} onClick={saveToMatter}>
                    <Save size={15} /> Dosya notuna kaydet
                  </button>
                )}
              </div>
            </section>

            {answer.confidence?.reason && <p style={styles.confidenceReason}>{answer.confidence.reason}</p>}

            <section style={styles.analysisSection}>
              <h3 style={styles.sectionTitle}>Değerlendirme</h3>
              {answer.analysis.length === 0 && <p style={styles.mutedText}>Doğrulanmış hukuki iddia üretilemedi.</p>}
              {answer.analysis.map((claim) => (
                <p key={claim.claimKey} style={styles.claimText}>
                  {claim.text} {(claim.citationOrders || []).map(citationLink)}
                </p>
              ))}
            </section>

            <div className="research-answer-columns" style={styles.answerColumns}>
              <section style={styles.plainSection}>
                <h3 style={styles.sectionTitle}>Karşıt görüşler</h3>
                {answer.counterArguments.length === 0 && <p style={styles.mutedText}>Ayrı sorguda doğrulanmış karşıt kaynak bulunamadı.</p>}
                {answer.counterArguments.map((item, index) => (
                  <p key={`${item.claimKey || "counter"}-${index}`} style={styles.counterText}>
                    {item.text} {(item.citationOrders || []).map(citationLink)}
                  </p>
                ))}
              </section>
              <section style={styles.plainSection}>
                <h3 style={styles.sectionTitle}>Eksik bilgi ve uyarılar</h3>
                {[...(answer.missingInformation || []), ...(answer.warnings || [])].length === 0
                  ? <p style={styles.mutedText}>Ek uyarı yok.</p>
                  : [...(answer.missingInformation || []), ...(answer.warnings || [])].map((item, index) => (
                    <div key={`${item}-${index}`} style={styles.warningRow}><AlertTriangle size={15} /> <span>{item}</span></div>
                  ))}
              </section>
            </div>

            <section style={styles.sourcesSection}>
              <div style={styles.sourcesHeader}>
                <h3 style={styles.sectionTitle}>Doğrulanmış kaynaklar</h3>
                <span style={styles.metricText}>
                  {answer.citations.length} atıf · {answer.metrics?.durationMs || 0} ms · {answer.metrics?.cacheStatus || "MISS"}
                </span>
              </div>
              <div className="research-source-grid" style={styles.sourceGrid}>
                {answer.citations.map((citation) => {
                  const detail = sourceDetails[citation.source_id];
                  const expanded = expandedSourceId === citation.source_id;
                  return (
                    <article key={citation.id || `${citation.source_id}-${citation.citation_order}-${citation.claim_key}`} id={`research-citation-${citation.citation_order}`} style={styles.sourceCard}>
                      <div style={styles.sourceCardHeader}>
                        <span style={styles.sourceNumber}>[{citation.citation_order}]</span>
                        <span style={{ ...styles.supportBadge, ...(citation.support_type === "CONTRADICTS" ? styles.contradictsBadge : {}) }}>
                          {citation.support_type === "CONTRADICTS" ? "Çelişiyor" : citation.support_type === "BACKGROUND" ? "Arka plan" : "Destekliyor"}
                        </span>
                        <span style={styles.verifiedBadge}><CheckCircle2 size={12} /> {citation.verification_status}</span>
                      </div>
                      <h4 style={styles.sourceTitle}>{citation.title}</h4>
                      <p style={styles.sourceMeta}>
                        {[sourceTypeLabel(citation.source_type), citation.court, citation.chamber, citation.case_number, citation.decision_number, formatDate(citation.decision_date)].filter(Boolean).join(" · ")}
                      </p>
                      <blockquote style={styles.excerpt}>{citation.source_excerpt}</blockquote>
                      <p style={styles.claimKey}>İddia: {citation.claim_key}</p>
                      <div style={styles.sourceActions}>
                        <button type="button" style={styles.textButton} onClick={() => toggleSource(citation)}>
                          <BookOpen size={14} /> {expanded ? "Detayı kapat" : "Kaynak detayı"}
                        </button>
                        {citation.source_url && (
                          <a href={citation.source_url} target="_blank" rel="noreferrer" style={styles.textLink}>
                            <ExternalLink size={14} /> Resmî kaynak
                          </a>
                        )}
                      </div>
                      {expanded && (
                        <div style={styles.sourceDetail}>
                          {!detail && <span style={styles.mutedText}>Kaynak yükleniyor...</span>}
                          {detail?.chunks?.slice(0, 3).map((chunk) => (
                            <p key={chunk.id}>{chunk.heading ? <strong>{chunk.heading}: </strong> : null}{chunk.content}</p>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
              {answer.usage && (
                <div style={styles.usageLine}>
                  Model: {answer.usage.model || "-"} · {Number(answer.usage.inputTokens || 0) + Number(answer.usage.outputTokens || 0)} token · tahmini toplam ${Number(answer.usage.totalCost || 0).toFixed(6)}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      <style jsx>{`
        @keyframes research-spin { to { transform: rotate(360deg); } }
        :global(.spin) { animation: research-spin 0.8s linear infinite; }
        @media (max-width: 1050px) {
          .legal-research-workspace { grid-template-columns: 220px minmax(0, 1fr) !important; }
          .research-filter-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .research-answer-columns, .research-source-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 760px) {
          .legal-research-workspace { display: block !important; overflow: auto !important; }
          .legal-research-workspace > aside { max-height: 230px; border-right: 0 !important; border-bottom: 1px solid var(--color-border-subtle); }
          .legal-research-workspace > main { padding: 18px 14px 40px !important; overflow: visible !important; }
          .research-filter-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

const styles = {
  workspace: { display: "grid", gridTemplateColumns: "280px minmax(0, 1fr)", width: "100%", height: "100%", minHeight: 0, background: "var(--color-bg)", overflow: "hidden" },
  historyPane: { display: "flex", flexDirection: "column", minWidth: 0, background: "var(--color-bg-subtle)", borderRight: "1px solid var(--color-border-subtle)", overflow: "hidden" },
  historyHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 16px 14px", borderBottom: "1px solid var(--color-border-subtle)" },
  eyebrow: { display: "block", marginBottom: 4, color: "var(--color-text-tertiary)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0 },
  historyTitle: { margin: 0, color: "var(--color-text-primary)", fontSize: 17, lineHeight: 1.25 },
  iconButton: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-bg-elevated)", color: "var(--color-text-primary)", cursor: "pointer" },
  sessionList: { flex: 1, overflowY: "auto", padding: 8 },
  sessionRow: { width: "100%", minHeight: 58, display: "flex", alignItems: "center", gap: 4, padding: "4px", marginBottom: 3, border: "1px solid transparent", borderRadius: 6, background: "transparent", color: "var(--color-text-primary)" },
  sessionRowActive: { background: "var(--color-bg-elevated)", borderColor: "var(--color-border)" },
  sessionOpenButton: { display: "flex", flex: 1, minWidth: 0, padding: "5px 6px", border: 0, background: "transparent", color: "inherit", textAlign: "left", cursor: "pointer" },
  sessionMain: { display: "flex", flex: 1, minWidth: 0, flexDirection: "column", gap: 4 },
  sessionActions: { display: "flex", gap: 2, flexShrink: 0 },
  smallIcon: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 25, height: 25, padding: 0, border: 0, background: "transparent", color: "var(--color-text-tertiary)", borderRadius: 4, cursor: "pointer" },
  emptyHistory: { padding: "20px 10px", color: "var(--color-text-tertiary)", fontSize: 13 },
  mutedRow: { display: "flex", alignItems: "center", gap: 8, padding: 12, color: "var(--color-text-secondary)", fontSize: 13 },
  mainPane: { minWidth: 0, overflowY: "auto", padding: "26px clamp(18px, 3vw, 42px) 60px" },
  pageHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: 1120, margin: "0 auto 18px" },
  pageTitle: { margin: 0, color: "var(--color-text-primary)", fontSize: 25, lineHeight: 1.2, letterSpacing: 0 },
  sessionBadge: { display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 9px", borderRadius: 6, background: "var(--color-bg-subtle)", color: "var(--color-text-secondary)", fontSize: 12, fontWeight: 600 },
  researchForm: { maxWidth: 1120, margin: "0 auto", border: "1px solid var(--color-border)", borderRadius: 8, background: "var(--color-bg-elevated)", overflow: "hidden" },
  questionInput: { width: "100%", minHeight: 106, resize: "vertical", padding: "18px 18px 12px", border: 0, outline: 0, background: "transparent", color: "var(--color-text-primary)", font: "inherit", fontSize: 15, lineHeight: 1.55, boxSizing: "border-box" },
  formToolbar: { display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderTop: "1px solid var(--color-border-subtle)" },
  filterButton: { display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 9px", border: 0, borderRadius: 6, background: "transparent", color: "var(--color-text-secondary)", fontSize: 13, cursor: "pointer" },
  queryCount: { marginLeft: "auto", color: "var(--color-text-tertiary)", fontSize: 11 },
  primaryButton: { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, minWidth: 112, height: 36, padding: "0 14px", border: 0, borderRadius: 6, background: "var(--color-accent)", color: "var(--color-text-inverse)", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  filterGrid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, padding: 14, borderTop: "1px solid var(--color-border-subtle)", background: "var(--color-bg-subtle)" },
  field: { display: "flex", minWidth: 0, flexDirection: "column", gap: 6, color: "var(--color-text-secondary)", fontSize: 11, fontWeight: 600 },
  control: { width: "100%", height: 36, padding: "0 9px", boxSizing: "border-box", border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-bg-elevated)", color: "var(--color-text-primary)", fontSize: 13 },
  sourceTypeRow: { display: "flex", flexWrap: "wrap", gap: 6 },
  typeButton: { padding: "7px 9px", border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-bg-elevated)", color: "var(--color-text-secondary)", fontSize: 12, cursor: "pointer" },
  typeButtonActive: { borderColor: "var(--color-accent)", color: "var(--color-accent)", background: "var(--color-bg)" },
  errorBox: { maxWidth: 1120, margin: "14px auto 0", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", border: "1px solid #FCA5A5", borderRadius: 6, background: "#FEF2F2", color: "#991B1B", fontSize: 13 },
  successBox: { maxWidth: 1120, margin: "14px auto 0", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", border: "1px solid #86EFAC", borderRadius: 6, background: "#F0FDF4", color: "#166534", fontSize: 13 },
  processing: { maxWidth: 1120, margin: "28px auto", display: "flex", alignItems: "center", gap: 10, color: "var(--color-text-secondary)", fontSize: 14 },
  blankState: { maxWidth: 1120, minHeight: 220, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "var(--color-text-tertiary)" },
  answerArea: { maxWidth: 1120, margin: "30px auto 0" },
  answerHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18, paddingBottom: 18, borderBottom: "1px solid var(--color-border-subtle)" },
  answerTitle: { maxWidth: 760, margin: 0, color: "var(--color-text-primary)", fontSize: 20, lineHeight: 1.45, letterSpacing: 0 },
  answerActions: { display: "flex", alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap", gap: 8 },
  confidence: { padding: "6px 9px", borderRadius: 6, fontSize: 12, fontWeight: 700 },
  toneSuccess: { background: "#DCFCE7", color: "#166534" },
  toneWarning: { background: "#FEF3C7", color: "#92400E" },
  toneDanger: { background: "#FEE2E2", color: "#991B1B" },
  secondaryButton: { display: "inline-flex", alignItems: "center", gap: 7, height: 34, padding: "0 10px", border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-bg-elevated)", color: "var(--color-text-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  confidenceReason: { margin: "12px 0 0", color: "var(--color-text-secondary)", fontSize: 13, lineHeight: 1.5 },
  analysisSection: { padding: "24px 0" },
  plainSection: { minWidth: 0, padding: "18px 0", borderTop: "1px solid var(--color-border-subtle)" },
  sectionTitle: { margin: "0 0 12px", color: "var(--color-text-primary)", fontSize: 14, lineHeight: 1.3 },
  claimText: { margin: "0 0 13px", color: "var(--color-text-primary)", fontSize: 14, lineHeight: 1.7 },
  counterText: { margin: "0 0 10px", paddingLeft: 12, borderLeft: "3px solid #F59E0B", color: "var(--color-text-primary)", fontSize: 13, lineHeight: 1.6 },
  citationLink: { display: "inline", padding: 0, border: 0, background: "transparent", color: "#2563EB", fontWeight: 700, cursor: "pointer" },
  answerColumns: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 28 },
  warningRow: { display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8, color: "#92400E", fontSize: 13, lineHeight: 1.5 },
  mutedText: { margin: 0, color: "var(--color-text-tertiary)", fontSize: 13, lineHeight: 1.5 },
  sourcesSection: { paddingTop: 24, borderTop: "1px solid var(--color-border-subtle)" },
  sourcesHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  metricText: { color: "var(--color-text-tertiary)", fontSize: 11 },
  sourceGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 },
  sourceCard: { minWidth: 0, padding: 14, border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-bg-elevated)", scrollMarginTop: 20 },
  sourceCardHeader: { display: "flex", alignItems: "center", gap: 6, marginBottom: 10 },
  sourceNumber: { marginRight: "auto", color: "#2563EB", fontSize: 13, fontWeight: 800 },
  supportBadge: { padding: "4px 6px", borderRadius: 4, background: "#DCFCE7", color: "#166534", fontSize: 10, fontWeight: 700 },
  contradictsBadge: { background: "#FEF3C7", color: "#92400E" },
  verifiedBadge: { display: "inline-flex", alignItems: "center", gap: 4, color: "var(--color-text-tertiary)", fontSize: 9, fontWeight: 700 },
  sourceTitle: { margin: "0 0 5px", color: "var(--color-text-primary)", fontSize: 14, lineHeight: 1.4 },
  sourceMeta: { margin: "0 0 10px", color: "var(--color-text-tertiary)", fontSize: 11, lineHeight: 1.45 },
  excerpt: { margin: 0, padding: "10px 0 10px 12px", borderLeft: "2px solid var(--color-border)", color: "var(--color-text-secondary)", fontSize: 12, lineHeight: 1.55 },
  claimKey: { margin: "9px 0 0", color: "var(--color-text-tertiary)", fontSize: 10 },
  sourceActions: { display: "flex", alignItems: "center", gap: 12, marginTop: 10 },
  textButton: { display: "inline-flex", alignItems: "center", gap: 5, padding: 0, border: 0, background: "transparent", color: "var(--color-accent)", fontSize: 11, fontWeight: 600, cursor: "pointer" },
  textLink: { display: "inline-flex", alignItems: "center", gap: 5, color: "var(--color-text-secondary)", fontSize: 11, fontWeight: 600, textDecoration: "none" },
  sourceDetail: { marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--color-border-subtle)", color: "var(--color-text-secondary)", fontSize: 11, lineHeight: 1.55, maxHeight: 240, overflowY: "auto" },
  usageLine: { marginTop: 14, color: "var(--color-text-tertiary)", fontSize: 10, textAlign: "right" },
};
