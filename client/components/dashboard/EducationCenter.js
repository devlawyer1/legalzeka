"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive, BookOpen, Brain, ClipboardCheck, Download, FileText, FlaskConical,
  GraduationCap, Library, Loader2, Plus, RefreshCw, Scale, Send, Users,
} from "lucide-react";
import {
  createCaseBrief, createCodingSchema, createCourse, createCourseAssignment,
  createLearningQuiz, createLearningTopic, createLearningWorkspace, createMootScenario,
  createResearchEntry, createResearchProject, createSourceCollection, createStudyNote,
  downloadEducationExport, generateCaseBrief, generateLearningCards, getCourseAssignments,
  getLearningQuiz, getLearningWorkspace, getLearningWorkspaces, getResearchProject, getStudyNote,
  inviteCourseMember, startQuizAttempt, submitQuizAttempt, suggestStudyNote, updateStudyNote,
  updateCaseBrief,
} from "@/lib/api";
import styles from "./EducationCenter.module.css";

const VIEW_COPY = {
  learning: { title: "Öğrenme Merkezi", subtitle: "Notlar, case brief, kartlar, quiz ve moot çalışmaları", icon: GraduationCap },
  academic: { title: "Akademik Araştırma", subtitle: "Kaynak corpus'u, anotasyon ve akademik kodlama", icon: FlaskConical },
  courses: { title: "Derslerim", subtitle: "Okuma listeleri, ödevler, teslimler ve değerlendirme", icon: Users },
};

const TABS = {
  learning: ["Genel", "Notlar", "Case brief", "Kartlar & quiz", "Moot court", "Kaynaklar"],
  academic: ["Proje", "Araştırma notları", "Kodlama", "Kaynaklar", "Export"],
  courses: ["Ders", "Ödevler", "Okuma listesi", "Üyeler"],
};

function formatDate(value) {
  return value ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(new Date(value)) : "-";
}

function Empty({ icon: Icon, title }) {
  return <div className={styles.empty}><Icon size={22} /><span>{title}</span></div>;
}

export default function EducationCenter({ mode = "learning", activeFirmId = null, entitlements = {} }) {
  const copy = VIEW_COPY[mode];
  const HeaderIcon = copy.icon;
  const [workspaces, setWorkspaces] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [project, setProject] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [courseRole, setCourseRole] = useState(null);
  const [tab, setTab] = useState(TABS[mode][0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [email, setEmail] = useState("");
  const [noteEditor, setNoteEditor] = useState(null);
  const [noteSuggestion, setNoteSuggestion] = useState(null);
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [quizAttempt, setQuizAttempt] = useState(null);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizResult, setQuizResult] = useState(null);

  const filter = useMemo(() => {
    if (mode === "academic") return { workspaceType: "RESEARCH_PROJECT", sort: "updated_at" };
    if (mode === "courses") return { workspaceType: "COURSE", sort: "updated_at" };
    return { workspaceType: "STUDENT", sort: "updated_at" };
  }, [mode]);

  const loadList = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const response = await getLearningWorkspaces(filter);
      const items = response.data?.items || [];
      setWorkspaces(items);
      setSelectedId((current) => current && items.some((item) => item.id === current) ? current : items[0]?.id || null);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }, [filter]);

  const loadDetail = useCallback(async () => {
    if (!selectedId) { setDetail(null); setProject(null); setAssignments([]); return; }
    setBusy(true); setError("");
    try {
      const response = await getLearningWorkspace(selectedId);
      setDetail(response.data);
      if (mode === "academic" && response.data.project_id) {
        setProject((await getResearchProject(response.data.project_id)).data);
      } else setProject(null);
      if (mode === "courses" && response.data.course_id) {
        const assignmentResponse = (await getCourseAssignments(response.data.course_id)).data;
        setAssignments(assignmentResponse?.items || []);
        setCourseRole(assignmentResponse?.memberRole || null);
      } else { setAssignments([]); setCourseRole(null); }
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }, [mode, selectedId]);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadDetail(); }, [loadDetail]);
  useEffect(() => { setTab(TABS[mode][0]); }, [mode]);

  async function act(action, success) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); setMessage(success); await loadList(); await loadDetail(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function createPrimary(event) {
    event.preventDefault();
    if (!title.trim()) return;
    await act(async () => {
      let response;
      if (mode === "academic") response = await createResearchProject({ title, organizationId: activeFirmId || null, status: "PLANNING" });
      else if (mode === "courses") response = await createCourse({ title, organizationId: activeFirmId || null, status: "DRAFT" });
      else response = await createLearningWorkspace({ workspaceType: "STUDENT", title, academicLevel: "UNDERGRADUATE" });
      setSelectedId(response.data.workspace?.id || response.data.id);
      setTitle(""); setShowCreate(false);
    }, mode === "academic" ? "Araştırma projesi oluşturuldu." : mode === "courses" ? "Ders oluşturuldu." : "Çalışma alanı oluşturuldu.");
  }

  async function createNote() {
    if (!detail) return;
    await act(() => createStudyNote(detail.id, { title: title || "Yeni ders notu", contentJson: { type: "doc", content: [] }, plainText: "", status: "DRAFT" }), "Ders notu oluşturuldu.");
    setTitle("");
  }

  async function openNote(noteId) {
    await act(async () => {
      const response = await getStudyNote(noteId);
      setNoteEditor({ ...response.data, draftTitle: response.data.title, draftText: response.data.plain_text || "" });
      setNoteSuggestion(null);
    }, "");
  }

  async function saveNote() {
    if (!noteEditor) return;
    await act(async () => {
      const response = await updateStudyNote(noteEditor.id, { title: noteEditor.draftTitle, plainText: noteEditor.draftText, contentJson: { type: "doc", content: [{ type: "paragraph", text: noteEditor.draftText }] }, changeSummary: "Editor update" });
      setNoteEditor({ ...noteEditor, ...response.data });
    }, "Notun yeni sürümü kaydedildi.");
  }

  async function previewNoteSuggestion(operation) {
    if (!noteEditor || !sourceId) return;
    await act(async () => setNoteSuggestion((await suggestStudyNote(noteEditor.id, { operation, sourceIds: [sourceId] })).data), "AI önerisi önizlemeye alındı.");
  }

  async function acceptNoteSuggestion() {
    if (!noteEditor || !noteSuggestion) return;
    await act(async () => {
      const response = await updateStudyNote(noteEditor.id, { suggestionId: noteSuggestion.id, changeSummary: "Accepted AI preview" });
      setNoteEditor({ ...noteEditor, ...response.data, draftTitle: response.data.title, draftText: response.data.plain_text });
      setNoteSuggestion(null);
    }, "Öneri yeni ve immutable bir not sürümü olarak kabul edildi.");
  }

  async function createBrief() {
    if (!detail || !sourceId) return;
    await act(async () => {
      const brief = await createCaseBrief(detail.id, { legalSourceId: sourceId });
      await generateCaseBrief(brief.data.id);
    }, "Case brief önerisi hazırlandı; kabul edilene kadar taslak kalacak.");
  }

  async function acceptBrief(briefId) {
    await act(() => updateCaseBrief(briefId, { acceptSuggestion: true }), "Case brief önerisi yeni immutable sürüm olarak kabul edildi.");
  }

  async function generateCards() {
    if (!detail || !sourceId) return;
    await act(() => generateLearningCards(detail.id, { sourceIds: [sourceId], count: 8 }), "Taslak çalışma kartları oluşturuldu.");
  }

  async function generateQuiz() {
    if (!detail || !sourceId) return;
    await act(() => createLearningQuiz(detail.id, { title: title || "Kaynaklı çalışma quizi", quizType: "SELF_ASSESSMENT", generate: true, sourceIds: [sourceId], questionCount: 5 }), "Kaynaklı quiz taslağı oluşturuldu.");
  }

  async function openQuiz(quizId) {
    await act(async () => {
      const quiz = (await getLearningQuiz(quizId)).data;
      const attempt = (await startQuizAttempt(quizId)).data;
      setActiveQuiz(quiz); setQuizAttempt(attempt); setQuizAnswers({}); setQuizResult(null);
    }, "");
  }

  async function submitActiveQuiz() {
    if (!activeQuiz || !quizAttempt) return;
    await act(async () => {
      const answers = activeQuiz.questions.filter((question) => quizAnswers[question.id] !== undefined).map((question) => ({
        questionId: question.id,
        answer: ["MULTIPLE_CHOICE", "TRUE_FALSE"].includes(question.question_type)
          ? { value: quizAnswers[question.id] }
          : { text: quizAnswers[question.id] },
      }));
      setQuizResult((await submitQuizAttempt(quizAttempt.id, { answers })).data);
    }, "Quiz değerlendirildi; AI puanları tavsiye niteliğindedir.");
  }

  async function createMoot() {
    if (!detail || !sourceId) return;
    await act(() => createMootScenario({ workspaceId: detail.id, title: title || "Farazi dava çalışması", facts: "Farazi olay çalışma taslağı", issues: [], sourceIds: [sourceId], roles: ["CLAIMANT", "RESPONDENT", "JUDGE", "ACADEMIC_OBSERVER"], rubric: {}, status: "DRAFT" }), "Moot court senaryosu oluşturuldu.");
  }

  async function createResearchNote() {
    if (!project) return;
    await act(() => createResearchEntry(project.id, { entryType: "LITERATURE_NOTE", title: title || "Araştırma notu", content: "", tags: [] }), "Araştırma notu oluşturuldu.");
  }

  async function createSchema() {
    if (!project) return;
    await act(() => createCodingSchema(project.id, { name: title || "Karar kodlama şeması", status: "DRAFT", definition: { type: "object", required: ["claimAccepted"], properties: { courtLevel: { type: "string", enum: ["YARGITAY", "BAM", "İLK_DERECE"] }, claimAccepted: { type: "boolean" }, damagesAwarded: { type: "boolean" }, reasoningCategory: { type: "string" } } } }), "Kodlama şemasının yeni sürümü oluşturuldu.");
  }

  async function createAssignment() {
    if (!detail?.course_id) return;
    await act(() => createCourseAssignment(detail.course_id, { title: title || "Yeni ödev", assignmentType: "ESSAY", rubric: {}, status: "DRAFT", aiPolicy: "AI_ALLOWED_WITH_DISCLOSURE", lateSubmissionPolicy: "BLOCK" }), "Ödev taslağı oluşturuldu.");
  }

  async function invite() {
    if (!detail?.course_id || !email) return;
    await act(() => inviteCourseMember(detail.course_id, { email, role: "STUDENT", expiresInHours: 72 }), "Tek kullanımlık ders daveti oluşturuldu.");
    setEmail("");
  }

  const stats = detail?.progress || {};
  const canCreatePrimary = mode !== "courses" || entitlements.ACADEMIC_COURSE !== false;
  const canManageCourse = ["INSTRUCTOR", "TEACHING_ASSISTANT"].includes(courseRole);

  return (
    <section className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.heading}><HeaderIcon size={22} /><div><h1>{copy.title}</h1><p>{copy.subtitle}</p></div></div>
        <div className={styles.headerActions}>
          <button className={styles.iconButton} onClick={loadList} title="Yenile"><RefreshCw size={16} /></button>
          {canCreatePrimary && <button className={styles.primaryButton} onClick={() => setShowCreate((value) => !value)}><Plus size={16} /> Yeni</button>}
        </div>
      </header>

      {showCreate && <form className={styles.createBar} onSubmit={createPrimary}>
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={mode === "academic" ? "Proje adı" : mode === "courses" ? "Ders adı" : "Çalışma alanı adı"} autoFocus />
        <button className={styles.primaryButton} type="submit"><Plus size={15} /> Oluştur</button>
      </form>}

      {(error || message) && <div className={error ? styles.error : styles.notice}>{error || message}</div>}

      <div className={styles.body}>
        <aside className={styles.workspaceList}>
          <div className={styles.listLabel}>{workspaces.length} alan</div>
          {workspaces.map((workspace) => <button key={workspace.id} className={`${styles.workspaceRow} ${selectedId === workspace.id ? styles.selected : ""}`} onClick={() => setSelectedId(workspace.id)}>
            <span className={styles.workspaceIcon}>{mode === "academic" ? <FlaskConical size={16} /> : mode === "courses" ? <BookOpen size={16} /> : <Library size={16} />}</span>
            <span><strong>{workspace.title}</strong><small>{workspace.status} · {formatDate(workspace.updated_at)}</small></span>
          </button>)}
          {!busy && !workspaces.length && <Empty icon={Archive} title="Henüz kayıt yok" />}
        </aside>

        <main className={styles.workspaceMain}>
          {busy && !detail ? <div className={styles.loading}><Loader2 size={22} className={styles.spin} /></div> : !detail ? <Empty icon={BookOpen} title="Bir çalışma alanı seçin" /> : <>
            <div className={styles.workspaceHeader}><div><h2>{detail.title}</h2><p>{detail.legal_domain || "Genel hukuk"}</p></div><span className={styles.status}>{detail.status}</span></div>
            <div className={styles.tabs}>{TABS[mode].map((item) => <button key={item} className={tab === item ? styles.activeTab : ""} onClick={() => setTab(item)}>{item}</button>)}</div>

            {mode === "learning" && tab === "Genel" && <div className={styles.metricGrid}>
              <div><FileText size={17} /><strong>{stats.notes || 0}</strong><span>Not</span></div>
              <div><Scale size={17} /><strong>{stats.briefs || 0}</strong><span>Case brief</span></div>
              <div><Brain size={17} /><strong>{stats.active_cards || 0}</strong><span>Aktif kart</span></div>
              <div><ClipboardCheck size={17} /><strong>{stats.completed_quizzes || 0}</strong><span>Tamamlanan quiz</span></div>
            </div>}

            {mode === "learning" && tab === "Notlar" && <div className={styles.stack}>
              <ToolSection title="Ders notları" icon={FileText} value={title} onValue={setTitle} placeholder="Not başlığı" action={createNote} button="Not oluştur" items={null} render={() => null} />
              <div className={styles.splitPane}>
                <div className={styles.itemList}>{detail.notes?.map((item) => <button className={styles.listButton} key={item.id} onClick={() => openNote(item.id)}><strong>{item.title}</strong><small>{item.status} · {formatDate(item.updated_at)}</small></button>)}</div>
                {noteEditor ? <div className={styles.editor}>
                  <input value={noteEditor.draftTitle} onChange={(event) => setNoteEditor({ ...noteEditor, draftTitle: event.target.value })} />
                  <textarea value={noteEditor.draftText} onChange={(event) => setNoteEditor({ ...noteEditor, draftText: event.target.value })} />
                  <div className={styles.editorActions}><button onClick={saveNote}><FileText size={15} /> Kaydet</button><input value={sourceId} onChange={(event) => setSourceId(event.target.value)} placeholder="Kaynak UUID" /><button onClick={() => previewNoteSuggestion("SIMPLIFY")}><Brain size={15} /> Sadeleştir</button></div>
                  {noteSuggestion && <div className={styles.preview}><strong>AI önizleme</strong><p>{noteSuggestion.suggested_plain_text}</p><button onClick={acceptNoteSuggestion}><ClipboardCheck size={15} /> Yeni sürüm olarak kabul et</button></div>}
                </div> : <Empty icon={FileText} title="Düzenlemek için bir not seçin" />}
              </div>
            </div>}
            {mode === "learning" && tab === "Case brief" && <SourceTool title="Case brief" sourceId={sourceId} setSourceId={setSourceId} action={createBrief} button="Brief önerisi üret" items={detail.caseBriefs} render={(item) => <><strong>{item.title}</strong><small>{item.court || "Mahkeme"} · {item.verification_status}</small>{item.verification_status === "AI_SUGGESTED" && <button className={styles.miniButton} onClick={() => acceptBrief(item.id)}><ClipboardCheck size={14} /> Öneriyi kabul et</button>}</>} />}
            {mode === "learning" && tab === "Kartlar & quiz" && <div className={styles.stack}>
              <SourceAction title="Çalışma kartları" sourceId={sourceId} setSourceId={setSourceId} action={generateCards} button="Kart üret" />
              <SourceAction title="Kaynaklı quiz" sourceId={sourceId} setSourceId={setSourceId} action={generateQuiz} button="Quiz üret" />
              <ItemList items={detail.cards} render={(item) => <><strong>{item.front}</strong><small>{item.card_type} · {item.status}</small></>} />
              <div className={styles.itemList}>{detail.quizzes?.map((item) => <button className={styles.listButton} key={item.id} onClick={() => openQuiz(item.id)}><strong>{item.title}</strong><small>{item.quiz_type} · {item.status}</small></button>)}</div>
              {activeQuiz && <div className={styles.quizPanel}><h3>{activeQuiz.title}</h3>{activeQuiz.questions.map((question, index) => <div className={styles.question} key={question.id}><strong>{index + 1}. {question.prompt}</strong>{question.question_type === "MULTIPLE_CHOICE" ? <div className={styles.options}>{(question.options || []).map((option, optionIndex) => { const value = String(option?.id ?? optionIndex); return <label key={value}><input type="radio" name={question.id} checked={quizAnswers[question.id] === value} onChange={() => setQuizAnswers({ ...quizAnswers, [question.id]: value })} /> {option?.text ?? option}</label>; })}</div> : question.question_type === "TRUE_FALSE" ? <div className={styles.options}>{["true", "false"].map((value) => <label key={value}><input type="radio" name={question.id} checked={quizAnswers[question.id] === value} onChange={() => setQuizAnswers({ ...quizAnswers, [question.id]: value })} /> {value === "true" ? "Doğru" : "Yanlış"}</label>)}</div> : <textarea value={quizAnswers[question.id] || ""} onChange={(event) => setQuizAnswers({ ...quizAnswers, [question.id]: event.target.value })} />}</div>)}<button className={styles.submitButton} onClick={submitActiveQuiz}><ClipboardCheck size={15} /> Cevapları değerlendir</button>{quizResult && <div className={styles.score}>{Number(quizResult.score)} / {Number(quizResult.max_score)}</div>}</div>}
            </div>}
            {mode === "learning" && tab === "Moot court" && <SourceTool title="Farazi dava" sourceId={sourceId} setSourceId={setSourceId} action={createMoot} button="Senaryo oluştur" items={detail.mootScenarios} render={(item) => <><strong>{item.title}</strong><small>{item.status}</small></>} />}
            {mode === "learning" && tab === "Kaynaklar" && <ToolSection title="Kaynak koleksiyonları" icon={Library} value={title} onValue={setTitle} placeholder="Koleksiyon adı" action={() => act(() => createSourceCollection(detail.id, { title: title || "Okuma listesi", collectionType: "READING_LIST" }), "Kaynak koleksiyonu oluşturuldu.")} button="Koleksiyon oluştur" items={detail.sourceCollections} render={(item) => <><strong>{item.title}</strong><small>{item.collection_type}</small></>} />}

            {mode === "academic" && tab === "Proje" && project && <div className={styles.definition}><h3>Araştırma sorusu</h3><p>{project.research_question || "Henüz tanımlanmadı"}</p><h3>Hipotez</h3><p>{project.hypothesis || "Henüz tanımlanmadı"}</p><h3>Yöntem</h3><p>{project.methodology || "Henüz tanımlanmadı"}</p></div>}
            {mode === "academic" && tab === "Araştırma notları" && <ToolSection title="Araştırma notları" icon={FileText} value={title} onValue={setTitle} placeholder="Not başlığı" action={createResearchNote} button="Not ekle" items={project?.entries} render={(item) => <><strong>{item.title}</strong><small>{item.entry_type}</small></>} />}
            {mode === "academic" && tab === "Kodlama" && <ToolSection title="Kodlama şemaları" icon={FlaskConical} value={title} onValue={setTitle} placeholder="Şema adı" action={createSchema} button="Yeni sürüm" items={project?.schemas} render={(item) => <><strong>{item.name}</strong><small>v{item.version_number} · {item.status}</small></>} />}
            {mode === "academic" && tab === "Kaynaklar" && <ItemList items={detail.sourceCollections} render={(item) => <><strong>{item.title}</strong><small>{item.collection_type}</small></>} />}
            {mode === "academic" && tab === "Export" && <div className={styles.exportGrid}>{["CSV", "JSON", "RIS", "BIBTEX"].map((format) => <button key={format} onClick={() => downloadEducationExport(`/v1/research-projects/${project?.id}/export?format=${format}`, `${detail.title}.${format.toLowerCase()}`)}><Download size={17} /><span>{format}</span><small>{format === "RIS" || format === "BIBTEX" ? "Taslak citation" : "Araştırma verisi"}</small></button>)}</div>}

            {mode === "courses" && tab === "Ders" && <div className={styles.metricGrid}><div><BookOpen size={17} /><strong>{assignments.length}</strong><span>Ödev</span></div><div><Library size={17} /><strong>{detail.sourceCollections?.length || 0}</strong><span>Okuma listesi</span></div><div><ClipboardCheck size={17} /><strong>{detail.quizzes?.length || 0}</strong><span>Quiz</span></div></div>}
            {mode === "courses" && tab === "Ödevler" && (canManageCourse ? <ToolSection title="Ödevler" icon={ClipboardCheck} value={title} onValue={setTitle} placeholder="Ödev başlığı" action={createAssignment} button="Ödev taslağı" items={assignments} render={(item) => <><strong>{item.title}</strong><small>{item.status} · {item.ai_policy} · {formatDate(item.due_at)}</small></>} /> : <ItemList items={assignments} render={(item) => <><strong>{item.title}</strong><small>{item.status} · {formatDate(item.due_at)}</small></>} />)}
            {mode === "courses" && tab === "Okuma listesi" && <ItemList items={detail.sourceCollections} render={(item) => <><strong>{item.title}</strong><small>{item.collection_type}</small></>} />}
            {mode === "courses" && tab === "Üyeler" && (canManageCourse ? <div className={styles.tool}><div><h3>Öğrenci daveti</h3><p>Süreli ve tek kullanımlık erişim</p></div><div className={styles.inlineForm}><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ogrenci@universite.edu.tr" /><button onClick={invite}><Send size={15} /> Davet oluştur</button></div></div> : <Empty icon={Users} title="Ders üyeliğiniz aktif" />)}
          </>}
        </main>
      </div>
    </section>
  );
}

function ToolSection({ title, icon: Icon, value, onValue, placeholder, action, button, items = [], render }) {
  return <div className={styles.stack}><div className={styles.tool}><div><h3><Icon size={17} /> {title}</h3></div><div className={styles.inlineForm}><input value={value} onChange={(event) => onValue(event.target.value)} placeholder={placeholder} /><button onClick={action}><Plus size={15} /> {button}</button></div></div>{items !== null && <ItemList items={items} render={render} />}</div>;
}

function SourceAction({ title, sourceId, setSourceId, action, button }) {
  return <div className={styles.tool}><div><h3><Library size={17} /> {title}</h3><p>Doğrulanmış hukuk kaynağı</p></div><div className={styles.inlineForm}><input value={sourceId} onChange={(event) => setSourceId(event.target.value)} placeholder="Kaynak UUID" /><button onClick={action}><Brain size={15} /> {button}</button></div></div>;
}

function SourceTool({ title, sourceId, setSourceId, action, button, items, render }) {
  return <div className={styles.stack}><SourceAction title={title} sourceId={sourceId} setSourceId={setSourceId} action={action} button={button} /><ItemList items={items} render={render} /></div>;
}

function ItemList({ items = [], render }) {
  if (!items?.length) return <Empty icon={Archive} title="Kayıt bulunmuyor" />;
  return <div className={styles.itemList}>{items.map((item, index) => <div className={styles.item} key={item.id || index}>{render(item)}</div>)}</div>;
}
