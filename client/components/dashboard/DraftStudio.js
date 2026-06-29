"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  Clock3,
  Download,
  FilePlus2,
  FileText,
  History,
  Link2,
  Loader2,
  Plus,
  Save,
  Scale,
  Search,
  Sparkles,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import {
  acceptDraftSuggestion,
  addDraftCitation,
  analyzeDraft,
  bulkReviewDraftSuggestions,
  compareDraftVersions,
  createDraft,
  createEvidenceRelation,
  createMatterClaim,
  exportDraft,
  generateDraftPlan,
  generateDraftSection,
  getDraft,
  getDrafts,
  getDraftTemplates,
  getEvidenceMatrix,
  getCaseWorkspace,
  rejectDraftSuggestion,
  removeDraftCitation,
  searchDraftSources,
  updateDraft,
} from "@/lib/api";

const EMPTY_CREATE = { title: "", draftType: "PETITION", templateId: "", documentId: "" };
const EMPTY_DOCUMENTS = [];
const TYPE_LABELS = {
  PETITION: "Dava dilekçesi",
  RESPONSE: "Cevap dilekçesi",
  APPEAL: "İstinaf / temyiz",
  OBJECTION: "İtiraz",
  NOTICE: "İhtarname",
  LEGAL_OPINION: "Hukuki görüş",
  OTHER: "Diğer",
};

function messageOf(error) {
  return error?.message || "İşlem tamamlanamadı.";
}

function RightTab({ active, icon, children, onClick }) {
  return <button className={active ? "draft-tab active" : "draft-tab"} onClick={onClick}>{icon}{children}</button>;
}

export default function DraftStudio({ caseId, documents = EMPTY_DOCUMENTS }) {
  const [drafts, setDrafts] = useState([]);
  const [draft, setDraft] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [matrix, setMatrix] = useState({ claims: [], evidence: [], relations: [] });
  const [sections, setSections] = useState([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [rightTab, setRightTab] = useState("suggestions");
  const [createForm, setCreateForm] = useState(EMPTY_CREATE);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState("");
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState({ type: "", text: "" });
  const [sourceQuery, setSourceQuery] = useState("");
  const [sourceResults, setSourceResults] = useState([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState([]);
  const [compareIds, setCompareIds] = useState([]);
  const [comparison, setComparison] = useState([]);
  const [claimTitle, setClaimTitle] = useState("");
  const [availableDocuments, setAvailableDocuments] = useState(documents);
  const [relation, setRelation] = useState({ claimId: "", evidenceId: "", relationType: "SUPPORTS" });
  const loadedVersion = useRef(null);

  const selectedSection = sections.find((item) => item.sectionKey === selectedKey) || sections[0];
  const pendingSuggestions = (draft?.suggestions || []).filter((item) => item.status === "PENDING");
  const analysis = draft?.metadata?.lastAnalysis || null;

  const flash = useCallback((type, text) => {
    setNotice({ type, text });
    window.setTimeout(() => setNotice({ type: "", text: "" }), 3500);
  }, []);

  const loadDraft = useCallback(async (draftId, { quiet = false } = {}) => {
    if (!draftId) return;
    if (!quiet) setBusy("load");
    try {
      const response = await getDraft(draftId);
      setDraft(response.data);
      setSections(response.data.sections || []);
      setSelectedKey((current) => response.data.sections?.some((item) => item.sectionKey === current)
        ? current : response.data.sections?.[0]?.sectionKey || "");
      loadedVersion.current = response.data.current_version_id;
      setDirty(false);
    } catch (error) {
      flash("error", messageOf(error));
    } finally {
      if (!quiet) setBusy("");
    }
  }, [flash]);

  const loadBase = useCallback(async () => {
    setBusy("base");
    try {
      const [draftResponse, templateResponse, matrixResponse] = await Promise.all([
        getDrafts(caseId), getDraftTemplates(caseId), getEvidenceMatrix(caseId),
      ]);
      setDrafts(draftResponse.data || []);
      setTemplates(templateResponse.data || []);
      setMatrix(matrixResponse.data || { claims: [], evidence: [], relations: [] });
      const first = draftResponse.data?.[0];
      if (first) await loadDraft(first.id);
      else setShowCreate(true);
    } catch (error) {
      flash("error", messageOf(error));
    } finally {
      setBusy("");
    }
  }, [caseId, flash, loadDraft]);

  useEffect(() => { loadBase(); }, [loadBase]);

  useEffect(() => {
    if (documents.length) {
      setAvailableDocuments(documents);
      return;
    }
    let active = true;
    getCaseWorkspace(caseId)
      .then((response) => { if (active) setAvailableDocuments(response.data?.documents || []); })
      .catch(() => {});
    return () => { active = false; };
  }, [caseId, documents]);

  useEffect(() => {
    if (!dirty || !draft) return undefined;
    const timer = window.setTimeout(async () => {
      setBusy("save");
      try {
        await updateDraft(draft.id, { sections, changeSummary: "Otomatik kayıt" });
        await loadDraft(draft.id, { quiet: true });
      } catch (error) {
        flash("error", `Otomatik kayıt başarısız: ${messageOf(error)}`);
      } finally {
        setBusy("");
      }
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [dirty, draft, flash, loadDraft, sections]);

  const updateSection = (content) => {
    setSections((items) => items.map((item) => item.sectionKey === selectedSection.sectionKey ? { ...item, content } : item));
    setDirty(true);
  };

  const createNewDraft = async (event) => {
    event.preventDefault();
    setBusy("create");
    try {
      const response = await createDraft({
        caseId,
        title: createForm.title || undefined,
        draftType: createForm.draftType,
        templateId: createForm.templateId || undefined,
        documentId: createForm.documentId || undefined,
      });
      setDrafts((items) => [response.data, ...items]);
      setShowCreate(false);
      setCreateForm(EMPTY_CREATE);
      await loadDraft(response.data.id);
      flash("success", "Taslak ve ilk immutable sürüm oluşturuldu.");
    } catch (error) {
      flash("error", messageOf(error));
    } finally { setBusy(""); }
  };

  const addSection = () => {
    const index = sections.length + 1;
    const sectionKey = `SECTION_${index}`;
    setSections((items) => [...items, { sectionKey, title: `Yeni Bölüm ${index}`, content: "", sortOrder: items.length, metadata: {} }]);
    setSelectedKey(sectionKey);
    setDirty(true);
  };

  const removeSection = () => {
    if (!selectedSection || sections.length <= 1 || !window.confirm("Bu bölümü yeni sürümden kaldırmak istiyor musunuz?")) return;
    const remaining = sections.filter((item) => item.sectionKey !== selectedSection.sectionKey);
    setSections(remaining);
    setSelectedKey(remaining[0]?.sectionKey || "");
    setDirty(true);
  };

  const moveSection = (direction) => {
    const index = sections.findIndex((item) => item.sectionKey === selectedSection?.sectionKey);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    setSections(next.map((item, sortOrder) => ({ ...item, sortOrder })));
    setDirty(true);
  };

  const runAction = async (key, action, success) => {
    setBusy(key);
    try {
      if (dirty) {
        setDirty(false);
        try {
          await updateDraft(draft.id, { sections, changeSummary: "AI veya kaynak işlemi öncesi kayıt" });
        } catch (error) {
          setDirty(true);
          throw error;
        }
      }
      await action();
      await loadDraft(draft.id, { quiet: true });
      flash("success", success);
    } catch (error) { flash("error", messageOf(error)); }
    finally { setBusy(""); }
  };

  const runExport = async (format) => {
    setBusy(`export-${format}`);
    try {
      if (dirty) {
        setDirty(false);
        await updateDraft(draft.id, { sections, changeSummary: "Dışa aktarma öncesi kayıt" });
      }
      await exportDraft(draft.id, format, draft.title);
      flash("success", `${format.toUpperCase()} dosyası hazırlandı.`);
    } catch (error) {
      setDirty(true);
      flash("error", messageOf(error));
    } finally { setBusy(""); }
  };

  const reviewSuggestion = (suggestion, action) => runAction(
    suggestion.id,
    () => action === "accept" ? acceptDraftSuggestion(draft.id, suggestion.id) : rejectDraftSuggestion(draft.id, suggestion.id),
    action === "accept" ? "Öneri yeni bir sürüme uygulandı." : "Öneri reddedildi; belge değişmedi.",
  );

  const bulkReview = (action) => runAction("bulk", async () => {
    await bulkReviewDraftSuggestions(draft.id, {
      accept: action === "accept" ? selectedSuggestions : [],
      reject: action === "reject" ? selectedSuggestions : [],
    });
    setSelectedSuggestions([]);
  }, "Seçili öneriler tek işlemde incelendi.");

  const findSources = async (counter = false) => {
    if (!sourceQuery.trim()) return;
    setBusy("sources");
    try {
      const response = await searchDraftSources(draft.id, { query: sourceQuery, counter, currentOnly: false, limit: 12 });
      setSourceResults(response.data.results || []);
    } catch (error) { flash("error", messageOf(error)); }
    finally { setBusy(""); }
  };

  const addSource = (source) => runAction(`source-${source.sourceId}`, () => addDraftCitation(draft.id, {
    sectionKey: selectedSection.sectionKey,
    claimKey: selectedSection.sectionKey,
    sourceId: source.sourceId,
    chunkId: source.metadata.chunkId,
    excerpt: source.excerpt,
  }), "Doğrulanmış kaynak bölüme bağlandı.");

  const compare = async () => {
    if (compareIds.length !== 2) return;
    setBusy("compare");
    try {
      const response = await compareDraftVersions(draft.id, compareIds[0], compareIds[1]);
      setComparison(response.data || []);
      setRightTab("history");
    } catch (error) { flash("error", messageOf(error)); }
    finally { setBusy(""); }
  };

  const addClaim = async (event) => {
    event.preventDefault();
    if (!claimTitle.trim()) return;
    setBusy("claim");
    try {
      await createMatterClaim(caseId, { title: claimTitle, claimType: "FACT", verified: true });
      setClaimTitle("");
      const response = await getEvidenceMatrix(caseId);
      setMatrix(response.data);
    } catch (error) { flash("error", messageOf(error)); }
    finally { setBusy(""); }
  };

  const linkEvidence = async (event) => {
    event.preventDefault();
    if (!relation.claimId || !relation.evidenceId) return;
    setBusy("relation");
    try {
      await createEvidenceRelation(caseId, { ...relation, verified: true });
      const response = await getEvidenceMatrix(caseId);
      setMatrix(response.data);
      flash("success", "İddia ve delil kullanıcı onayıyla ilişkilendirildi.");
    } catch (error) { flash("error", messageOf(error)); }
    finally { setBusy(""); }
  };

  const versionOptions = useMemo(() => draft?.versions || [], [draft?.versions]);

  if (busy === "base" && !drafts.length) return <div className="draft-empty"><Loader2 className="spin" /> Dilekçe Stüdyosu hazırlanıyor...</div>;

  return (
    <div className="draft-studio">
      {notice.text && <div className={`draft-notice ${notice.type}`}>{notice.text}</div>}
      <header className="draft-toolbar">
        <div className="draft-brand"><FileText size={20} /><div><strong>Dilekçe Stüdyosu</strong><span>{draft ? `${TYPE_LABELS[draft.draft_type] || draft.draft_type} · v${draft.versions?.[0]?.version_number || 1}` : "Matter tabanlı çalışma alanı"}</span></div></div>
        <div className="draft-actions">
          {busy === "save" ? <span className="save-state"><Loader2 size={14} className="spin" /> Kaydediliyor</span> : dirty ? <span className="save-state"><Clock3 size={14} /> Bekliyor</span> : draft ? <span className="save-state"><Save size={14} /> Kaydedildi</span> : null}
          <button className="icon-command" title="Yeni taslak" onClick={() => setShowCreate(true)}><FilePlus2 size={17} /></button>
          {draft && <><button className="command" onClick={() => runExport("docx")}><Download size={16} /> DOCX</button><button className="command" onClick={() => runExport("pdf")}><Download size={16} /> PDF</button></>}
        </div>
      </header>

      {showCreate && (
        <form className="draft-create-band" onSubmit={createNewDraft}>
          <input placeholder="Taslak başlığı" value={createForm.title} onChange={(event) => setCreateForm({ ...createForm, title: event.target.value })} />
          <select value={createForm.draftType} onChange={(event) => setCreateForm({ ...createForm, draftType: event.target.value })}>{Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select value={createForm.templateId} onChange={(event) => setCreateForm({ ...createForm, templateId: event.target.value })}><option value="">Şablonsuz</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.scope_type}</option>)}</select>
          <select value={createForm.documentId} onChange={(event) => setCreateForm({ ...createForm, documentId: event.target.value })}><option value="">Yeni boş taslak</option>{availableDocuments.map((item) => <option key={item.id} value={item.id}>Belgeden aktar: {item.original_filename || item.document_name}</option>)}</select>
          <button className="primary" disabled={busy === "create"}><Plus size={16} /> Oluştur</button>
          <button type="button" className="icon-command" title="Kapat" onClick={() => setShowCreate(false)}><X size={17} /></button>
        </form>
      )}

      {!draft ? <div className="draft-empty"><FilePlus2 size={34} /><strong>Bu Matter için henüz taslak yok.</strong><button className="primary" onClick={() => setShowCreate(true)}>İlk taslağı oluştur</button></div> : (
        <div className="draft-layout">
          <aside className="draft-left">
            <label>Taslaklar</label>
            <select value={draft.id} onChange={(event) => loadDraft(event.target.value)}>{drafts.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
            <div className="panel-heading"><span>Bölümler</span><button className="icon-command" title="Bölüm ekle" onClick={addSection}><Plus size={15} /></button></div>
            <nav className="section-list">{sections.map((item, index) => <button key={item.sectionKey} className={item.sectionKey === selectedSection?.sectionKey ? "active" : ""} onClick={() => setSelectedKey(item.sectionKey)}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{item.title}</strong><small>{item.content.length} karakter</small></div></button>)}</nav>
            <div className="section-tools"><button title="Yukarı taşı" onClick={() => moveSection(-1)}><ArrowUp size={15} /></button><button title="Aşağı taşı" onClick={() => moveSection(1)}><ArrowDown size={15} /></button><button title="Bölümü sil" onClick={removeSection}><Trash2 size={15} /></button></div>
            <button className="command wide" onClick={() => runAction("plan", () => generateDraftPlan(draft.id), "Yapısal plan oluşturuldu.")}><Sparkles size={16} /> Yapısal plan üret</button>
          </aside>

          <main className="draft-editor">
            <div className="editor-heading"><div><input className="section-title" value={selectedSection?.title || ""} onChange={(event) => { setSections((items) => items.map((item) => item.sectionKey === selectedSection.sectionKey ? { ...item, title: event.target.value } : item)); setDirty(true); }} /><span>{selectedSection?.sectionKey}</span></div><div><button className="command" onClick={() => runAction("rewrite", () => generateDraftSection(draft.id, { sectionKey: selectedSection.sectionKey, instruction: "Bölümü açık, ölçülü ve kaynaklı biçimde yeniden yaz." }), "Yeniden yazım önerilere eklendi.")}><WandSparkles size={16} /> Yeniden yaz</button><button className="primary" onClick={() => runAction("analysis", () => analyzeDraft(draft.id), "Dilekçe analizi tamamlandı.")}><AlertTriangle size={16} /> Analiz et</button></div></div>
            <textarea aria-label="Dilekçe bölümü" value={selectedSection?.content || ""} onChange={(event) => updateSection(event.target.value)} placeholder="Bu bölümün içeriğini yazın..." />
            <footer><span>AI çıktıları belgeye doğrudan yazılmaz; öneri olarak bekler.</span><span>{selectedSection?.content.length || 0} karakter</span></footer>
          </main>

          <aside className="draft-right">
            <div className="right-tabs"><RightTab active={rightTab === "suggestions"} icon={<Sparkles size={14} />} onClick={() => setRightTab("suggestions")}>Öneriler</RightTab><RightTab active={rightTab === "sources"} icon={<BookOpen size={14} />} onClick={() => setRightTab("sources")}>Kaynaklar</RightTab><RightTab active={rightTab === "evidence"} icon={<Link2 size={14} />} onClick={() => setRightTab("evidence")}>Deliller</RightTab><RightTab active={rightTab === "warnings"} icon={<AlertTriangle size={14} />} onClick={() => setRightTab("warnings")}>Uyarılar</RightTab><RightTab active={rightTab === "history"} icon={<History size={14} />} onClick={() => setRightTab("history")}>Sürümler</RightTab></div>

            {rightTab === "suggestions" && <div className="right-content">{pendingSuggestions.length > 0 && <div className="bulk-bar"><button disabled={!selectedSuggestions.length} onClick={() => bulkReview("accept")}><Check size={14} /> Kabul</button><button disabled={!selectedSuggestions.length} onClick={() => bulkReview("reject")}><X size={14} /> Reddet</button></div>}{pendingSuggestions.length === 0 ? <p className="empty-copy">Bekleyen AI önerisi yok.</p> : pendingSuggestions.map((item) => <article className="suggestion-row" key={item.id}><label><input type="checkbox" checked={selectedSuggestions.includes(item.id)} onChange={() => setSelectedSuggestions((ids) => ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id])} /><span className={`severity ${item.severity?.toLowerCase()}`}>{item.suggestion_type}</span></label><strong>{item.reason}</strong>{item.suggested_text && <p>{item.suggested_text.slice(0, 420)}</p>}<div><button title="Kabul et" onClick={() => reviewSuggestion(item, "accept")}><Check size={15} /></button><button title="Reddet" onClick={() => reviewSuggestion(item, "reject")}><X size={15} /></button></div></article>)}</div>}

            {rightTab === "sources" && <div className="right-content"><div className="source-search"><input placeholder="Mevzuat veya emsal ara" value={sourceQuery} onChange={(event) => setSourceQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && findSources(false)} /><button title="Kaynak ara" onClick={() => findSources(false)}><Search size={16} /></button><button title="Karşıt kararları ara" onClick={() => findSources(true)}><Scale size={16} /></button></div><h4>Bağlı kaynaklar</h4>{(draft.citations || []).map((item) => <article className="source-row" key={item.id}><strong>{item.source_title}</strong><small>{item.court} {item.chamber} {item.decision_number}</small><p>{item.source_excerpt}</p>{item.source_url && <a href={item.source_url} target="_blank" rel="noreferrer">Resmi kaynağı görüntüle</a>}<button title="Kaynağı kaldır" onClick={() => runAction(`remove-${item.id}`, () => removeDraftCitation(draft.id, item.id), "Kaynak kaldırıldı; paragraf kaynaksız olarak işaretlendi.")}><Trash2 size={14} /></button></article>)}<h4>Arama sonuçları</h4>{sourceResults.map((item) => <article className="source-row" key={item.sourceId}><strong>{item.title}</strong><small>{item.sourceType} · %{Math.round(item.score * 100)}</small><p>{item.excerpt}</p>{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">Kaynağı görüntüle</a>}<button className="text-command" onClick={() => addSource(item)}><Plus size={14} /> Bu bölüme ekle</button></article>)}</div>}

            {rightTab === "evidence" && <div className="right-content"><form className="stack-form" onSubmit={addClaim}><input placeholder="Yeni doğrulanmış iddia" value={claimTitle} onChange={(event) => setClaimTitle(event.target.value)} /><button className="command"><Plus size={14} /> İddia ekle</button></form><form className="stack-form" onSubmit={linkEvidence}><select value={relation.claimId} onChange={(event) => setRelation({ ...relation, claimId: event.target.value })}><option value="">İddia seç</option>{matrix.claims.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><select value={relation.evidenceId} onChange={(event) => setRelation({ ...relation, evidenceId: event.target.value })}><option value="">Delil seç</option>{matrix.evidence.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><select value={relation.relationType} onChange={(event) => setRelation({ ...relation, relationType: event.target.value })}><option value="SUPPORTS">Destekler</option><option value="CONTRADICTS">Çelişir</option><option value="BACKGROUND">Arka plan</option></select><button className="primary"><Link2 size={14} /> İlişkilendir</button></form>{matrix.claims.map((claim) => <article className="claim-row" key={claim.id}><strong>{claim.title}</strong><span>{claim.supportingEvidence?.length || 0} destek · {claim.contradictingEvidence?.length || 0} çelişki</span>{claim.missingEvidence && <small>Doğrulanmış delil eksik</small>}</article>)}</div>}

            {rightTab === "warnings" && <div className="right-content">{!analysis ? <p className="empty-copy">Analiz çalıştırıldığında usul, kaynak, delil ve süre uyarıları burada görünür.</p> : <><div className="assessment"><strong>{analysis.overallAssessment?.level || "NEEDS_REVIEW"}</strong><p>{analysis.overallAssessment?.reason}</p></div>{(analysis.calculationRequired || []).map((item, index) => <article className="warning-row" key={`${item.kind}-${index}`}><AlertTriangle size={15} /><div><strong>{item.kind}</strong><p>{item.reason}</p><small>Kesin hesap yapılmadı; Faz 4 girdisi.</small></div></article>)}{(analysis.missingInformation || []).map((item) => <article className="warning-row" key={item}><AlertTriangle size={15} /><p>{item}</p></article>)}</>}</div>}

            {rightTab === "history" && <div className="right-content"><div className="version-list">{versionOptions.map((version) => <label key={version.id}><input type="checkbox" checked={compareIds.includes(version.id)} onChange={() => setCompareIds((ids) => ids.includes(version.id) ? ids.filter((id) => id !== version.id) : ids.length < 2 ? [...ids, version.id] : [ids[1], version.id])} /><strong>v{version.version_number}</strong><span>{version.change_summary}</span></label>)}</div><button className="command wide" disabled={compareIds.length !== 2} onClick={compare}><History size={15} /> İki sürümü karşılaştır</button>{comparison.map((version) => <article className="compare-row" key={version.id}><strong>v{version.version_number}</strong><pre>{version.plain_text}</pre></article>)}</div>}
          </aside>
        </div>
      )}

      <style jsx>{`
        .draft-studio{position:relative;height:100%;min-height:620px;display:flex;flex-direction:column;background:var(--color-bg);color:var(--color-text-primary);overflow:hidden}.draft-toolbar{min-height:58px;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:9px 12px;border-bottom:1px solid var(--color-border-subtle);background:var(--color-bg-elevated)}.draft-brand,.draft-actions,.editor-heading,.editor-heading>div,.panel-heading,.bulk-bar,.suggestion-row label,.suggestion-row>div,.source-search{display:flex;align-items:center;gap:8px}.draft-brand>div{display:flex;flex-direction:column}.draft-brand span,.save-state,.editor-heading span,.claim-row span,.claim-row small,.source-row small{font-size:11px;color:var(--color-text-tertiary)}.draft-actions{flex-wrap:wrap;justify-content:flex-end}.command,.primary,.icon-command,.section-tools button,.suggestion-row button,.source-row button,.source-search button,.bulk-bar button,.text-command{height:34px;display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--color-border);border-radius:7px;background:var(--color-bg-elevated);color:var(--color-text-primary);font-size:12px;font-weight:700;cursor:pointer}.primary{background:var(--color-accent);border-color:var(--color-accent);color:var(--color-text-inverse);padding:0 12px}.command{padding:0 10px}.icon-command,.section-tools button,.suggestion-row button,.source-search button{width:34px;padding:0}.wide{width:100%}.draft-create-band{display:grid;grid-template-columns:1.2fr repeat(3,minmax(140px,1fr)) auto auto;gap:8px;padding:10px 12px;border-bottom:1px solid var(--color-border-subtle);background:var(--color-bg-subtle)}input,select,textarea{border:1px solid var(--color-border);border-radius:7px;background:var(--color-bg-elevated);color:var(--color-text-primary);font:inherit}.draft-create-band input,.draft-create-band select,.draft-left select,.source-search input,.stack-form input,.stack-form select{height:36px;padding:0 9px;min-width:0}.draft-layout{flex:1;min-height:0;display:grid;grid-template-columns:220px minmax(360px,1fr) minmax(300px,360px)}.draft-left,.draft-right{min-width:0;background:var(--color-bg-elevated);overflow:auto}.draft-left{padding:12px;border-right:1px solid var(--color-border-subtle);display:flex;flex-direction:column;gap:10px}.draft-left>label{font-size:11px;font-weight:800;color:var(--color-text-tertiary);text-transform:uppercase}.panel-heading{justify-content:space-between;margin-top:4px;font-size:12px;font-weight:800}.section-list{display:flex;flex-direction:column;border-top:1px solid var(--color-border-subtle)}.section-list button{display:flex;align-items:flex-start;gap:9px;width:100%;padding:10px 6px;border:0;border-bottom:1px solid var(--color-border-subtle);background:transparent;color:var(--color-text-primary);text-align:left;cursor:pointer}.section-list button.active{background:rgba(37,99,235,.08);color:var(--color-accent)}.section-list button>span{font:700 10px monospace;color:var(--color-text-tertiary);padding-top:2px}.section-list button div{display:flex;min-width:0;flex-direction:column;gap:3px}.section-list strong{font-size:12px;overflow:hidden;text-overflow:ellipsis}.section-list small{font-size:10px;color:var(--color-text-tertiary)}.section-tools{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.section-tools button{width:100%}.draft-editor{min-width:0;display:flex;flex-direction:column;background:var(--color-bg)}.editor-heading{justify-content:space-between;padding:12px 14px;border-bottom:1px solid var(--color-border-subtle);background:var(--color-bg-elevated)}.editor-heading>div:first-child{align-items:flex-start;flex-direction:column;min-width:0}.section-title{width:min(360px,100%);border:0;background:transparent;font-size:16px;font-weight:800;padding:0}.draft-editor textarea{flex:1;width:100%;min-height:460px;padding:28px clamp(20px,5vw,72px);border:0;border-radius:0;resize:none;outline:0;font-family:Georgia,"Times New Roman",serif;font-size:15px;line-height:1.8;box-sizing:border-box}.draft-editor footer{display:flex;justify-content:space-between;gap:12px;padding:8px 14px;border-top:1px solid var(--color-border-subtle);font-size:10px;color:var(--color-text-tertiary);background:var(--color-bg-elevated)}.draft-right{border-left:1px solid var(--color-border-subtle)}.right-tabs{display:flex;overflow-x:auto;border-bottom:1px solid var(--color-border-subtle);position:sticky;top:0;background:var(--color-bg-elevated);z-index:2}.draft-tab{height:42px;display:flex;align-items:center;gap:5px;padding:0 9px;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--color-text-tertiary);font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap}.draft-tab.active{color:var(--color-accent);border-bottom-color:var(--color-accent)}.right-content{display:flex;flex-direction:column}.empty-copy{padding:18px;color:var(--color-text-tertiary);font-size:12px;line-height:1.5}.bulk-bar{padding:8px;border-bottom:1px solid var(--color-border-subtle)}.bulk-bar button{width:auto;padding:0 9px}.suggestion-row,.source-row,.claim-row,.warning-row,.compare-row,.assessment{position:relative;display:flex;flex-direction:column;gap:7px;padding:12px;border-bottom:1px solid var(--color-border-subtle)}.suggestion-row strong,.source-row strong,.claim-row strong,.warning-row strong{font-size:12px;line-height:1.4}.suggestion-row p,.source-row p,.warning-row p,.assessment p{margin:0;color:var(--color-text-secondary);font-size:11px;line-height:1.5;white-space:pre-wrap}.severity{font-size:9px;font-weight:900;padding:3px 5px;border-radius:4px;background:#DBEAFE;color:#1D4ED8}.severity.high,.severity.critical{background:#FEE2E2;color:#991B1B}.source-search{padding:10px;border-bottom:1px solid var(--color-border-subtle)}.source-search input{flex:1;min-width:0}.right-content h4{margin:0;padding:10px 12px 6px;font-size:10px;text-transform:uppercase;color:var(--color-text-tertiary)}.source-row>button{align-self:flex-start;width:auto;padding:0 8px}.stack-form{display:flex;flex-direction:column;gap:7px;padding:10px;border-bottom:1px solid var(--color-border-subtle)}.warning-row{flex-direction:row}.warning-row>svg{flex-shrink:0;color:#D97706}.version-list{display:flex;flex-direction:column}.version-list label{display:grid;grid-template-columns:auto 32px 1fr;gap:7px;padding:10px 12px;border-bottom:1px solid var(--color-border-subtle);font-size:11px;align-items:start}.compare-row pre{max-height:230px;overflow:auto;white-space:pre-wrap;font:11px/1.5 monospace;color:var(--color-text-secondary)}.draft-empty{min-height:420px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:var(--color-text-secondary)}.draft-notice{position:absolute;top:66px;right:14px;z-index:20;max-width:420px;padding:10px 13px;border-radius:7px;background:#DCFCE7;color:#166534;font-size:12px;font-weight:700;box-shadow:0 8px 24px rgba(0,0,0,.14)}.draft-notice.error{background:#FEE2E2;color:#991B1B}.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:1050px){.draft-layout{grid-template-columns:190px minmax(360px,1fr)}.draft-right{grid-column:1/-1;border-left:0;border-top:1px solid var(--color-border-subtle);max-height:360px}.draft-create-band{grid-template-columns:1fr 1fr}}@media(max-width:720px){.draft-toolbar,.editor-heading{align-items:flex-start;flex-direction:column}.draft-layout{display:flex;flex-direction:column;overflow:auto}.draft-left{max-height:260px;border-right:0}.draft-editor textarea{min-height:420px}.draft-right{max-height:none}.draft-create-band{grid-template-columns:1fr}.command{white-space:normal}.draft-editor footer{flex-direction:column}}
      `}</style>
    </div>
  );
}
