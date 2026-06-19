"use client";

import { useState, useEffect, useCallback } from "react";
import {
  triggerUyapSync,
  getUyapSyncLogs,
  getUyapSyncStatus,
  getUyapNotifications,
  getUyapUnreadCount,
  markUyapNotificationRead,
  markAllUyapNotificationsRead,
  getUyapCases,
  getUyapDocuments,
  downloadUyapDocument,
  analyzeUyapDocument,
} from "@/lib/api";
import { 
  Landmark, Mail, Calendar, Folder, RefreshCw, Scale, FileText, ClipboardList, 
  Eye, EyeOff, Settings, Lock, BarChart, Download, CheckCircle, Sparkles, Inbox 
} from "lucide-react";

// ============================================================
// UYAP Entegrasyon Paneli (Gelişmiş & Profesyonel Versiyon)
// 5 Sekme: Senkronizasyon | Davalar & Duruşmalar | Evraklar | Tebligatlar | Geçmiş
// ============================================================

export default function UyapIntegration({ firmId }) {
  const [activeTab, setActiveTab] = useState("sync");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);

  // ---- Senkronizasyon Ayarları Formu ----
  const [tcKimlik, setTcKimlik] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [syncScope, setSyncScope] = useState({
    cases: true,
    hearings: true,
    notifications: true,
    documents: false, 
  });
  const [syncDateRange, setSyncDateRange] = useState("1_month"); 
  const [autoSync, setAutoSync] = useState(false); 

  // ---- Loglar ----
  const [syncLogs, setSyncLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // ---- Tebligatlar ----
  const [notifications, setNotifications] = useState([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifFilter, setNotifFilter] = useState("all"); 
  const [selectedNotif, setSelectedNotif] = useState(null);

  // ---- Davalar & Duruşmalar ----
  const [casesLoading, setCasesLoading] = useState(false);
  const [cases, setCases] = useState([]);

  // ---- Evraklar ----
  const [docsLoading, setDocsLoading] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [docFilter, setDocFilter] = useState("all");
  const [analyzingDoc, setAnalyzingDoc] = useState(null);
  
  // ---- Yapay Zeka Özeti Modalı ----
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [currentSummaryData, setCurrentSummaryData] = useState(null);

  // Son durum
  const [lastStatus, setLastStatus] = useState(null);

  // ============================================================
  // Veri Yükleme İşlemleri (Gerçek API)
  // ============================================================
  const loadSyncStatus = useCallback(async () => {
    if (!firmId) return;
    try {
      const res = await getUyapSyncStatus(firmId);
      setLastStatus(res.data);
    } catch (err) {
      console.error("Sync status error:", err);
    }
  }, [firmId]);

  const loadSyncLogs = useCallback(async () => {
    if (!firmId) return;
    setLogsLoading(true);
    try {
      const res = await getUyapSyncLogs(firmId);
      setSyncLogs(res.data || []);
    } catch (err) {
      console.error("Sync logs error:", err);
    } finally {
      setLogsLoading(false);
    }
  }, [firmId]);

  const loadNotifications = useCallback(async () => {
    if (!firmId) return;
    setNotifLoading(true);
    try {
      const res = await getUyapNotifications(firmId, {
        unreadOnly: notifFilter === "unread",
      });
      setNotifications(res.data || []);
      if (res.meta) setUnreadCount(res.meta.unreadCount);
    } catch (err) {
      console.error("Notifications error:", err);
    } finally {
      setNotifLoading(false);
    }
  }, [firmId, notifFilter]);

  const loadUnreadCount = useCallback(async () => {
    if (!firmId) return;
    try {
      const res = await getUyapUnreadCount(firmId);
      setUnreadCount(res.data?.unreadCount || 0);
    } catch (err) {
      console.error(err);
    }
  }, [firmId]);

  const loadCasesAndHearings = useCallback(async () => {
    if (!firmId) return;
    setCasesLoading(true);
    try {
      const res = await getUyapCases(firmId);
      setCases(res.data || []);
    } catch (err) {
      console.error("Cases error:", err);
      // Hata durumunda state temizlenebilir veya kullanıcıya toast çıkarılabilir
      setCases([]); 
    } finally {
      setCasesLoading(false);
    }
  }, [firmId]);

  const loadDocuments = useCallback(async () => {
    if (!firmId) return;
    setDocsLoading(true);
    try {
      const res = await getUyapDocuments(firmId, { type: docFilter });
      setDocuments(res.data || []);
    } catch (err) {
      console.error("Documents error:", err);
      setDocuments([]);
    } finally {
      setDocsLoading(false);
    }
  }, [firmId, docFilter]);

  useEffect(() => {
    loadSyncStatus();
    loadUnreadCount();
  }, [loadSyncStatus, loadUnreadCount]);

  useEffect(() => {
    if (activeTab === "logs") loadSyncLogs();
    if (activeTab === "notifications") loadNotifications();
    if (activeTab === "cases") loadCasesAndHearings();
    if (activeTab === "documents") loadDocuments();
  }, [activeTab, loadSyncLogs, loadNotifications, loadCasesAndHearings, loadDocuments]);

  // ============================================================
  // Polling (Senkronizasyon Devam Ediyorsa)
  // ============================================================
  useEffect(() => {
    if (!syncing) return;
    const interval = setInterval(async () => {
      await loadSyncStatus();
      if (lastStatus && lastStatus.status !== "running") {
        setSyncing(false);
        setSyncMessage(
          lastStatus.status === "success"
            ? `✅ Senkronizasyon başarıyla tamamlandı! Çekilen veriler güncellendi.`
            : lastStatus.status === "partial"
              ? `⚠️ Kısmi başarı: ${lastStatus.error_message}`
              : `❌ Hata: ${lastStatus.error_message}`
        );
        loadSyncLogs();
        loadNotifications();
        loadUnreadCount();
        if(activeTab === "cases") loadCasesAndHearings();
        if(activeTab === "documents") loadDocuments();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [syncing, lastStatus, loadSyncStatus, loadSyncLogs, loadNotifications, loadUnreadCount, activeTab, loadCasesAndHearings, loadDocuments]);

  // ============================================================
  // Handlers
  // ============================================================
  const handleSync = async (e) => {
    e.preventDefault();
    if (!tcKimlik || !password) {
      setSyncMessage("⚠️ TC Kimlik No ve şifre gereklidir.");
      return;
    }

    setSyncing(true);
    setSyncMessage(null);
    try {
      const payload = {
        tcKimlik,
        password,
        settings: { syncScope, syncDateRange, autoSync }
      };
      const res = await triggerUyapSync(firmId, payload);
      setSyncMessage("🔄 " + res.message);
      setTcKimlik("");
      setPassword("");
    } catch (err) {
      setSyncing(false);
      setSyncMessage("❌ " + (err.message || "Bağlantı hatası."));
    }
  };

  const handleMarkRead = async (notifId) => {
    try {
      await markUyapNotificationRead(firmId, notifId);
      setNotifications((prev) => prev.map((n) => (n.id === notifId ? { ...n, is_read: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllUyapNotificationsRead(firmId);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error(err);
    }
  };

  // Gerçek İndirme İşlemi
  const handleDownloadDoc = async (docId, fileName) => {
    try {
      const res = await downloadUyapDocument(firmId, docId);
      if (res && res.data && res.data.downloadUrl) {
        window.open(res.data.downloadUrl, '_blank');
      } else {
        alert("İndirme bağlantısı bulunamadı.");
      }
    } catch (err) {
      alert("Evrak indirilirken bir hata oluştu: " + err.message);
    }
  };

  // Gerçek AI İnceleme İşlemi
  const handleAnalyzeDoc = async (doc) => {
    if (doc.isAnalyzed && doc.summary) {
      // Zaten incelenmişse direkt modal'ı aç
      setCurrentSummaryData({ title: doc.name, summary: doc.summary });
      setShowSummaryModal(true);
      return;
    }

    setAnalyzingDoc(doc.id);
    setCurrentSummaryData({ title: doc.name, loading: true });
    setShowSummaryModal(true);

    try {
      const res = await analyzeUyapDocument(firmId, doc.id);
      
      // Listeyi güncelle
      setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, isAnalyzed: true, summary: res.data.summary } : d));
      
      // Modal verisini güncelle
      setCurrentSummaryData({ title: doc.name, summary: res.data.summary, loading: false });
    } catch (err) {
      setCurrentSummaryData({ title: doc.name, error: "Yapay zeka incelemesi sırasında bir hata oluştu: " + err.message, loading: false });
    } finally {
      setAnalyzingDoc(null);
    }
  };

  // ============================================================
  // Yardımcı UI Fonksiyonları
  // ============================================================
  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString("tr-TR", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  };

  const statusBadge = (status) => {
    const map = {
      running: { bg: "rgba(59,130,246,0.15)", color: "#60a5fa", text: "Çalışıyor" },
      success: { bg: "rgba(34,197,94,0.15)", color: "#4ade80", text: "Başarılı" },
      partial: { bg: "rgba(251,146,60,0.15)", color: "#fb923c", text: "Kısmi" },
      failed: { bg: "rgba(239,68,68,0.15)", color: "#f87171", text: "Hata" },
    };
    const s = map[status] || map.failed;
    return (
      <span style={{ ...badgeBase, background: s.bg, color: s.color }}>
        {status === "running" && <span style={pulseStyle} />}
        {s.text}
      </span>
    );
  };

  const notifTypeBadge = (type) => {
    const colors = { tebligat: "#f59e0b", karar: "#8b5cf6", tensip: "#06b6d4", durusma_degisikligi: "#ef4444" };
    const color = colors[type] || "#64748b";
    return <span style={{ ...badgeBase, background: `${color}22`, color }}>{type || "Genel"}</span>;
  };

  const docTypeBadge = (type) => {
    const colors = { Rapor: "#ec4899", Tensip: "#0ea5e9", Dilekçe: "#eab308", Karar: "#10b981" };
    const color = colors[type] || "#64748b";
    return <span style={{ ...badgeBase, background: `${color}22`, color }}>{type || "Evrak"}</span>;
  };

  if (!firmId) {
    return (
      <div style={pageContainer}>
        <div style={headerRow}><h2 style={pageTitle}>UYAP Entegrasyonu</h2></div>
        <div style={emptyStateCard}>
          <h3 style={{ fontSize: 20, marginBottom: 15, color: "var(--color-text-primary)" }}>Lütfen önce bir büro oluşturun veya seçin.</h3>
          <p style={{ color: "var(--color-text-tertiary)", fontSize: 15 }}>UYAP entegrasyonunu kullanmak için önce bir hukuk bürosuna üye olmalısınız. Sol menüden <strong>Büro Yönetimi</strong> sekmesine giderek yeni bir büro oluşturabilirsiniz.</p>
        </div>
      </div>
    );
  }

  const upcomingHearingsCount = cases.filter(c => c.nextHearing && new Date(c.nextHearing) > new Date()).length;

  return (
    <div style={pageContainer}>
      <div style={headerRow}>
        <div>
          <h2 style={pageTitle}><Landmark size={24} style={{ marginRight: 10 }} /> UYAP Entegrasyonu</h2>
          <p style={pageSubtitle}>UYAP Avukat Portal'a bağlanarak dava, duruşma, evrak ve tebligat verilerinizi senkronize edin.</p>
        </div>
      </div>

      <div style={metricsBar}>
        <div style={metricCard}>
          <div style={metricIconWrapper}><Mail size={20} /></div>
          <div><div style={metricValue}>{unreadCount}</div><div style={metricLabel}>Okunmamış Tebligat</div></div>
        </div>
        <div style={metricCard}>
          <div style={metricIconWrapper}><Calendar size={20} /></div>
          <div><div style={metricValue}>{upcomingHearingsCount || 0}</div><div style={metricLabel}>Yaklaşan Duruşma</div></div>
        </div>
        <div style={metricCard}>
          <div style={metricIconWrapper}><Folder size={20} /></div>
          <div><div style={metricValue}>{cases.length || 0}</div><div style={metricLabel}>Aktif Dava Dosyası</div></div>
        </div>
      </div>

      <div style={tabBar}>
        {[
          { id: "sync", label: "Senkronizasyon", icon: <RefreshCw size={16} /> },
          { id: "cases", label: "Davalar & Duruşmalar", icon: <Scale size={16} /> },
          { id: "documents", label: "Evraklar", icon: <FileText size={16} /> },
          { id: "notifications", label: "Tebligatlar", icon: <Mail size={16} />, badge: unreadCount },
          { id: "logs", label: "Geçmiş", icon: <ClipboardList size={16} /> },
        ].map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ ...tabItem, ...(activeTab === tab.id ? tabItemActive : {}) }}>
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.badge > 0 && <span style={badgeCountStyle}>{tab.badge}</span>}
          </button>
        ))}
      </div>

      {activeTab === "sync" && (
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 500px", display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={formCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 600, color: "var(--color-text-primary)" }}>UYAP'a Bağlan</h3>
                  <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)" }}>E-İmza veya Mobil İmza kullanmadan, şifreli yöntemle verilerinizi hızlıca çekin.</p>
                </div>
              </div>

              <form onSubmit={handleSync} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ display: "flex", gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>TC Kimlik No</label>
                    <input type="text" placeholder="12345678901" maxLength={11} value={tcKimlik} onChange={(e) => setTcKimlik(e.target.value.replace(/\D/g, ""))} style={inputStyle} disabled={syncing} required />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>UYAP Şifresi</label>
                    <div style={{ position: "relative" }}>
                      <input type={showPassword ? "text" : "password"} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} style={{ ...inputStyle, paddingRight: 44 }} disabled={syncing} required />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} style={{...eyeButton, color: "var(--color-text-secondary)"}} tabIndex={-1}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                    </div>
                  </div>
                </div>

                <div style={advancedSettingsBox}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 12, borderBottom: "1px solid var(--color-border-subtle)", paddingBottom: 8 }}><Settings size={14} /> Senkronizasyon Kapsamı ve Ayarları</div>
                  
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 8 }}>Çekilecek Veriler</label>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <label style={checkboxLabel}><input type="checkbox" checked={syncScope.cases} onChange={e=>setSyncScope({...syncScope, cases: e.target.checked})} /> Dava Dosyaları</label>
                        <label style={checkboxLabel}><input type="checkbox" checked={syncScope.hearings} onChange={e=>setSyncScope({...syncScope, hearings: e.target.checked})} /> Duruşma Günleri</label>
                        <label style={checkboxLabel}><input type="checkbox" checked={syncScope.notifications} onChange={e=>setSyncScope({...syncScope, notifications: e.target.checked})} /> E-Tebligatlar</label>
                        <label style={checkboxLabel}><input type="checkbox" checked={syncScope.documents} onChange={e=>setSyncScope({...syncScope, documents: e.target.checked})} /> Dosya Evrakları (Safahat) <span style={{fontSize:10, color:"var(--color-text-tertiary)"}}>(Uzun sürebilir)</span></label>
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: 16 }}>
                      <div>
                        <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Tarih Aralığı Filtresi</label>
                        <select style={inputStyle} value={syncDateRange} onChange={e=>setSyncDateRange(e.target.value)}>
                          <option value="1_week">Sadece Son 1 Hafta (Hızlı)</option>
                          <option value="1_month">Son 1 Ay (Önerilen)</option>
                          <option value="6_months">Son 6 Ay</option>
                          <option value="all">Tüm Geçmiş Veriler (Çok Yavaş)</option>
                        </select>
                      </div>
                      <div style={{ padding: "10px", background: "var(--color-bg)", borderRadius: 8, border: "1px solid var(--color-border-subtle)" }}>
                        <label style={{ ...checkboxLabel, margin: 0, fontWeight: 500, color: "var(--color-text-primary)" }}>
                          <input type="checkbox" checked={autoSync} onChange={e=>setAutoSync(e.target.checked)} /> 
                          Arka Planda Otomatik Senkronize Et
                        </label>
                        <p style={{ margin: "4px 0 0 24px", fontSize: 11, color: "var(--color-text-tertiary)" }}>Premium Özellik: Her gün sabah 08:00'da verilerinizi otomatik günceller.</p>
                      </div>
                    </div>
                  </div>
                </div>

                {syncMessage && <div style={getMessageStyle(syncMessage)}>{syncMessage}</div>}

                <button type="submit" disabled={syncing || !tcKimlik || !password} style={{ ...primaryBtn, opacity: syncing || !tcKimlik || !password ? 0.6 : 1, cursor: syncing ? "wait" : "pointer" }}>
                  {syncing ? (<><span style={spinnerStyle} /> UYAP'tan Veriler Çekiliyor...</>) : (<><RefreshCw size={16} /> Senkronizasyonu Başlat</>)}
                </button>
              </form>
            </div>
            
            <div style={infoCard}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <Lock size={24} style={{ color: "var(--color-accent)" }} />
                <div>
                  <strong style={{ color: "var(--color-text-primary)" }}>Uçtan Uca Güvenlik</strong>
                  <p style={{ margin: "4px 0 0", color: "var(--color-text-secondary)", fontSize: 13, lineHeight: 1.6 }}>Kimlik bilgileriniz sunucularımızda saklanmaz, doğrudan UYAP altyapısına şifreli iletilir. Bağlantı esnasında 256-bit SSL şifreleme kullanılmaktadır.</p>
                </div>
              </div>
            </div>
          </div>

          <div style={{ flex: "1 1 300px" }}>
            {lastStatus ? (
              <div style={statusCard}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, borderBottom: "1px solid var(--color-border-subtle)", paddingBottom: 12 }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>Son Eşitleme Özeti</span>
                  {statusBadge(lastStatus.status)}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div style={statBox}>
                    <span style={statLabel}>Dava Dosyası</span>
                    <span style={statValue}>{lastStatus.cases_synced || 0}</span>
                  </div>
                  <div style={statBox}>
                    <span style={statLabel}>Duruşma Kaydı</span>
                    <span style={statValue}>{lastStatus.hearings_synced || 0}</span>
                  </div>
                  <div style={statBox}>
                    <span style={statLabel}>E-Tebligat</span>
                    <span style={statValue}>{lastStatus.notifications_synced || 0}</span>
                  </div>
                  <div style={statBox}>
                    <span style={statLabel}>Son Tarih</span>
                    <span style={{ ...statValue, fontSize: 13, marginTop: 4 }}>{formatDate(lastStatus.completed_at || lastStatus.started_at)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ ...statusCard, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 200, color: "var(--color-text-tertiary)", textAlign: "center" }}>
                <BarChart size={32} style={{ marginBottom: 12 }} />
                <p>Henüz bir senkronizasyon kaydı bulunmuyor. Senkronizasyon başlattığınızda sonuçlar burada görünecektir.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "cases" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 18, color: "var(--color-text-primary)" }}>Güncel Dava Dosyaları ve Duruşmalar</h3>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{...secondaryBtn, display:"flex", alignItems:"center", gap:6}} onClick={loadCasesAndHearings}><RefreshCw size={14}/> Yenile</button>
            </div>
          </div>

          {casesLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{[1, 2, 3].map((i) => <div key={i} style={skeletonRow} />)}</div>
          ) : cases.length === 0 ? (
            <div style={emptyCard}><p>Kayıtlı dava bulunamadı. Lütfen UYAP senkronizasyonu yapın.</p></div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {cases.map((c) => (
                <div key={c.id} style={caseCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 4 }}>{c.esas || c.title}</div>
                      <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 8 }}>{c.mahkeme || c.courtName || "Bilinmiyor"}</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <span style={pillLabel}>Taraf: {c.taraf || "Belirtilmemiş"}</span>
                        <span style={{ ...pillLabel, background: c.durum === "Açık" ? "rgba(34,197,94,0.1)" : "rgba(100,116,139,0.1)", color: c.durum === "Açık" ? "#4ade80" : "#94a3b8" }}>Durum: {c.durum || c.status || "Açık"}</span>
                      </div>
                    </div>
                    {c.nextHearing ? (
                      <div style={hearingBox}>
                        <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.5, marginBottom: 4 }}>Yaklaşan Duruşma</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--color-accent)", fontWeight: 600, fontSize: 14 }}>
                          <Calendar size={14} /> {formatDate(c.nextHearing)}
                        </div>
                      </div>
                    ) : (
                      <div style={{ ...hearingBox, background: "transparent", border: "1px dashed var(--color-border-subtle)" }}>
                        <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>Planlı duruşma yok</div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "documents" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {["all", "Rapor", "Tensip", "Karar", "Dilekçe"].map(f => (
                <button key={f} onClick={() => setDocFilter(f)} style={{ ...filterBtn, ...(docFilter === f ? filterBtnActive : {}) }}>
                  {f === "all" ? "Tümü" : f}
                </button>
              ))}
            </div>
          </div>

          {docsLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{[1, 2, 3].map((i) => <div key={i} style={skeletonRow} />)}</div>
          ) : documents.length === 0 ? (
            <div style={emptyCard}><p>Kayıtlı evrak bulunamadı. UYAP senkronizasyon ayarlarından "Dosya Evrakları"nı seçerek eşitleme yapın.</p></div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
              {documents.filter(d => docFilter === "all" || d.type === docFilter).map(doc => (
                <div key={doc.id} style={docCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                    {docTypeBadge(doc.type)}
                    <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{doc.size || "Bilinmiyor"}</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 6, wordBreak: "break-word" }}>{doc.name || doc.title}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 16, display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Folder size={12}/> {doc.esas}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Calendar size={12}/> {formatDate(doc.date || doc.createdAt)}</div>
                  </div>
                  
                  <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
                    <button onClick={() => handleDownloadDoc(doc.id, doc.name)} style={{ ...secondaryBtn, flex: 1, padding: "8px", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}><Download size={14} /> İndir</button>
                    <button 
                      onClick={() => handleAnalyzeDoc(doc)} 
                      disabled={analyzingDoc === doc.id}
                      style={{ ...primaryBtn, flex: 2, padding: "8px", fontSize: 12, margin: 0, opacity: doc.isAnalyzed ? 0.9 : 1, background: doc.isAnalyzed ? "var(--color-success)" : "var(--color-accent)" }}
                    >
                      {analyzingDoc === doc.id ? "İnceleniyor..." : doc.isAnalyzed ? <><CheckCircle size={14}/> Özeti Gör</> : <><Sparkles size={14}/> AI İle İncele</>}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "notifications" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {[{ id: "all", label: "Tümü" }, { id: "unread", label: `Okunmamış (${unreadCount})` }].map((f) => (
                <button key={f.id} onClick={() => setNotifFilter(f.id)} style={{ ...filterBtn, ...(notifFilter === f.id ? filterBtnActive : {}) }}>{f.label}</button>
              ))}
            </div>
            {unreadCount > 0 && <button onClick={handleMarkAllRead} style={secondaryBtn}>✅ Tümünü Okundu İşaretle</button>}
          </div>

          {notifLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{[1, 2, 3].map((i) => <div key={i} style={skeletonRow} />)}</div>
          ) : notifications.length === 0 ? (
            <div style={emptyCard}>
              <div style={{ marginBottom: 12, color: "var(--color-text-tertiary)", display: "flex", justifyContent: "center" }}><Inbox size={40} /></div>
              <p style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>{notifFilter === "unread" ? "Okunmamış tebligat bulunmuyor." : "Henüz tebligat yok."}</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {notifications.map((notif) => (
                <div key={notif.id} onClick={() => { setSelectedNotif(notif); if (!notif.is_read) handleMarkRead(notif.id); }} style={{ ...notifCard, borderLeft: notif.is_read ? "3px solid transparent" : "3px solid var(--color-accent)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        {!notif.is_read && <span style={unreadDot} />}
                        <span style={{ fontSize: 14, fontWeight: notif.is_read ? 400 : 600, color: "var(--color-text-primary)" }}>{notif.title}</span>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        {notifTypeBadge(notif.notification_type)}
                        {notif.esas_no && <span style={{ fontSize: 12, color: "var(--color-text-tertiary)", display: "flex", alignItems: "center", gap: 4 }}><Folder size={12}/> {notif.esas_no}</span>}
                      </div>
                    </div>
                    <span style={{ fontSize: 12, color: "var(--color-text-tertiary)", whiteSpace: "nowrap" }}>{formatDate(notif.notification_date)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedNotif && (
            <div style={modalOverlay} onClick={() => setSelectedNotif(null)}>
              <div style={modalContent} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "var(--color-text-primary)" }}>{selectedNotif.title}</h3>
                    <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                      {notifTypeBadge(selectedNotif.notification_type)}
                      <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>{formatDate(selectedNotif.notification_date)}</span>
                    </div>
                  </div>
                  <button onClick={() => setSelectedNotif(null)} style={closeBtn}>✕</button>
                </div>
                {selectedNotif.esas_no && <div style={{ padding: "8px 12px", borderRadius: 8, background: "var(--color-bg-subtle)", marginBottom: 12, fontSize: 13, color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 6 }}><Folder size={14}/> İlgili Dava: <strong>{selectedNotif.esas_no}</strong> — {selectedNotif.dava_mahkeme || ""}</div>}
                <div style={{ padding: "16px", borderRadius: 10, background: "var(--color-bg-subtle)", fontSize: 14, lineHeight: 1.7, color: "var(--color-text-primary)", maxHeight: 300, overflowY: "auto" }}>{selectedNotif.content || "İçerik mevcut değil."}</div>
                <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}><button onClick={() => setSelectedNotif(null)} style={secondaryBtn}>Kapat</button></div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "logs" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-secondary)" }}>Son {syncLogs.length} senkronizasyon kaydı</span>
            <button onClick={loadSyncLogs} style={{...secondaryBtn, display: "flex", alignItems: "center", gap: 6}} disabled={logsLoading}><RefreshCw size={14} /> {logsLoading ? "Yükleniyor..." : "Yenile"}</button>
          </div>
          {logsLoading ? <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{[1, 2, 3].map((i) => <div key={i} style={skeletonRow} />)}</div> : syncLogs.length === 0 ? <div style={emptyCard}><p>Kayıt yok.</p></div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {syncLogs.map((log) => (
                <div key={log.id} style={logCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>{statusBadge(log.status)}<span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{log.first_name} {log.last_name}</span></div>
                    <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>{formatDate(log.started_at)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
                    <span style={{ color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 4 }}><Folder size={12}/> {log.cases_synced || 0} dava</span>
                    <span style={{ color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 4 }}><Calendar size={12}/> {log.hearings_synced || 0} duruşma</span>
                    <span style={{ color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 4 }}><Mail size={12}/> {log.notifications_synced || 0} tebligat</span>
                  </div>
                  {log.error_message && <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.08)", fontSize: 12, color: "var(--color-error)" }}>{log.error_message}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================== AI SUMMARY MODAL ==================== */}
      {showSummaryModal && currentSummaryData && (
        <div style={modalOverlay} onClick={() => !currentSummaryData.loading && setShowSummaryModal(false)}>
          <div style={{ ...modalContent, maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Sparkles size={24} style={{ color: "var(--color-accent)" }} />
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "var(--color-text-primary)" }}>Yapay Zeka İncelemesi</h3>
              </div>
              {!currentSummaryData.loading && <button onClick={() => setShowSummaryModal(false)} style={closeBtn}>✕</button>}
            </div>

            <div style={{ padding: "12px 16px", borderRadius: 8, background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.1)", marginBottom: 20 }}>
              <span style={{ fontSize: 12, color: "var(--color-text-tertiary)", display: "block", marginBottom: 4 }}>İncelenen Evrak</span>
              <strong style={{ fontSize: 14, color: "var(--color-text-primary)" }}>{currentSummaryData.title}</strong>
            </div>

            {currentSummaryData.loading ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 0", gap: 16 }}>
                <div style={{ width: 40, height: 40, border: "3px solid rgba(16,185,129,0.2)", borderTopColor: "#10b981", borderRadius: "50%", animation: "spin 1s linear infinite" }}></div>
                <div style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text-primary)" }}>Evrak okunuyor ve analiz ediliyor...</div>
                <div style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>Bu işlem dosya boyutuna göre birkaç saniye sürebilir.</div>
              </div>
            ) : currentSummaryData.error ? (
              <div style={{ padding: 20, background: "rgba(239,68,68,0.1)", color: "#f87171", borderRadius: 10, fontSize: 14 }}>
                {currentSummaryData.error}
              </div>
            ) : (
              <div className="prose prose-invert max-w-none" style={{ background: "var(--color-bg-subtle)", padding: 20, borderRadius: 12, border: "1px solid var(--color-border-subtle)", fontSize: 14, lineHeight: 1.7, color: "var(--color-text-primary)", maxHeight: "50vh", overflowY: "auto" }}>
                {currentSummaryData.summary}
              </div>
            )}

            {!currentSummaryData.loading && (
              <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
                <button onClick={() => setShowSummaryModal(false)} style={primaryBtn}>Anladım, Kapat</button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

// ============================================================
// Stiller
// ============================================================

const pageContainer = { padding: 24, maxWidth: 960, margin: "0 auto", width: "100%", boxSizing: "border-box" };
const headerRow = { marginBottom: 24 };
const pageTitle = { margin: 0, fontSize: 24, fontWeight: 700, color: "var(--color-text-primary)", display: "flex", alignItems: "center" };
const pageSubtitle = { margin: "6px 0 0", fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.5 };

const metricsBar = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 };
const metricCard = { background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)", borderRadius: 12, padding: "16px", display: "flex", alignItems: "center", gap: 16, boxShadow: "var(--shadow-xs)" };
const metricIconWrapper = { width: 44, height: 44, borderRadius: 10, background: "var(--color-bg-subtle)", display: "flex", alignItems: "center", justifyContent: "center" };
const metricValue = { fontSize: 22, fontWeight: 700, color: "var(--color-text-primary)", lineHeight: 1.2 };
const metricLabel = { fontSize: 12, color: "var(--color-text-tertiary)", fontWeight: 500 };

const tabBar = { display: "flex", gap: 4, marginBottom: 24, padding: 4, borderRadius: 12, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border-subtle)", overflowX: "auto" };
const tabItem = { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 16px", borderRadius: 10, border: "none", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 500, color: "var(--color-text-secondary)", transition: "all 0.2s ease", whiteSpace: "nowrap" };
const tabItemActive = { background: "var(--color-bg-elevated)", color: "var(--color-text-primary)", fontWeight: 600, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" };
const badgeCountStyle = { background: "var(--color-accent)", color: "#fff", fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 20, minWidth: 18, textAlign: "center" };

const infoCard = { padding: "16px 20px", borderRadius: 14, background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.12)" };
const statusCard = { padding: 24, borderRadius: 14, background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)", height: "100%", boxSizing: "border-box" };
const formCard = { padding: 24, borderRadius: 14, background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)", boxShadow: "var(--shadow-sm)" };

const statBox = { background: "var(--color-bg-subtle)", padding: 12, borderRadius: 10, display: "flex", flexDirection: "column", gap: 4 };
const statValue = { fontSize: 20, fontWeight: 700, color: "var(--color-text-primary)" };
const statLabel = { fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500 };

const labelStyle = { display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)" };
const inputStyle = { width: "100%", padding: "12px 16px", fontSize: 14, background: "var(--color-surface)", border: "1px solid var(--color-border)", borderBottom: "2px solid var(--color-border)", borderRadius: 10, color: "var(--color-text-primary)", outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" };
const eyeButton = { position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: 4 };

const advancedSettingsBox = { padding: 16, borderRadius: 10, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border-subtle)" };
const checkboxLabel = { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--color-text-secondary)", cursor: "pointer" };

const primaryBtn = { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 24px", fontSize: 14, fontWeight: 600, background: "var(--color-accent)", color: "var(--color-text-inverse)", border: "none", borderRadius: 10, cursor: "pointer", transition: "all 0.2s ease" };
const secondaryBtn = { padding: "8px 16px", fontSize: 13, fontWeight: 500, background: "var(--color-bg-elevated)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)", borderRadius: 8, cursor: "pointer", transition: "all 0.2s ease" };
const filterBtn = { padding: "6px 14px", fontSize: 13, fontWeight: 500, background: "transparent", color: "var(--color-text-secondary)", border: "1px solid var(--color-border-subtle)", borderRadius: 8, cursor: "pointer", transition: "all 0.15s" };
const filterBtnActive = { background: "var(--color-accent)", color: "var(--color-text-inverse)", border: "1px solid var(--color-accent)" };

const caseCard = { padding: 16, borderRadius: 12, background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)", transition: "all 0.2s" };
const docCard = { padding: 16, borderRadius: 12, background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)", display: "flex", flexDirection: "column", height: 180 };
const hearingBox = { background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)", borderRadius: 10, padding: "10px 14px", display: "flex", flexDirection: "column", alignItems: "flex-end" };
const pillLabel = { fontSize: 11, fontWeight: 600, background: "var(--color-bg-subtle)", padding: "4px 8px", borderRadius: 6, color: "var(--color-text-secondary)" };

const logCard = { padding: 16, borderRadius: 12, background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)" };
const notifCard = { padding: "14px 16px", borderRadius: 12, background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)", cursor: "pointer" };
const emptyStateCard = { textAlign: "center", padding: 60, background: "var(--color-bg-elevated)", borderRadius: 12, border: "1px solid var(--color-border-subtle)", marginTop: 20 };
const emptyCard = { padding: 48, borderRadius: 14, background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)", textAlign: "center", color: "var(--color-text-tertiary)" };
const skeletonRow = { height: 72, borderRadius: 12, background: "linear-gradient(90deg, var(--color-bg-subtle) 25%, var(--color-bg-elevated) 50%, var(--color-bg-subtle) 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite" };
const unreadDot = { width: 8, height: 8, borderRadius: "50%", background: "var(--color-accent)", flexShrink: 0 };
const badgeBase = { padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 };
const pulseStyle = { width: 8, height: 8, borderRadius: "50%", background: "#60a5fa", animation: "pulse 1.5s infinite" };
const spinnerStyle = { width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" };

const modalOverlay = { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 };
const modalContent = { background: "var(--color-bg-elevated)", padding: 28, borderRadius: 16, width: "90%", maxWidth: 560, border: "1px solid var(--color-border)", boxShadow: "0 24px 48px -12px rgba(0,0,0,0.3)", maxHeight: "80vh", overflowY: "auto" };
const closeBtn = { width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "1px solid var(--color-border-subtle)", background: "transparent", cursor: "pointer", fontSize: 16, color: "var(--color-text-secondary)", flexShrink: 0 };

function getMessageStyle(msg) {
  const isSuccess = msg.startsWith("✅");
  const isError = msg.startsWith("❌");
  const isWarning = msg.startsWith("⚠️");
  const colorParams = isSuccess ? "34,197,94" : isError ? "239,68,68" : isWarning ? "251,146,60" : "59,130,246";
  return {
    padding: "12px 16px", borderRadius: 10, fontSize: 13, lineHeight: 1.5,
    background: `rgba(${colorParams},0.1)`, color: "var(--color-text-primary)",
    border: `1px solid rgba(${colorParams},0.2)`
  };
}
