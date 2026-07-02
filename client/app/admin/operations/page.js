"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, ArchiveRestore, Bot, Database, Download, KeyRound, LockKeyhole, RefreshCw, Server, ShieldCheck, Users } from "lucide-react";
import { activateAdminRule, downloadAuditExport, getAdminRuleVersions, getCalculationRules, getOperationsOverview } from "@/lib/api";
import styles from "./page.module.css";

const labels = { database: "PostgreSQL", redis: "Redis", storage: "Object storage", email: "E-posta", antivirus: "Antivirus" };

function State({ value }) {
  const normalized = String(value || "UNKNOWN").toUpperCase();
  const tone = ["UP", "ACTIVE", "CONFIGURED", "VERIFIED", "PASSED"].includes(normalized) ? styles.good : normalized === "UNKNOWN" ? styles.neutral : styles.warn;
  return <span className={`${styles.state} ${tone}`}>{normalized}</span>;
}

export default function OperationsPage() {
  const [data, setData] = useState(null);
  const [rules, setRules] = useState([]);
  const [status, setStatus] = useState("loading");
  const [actionId, setActionId] = useState(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const [operations, ruleResult] = await Promise.all([getOperationsOverview(), getCalculationRules(null, true)]);
      const ruleSets = ruleResult.data || [];
      const versionGroups = await Promise.all(ruleSets.map(async (ruleSet) => {
        const result = await getAdminRuleVersions(ruleSet.rule_code);
        return (result.data || []).map((version) => ({ ...version, ruleName: ruleSet.name }));
      }));
      setData(operations.data);
      setRules(versionGroups.flat());
      setStatus("ready");
    } catch (error) { setStatus(error.status === 403 ? "denied" : "error"); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function activate(rule) {
    if (!window.confirm(`${rule.ruleName} surumunu aktive etmek istiyor musunuz?`)) return;
    setActionId(rule.id);
    try { await activateAdminRule(rule.rule_code, rule.id); await load(); }
    catch (_) { setStatus("error"); }
    finally { setActionId(null); }
  }

  if (status === "loading") return <main className={styles.page} aria-busy="true"><p>Operasyon durumu yukleniyor...</p></main>;
  if (status === "denied") return <main className={styles.page}><h1>Erisim reddedildi</h1><p>Bu ekran sistem veya kurum yoneticisi yetkisi gerektirir.</p></main>;
  if (status === "error") return <main className={styles.page}><h1>Sistem Yonetimi</h1><p>Operasyon verisi su anda kullanilamiyor.</p><button className={styles.iconButton} onClick={load} title="Tekrar dene"><RefreshCw aria-hidden="true" /></button></main>;

  const queues = [["Belge", data.queues.document_depth], ["Ajan", data.queues.agent_depth], ["Bildirim", data.queues.notification_depth], ["Dead-letter", data.queues.dead_letters]];
  return <main className={styles.page}>
    <header className={styles.header}><div><h1>Sistem Yonetimi</h1><p>Release {data.release}</p></div><button className={styles.iconButton} onClick={load} title="Yenile"><RefreshCw aria-hidden="true" /></button></header>
    {data.warnings.length > 0 && <section className={styles.warningBand} aria-label="Yapilandirma uyarilari"><ShieldCheck aria-hidden="true" /><div>{data.warnings.map((item) => <p key={item.code}>{item.code}</p>)}</div></section>}

    <section className={styles.section}><h2><Server aria-hidden="true" /> Servisler</h2><div className={styles.statusGrid}>{Object.entries(data.services).map(([name, item]) => <div className={styles.statusRow} key={name}><span>{labels[name] || name}</span><State value={item.status} /></div>)}</div></section>
    <section className={styles.section}><h2><Activity aria-hidden="true" /> Kuyruklar</h2><div className={styles.metricGrid}>{queues.map(([name, value]) => <div className={styles.metric} key={name}><span>{name}</span><strong>{value}</strong></div>)}</div></section>

    <div className={styles.twoColumn}>
      <section className={styles.section}><h2><Database aria-hidden="true" /> Release ve veri</h2><dl className={styles.details}><dt>Migration</dt><dd>{data.migration?.version || "Yok"}</dd><dt>Dogrulama</dt><dd><State value={data.migration?.verified_at ? "VERIFIED" : "PENDING"} /></dd><dt>Backup</dt><dd><State value={data.backup?.status || "UNKNOWN"} /></dd><dt>Aktif hukuk kurali</dt><dd>{data.activeLegalRules}</dd></dl></section>
      <section className={styles.section}><h2><Bot aria-hidden="true" /> AI ve bildirim</h2><dl className={styles.details}><dt>Token</dt><dd>{Number(data.aiUsage.tokens || 0).toLocaleString("tr-TR")}</dd><dt>Tahmini maliyet</dt><dd>{Number(data.aiUsage.cost || 0).toFixed(4)}</dd><dt>Teslimat</dt><dd>{data.notifications.map((item) => `${item.status}: ${item.count}`).join(" / ") || "Yok"}</dd></dl></section>
    </div>

    <section className={styles.section}><h2><Users aria-hidden="true" /> Kurum seat kullanimi</h2>{data.seats.length ? <div className={styles.tableWrap}><table><thead><tr><th>Kurum</th><th>Limit</th><th>Kullanilan</th><th>Bekleyen</th></tr></thead><tbody>{data.seats.map((seat) => <tr key={seat.id}><td>{seat.name}</td><td>{seat.seat_limit ?? "Sinirsiz"}</td><td>{seat.used}</td><td>{seat.pending}</td></tr>)}</tbody></table></div> : <p className={styles.empty}>Kurum kaydi bulunmuyor.</p>}</section>

    <section className={styles.section}><h2><KeyRound aria-hidden="true" /> Provider ve SSO</h2><div className={styles.tableWrap}><table><thead><tr><th>Tur</th><th>Ad</th><th>Durum</th><th>Son dogrulama</th><th>Hata kodu</th></tr></thead><tbody>{[...(data.providers || []), ...(data.sso || []).map((item) => ({ provider_type: `SSO/${item.provider_type}`, provider_name: item.name, status: item.status, last_verified_at: item.updated_at }))].map((provider, index) => <tr key={provider.id || `${provider.provider_type}-${index}`}><td>{provider.provider_type}</td><td>{provider.provider_name}</td><td><State value={provider.status} /></td><td>{provider.last_verified_at ? new Date(provider.last_verified_at).toLocaleString("tr-TR") : "-"}</td><td>{provider.last_error_code || "-"}</td></tr>)}</tbody></table></div></section>

    <div className={styles.twoColumn}>
      <section className={styles.section}><h2><LockKeyhole aria-hidden="true" /> MFA politikalari</h2>{data.securityPolicies?.length ? data.securityPolicies.map((policy) => <dl className={styles.details} key={policy.id}><dt>Kullanici MFA</dt><dd><State value={policy.require_mfa ? "ACTIVE" : "DISABLED"} /></dd><dt>Portal MFA</dt><dd><State value={policy.require_portal_mfa ? "ACTIVE" : "DISABLED"} /></dd><dt>Oturum</dt><dd>{policy.session_ttl_minutes} dk</dd></dl>) : <p className={styles.empty}>Politika tanimli degil.</p>}</section>
      <section className={styles.section}><div className={styles.sectionHeader}><h2><ArchiveRestore aria-hidden="true" /> KVKK ve audit</h2><div className={styles.actions}><button className={styles.iconButton} onClick={() => downloadAuditExport("JSON")} title="Audit JSON indir"><Download aria-hidden="true" /></button><button className={styles.iconButton} onClick={() => downloadAuditExport("CSV")} title="Audit CSV indir"><Download aria-hidden="true" /></button></div></div><dl className={styles.details}>{(data.privacyRequests || []).map((item) => <div className={styles.detailPair} key={item.status}><dt>{item.status}</dt><dd>{item.count}</dd></div>)}</dl>{!data.privacyRequests?.length && <p className={styles.empty}>Acik privacy talebi yok.</p>}</section>
    </div>

    <section className={styles.section}><h2><ArchiveRestore aria-hidden="true" /> Hukuk kurali yonetimi</h2><div className={styles.tableWrap}><table><thead><tr><th>Kural</th><th>Durum</th><th>Kaynak</th><th>Surum</th><th>Fixture</th><th>Reviewer</th><th>Aktivasyon</th><th>Cakisma</th><th>Islem</th></tr></thead><tbody>{rules.map((rule) => <tr key={rule.id}><td>{rule.ruleName}</td><td><State value={rule.status} /></td><td>{rule.official_source_reference || "Kaynak bekliyor"}</td><td>{rule.version_number}</td><td><State value={rule.fixture_status || "PENDING"} /></td><td>{rule.reviewed_by || "-"}</td><td>{rule.activated_at ? new Date(rule.activated_at).toLocaleDateString("tr-TR") : "-"}</td><td>{rule.conflict_warning ? <State value="WARNING" /> : "-"}</td><td>{rule.status === "REVIEWED" ? <button className={styles.iconButton} disabled={actionId === rule.id} onClick={() => activate(rule)} title="Kurali aktive et"><ShieldCheck aria-hidden="true" /></button> : "-"}</td></tr>)}</tbody></table></div></section>
  </main>;
}
