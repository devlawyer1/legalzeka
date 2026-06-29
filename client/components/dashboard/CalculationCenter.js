"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarCheck, Check, FileInput, History, ListChecks, Play, RefreshCw, Scale, Trash2 } from "lucide-react";
import {
  confirmCalculation, createDeadlineFromCalculation, createTaskFromCalculation, getCalculation, getCalculationRules,
  getCalculations, getAccessibleCases, linkCalculationToDraft, recalculateCalculation, runCalculation, voidCalculation,
} from "@/lib/api";

const TYPES = [
  { id: "deadline", label: "Hukuki süre", ruleType: "DEADLINE" },
  { id: "limitation", label: "Zamanaşımı", ruleType: "LIMITATION" },
  { id: "interest", label: "Faiz", ruleType: "INTEREST" },
  { id: "employment", label: "İşçilik", ruleType: "SEVERANCE" },
  { id: "fee", label: "Harç ve ücret", ruleType: "COURT_FEE" },
];
const EMPTY = { ruleCode: "", triggerDate: "", startDate: "", endDate: "", principal: "", grossWage: "", employmentStartDate: "", employmentEndDate: "", baseAmount: "", rateCode: "", calendarCode: "TR_GENERAL", calculationType: "SEVERANCE", limitationType: "LIMITATION" };

function initialKind(value) {
  const normalized = String(value || "deadline").toLowerCase();
  if (normalized.includes("faiz") || normalized.includes("interest")) return "interest";
  if (normalized.includes("zamana") || normalized.includes("limitation") || normalized.includes("forfeiture")) return "limitation";
  if (normalized.includes("iş") || normalized.includes("isc") || normalized.includes("severance") || normalized.includes("overtime")) return "employment";
  if (normalized.includes("harç") || normalized.includes("harc") || normalized.includes("fee") || normalized.includes("ücret")) return "fee";
  return "deadline";
}

function resultPairs(result) {
  return Object.entries(result || {}).filter(([, value]) => !Array.isArray(value) && value !== null && typeof value !== "object");
}

export default function CalculationCenter({ initialType = "deadline", caseId = null, draftId = null, embedded = false }) {
  const [kind, setKind] = useState(initialKind(initialType));
  const [form, setForm] = useState(EMPTY);
  const [rules, setRules] = useState([]);
  const [matters, setMatters] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState(caseId || "");
  const [history, setHistory] = useState([]);
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const activeType = TYPES.find((item) => item.id === kind) || TYPES[0];
  const calculationType = kind === "employment"
    ? (["SEVERANCE", "NOTICE_PAY", "OVERTIME", "ANNUAL_LEAVE"].includes(form.calculationType) ? form.calculationType : "SEVERANCE")
    : kind === "fee"
      ? (["COURT_FEE", "ATTORNEY_FEE", "ENFORCEMENT_COST"].includes(form.calculationType) ? form.calculationType : "COURT_FEE")
      : activeType.ruleType;
  const scopeCaseId = caseId || selectedCaseId || null;

  const load = useCallback(async () => {
    try {
      const requests = [getCalculationRules(calculationType), getCalculations({ caseId: scopeCaseId, limit: 30 })];
      if (!caseId) requests.push(getAccessibleCases());
      const [ruleResponse, historyResponse, matterResponse] = await Promise.all(requests);
      setRules(ruleResponse.data || []); setHistory(historyResponse.data || []);
      if (matterResponse) setMatters(matterResponse.data || []);
    } catch (err) { setError(err.message || "Hesaplama verileri alınamadı."); }
  }, [calculationType, caseId, scopeCaseId]);

  useEffect(() => { setKind(initialKind(initialType)); }, [initialType]);
  useEffect(() => {
    if (kind === "employment" && !["SEVERANCE", "NOTICE_PAY", "OVERTIME", "ANNUAL_LEAVE"].includes(form.calculationType)) setForm((current) => ({ ...current, calculationType: "SEVERANCE" }));
    if (kind === "fee" && !["COURT_FEE", "ATTORNEY_FEE", "ENFORCEMENT_COST"].includes(form.calculationType)) setForm((current) => ({ ...current, calculationType: "COURT_FEE" }));
  }, [kind, form.calculationType]);
  useEffect(() => { load(); }, [load]);

  const payload = useMemo(() => {
    const scope = { ...(scopeCaseId ? { caseId: scopeCaseId } : {}), ...(draftId ? { draftId } : {}), ...(form.ruleCode ? { ruleCode: form.ruleCode } : {}) };
    if (kind === "deadline") return { ...scope, triggerDate: form.triggerDate || undefined, calendarCode: form.calendarCode || undefined, timezone: "Europe/Istanbul" };
    if (kind === "limitation") return { ...scope, triggerDate: form.triggerDate || undefined, limitationType: form.limitationType, calendarCode: form.calendarCode || undefined, timezone: "Europe/Istanbul" };
    if (kind === "interest") return { ...scope, principal: form.principal, currency: "TRY", startDate: form.startDate, endDate: form.endDate, rateCode: form.rateCode || undefined, dayCountConvention: "ACTUAL_365", roundingMode: "ROUND_HALF_UP" };
    if (kind === "employment") return { ...scope, calculationType: form.calculationType, grossWage: form.grossWage, employmentStartDate: form.employmentStartDate, employmentEndDate: form.employmentEndDate };
    return { ...scope, calculationType: form.calculationType, baseAmount: form.baseAmount };
  }, [scopeCaseId, draftId, form, kind]);

  const execute = async () => {
    setBusy("run"); setError("");
    try { const response = await runCalculation(kind, payload, crypto.randomUUID()); setRun(response.data); await load(); }
    catch (err) { setError(err.message || "Hesaplama tamamlanamadı."); } finally { setBusy(""); }
  };
  const action = async (name, fn) => {
    if (!run) return; setBusy(name); setError("");
    try { const response = await fn(run.id); if (response?.data?.id === run.id) setRun(response.data); else if (name === "recalculate") setRun(response.data); await load(); }
    catch (err) { setError(err.message || "İşlem tamamlanamadı."); } finally { setBusy(""); }
  };
  const pick = async (item) => {
    setBusy("detail");
    try { const response = await getCalculation(item.id); setRun(response.data); }
    catch (err) { setError(err.message); } finally { setBusy(""); }
  };

  return (
    <div className={`calculation-center ${embedded ? "embedded" : ""}`}>
      <header><div><Scale size={20} /><div><h2>Hesaplama Merkezi</h2><span>{caseId ? "Matter hesabı" : "Kişisel hesap"}</span></div></div><button title="Yenile" onClick={load}><RefreshCw size={16} /></button></header>
      <nav>{TYPES.map((item) => <button key={item.id} className={kind === item.id ? "active" : ""} onClick={() => { setKind(item.id); setRun(null); }}>{item.label}</button>)}</nav>
      <div className="workspace">
        <section className="form-area">
          <div className="field-grid">
            {!caseId && <label>Matter<select value={selectedCaseId} onChange={(e) => setSelectedCaseId(e.target.value)}><option value="">Kişisel, Matter bağlantısız</option>{matters.map((matter) => <option value={matter.id} key={matter.id}>{matter.esas_no || matter.konu || matter.id}</option>)}</select></label>}
            <label>Kural<select value={form.ruleCode} onChange={(e) => setForm({ ...form, ruleCode: e.target.value })}><option value="">Etkin kurala göre seç</option>{rules.map((rule) => <option value={rule.rule_code} key={rule.id}>{rule.name} · v{rule.version_number}</option>)}</select></label>
            {(kind === "deadline" || kind === "limitation") && <><label>Başlangıç tarihi<input type="date" value={form.triggerDate} onChange={(e) => setForm({ ...form, triggerDate: e.target.value })} /></label><label>Takvim<input value={form.calendarCode} onChange={(e) => setForm({ ...form, calendarCode: e.target.value })} /></label></>}
            {kind === "limitation" && <label>Süre türü<select value={form.limitationType} onChange={(e) => setForm({ ...form, limitationType: e.target.value })}><option value="LIMITATION">Zamanaşımı</option><option value="FORFEITURE">Hak düşürücü süre</option></select></label>}
            {kind === "interest" && <><label>Anapara<input inputMode="decimal" value={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.value })} /></label><label>Başlangıç<input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label><label>Bitiş<input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label><label>Oran kodu<input value={form.rateCode} onChange={(e) => setForm({ ...form, rateCode: e.target.value })} /></label></>}
            {kind === "employment" && <><label>Hesap<select value={form.calculationType} onChange={(e) => setForm({ ...form, calculationType: e.target.value })}><option value="SEVERANCE">Kıdem tazminatı</option><option value="NOTICE_PAY">İhbar tazminatı</option><option value="OVERTIME">Fazla mesai</option><option value="ANNUAL_LEAVE">Yıllık izin</option></select></label><label>Brüt ücret<input inputMode="decimal" value={form.grossWage} onChange={(e) => setForm({ ...form, grossWage: e.target.value })} /></label><label>İşe giriş<input type="date" value={form.employmentStartDate} onChange={(e) => setForm({ ...form, employmentStartDate: e.target.value })} /></label><label>Çıkış<input type="date" value={form.employmentEndDate} onChange={(e) => setForm({ ...form, employmentEndDate: e.target.value })} /></label></>}
            {kind === "fee" && <><label>Hesap<select value={form.calculationType} onChange={(e) => setForm({ ...form, calculationType: e.target.value })}><option value="COURT_FEE">Mahkeme harcı</option><option value="ATTORNEY_FEE">Vekalet ücreti</option><option value="ENFORCEMENT_COST">İcra masrafı</option></select></label><label>Matrah<input inputMode="decimal" value={form.baseAmount} onChange={(e) => setForm({ ...form, baseAmount: e.target.value })} /></label></>}
          </div>
          <button className="primary" disabled={Boolean(busy)} onClick={execute}><Play size={15} /> Hesapla</button>
          {error && <div className="error"><AlertTriangle size={15} />{error}</div>}
          {run && <section className={`result ${run.status !== "CALCULATED" && run.status !== "CONFIRMED" ? "uncertain" : ""}`}>
            <div className="result-head"><div><strong>{run.status}</strong><span>{run.rule_snapshot?.rule?.legalReference || "Aktif doğrulanmış kaynak bulunamadı"}</span></div><small>{run.rule_snapshot?.rule ? `v${run.rule_snapshot.rule.versionNumber} · ${String(run.rule_snapshot.rule.effectiveFrom).slice(0, 10)}` : "Kural sürümü yok"}</small></div>
            <dl>{resultPairs(run.result_data).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl>
            <div className="steps"><h3><ListChecks size={15} /> Hesap adımları</h3>{(run.steps || []).map((step) => <div key={step.id}><span>{step.step_number}</span><div><strong>{step.title}</strong><p>{step.explanation}</p></div></div>)}</div>
            {(run.warnings || []).map((item) => <div className="warning" key={item.id || item.warning_code}><AlertTriangle size={14} /><span><strong>{item.warning_code}</strong>{item.message}</span></div>)}
            <div className="actions"><button disabled={run.status !== "CALCULATED" || Boolean(busy)} onClick={() => action("confirm", confirmCalculation)}><Check size={14} /> Onayla</button><button disabled={run.status !== "CONFIRMED" || Boolean(busy)} onClick={() => action("deadline", createDeadlineFromCalculation)}><CalendarCheck size={14} /> Deadline</button><button disabled={run.status !== "CONFIRMED" || Boolean(busy)} onClick={() => action("task", createTaskFromCalculation)}><ListChecks size={14} /> Görev</button><button disabled={Boolean(busy)} onClick={() => action("recalculate", (id) => recalculateCalculation(id, crypto.randomUUID()))}><RefreshCw size={14} /> Yeniden hesapla</button>{draftId && <button disabled={Boolean(busy)} onClick={() => action("draft", (id) => linkCalculationToDraft(id, draftId))}><FileInput size={14} /> Draft'a bağla</button>}</div>
          </section>}
        </section>
        <aside><h3><History size={15} /> Geçmiş</h3>{history.length === 0 ? <p className="empty">Hesap kaydı yok.</p> : history.map((item) => <button className="history-row" key={item.id} onClick={() => pick(item)}><span>{item.calculation_type}</span><strong>{item.status}</strong><small>{new Date(item.created_at).toLocaleDateString("tr-TR")}</small></button>)}</aside>
      </div>
      <style jsx>{`
        .calculation-center{width:100%;max-width:1180px;margin:0 auto;background:var(--color-bg-elevated);border:1px solid var(--color-border);border-radius:8px;overflow:hidden;color:var(--color-text-primary)}.embedded{border:0;border-radius:0}.calculation-center>header{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--color-border-subtle)}header>div{display:flex;align-items:center;gap:9px}h2,h3,p{margin:0}h2{font-size:17px}header span{font-size:11px;color:var(--color-text-tertiary)}button{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--color-border);background:var(--color-bg-elevated);color:var(--color-text-primary);border-radius:6px;min-height:34px;padding:0 10px;cursor:pointer;font-weight:700}button:disabled{opacity:.45;cursor:not-allowed}nav{display:flex;overflow:auto;border-bottom:1px solid var(--color-border-subtle)}nav button{border:0;border-radius:0;border-bottom:2px solid transparent;white-space:nowrap}nav button.active{color:var(--color-accent);border-bottom-color:var(--color-accent)}.workspace{display:grid;grid-template-columns:minmax(0,1fr) 260px}.form-area{padding:16px}.field-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:12px}label{display:flex;flex-direction:column;gap:5px;font-size:11px;font-weight:800;color:var(--color-text-secondary)}input,select{width:100%;height:38px;padding:0 9px;border:1px solid var(--color-border);border-radius:6px;background:var(--color-bg);color:var(--color-text-primary)}.primary{background:var(--color-accent);border-color:var(--color-accent);color:var(--color-text-inverse)}.error,.warning{display:flex;align-items:flex-start;gap:7px;margin-top:10px;padding:9px;background:#FEF2F2;color:#991B1B;border-left:3px solid #DC2626;font-size:12px}.result{margin-top:16px;border-top:1px solid var(--color-border);padding-top:14px}.result.uncertain{border-top-color:#D97706}.result-head{display:flex;justify-content:space-between;gap:12px}.result-head>div{display:flex;flex-direction:column}.result-head strong{font-size:14px}.result-head span,.result-head small{font-size:11px;color:var(--color-text-tertiary)}dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:var(--color-border-subtle);margin:12px 0}dl div{background:var(--color-bg-elevated);padding:9px;min-width:0}dt{font-size:10px;color:var(--color-text-tertiary);overflow-wrap:anywhere}dd{margin:3px 0 0;font-size:13px;font-weight:800;overflow-wrap:anywhere}.steps{border-top:1px solid var(--color-border-subtle)}.steps h3,aside h3{display:flex;align-items:center;gap:6px;font-size:12px;padding:10px 0}.steps>div{display:grid;grid-template-columns:26px 1fr;gap:8px;padding:9px 0;border-top:1px solid var(--color-border-subtle)}.steps>div>span{display:grid;place-items:center;width:24px;height:24px;background:var(--color-bg-subtle);font-size:11px}.steps strong{font-size:12px}.steps p{font-size:11px;color:var(--color-text-secondary);margin-top:3px}.actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}aside{border-left:1px solid var(--color-border-subtle);padding:12px;min-width:0}.history-row{width:100%;display:grid;grid-template-columns:1fr auto;text-align:left;padding:9px 5px;border-width:1px 0 0;border-radius:0}.history-row span{font-size:11px}.history-row strong{font-size:10px}.history-row small{grid-column:1/-1;color:var(--color-text-tertiary)}.empty{font-size:12px;color:var(--color-text-tertiary)}@media(max-width:760px){.workspace{grid-template-columns:1fr}aside{border-left:0;border-top:1px solid var(--color-border-subtle)}.field-grid,dl{grid-template-columns:1fr}.result-head{flex-direction:column}}
      `}</style>
    </div>
  );
}
