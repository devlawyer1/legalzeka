"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getAccessibleCases,
  getPracticeDashboard,
  getPracticeLeads,
  createPracticeLead,
  getPracticeClients,
  createConflictCheck,
  reviewConflictCheck,
  convertPracticeLead,
  getPracticeInvoices,
  createPracticeInvoice,
  recordPracticePayment,
  getMatterTasks,
  createMatterTask,
  getMatterHearings,
  createMatterHearing,
  getMatterDeadlines,
  getMatterUpdates,
  createMatterUpdate,
  inviteClientPortal,
  sharePortalItem,
} from "@/lib/api";

const tabs = [
  { id: "overview", label: "Özet" },
  { id: "crm", label: "CRM" },
  { id: "matters", label: "Matter" },
  { id: "finance", label: "Finans" },
  { id: "portal", label: "Portal" },
];

const emptyLead = { fullName: "", email: "", phone: "", legalDomain: "", summary: "" };
const emptyTask = { title: "", dueAt: "", priority: "NORMAL" };
const emptyInvoice = { clientName: "", amount: "", description: "Hukuki hizmet bedeli", taxRate: "20" };

export default function PracticeManagementCenter({ activeFirmId }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [leads, setLeads] = useState([]);
  const [clients, setClients] = useState([]);
  const [cases, setCases] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [leadForm, setLeadForm] = useState(emptyLead);
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [lastConflict, setLastConflict] = useState(null);
  const [matterData, setMatterData] = useState({ tasks: [], hearings: [], deadlines: [], updates: [] });
  const [taskForm, setTaskForm] = useState(emptyTask);
  const [hearingAt, setHearingAt] = useState("");
  const [updateForm, setUpdateForm] = useState({ title: "", content: "", visibility: "INTERNAL" });
  const [invoiceForm, setInvoiceForm] = useState(emptyInvoice);
  const [paymentForm, setPaymentForm] = useState({ invoiceId: "", amount: "" });

  const selectedLead = useMemo(() => leads.find((lead) => lead.id === selectedLeadId), [leads, selectedLeadId]);
  const selectedCase = useMemo(() => cases.find((item) => item.id === selectedCaseId), [cases, selectedCaseId]);

  async function refresh() {
    if (!activeFirmId) return;
    setLoading(true);
    try {
      const [summary, leadList, clientList, caseList, invoiceList] = await Promise.all([
        getPracticeDashboard(activeFirmId),
        getPracticeLeads({ organizationId: activeFirmId }),
        getPracticeClients({ organizationId: activeFirmId }),
        getAccessibleCases(),
        getPracticeInvoices(activeFirmId),
      ]);
      setDashboard(summary.data);
      setLeads(leadList.data || []);
      setClients(clientList.data || []);
      setCases((caseList.data || []).filter((item) => item.scopeType === "ORGANIZATION" || item.scope_type === "ORGANIZATION"));
      setInvoices(invoiceList.data || []);
      if (!selectedLeadId && leadList.data?.[0]) setSelectedLeadId(leadList.data[0].id);
      if (!selectedCaseId && caseList.data?.[0]) setSelectedCaseId(caseList.data[0].id);
      if (!selectedClientId && clientList.data?.[0]) setSelectedClientId(clientList.data[0].id);
    } catch (error) {
      setMessage(error.message || "Veri alınamadı.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshMatter(caseId = selectedCaseId) {
    if (!caseId) return;
    try {
      const [tasks, hearings, deadlines, updates] = await Promise.all([
        getMatterTasks(caseId),
        getMatterHearings(caseId),
        getMatterDeadlines(caseId),
        getMatterUpdates(caseId),
      ]);
      setMatterData({
        tasks: tasks.data || [],
        hearings: hearings.data || [],
        deadlines: deadlines.data || [],
        updates: updates.data || [],
      });
    } catch (error) {
      setMessage(error.message || "Matter verisi alınamadı.");
    }
  }

  useEffect(() => { refresh(); }, [activeFirmId]);
  useEffect(() => { refreshMatter(); }, [selectedCaseId]);

  async function submitLead(event) {
    event.preventDefault();
    await createPracticeLead({ organizationId: activeFirmId, ...leadForm });
    setLeadForm(emptyLead);
    setMessage("Lead oluşturuldu.");
    await refresh();
  }

  async function runConflict() {
    if (!selectedLead) return;
    const result = await createConflictCheck({
      organizationId: activeFirmId,
      leadId: selectedLead.id,
      queryTerms: [selectedLead.full_name || selectedLead.name, selectedLead.email, selectedLead.phone].filter(Boolean),
    });
    setLastConflict(result.data);
    setMessage("Conflict check oluşturuldu.");
  }

  async function markConflictClear() {
    if (!lastConflict) return;
    const result = await reviewConflictCheck(lastConflict.id, { status: "CLEAR", reviewNote: "İnsan incelemesiyle temiz." });
    setLastConflict(result.data);
    setMessage("Conflict review tamamlandı.");
  }

  async function convertLead() {
    if (!selectedLead || !lastConflict) return;
    await convertPracticeLead(selectedLead.id, { conflictCheckId: lastConflict.id });
    setMessage("Lead client ve matter kaydına dönüştürüldü.");
    await refresh();
  }

  async function submitTask(event) {
    event.preventDefault();
    await createMatterTask(selectedCaseId, taskForm);
    setTaskForm(emptyTask);
    await refreshMatter();
  }

  async function submitHearing(event) {
    event.preventDefault();
    await createMatterHearing(selectedCaseId, { scheduledAt: hearingAt, court: selectedCase?.mahkeme || selectedCase?.court });
    setHearingAt("");
    await refreshMatter();
  }

  async function submitUpdate(event) {
    event.preventDefault();
    await createMatterUpdate(selectedCaseId, updateForm);
    setUpdateForm({ title: "", content: "", visibility: "INTERNAL" });
    await refreshMatter();
  }

  async function submitInvoice(event) {
    event.preventDefault();
    await createPracticeInvoice({
      organizationId: activeFirmId,
      clientId: selectedClientId || undefined,
      caseId: selectedCaseId || undefined,
      clientName: invoiceForm.clientName,
      items: [{
        sourceType: "CUSTOM",
        description: invoiceForm.description,
        unitPrice: invoiceForm.amount,
        quantity: 1,
        taxRate: invoiceForm.taxRate,
      }],
    });
    setInvoiceForm(emptyInvoice);
    await refresh();
  }

  async function submitPayment(event) {
    event.preventDefault();
    await recordPracticePayment(paymentForm.invoiceId, { amount: paymentForm.amount, paymentMethod: "manual" });
    setPaymentForm({ invoiceId: "", amount: "" });
    await refresh();
  }

  async function invitePortal() {
    if (!selectedClientId || !selectedCaseId) return;
    const result = await inviteClientPortal({ clientId: selectedClientId, caseId: selectedCaseId });
    setMessage(`Portal daveti oluşturuldu: ${result.data.invitationToken}`);
  }

  async function shareUpdateToPortal() {
    if (!selectedClientId || !selectedCaseId || matterData.updates.length === 0) return;
    const update = matterData.updates[0];
    await sharePortalItem({ caseId: selectedCaseId, clientId: selectedClientId, itemType: "UPDATE", itemId: update.id, title: update.title });
    setMessage("Portal paylaşımı oluşturuldu.");
  }

  if (!activeFirmId) {
    return <div style={styles.empty}>Büro seçimi gerekli.</div>;
  }

  return (
    <div style={styles.shell}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Büro Operasyon</h2>
          <div style={styles.subtle}>{loading ? "Yükleniyor" : "Matter Twin çalışma sistemi"}</div>
        </div>
        <button style={styles.iconButton} onClick={refresh} title="Yenile">↻</button>
      </div>

      <div style={styles.tabs}>
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={activeTab === tab.id ? styles.tabActive : styles.tab}>
            {tab.label}
          </button>
        ))}
      </div>

      {message && <div style={styles.notice}>{message}</div>}

      {activeTab === "overview" && (
        <div style={styles.grid}>
          {[
            ["Aktif matter", dashboard?.active_matters || 0],
            ["Yaklaşan deadline", dashboard?.upcoming_deadlines || 0],
            ["Yaklaşan duruşma", dashboard?.upcoming_hearings || 0],
            ["Açık görev", dashboard?.open_tasks || 0],
            ["Açık fatura", dashboard?.open_invoices || 0],
            ["Yeni lead", dashboard?.new_leads || 0],
            ["Conflict review", dashboard?.conflict_reviews || 0],
            ["Bakiye", `${Number(dashboard?.balance_total || 0).toLocaleString("tr-TR")} TRY`],
          ].map(([label, value]) => (
            <div key={label} style={styles.metric}>
              <span style={styles.metricLabel}>{label}</span>
              <strong style={styles.metricValue}>{value}</strong>
            </div>
          ))}
        </div>
      )}

      {activeTab === "crm" && (
        <div style={styles.columns}>
          <form style={styles.panel} onSubmit={submitLead}>
            <h3 style={styles.panelTitle}>Lead</h3>
            <input style={styles.input} placeholder="Ad soyad" value={leadForm.fullName} onChange={(e) => setLeadForm({ ...leadForm, fullName: e.target.value })} required />
            <input style={styles.input} placeholder="E-posta" value={leadForm.email} onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })} />
            <input style={styles.input} placeholder="Telefon" value={leadForm.phone} onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })} />
            <input style={styles.input} placeholder="Hukuk alanı" value={leadForm.legalDomain} onChange={(e) => setLeadForm({ ...leadForm, legalDomain: e.target.value })} />
            <textarea style={styles.textarea} placeholder="Özet" value={leadForm.summary} onChange={(e) => setLeadForm({ ...leadForm, summary: e.target.value })} />
            <button style={styles.primary}>Oluştur</button>
          </form>
          <div style={styles.panel}>
            <h3 style={styles.panelTitle}>Pipeline</h3>
            <select style={styles.input} value={selectedLeadId} onChange={(e) => { setSelectedLeadId(e.target.value); setLastConflict(null); }}>
              {leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.full_name || lead.name} · {lead.status}</option>)}
            </select>
            <div style={styles.row}>
              <button style={styles.secondary} onClick={runConflict} disabled={!selectedLead}>Conflict</button>
              <button style={styles.secondary} onClick={markConflictClear} disabled={!lastConflict}>CLEAR</button>
              <button style={styles.primary} onClick={convertLead} disabled={!lastConflict || !["CLEAR", "OVERRIDDEN"].includes(lastConflict.status)}>Convert</button>
            </div>
            <List rows={leads.slice(0, 8)} render={(lead) => `${lead.full_name || lead.name} · ${lead.status}`} />
          </div>
          <div style={styles.panel}>
            <h3 style={styles.panelTitle}>Client</h3>
            <select style={styles.input} value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)}>
              <option value="">Seç</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.company_name || client.full_name}</option>)}
            </select>
            <List rows={clients.slice(0, 8)} render={(client) => `${client.company_name || client.full_name} · ${client.client_type}`} />
          </div>
        </div>
      )}

      {activeTab === "matters" && (
        <div style={styles.columns}>
          <div style={styles.panel}>
            <h3 style={styles.panelTitle}>Matter</h3>
            <select style={styles.input} value={selectedCaseId} onChange={(e) => setSelectedCaseId(e.target.value)}>
              <option value="">Seç</option>
              {cases.map((item) => <option key={item.id} value={item.id}>{item.konu || item.esas_no || item.id}</option>)}
            </select>
            <List rows={matterData.deadlines} render={(item) => `${item.title} · ${new Date(item.due_at).toLocaleDateString("tr-TR")} · ${item.status}`} />
          </div>
          <form style={styles.panel} onSubmit={submitTask}>
            <h3 style={styles.panelTitle}>Görev</h3>
            <input style={styles.input} placeholder="Başlık" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} required />
            <input style={styles.input} type="datetime-local" value={taskForm.dueAt} onChange={(e) => setTaskForm({ ...taskForm, dueAt: e.target.value })} />
            <select style={styles.input} value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}>
              <option>NORMAL</option><option>HIGH</option><option>URGENT</option><option>LOW</option>
            </select>
            <button style={styles.primary} disabled={!selectedCaseId}>Ekle</button>
            <List rows={matterData.tasks} render={(item) => `${item.title} · ${item.status}`} />
          </form>
          <div style={styles.panel}>
            <form onSubmit={submitHearing}>
              <h3 style={styles.panelTitle}>Duruşma</h3>
              <input style={styles.input} type="datetime-local" value={hearingAt} onChange={(e) => setHearingAt(e.target.value)} required />
              <button style={styles.primary} disabled={!selectedCaseId}>Ekle</button>
            </form>
            <form onSubmit={submitUpdate} style={{ marginTop: 16 }}>
              <h3 style={styles.panelTitle}>Gelişme</h3>
              <input style={styles.input} placeholder="Başlık" value={updateForm.title} onChange={(e) => setUpdateForm({ ...updateForm, title: e.target.value })} required />
              <textarea style={styles.textarea} placeholder="İçerik" value={updateForm.content} onChange={(e) => setUpdateForm({ ...updateForm, content: e.target.value })} required />
              <select style={styles.input} value={updateForm.visibility} onChange={(e) => setUpdateForm({ ...updateForm, visibility: e.target.value })}>
                <option>INTERNAL</option><option>CLIENT_VISIBLE</option>
              </select>
              <button style={styles.primary} disabled={!selectedCaseId}>Kaydet</button>
            </form>
          </div>
        </div>
      )}

      {activeTab === "finance" && (
        <div style={styles.columns}>
          <form style={styles.panel} onSubmit={submitInvoice}>
            <h3 style={styles.panelTitle}>Fatura</h3>
            <input style={styles.input} placeholder="Müvekkil adı" value={invoiceForm.clientName} onChange={(e) => setInvoiceForm({ ...invoiceForm, clientName: e.target.value })} />
            <input style={styles.input} placeholder="Tutar" value={invoiceForm.amount} onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.target.value })} required />
            <input style={styles.input} placeholder="KDV %" value={invoiceForm.taxRate} onChange={(e) => setInvoiceForm({ ...invoiceForm, taxRate: e.target.value })} />
            <input style={styles.input} placeholder="Açıklama" value={invoiceForm.description} onChange={(e) => setInvoiceForm({ ...invoiceForm, description: e.target.value })} />
            <button style={styles.primary}>Oluştur</button>
          </form>
          <form style={styles.panel} onSubmit={submitPayment}>
            <h3 style={styles.panelTitle}>Tahsilat</h3>
            <select style={styles.input} value={paymentForm.invoiceId} onChange={(e) => setPaymentForm({ ...paymentForm, invoiceId: e.target.value })} required>
              <option value="">Fatura</option>
              {invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoice_number || invoice.id} · {invoice.balance} {invoice.currency}</option>)}
            </select>
            <input style={styles.input} placeholder="Tutar" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} required />
            <button style={styles.primary}>Kaydet</button>
          </form>
          <div style={styles.panel}>
            <h3 style={styles.panelTitle}>Faturalar</h3>
            <List rows={invoices.slice(0, 10)} render={(invoice) => `${invoice.invoice_number || "-"} · ${invoice.status} · ${invoice.balance} ${invoice.currency}`} />
          </div>
        </div>
      )}

      {activeTab === "portal" && (
        <div style={styles.columns}>
          <div style={styles.panel}>
            <h3 style={styles.panelTitle}>Erişim</h3>
            <select style={styles.input} value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)}>
              <option value="">Client</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.company_name || client.full_name}</option>)}
            </select>
            <select style={styles.input} value={selectedCaseId} onChange={(e) => setSelectedCaseId(e.target.value)}>
              <option value="">Matter</option>
              {cases.map((item) => <option key={item.id} value={item.id}>{item.konu || item.esas_no}</option>)}
            </select>
            <div style={styles.row}>
              <button style={styles.primary} onClick={invitePortal} disabled={!selectedClientId || !selectedCaseId}>Davet</button>
              <button style={styles.secondary} onClick={shareUpdateToPortal} disabled={!selectedClientId || matterData.updates.length === 0}>Paylaş</button>
            </div>
          </div>
          <div style={styles.panel}>
            <h3 style={styles.panelTitle}>Paylaşılan Gelişmeler</h3>
            <List rows={matterData.updates.filter((item) => item.visibility === "CLIENT_VISIBLE")} render={(item) => `${item.title} · ${new Date(item.created_at).toLocaleDateString("tr-TR")}`} />
          </div>
        </div>
      )}
    </div>
  );
}

function List({ rows, render }) {
  if (!rows?.length) return <div style={styles.emptyList}>Kayıt yok</div>;
  return (
    <div style={styles.list}>
      {rows.map((row) => <div key={row.id} style={styles.listItem}>{render(row)}</div>)}
    </div>
  );
}

const styles = {
  shell: { height: "100%", overflow: "auto", padding: 24, color: "var(--color-text-primary)" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  title: { margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: 0 },
  subtle: { fontSize: 13, color: "var(--color-text-secondary)", marginTop: 4 },
  tabs: { display: "flex", gap: 6, marginBottom: 16, borderBottom: "1px solid var(--color-border-subtle)", paddingBottom: 8 },
  tab: { border: "1px solid var(--color-border)", background: "var(--color-bg-elevated)", color: "var(--color-text-secondary)", borderRadius: 8, padding: "8px 12px", cursor: "pointer" },
  tabActive: { border: "1px solid var(--color-accent)", background: "var(--color-accent)", color: "var(--color-text-inverse)", borderRadius: 8, padding: "8px 12px", cursor: "pointer" },
  iconButton: { width: 34, height: 34, borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-bg-elevated)", cursor: "pointer" },
  notice: { padding: 10, borderRadius: 8, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", marginBottom: 16, fontSize: 13 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 },
  metric: { border: "1px solid var(--color-border)", borderRadius: 8, padding: 14, background: "var(--color-bg-elevated)" },
  metricLabel: { display: "block", fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 8 },
  metricValue: { fontSize: 22 },
  columns: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, alignItems: "start" },
  panel: { border: "1px solid var(--color-border)", borderRadius: 8, padding: 14, background: "var(--color-bg-elevated)" },
  panelTitle: { margin: "0 0 12px", fontSize: 15, fontWeight: 700 },
  input: { width: "100%", boxSizing: "border-box", border: "1px solid var(--color-border)", borderRadius: 8, background: "var(--color-bg)", color: "var(--color-text-primary)", padding: "9px 10px", marginBottom: 8 },
  textarea: { width: "100%", boxSizing: "border-box", minHeight: 84, border: "1px solid var(--color-border)", borderRadius: 8, background: "var(--color-bg)", color: "var(--color-text-primary)", padding: 10, marginBottom: 8, resize: "vertical" },
  row: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 },
  primary: { border: "none", borderRadius: 8, background: "var(--color-accent)", color: "var(--color-text-inverse)", padding: "9px 12px", fontWeight: 700, cursor: "pointer" },
  secondary: { border: "1px solid var(--color-border)", borderRadius: 8, background: "var(--color-bg-subtle)", color: "var(--color-text-primary)", padding: "9px 12px", fontWeight: 600, cursor: "pointer" },
  list: { display: "flex", flexDirection: "column", gap: 6, marginTop: 10 },
  listItem: { padding: "9px 10px", borderRadius: 8, background: "var(--color-bg-subtle)", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  empty: { padding: 40, color: "var(--color-text-secondary)" },
  emptyList: { padding: 12, color: "var(--color-text-tertiary)", fontSize: 13 },
};
