"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Check,
  Download,
  FileText,
  FileSearch,
  FolderOpen,
  GitBranch,
  ListChecks,
  Map as MapIcon,
  RefreshCw,
  RotateCcw,
  Scale,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import LegalResearchWorkspace from "./LegalResearchWorkspace";
import {
  acceptMatterSuggestion,
  bulkReviewMatterSuggestions,
  deleteCaseDocument,
  downloadCaseDocument,
  getDocumentSuggestions,
  getCaseWorkspace,
  rejectMatterSuggestion,
  retryCaseDocument,
  uploadCaseDocument,
} from "@/lib/api";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatDate(value, withTime = false) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function statusStyle(status) {
  switch (String(status || "").toUpperCase()) {
    case "COMPLETED":
      return { color: "#166534", background: "#DCFCE7" };
    case "FAILED":
      return { color: "#991B1B", background: "#FEE2E2" };
    case "PROCESSING":
      return { color: "#92400E", background: "#FEF3C7" };
    case "CANCELLED":
      return { color: "#475569", background: "#E2E8F0" };
    default:
      return { color: "#1D4ED8", background: "#DBEAFE" };
  }
}

function textOf(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.evidence || value.relatedFact || value.legalElement || value.message || JSON.stringify(value);
}

function EmptyLine({ text }) {
  return <div style={styles.emptyLine}>{text}</div>;
}

function Section({ title, icon, children, action }) {
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

function ListBlock({ items, empty, tone = "neutral" }) {
  if (!items.length) return <EmptyLine text={empty} />;
  return (
    <div style={styles.list}>
      {items.map((item, index) => (
        <div key={`${textOf(item)}-${index}`} style={styles.listRow}>
          <span style={{ ...styles.rowMarker, ...(tone === "danger" ? styles.rowMarkerDanger : {}) }} />
          <span>{textOf(item)}</span>
        </div>
      ))}
    </div>
  );
}

export default function CaseWorkspace({ caseId, onBack }) {
  const [workspace, setWorkspace] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState({ type: "", text: "" });
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [documentType, setDocumentType] = useState("Dava Dilekçesi");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [actionId, setActionId] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState([]);

  const caseData = workspace?.case || {};
  const documents = asArray(workspace?.documents);
  const analyses = asArray(workspace?.analyses);
  const matterTwin = workspace?.matterTwin || { parties: [], events: [], metadata: {} };
  const pendingSuggestions = suggestions.filter((item) => item.status === "PENDING");
  const warnings = analyses.flatMap((analysis) =>
    asArray(analysis.warnings).map((warning) => ({
      ...warning,
      documentName: analysis.document_name,
    }))
  );

  const stats = useMemo(() => {
    return [
      { label: "Belge", value: documents.length, icon: <FileText size={18} />, color: "#2563EB" },
      { label: "Analiz", value: analyses.length, icon: <Sparkles size={18} />, color: "#16A34A" },
      { label: "Kronoloji", value: asArray(workspace?.timeline).length, icon: <CalendarDays size={18} />, color: "#7C3AED" },
      { label: "Risk", value: warnings.length, icon: <AlertTriangle size={18} />, color: "#DC2626" },
    ];
  }, [documents.length, analyses.length, workspace?.timeline, warnings.length]);

  const showToast = (type, text) => {
    setToast({ type, text });
    setTimeout(() => setToast({ type: "", text: "" }), 3500);
  };

  const loadWorkspace = async ({ silent = false } = {}) => {
    if (!caseId) return;
    if (!silent) setLoading(true);
    setError("");
    try {
      const res = await getCaseWorkspace(caseId);
      setWorkspace(res.data);
      const suggestionResults = await Promise.allSettled(
        asArray(res.data?.documents).map(async (doc) => {
          const response = await getDocumentSuggestions(caseId, doc.id);
          return asArray(response.data).map((item) => ({ ...item, document: doc }));
        })
      );
      setSuggestions(suggestionResults.flatMap((result) => result.status === "fulfilled" ? result.value : []));
    } catch (err) {
      setError(err.message || "Dosya Odası yüklenemedi.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspace();
  }, [caseId]);

  useEffect(() => {
    const hasActiveDocument = documents.some((doc) =>
      ["QUEUED", "PROCESSING"].includes(String(doc.processing_status || "").toUpperCase())
      || ["QUEUED", "RUNNING", "RETRYING"].includes(String(doc.latest_job_status || "").toUpperCase())
    );
    if (!hasActiveDocument) return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") loadWorkspace({ silent: true });
    }, 4000);
    return () => clearInterval(timer);
  }, [caseId, documents]);

  const handleUpload = async (event) => {
    event.preventDefault();
    if (!selectedFile) {
      showToast("error", "Lütfen bir belge seçin.");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("documentType", documentType);
      formData.append("description", description);
      await uploadCaseDocument(caseId, formData);
      setSelectedFile(null);
      setDescription("");
      setFileInputKey((value) => value + 1);
      showToast("success", "Belge yüklendi ve işleme kuyruğuna alındı.");
      await loadWorkspace();
    } catch (err) {
      showToast("error", err.message || "Belge yüklenemedi.");
    } finally {
      setUploading(false);
    }
  };

  const handleRetry = async (documentId) => {
    setActionId(documentId);
    try {
      await retryCaseDocument(caseId, documentId);
      showToast("success", "Belge yeniden işleme kuyruğuna alındı.");
      await loadWorkspace();
    } catch (err) {
      showToast("error", err.message || "Belge yeniden kuyruğa alınamadı.");
    } finally {
      setActionId(null);
    }
  };

  const handleDownload = async (doc) => {
    setActionId(doc.id);
    try {
      await downloadCaseDocument(caseId, doc.id, doc.original_filename || doc.document_name || "belge");
    } catch (err) {
      showToast("error", err.message || "Belge indirilemedi.");
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async (doc) => {
    if (!window.confirm("Bu belgeyi dosyadan kaldırmak istiyor musunuz?")) return;
    setActionId(doc.id);
    try {
      await deleteCaseDocument(caseId, doc.id);
      showToast("success", "Belge silme kuyruğuna alındı.");
      await loadWorkspace();
    } catch (err) {
      showToast("error", err.message || "Belge silinemedi.");
    } finally {
      setActionId(null);
    }
  };

  const handleSuggestionReview = async (suggestion, action) => {
    setActionId(suggestion.id);
    try {
      if (action === "accept") await acceptMatterSuggestion(caseId, suggestion.id);
      else await rejectMatterSuggestion(caseId, suggestion.id);
      showToast("success", action === "accept" ? "Öneri Matter Twin'e eklendi." : "Öneri reddedildi.");
      setSelectedSuggestionIds((items) => items.filter((id) => id !== suggestion.id));
      await loadWorkspace({ silent: true });
    } catch (err) {
      showToast("error", err.message || "Öneri incelenemedi.");
    } finally {
      setActionId(null);
    }
  };

  const handleBulkReview = async (action) => {
    if (!selectedSuggestionIds.length) return;
    setActionId("bulk");
    try {
      await bulkReviewMatterSuggestions(caseId, {
        accept: action === "accept" ? selectedSuggestionIds : [],
        reject: action === "reject" ? selectedSuggestionIds.map((id) => ({ id })) : [],
      });
      showToast("success", `${selectedSuggestionIds.length} öneri incelendi.`);
      setSelectedSuggestionIds([]);
      await loadWorkspace({ silent: true });
    } catch (err) {
      showToast("error", err.message || "Toplu inceleme tamamlanamadı.");
    } finally {
      setActionId(null);
    }
  };

  const toggleSuggestion = (id) => {
    setSelectedSuggestionIds((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  };

  const tabs = [
    { id: "overview", label: "Özet", icon: <FolderOpen size={15} /> },
    { id: "documents", label: "Belgeler", icon: <FileText size={15} /> },
    { id: "timeline", label: "Kronoloji", icon: <CalendarDays size={15} /> },
    { id: "matrix", label: "İddia Savunma", icon: <Scale size={15} /> },
    { id: "evidence", label: "Delil Haritası", icon: <MapIcon size={15} /> },
    { id: "risks", label: "Riskler", icon: <AlertTriangle size={15} /> },
    { id: "research", label: "Araştırma", icon: <FileSearch size={15} /> },
  ];

  if (!caseId) {
    return (
      <div style={styles.emptyState}>
        <FolderOpen size={42} />
        <h2>Dosya Odası</h2>
        <p>Bir dava dosyası seçildiğinde belgeler, kronoloji ve AI analizleri burada açılır.</p>
        <button style={styles.secondaryButton} onClick={onBack}>
          <ArrowLeft size={16} />
          Geri
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.header}>
          <button style={styles.secondaryButton} onClick={onBack}>
            <ArrowLeft size={16} />
            Geri
          </button>
          <div style={styles.loadingLine}>Dosya Odası hazırlanıyor...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      {toast.text && (
        <div style={{ ...styles.toast, ...(toast.type === "error" ? styles.toastError : styles.toastSuccess) }}>
          {toast.text}
        </div>
      )}

      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <button style={styles.iconButton} onClick={onBack} title="Dava listesine dön">
            <ArrowLeft size={18} />
          </button>
          <div>
            <span style={styles.eyebrow}>AI Dosya Odası</span>
            <h1>{caseData.esas_no || caseData.konu || "Dava Dosyası"}</h1>
            <p>{caseData.mahkeme || "Mahkeme bilgisi yok"} · {caseData.durum || "Açık"}</p>
          </div>
        </div>
        <button style={styles.secondaryButton} onClick={loadWorkspace}>
          <RefreshCw size={16} />
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
        {stats.map((item) => (
          <div key={item.label} style={{ ...styles.stat, borderLeftColor: item.color }}>
            <span style={{ color: item.color }}>{item.icon}</span>
            <div>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={styles.tabs}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            style={{ ...styles.tabButton, ...(activeTab === tab.id ? styles.tabButtonActive : {}) }}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="case-room-grid" style={styles.grid}>
          <Section title="Taraflar" icon={<Scale size={17} />}>
            <div style={styles.partyGrid}>
              <div style={styles.partyBox}>
                <span>Davacı</span>
                <strong>{workspace?.parties?.claimant || caseData.taraf_davaci || "-"}</strong>
              </div>
              <div style={styles.partyBox}>
                <span>Davalı</span>
                <strong>{workspace?.parties?.defendant || caseData.taraf_davali || "-"}</strong>
              </div>
            </div>
          </Section>

          <Section title="Vakıa Özeti" icon={<ListChecks size={17} />}>
            <ListBlock items={asArray(workspace?.facts).slice(0, 8)} empty="Analiz edilmiş vakıa bulunmuyor." />
          </Section>

          <Section title="İddia Sinyalleri" icon={<GitBranch size={17} />}>
            <ListBlock items={asArray(workspace?.claims).slice(0, 8)} empty="İddia veya talep çıkarımı yok." />
          </Section>

          <Section title="Sonraki Aksiyonlar" icon={<CheckCircle2 size={17} />}>
            <ListBlock items={asArray(workspace?.nextActions).slice(0, 8)} empty="Aksiyon önerisi oluşmadı." />
          </Section>

          <Section title="Doğrulanmış Taraflar" icon={<Scale size={17} />}>
            <ListBlock
              items={asArray(matterTwin.parties).map((party) =>
                `${party.name} · ${party.role} · ${party.original_filename}, s. ${party.source_page}`
              )}
              empty="Henüz kabul edilmiş taraf önerisi yok."
            />
          </Section>

          <Section title="Doğrulanmış Olaylar" icon={<CalendarDays size={17} />}>
            <ListBlock
              items={asArray(matterTwin.events).map((event) =>
                `${event.title}${event.event_date ? ` · ${formatDate(event.event_date)}` : ""} · ${event.original_filename}, s. ${event.source_page}`
              )}
              empty="Henüz kabul edilmiş olay veya tarih önerisi yok."
            />
          </Section>
        </div>
      )}

      {activeTab === "documents" && (
        <div style={styles.singleColumn}>
          <Section
            title="Belge Yükle"
            icon={<Upload size={17} />}
            action={<span style={styles.mutedText}>PDF, TXT, JPG, PNG</span>}
          >
            <form onSubmit={handleUpload} style={styles.uploadForm}>
              <input
                key={fileInputKey}
                type="file"
                accept=".pdf,.txt,.jpg,.jpeg,.png,application/pdf,text/plain,image/jpeg,image/png"
                onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                style={styles.fileInput}
              />
              <select value={documentType} onChange={(event) => setDocumentType(event.target.value)} style={styles.input}>
                <option>Dava Dilekçesi</option>
                <option>Cevap Dilekçesi</option>
                <option>Bilirkişi Raporu</option>
                <option>Delil Belgesi</option>
                <option>Tebligat</option>
                <option>Genel</option>
              </select>
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Kısa açıklama"
                style={styles.input}
              />
              <button type="submit" style={styles.primaryButton} disabled={uploading}>
                <Upload size={16} />
                {uploading ? "Yükleniyor" : "Yükle"}
              </button>
            </form>
          </Section>

          <Section title="Dosya Belgeleri" icon={<FileText size={17} />}>
            {documents.length === 0 ? (
              <EmptyLine text="Henüz belge yüklenmemiş." />
            ) : (
              <div style={styles.documentList}>
                {documents.map((doc) => (
                  <div key={doc.id} style={styles.documentRow}>
                    <div style={styles.documentMain}>
                      <strong>{doc.document_name || doc.file_name || "Belge"}</strong>
                      <span>{doc.document_type || "Genel"} · {formatDate(doc.uploaded_at || doc.created_at, true)}</span>
                      <span>
                        {doc.detected_mime_type || "Tür bilinmiyor"}
                        {doc.file_size_bytes ? ` · ${(Number(doc.file_size_bytes) / 1024).toFixed(1)} KB` : ""}
                      </span>
                      {doc.processing_error_message && <p style={styles.documentError}>{doc.processing_error_message}</p>}
                      {doc.min_ocr_confidence !== null && Number(doc.min_ocr_confidence) < 0.65 && (
                        <p style={styles.documentWarning}>
                          OCR güveni düşük: %{Math.round(Number(doc.min_ocr_confidence) * 100)}. Kaynak sayfayı kontrol edin.
                        </p>
                      )}
                      {doc.analysis_summary && <p>{doc.analysis_summary}</p>}
                    </div>
                    <div style={styles.documentActions}>
                      <span style={{ ...styles.statusPill, ...statusStyle(doc.processing_status) }}>
                        {doc.processing_status || "QUEUED"}
                      </span>
                      {String(doc.processing_status || "").toUpperCase() === "FAILED" && (
                        <button
                          style={styles.iconButton}
                          disabled={actionId === doc.id}
                          onClick={() => handleRetry(doc.id)}
                          title="Yeniden dene"
                        >
                          <RotateCcw size={16} />
                        </button>
                      )}
                      <button
                        style={styles.iconButton}
                        disabled={actionId === doc.id}
                        onClick={() => handleDownload(doc)}
                        title="Belgeyi indir"
                      >
                        <Download size={16} />
                      </button>
                      <button
                        style={styles.iconButton}
                        disabled={actionId === doc.id}
                        onClick={() => handleDelete(doc)}
                        title="Belgeyi sil"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section
            title="Matter Twin Önerileri"
            icon={<Sparkles size={17} />}
            action={pendingSuggestions.length > 0 ? (
              <div style={styles.documentActions}>
                <button
                  style={styles.secondaryButton}
                  disabled={!selectedSuggestionIds.length || actionId === "bulk"}
                  onClick={() => handleBulkReview("accept")}
                >
                  <Check size={15} /> Toplu kabul
                </button>
                <button
                  style={styles.secondaryButton}
                  disabled={!selectedSuggestionIds.length || actionId === "bulk"}
                  onClick={() => handleBulkReview("reject")}
                >
                  <X size={15} /> Toplu reddet
                </button>
              </div>
            ) : null}
          >
            {suggestions.length === 0 ? (
              <EmptyLine text="Belge çıkarımı tamamlandığında doğrulanabilir öneriler burada görünür." />
            ) : (
              <div style={styles.suggestionList}>
                {suggestions.map((suggestion) => (
                  <div key={suggestion.id} style={styles.suggestionRow}>
                    {suggestion.status === "PENDING" && (
                      <input
                        type="checkbox"
                        checked={selectedSuggestionIds.includes(suggestion.id)}
                        onChange={() => toggleSuggestion(suggestion.id)}
                        aria-label={`${suggestion.display_value} önerisini seç`}
                      />
                    )}
                    <div style={styles.suggestionMain}>
                      <div style={styles.suggestionHeading}>
                        <span style={{ ...styles.statusPill, ...statusStyle(suggestion.status === "PENDING" ? "PROCESSING" : suggestion.status === "ACCEPTED" ? "COMPLETED" : "FAILED") }}>
                          {suggestion.suggestion_type}
                        </span>
                        <strong>{suggestion.display_value}</strong>
                        <span style={styles.mutedText}>%{Math.round(Number(suggestion.confidence) * 100)} güven</span>
                      </div>
                      <button
                        style={styles.sourceQuote}
                        onClick={() => handleDownload(suggestion.document)}
                        title="Kaynak belgeyi indir"
                      >
                        {suggestion.original_filename} · Sayfa {suggestion.source_page}: “{suggestion.source_quote}”
                      </button>
                    </div>
                    {suggestion.status === "PENDING" ? (
                      <div style={styles.documentActions}>
                        <button style={styles.iconButton} disabled={actionId === suggestion.id} onClick={() => handleSuggestionReview(suggestion, "accept")} title="Öneriyi kabul et">
                          <Check size={16} />
                        </button>
                        <button style={styles.iconButton} disabled={actionId === suggestion.id} onClick={() => handleSuggestionReview(suggestion, "reject")} title="Öneriyi reddet">
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <span style={{ ...styles.statusPill, ...statusStyle(suggestion.status === "ACCEPTED" ? "COMPLETED" : "FAILED") }}>
                        {suggestion.status}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      )}

      {activeTab === "timeline" && (
        <Section title="Kronoloji" icon={<CalendarDays size={17} />}>
          {asArray(workspace?.timeline).length === 0 ? (
            <EmptyLine text="Kronoloji için analiz edilmiş veri yok." />
          ) : (
            <div style={styles.timeline}>
              {asArray(workspace?.timeline).map((event, index) => (
                <div key={`${event.date}-${index}`} style={styles.timelineRow}>
                  <div style={styles.timelineDate}>{formatDate(event.date || event.created_at)}</div>
                  <div style={styles.timelineBody}>
                    <strong>{event.title || event.event || event.type || "Olay"}</strong>
                    <span>{event.description || event.legalImportance || event.source || ""}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {activeTab === "matrix" && (
        <Section title="İddia Savunma Matrisi" icon={<Scale size={17} />}>
          {Math.max(asArray(workspace?.claims).length, asArray(workspace?.defenses).length) === 0 ? (
            <EmptyLine text="Matris için iddia veya savunma çıkarımı yok." />
          ) : (
            <div style={styles.matrix}>
              <div style={styles.matrixHeader}>İddia / Talep</div>
              <div style={styles.matrixHeader}>Savunma / İtiraz</div>
              {Array.from({
                length: Math.max(asArray(workspace?.claims).length, asArray(workspace?.defenses).length),
              }).map((_, index) => (
                <div key={index} style={styles.matrixPair}>
                  <div style={styles.matrixCell}>{workspace?.claims?.[index] || "Eşleşen iddia yok"}</div>
                  <div style={styles.matrixCell}>{workspace?.defenses?.[index] || "Eşleşen savunma yok"}</div>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {activeTab === "evidence" && (
        <Section title="Delil Haritası" icon={<MapIcon size={17} />}>
          {asArray(workspace?.evidenceMap).length === 0 ? (
            <EmptyLine text="Belge analizlerinden delil haritası oluşmadı." />
          ) : (
            <div style={styles.evidenceGrid}>
              {asArray(workspace?.evidenceMap).map((item, index) => (
                <div key={`${textOf(item)}-${index}`} style={styles.evidenceItem}>
                  <strong>{item.evidence || textOf(item)}</strong>
                  <span>{item.relatedFact || "İlgili vakıa manuel eşleştirilmeli."}</span>
                  <small>{item.legalElement || "Hukuki unsur sınıflandırması bekliyor."}</small>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {activeTab === "risks" && (
        <div className="case-room-grid" style={styles.grid}>
          <Section title="Çelişkiler" icon={<AlertTriangle size={17} />}>
            <ListBlock items={asArray(workspace?.contradictions)} empty="Çelişki sinyali bulunmuyor." tone="danger" />
          </Section>
          <Section title="Eksik Unsurlar" icon={<ListChecks size={17} />}>
            <ListBlock items={asArray(workspace?.missingElements)} empty="Eksik unsur uyarısı yok." tone="danger" />
          </Section>
          <Section title="Analiz Uyarıları" icon={<AlertTriangle size={17} />}>
            <ListBlock
              items={warnings.map((warning) => `${warning.documentName || "Belge"}: ${warning.label || warning.message}`)}
              empty="Belge analizi uyarısı yok."
              tone="danger"
            />
          </Section>
          <Section title="Avukat Onayı" icon={<CheckCircle2 size={17} />}>
            <ListBlock
              items={[
                "Otomatik süre ve görev çıktıları nihai işlem değildir.",
                "UYAP veya resmi başvuru işlemleri yalnızca kullanıcı onayıyla yapılmalıdır.",
                "Kaynak, tarih ve süre hesabı dosya sorumlusu tarafından kontrol edilmelidir.",
              ]}
              empty=""
            />
          </Section>
        </div>
      )}

      {activeTab === "research" && (
        <div style={styles.researchWorkspace}>
          <LegalResearchWorkspace initialCaseId={caseId} embedded />
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 900px) {
          .case-room-grid { grid-template-columns: 1fr !important; }
        }
      ` }} />
    </div>
  );
}

const styles = {
  wrapper: {
    maxWidth: 1280,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    color: "var(--color-text-primary)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 14,
  },
  headerLeft: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: 800,
    color: "var(--color-text-tertiary)",
    textTransform: "uppercase",
    letterSpacing: 0,
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 10,
  },
  stat: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "var(--color-bg-elevated)",
    border: "1px solid var(--color-border-subtle)",
    borderLeft: "3px solid #2563EB",
    borderRadius: 8,
    padding: 12,
    minWidth: 0,
  },
  tabs: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    borderBottom: "1px solid var(--color-border-subtle)",
    paddingBottom: 8,
  },
  tabButton: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    border: "1px solid var(--color-border)",
    background: "var(--color-bg-elevated)",
    color: "var(--color-text-secondary)",
    borderRadius: 8,
    padding: "8px 11px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  tabButtonActive: {
    background: "rgba(37,99,235,0.08)",
    color: "var(--color-accent)",
    borderColor: "rgba(37,99,235,0.28)",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 14,
  },
  singleColumn: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  section: {
    background: "var(--color-bg-elevated)",
    border: "1px solid var(--color-border-subtle)",
    borderRadius: 8,
    overflow: "hidden",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    borderBottom: "1px solid var(--color-border-subtle)",
  },
  sectionTitle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  partyGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
    padding: 14,
  },
  partyBox: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    border: "1px solid var(--color-border-subtle)",
    borderRadius: 8,
    padding: 12,
    minWidth: 0,
  },
  list: {
    display: "flex",
    flexDirection: "column",
  },
  listRow: {
    display: "flex",
    gap: 9,
    alignItems: "flex-start",
    padding: "11px 14px",
    borderBottom: "1px solid var(--color-border-subtle)",
    color: "var(--color-text-secondary)",
    fontSize: 13,
    lineHeight: 1.5,
  },
  rowMarker: {
    width: 7,
    height: 7,
    marginTop: 7,
    borderRadius: 999,
    background: "#2563EB",
    flexShrink: 0,
  },
  rowMarkerDanger: {
    background: "#DC2626",
  },
  uploadForm: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 10,
    padding: 14,
    alignItems: "center",
  },
  fileInput: {
    width: "100%",
    minWidth: 0,
    color: "var(--color-text-secondary)",
    fontSize: 13,
  },
  input: {
    width: "100%",
    minWidth: 0,
    border: "1px solid var(--color-border)",
    background: "var(--color-bg-subtle)",
    color: "var(--color-text-primary)",
    borderRadius: 8,
    padding: "9px 10px",
    fontSize: 13,
    boxSizing: "border-box",
  },
  documentList: {
    display: "flex",
    flexDirection: "column",
  },
  documentRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: 14,
    borderBottom: "1px solid var(--color-border-subtle)",
  },
  documentMain: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
  },
  documentActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  researchWorkspace: {
    width: "100%",
    height: "min(760px, 78vh)",
    minHeight: 560,
    overflow: "hidden",
    border: "1px solid var(--color-border-subtle)",
    borderRadius: 8,
    background: "var(--color-bg)",
  },
  documentError: {
    color: "#991B1B",
    fontSize: 12,
    margin: 0,
  },
  documentWarning: {
    color: "#92400E",
    background: "#FEF3C7",
    fontSize: 12,
    margin: 0,
    padding: "6px 8px",
    borderRadius: 6,
  },
  suggestionList: {
    display: "flex",
    flexDirection: "column",
  },
  suggestionRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderBottom: "1px solid var(--color-border-subtle)",
  },
  suggestionMain: {
    display: "flex",
    flexDirection: "column",
    gap: 7,
    minWidth: 0,
    flex: 1,
  },
  suggestionHeading: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  sourceQuote: {
    border: "none",
    background: "transparent",
    color: "var(--color-text-secondary)",
    padding: 0,
    textAlign: "left",
    fontSize: 12,
    lineHeight: 1.5,
    cursor: "pointer",
  },
  statusPill: {
    fontSize: 11,
    fontWeight: 800,
    borderRadius: 999,
    padding: "4px 8px",
    whiteSpace: "nowrap",
  },
  timeline: {
    display: "flex",
    flexDirection: "column",
  },
  timelineRow: {
    display: "grid",
    gridTemplateColumns: "150px 1fr",
    gap: 12,
    padding: 14,
    borderBottom: "1px solid var(--color-border-subtle)",
  },
  timelineDate: {
    color: "var(--color-text-tertiary)",
    fontSize: 12,
    fontWeight: 700,
  },
  timelineBody: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
  },
  matrix: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
  },
  matrixHeader: {
    padding: "12px 14px",
    background: "var(--color-bg-subtle)",
    borderBottom: "1px solid var(--color-border-subtle)",
    fontSize: 12,
    fontWeight: 800,
    color: "var(--color-text-tertiary)",
    textTransform: "uppercase",
    letterSpacing: 0,
  },
  matrixPair: {
    display: "contents",
  },
  matrixCell: {
    padding: 14,
    borderBottom: "1px solid var(--color-border-subtle)",
    borderRight: "1px solid var(--color-border-subtle)",
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--color-text-secondary)",
    minWidth: 0,
  },
  evidenceGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 10,
    padding: 14,
  },
  evidenceItem: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    border: "1px solid var(--color-border-subtle)",
    borderRadius: 8,
    padding: 12,
    minWidth: 0,
  },
  primaryButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    border: "none",
    background: "var(--color-accent)",
    color: "var(--color-text-inverse)",
    borderRadius: 8,
    padding: "9px 12px",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  secondaryButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    border: "1px solid var(--color-border)",
    background: "var(--color-bg-elevated)",
    color: "var(--color-text-primary)",
    borderRadius: 8,
    padding: "9px 12px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  iconButton: {
    width: 36,
    height: 36,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid var(--color-border)",
    background: "var(--color-bg-elevated)",
    color: "var(--color-text-primary)",
    borderRadius: 8,
    cursor: "pointer",
    flexShrink: 0,
  },
  mutedText: {
    color: "var(--color-text-tertiary)",
    fontSize: 12,
    fontWeight: 700,
  },
  emptyLine: {
    padding: 18,
    color: "var(--color-text-tertiary)",
    fontSize: 13,
  },
  emptyState: {
    minHeight: 440,
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
  toast: {
    position: "fixed",
    top: 20,
    right: 20,
    zIndex: 9999,
    padding: "11px 14px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    boxShadow: "0 10px 24px rgba(0,0,0,0.12)",
  },
  toastSuccess: {
    background: "#DCFCE7",
    color: "#166534",
  },
  toastError: {
    background: "#FEE2E2",
    color: "#991B1B",
  },
  loadingLine: {
    color: "var(--color-text-secondary)",
    fontWeight: 700,
  },
};
