"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  CalendarClock,
  Check,
  Clock3,
  CopyPlus,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Square,
  Workflow,
  X,
} from "lucide-react";
import {
  activateAgentWorkflow,
  approveAgentProposal,
  bulkReviewAgentProposals,
  cancelAgentRun,
  createAgentSchedule,
  createAgentWorkflow,
  getAccessibleCases,
  getAgentProposals,
  getAgentRun,
  getAgentRuns,
  getAgentSchedules,
  getAgentWorkflows,
  getCaseAgentProposals,
  getCaseAgentRuns,
  pauseAgentWorkflow,
  rejectAgentProposal,
  retryAgentRun,
  startAgentRun,
} from "@/lib/api";
import styles from "./AgentCenter.module.css";

const tabs = [
  { id: "workflows", label: "Workflow'lar", icon: Workflow },
  { id: "runs", label: "Çalışmalar", icon: Bot },
  { id: "approvals", label: "Onaylar", icon: ShieldCheck },
];

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
}

function statusTone(status) {
  if (["COMPLETED", "EXECUTED", "ACTIVE"].includes(status)) return styles.good;
  if (["FAILED", "EXECUTION_FAILED", "BUDGET_EXCEEDED", "REJECTED"].includes(status)) return styles.bad;
  if (["WAITING_APPROVAL", "PENDING", "PAUSED"].includes(status)) return styles.warn;
  return styles.neutral;
}

function Status({ value }) {
  return <span className={`${styles.status} ${statusTone(value)}`}>{String(value || "-").replaceAll("_", " ")}</span>;
}

function matterName(item) {
  return item.konu || item.esasNo || item.esas_no || "Dosya";
}

function metric(value) {
  return Number(value || 0).toLocaleString("tr-TR", { maximumFractionDigits: 6 });
}

export default function AgentCenter({ activeFirmId }) {
  const [activeTab, setActiveTab] = useState("workflows");
  const [workflows, setWorkflows] = useState([]);
  const [runs, setRuns] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [cases, setCases] = useState([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [selectedRun, setSelectedRun] = useState(null);
  const [selectedProposalIds, setSelectedProposalIds] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [cronExpression, setCronExpression] = useState("0 9 * * 1-5");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [workflowResponse, runResponse, proposalResponse, caseResponse] = await Promise.all([
        getAgentWorkflows({ limit: 100 }),
        getAgentRuns({ limit: 100 }),
        getAgentProposals({ limit: 100 }),
        getAccessibleCases(),
      ]);
      setWorkflows(workflowResponse.data || []);
      setRuns(runResponse.data || []);
      setProposals(proposalResponse.data || []);
      setCases(caseResponse.data || []);
      const firstActive = (workflowResponse.data || []).find((item) => item.status === "ACTIVE");
      if (!selectedWorkflowId && firstActive) setSelectedWorkflowId(firstActive.id);
      if (!selectedCaseId && caseResponse.data?.[0]) setSelectedCaseId(caseResponse.data[0].id);
    } catch (error) {
      setNotice(error.message || "Agent verisi alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [selectedCaseId, selectedWorkflowId]);

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    if (!selectedWorkflowId) return;
    getAgentSchedules(selectedWorkflowId).then((response) => setSchedules(response.data || [])).catch(() => setSchedules([]));
  }, [selectedWorkflowId]);

  const systemTemplates = useMemo(() => workflows.filter((item) => item.is_system_template), [workflows]);
  const firmWorkflows = useMemo(() => workflows.filter((item) => !item.is_system_template), [workflows]);
  const activeWorkflows = useMemo(() => firmWorkflows.filter((item) => item.status === "ACTIVE"), [firmWorkflows]);
  const pendingProposals = useMemo(() => proposals.filter((item) => item.status === "PENDING"), [proposals]);

  async function perform(key, action, success) {
    setBusy(key);
    setNotice("");
    try {
      await action();
      if (success) setNotice(success);
      await refresh();
      if (selectedRun?.id) setSelectedRun((await getAgentRun(selectedRun.id)).data);
    } catch (error) {
      setNotice(error.message || "İşlem tamamlanamadı.");
    } finally {
      setBusy("");
    }
  }

  function cloneTemplate(template) {
    return perform(`clone-${template.id}`, () => createAgentWorkflow({
      organizationId: activeFirmId,
      scopeType: activeFirmId ? "ORGANIZATION" : "PERSONAL",
      name: `${template.name} - Çalışma Kopyası`,
      description: template.description,
      workflowType: template.workflow_type,
      definition: template.definition,
      toolPolicy: template.tool_policy,
      modelPolicy: template.model_policy,
      budgetPolicy: template.budget_policy,
      triggerPolicy: template.trigger_policy,
    }), "Workflow taslağı oluşturuldu.");
  }

  function runWorkflow(workflowId = selectedWorkflowId, caseId = selectedCaseId) {
    if (!workflowId) return;
    return perform(`run-${workflowId}`, () => startAgentRun(workflowId, {
      caseId: caseId || null,
      inputData: {},
    }, `manual-${workflowId}-${caseId || "none"}-${Date.now()}`), "Çalışma kuyruğa alındı.");
  }

  async function openRun(runId) {
    setBusy(`detail-${runId}`);
    try {
      setSelectedRun((await getAgentRun(runId)).data);
      setActiveTab("runs");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy("");
    }
  }

  function toggleProposal(id) {
    setSelectedProposalIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function bulk(action) {
    const selected = pendingProposals.filter((item) => selectedProposalIds.includes(item.id));
    const payload = action === "approve"
      ? { approve: selected.filter((item) => item.risk_level === "REVERSIBLE_WRITE").map((item) => item.id), reject: [] }
      : { approve: [], reject: selected.map((item) => ({ id: item.id, reason: "Toplu inceleme" })) };
    return perform(`bulk-${action}`, () => bulkReviewAgentProposals(payload), "Toplu inceleme tamamlandı.")
      .then(() => setSelectedProposalIds([]));
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div>
          <h1>Agent Merkezi</h1>
          <div className={styles.headerMeta}>
            <span>{activeWorkflows.length} aktif workflow</span>
            <span>{runs.filter((item) => ["QUEUED", "RUNNING", "WAITING_APPROVAL"].includes(item.status)).length} devam eden çalışma</span>
            <span>{pendingProposals.length} bekleyen onay</span>
          </div>
        </div>
        <button className={styles.iconButton} onClick={refresh} title="Yenile" disabled={loading}>
          <RefreshCw size={17} className={loading ? styles.spinning : ""} />
        </button>
      </header>

      <nav className={styles.tabs}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} className={activeTab === tab.id ? styles.tabActive : styles.tab} onClick={() => setActiveTab(tab.id)}>
              <Icon size={16} />{tab.label}
              {tab.id === "approvals" && pendingProposals.length > 0 && <span className={styles.count}>{pendingProposals.length}</span>}
            </button>
          );
        })}
      </nav>

      {notice && <div className={styles.notice}>{notice}</div>}

      {activeTab === "workflows" && (
        <div className={styles.contentGrid}>
          <section className={styles.section}>
            <div className={styles.sectionHeading}><h2>Sistem Şablonları</h2><span>{systemTemplates.length}</span></div>
            <div className={styles.rows}>
              {systemTemplates.map((item) => (
                <div className={styles.row} key={item.id}>
                  <div className={styles.rowMain}>
                    <strong>{item.name}</strong>
                    <span>{item.workflow_type.replaceAll("_", " ")} · v{item.version_number}</span>
                  </div>
                  <Status value="DRAFT" />
                  <button className={styles.iconButton} onClick={() => cloneTemplate(item)} disabled={busy === `clone-${item.id}`} title="Şablondan workflow oluştur">
                    <CopyPlus size={16} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeading}><h2>Büro Workflow'ları</h2><span>{firmWorkflows.length}</span></div>
            <div className={styles.rows}>
              {firmWorkflows.length === 0 && <div className={styles.empty}>Workflow yok</div>}
              {firmWorkflows.map((item) => (
                <div className={`${styles.row} ${selectedWorkflowId === item.id ? styles.selectedRow : ""}`} key={item.id} onClick={() => setSelectedWorkflowId(item.id)}>
                  <div className={styles.rowMain}>
                    <strong>{item.name}</strong>
                    <span>{item.workflow_type.replaceAll("_", " ")} · v{item.version_number}</span>
                  </div>
                  <Status value={item.status} />
                  {item.status === "ACTIVE" ? (
                    <button className={styles.iconButton} onClick={(event) => { event.stopPropagation(); perform(`pause-${item.id}`, () => pauseAgentWorkflow(item.id)); }} title="Duraklat"><Pause size={16} /></button>
                  ) : (
                    <button className={styles.iconButton} onClick={(event) => { event.stopPropagation(); perform(`activate-${item.id}`, () => activateAgentWorkflow(item.id)); }} title="Aktifleştir"><Play size={16} /></button>
                  )}
                </div>
              ))}
            </div>
          </section>

          <aside className={styles.sidePanel}>
            <h2>Manuel Çalıştır</h2>
            <label>Workflow</label>
            <select value={selectedWorkflowId} onChange={(event) => setSelectedWorkflowId(event.target.value)}>
              <option value="">Seç</option>
              {activeWorkflows.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
            <label>Matter</label>
            <select value={selectedCaseId} onChange={(event) => setSelectedCaseId(event.target.value)}>
              <option value="">Matter olmadan</option>
              {cases.map((item) => <option value={item.id} key={item.id}>{matterName(item)}</option>)}
            </select>
            <button className={styles.primary} onClick={() => runWorkflow()} disabled={!selectedWorkflowId || busy.startsWith("run-")}><Play size={16} />Başlat</button>

            <div className={styles.divider} />
            <h2>Zamanlama</h2>
            <label>Cron</label>
            <input value={cronExpression} onChange={(event) => setCronExpression(event.target.value)} />
            <button className={styles.secondary} disabled={!selectedWorkflowId} onClick={() => perform("schedule", () => createAgentSchedule(selectedWorkflowId, {
              caseId: selectedCaseId || null, cronExpression, timezone: "Europe/Istanbul",
            }), "Zamanlama oluşturuldu.")}><CalendarClock size={16} />Kaydet</button>
            <div className={styles.scheduleList}>
              {schedules.map((item) => <div key={item.id}><Clock3 size={14} /><span>{item.cron_expression}</span><small>{formatDate(item.next_run_at)}</small></div>)}
            </div>
          </aside>
        </div>
      )}

      {activeTab === "runs" && (
        <div className={styles.runLayout}>
          <section className={styles.section}>
            <div className={styles.sectionHeading}><h2>Agent Çalışmaları</h2><span>{runs.length}</span></div>
            <div className={styles.rows}>
              {runs.map((run) => (
                <button className={`${styles.row} ${selectedRun?.id === run.id ? styles.selectedRow : ""}`} key={run.id} onClick={() => openRun(run.id)}>
                  <div className={styles.rowMain}>
                    <strong>{run.workflow_name}</strong>
                    <span>{formatDate(run.created_at)} · Adım {run.current_step}</span>
                  </div>
                  <Status value={run.status} />
                  <span className={styles.cost}>{run.estimated_cost === null ? "-" : `${metric(run.estimated_cost)} USD`}</span>
                </button>
              ))}
            </div>
          </section>

          <aside className={styles.runDetail}>
            {!selectedRun ? <div className={styles.empty}>Çalışma seçin</div> : (
              <>
                <div className={styles.detailHeader}>
                  <div><h2>{selectedRun.workflow_name}</h2><Status value={selectedRun.status} /></div>
                  <div className={styles.actions}>
                    {["QUEUED", "RUNNING", "WAITING_APPROVAL"].includes(selectedRun.status) && <button className={styles.iconButton} title="Durdur" onClick={() => perform("cancel", () => cancelAgentRun(selectedRun.id))}><Square size={15} /></button>}
                    {["FAILED", "PARTIALLY_COMPLETED"].includes(selectedRun.status) && <button className={styles.iconButton} title="Yeniden dene" onClick={() => perform("retry", () => retryAgentRun(selectedRun.id))}><RotateCcw size={15} /></button>}
                  </div>
                </div>
                <div className={styles.metrics}>
                  <div><span>Token</span><strong>{metric((selectedRun.input_tokens || 0) + (selectedRun.output_tokens || 0))}</strong></div>
                  <div><span>Maliyet</span><strong>{selectedRun.estimated_cost === null ? "-" : `${metric(selectedRun.estimated_cost)} USD`}</strong></div>
                  <div><span>Araç</span><strong>{selectedRun.tool_call_count}</strong></div>
                  <div><span>Öneri</span><strong>{selectedRun.proposal_count}</strong></div>
                </div>
                <div className={styles.timeline}>
                  {(selectedRun.steps || []).map((step) => (
                    <div className={styles.timelineItem} key={step.id}>
                      <span className={styles.timelineDot} />
                      <div>
                        <strong>{step.step_code}</strong>
                        <small>
                          {step.step_type}
                          {selectedRun.toolCalls?.find((call) => call.step_id === step.id)?.tool_name
                            ? ` · ${selectedRun.toolCalls.find((call) => call.step_id === step.id).tool_name}`
                            : ""}
                          {` · ${formatDate(step.completed_at || step.started_at)}`}
                        </small>
                      </div>
                      <Status value={step.status} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      {activeTab === "approvals" && (
        <section className={styles.section}>
          <div className={styles.approvalHeader}>
            <div className={styles.sectionHeading}><h2>Bekleyen Onaylar</h2><span>{pendingProposals.length}</span></div>
            <div className={styles.actions}>
              <button className={styles.secondary} disabled={!selectedProposalIds.length} onClick={() => bulk("approve")}><Check size={15} />Toplu kabul</button>
              <button className={styles.secondary} disabled={!selectedProposalIds.length} onClick={() => bulk("reject")}><X size={15} />Toplu reddet</button>
            </div>
          </div>
          <div className={styles.rows}>
            {pendingProposals.length === 0 && <div className={styles.empty}>Bekleyen onay yok</div>}
            {pendingProposals.map((proposal) => (
              <div className={styles.proposalRow} key={proposal.id}>
                <input type="checkbox" checked={selectedProposalIds.includes(proposal.id)} onChange={() => toggleProposal(proposal.id)} />
                <div className={styles.rowMain}>
                  <strong>{proposal.title}</strong>
                  <span>{proposal.workflow_name} · {proposal.proposal_type.replaceAll("_", " ")}</span>
                </div>
                <Status value={proposal.risk_level} />
                <div className={styles.actions}>
                  <button className={styles.iconButton} title="Kabul et" onClick={() => perform(`approve-${proposal.id}`, () => approveAgentProposal(proposal.id))}><Check size={16} /></button>
                  <button className={styles.iconButton} title="Reddet" onClick={() => perform(`reject-${proposal.id}`, () => rejectAgentProposal(proposal.id, "Kullanıcı reddi"))}><X size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function MatterAgentPanel({ caseId }) {
  const [workflows, setWorkflows] = useState([]);
  const [runs, setRuns] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [workflowResponse, runResponse, proposalResponse] = await Promise.all([
        getAgentWorkflows({ status: "ACTIVE", limit: 100 }),
        getCaseAgentRuns(caseId, { limit: 20 }),
        getCaseAgentProposals(caseId, { limit: 50 }),
      ]);
      const active = (workflowResponse.data || []).filter((item) => !item.is_system_template);
      setWorkflows(active);
      setRuns(runResponse.data || []);
      setProposals(proposalResponse.data || []);
      if (!selectedWorkflowId && active[0]) setSelectedWorkflowId(active[0].id);
    } catch (error) {
      setNotice(error.message || "Agent verisi alınamadı.");
    }
  }, [caseId, selectedWorkflowId]);

  useEffect(() => { refresh(); }, [caseId]);

  async function act(action) {
    setNotice("");
    try { await action(); await refresh(); } catch (error) { setNotice(error.message); }
  }

  const pending = proposals.filter((item) => item.status === "PENDING");
  return (
    <div className={styles.matterPanel}>
      <div className={styles.matterToolbar}>
        <select value={selectedWorkflowId} onChange={(event) => setSelectedWorkflowId(event.target.value)}>
          <option value="">Workflow seç</option>
          {workflows.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <button className={styles.primary} disabled={!selectedWorkflowId} onClick={() => act(() => startAgentRun(selectedWorkflowId, { caseId, inputData: {} }, `matter-${caseId}-${Date.now()}`))}><Play size={16} />Başlat</button>
        <button className={styles.iconButton} onClick={refresh} title="Yenile"><RefreshCw size={16} /></button>
      </div>
      {notice && <div className={styles.notice}>{notice}</div>}
      <div className={styles.matterColumns}>
        <section className={styles.section}>
          <div className={styles.sectionHeading}><h2>Çalışmalar</h2><span>{runs.length}</span></div>
          <div className={styles.rows}>{runs.slice(0, 10).map((run) => <div className={styles.row} key={run.id}><div className={styles.rowMain}><strong>{run.workflow_name}</strong><span>{formatDate(run.created_at)} · {run.result_summary?.stepsCompleted || run.current_step} adım</span></div><Status value={run.status} /></div>)}</div>
        </section>
        <section className={styles.section}>
          <div className={styles.sectionHeading}><h2>Bekleyen Öneriler</h2><span>{pending.length}</span></div>
          <div className={styles.rows}>{pending.map((proposal) => <div className={styles.proposalRow} key={proposal.id}><div className={styles.rowMain}><strong>{proposal.title}</strong><span>{proposal.proposal_type.replaceAll("_", " ")}</span></div><div className={styles.actions}><button className={styles.iconButton} title="Kabul et" onClick={() => act(() => approveAgentProposal(proposal.id))}><Check size={15} /></button><button className={styles.iconButton} title="Reddet" onClick={() => act(() => rejectAgentProposal(proposal.id, "Matter incelemesi"))}><X size={15} /></button></div></div>)}</div>
        </section>
      </div>
    </div>
  );
}
