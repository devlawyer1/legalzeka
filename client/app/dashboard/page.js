"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import Workdesk from "@/components/dashboard/Workdesk";
import SearchBar from "@/components/dashboard/SearchBar";
import ExecutionCalculator from "@/components/dashboard/ExecutionCalculator";
import FeeCalculator from "@/components/dashboard/FeeCalculator";
import TermCalculator from "@/components/dashboard/TermCalculator";
import LaborCalculator from "@/components/dashboard/LaborCalculator";
import CivilExecutionCalculator from "@/components/dashboard/CivilExecutionCalculator";
import CompensationCalculator from "@/components/dashboard/CompensationCalculator";
import FamilyLawCalculator from "@/components/dashboard/FamilyLawCalculator";
import FinancialCalculator from "@/components/dashboard/FinancialCalculator";
import InheritanceCalculator from "@/components/dashboard/InheritanceCalculator";
import AIChat from "@/components/dashboard/AIChat";
import DevilsAdvocate from "@/components/dashboard/DevilsAdvocate";
import ContractReview from "@/components/dashboard/ContractReview";
import ExpertAgents from "@/components/dashboard/ExpertAgents";
import CollectionsManagement from "@/components/dashboard/CollectionsManagement";
import CRMBoard from "@/components/crm/CRMBoard";
import FinanceDashboard from "@/components/finance/FinanceDashboard";
import CorporateNetwork from "@/components/corporate/CorporateNetwork";
import FirmManagement from "@/components/dashboard/FirmManagement";
import FirmTemplates from "@/components/dashboard/FirmTemplates";
import CaseManagement from "@/components/dashboard/CaseManagement";
import TaskBoard from "@/components/dashboard/TaskBoard";
import InternalChat from "@/components/dashboard/InternalChat";
import PetitionManagement from "@/components/dashboard/PetitionManagement";
import Simulation from "@/components/dashboard/Simulation";
import TevkilBoard from "@/components/dashboard/TevkilBoard";

import UyapIntegration from "@/components/dashboard/UyapIntegration";
import DeadlineTracker from "@/components/dashboard/DeadlineTracker";
import LawTimeline from "@/components/dashboard/LawTimeline";
import { getStoredUser, isAuthenticated, logout, searchKeyword, searchSemantic, askAI, getMySubscription, getHistory, clearHistory, deleteHistory, updateProfile, updatePassword, updateStoredUser, getNotes, addNote, deleteNote, updateNote, getMyFirms } from "@/lib/api";

/* ============================================================
   Emsal Atlası - Dashboard Page
   Main application layout with sidebar + search
   ============================================================ */

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [activeFirm, setActiveFirm] = useState(null);
  const [activePage, setActivePage] = useState("workdesk");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [lastSearch, setLastSearch] = useState(null);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [pageReady, setPageReady] = useState(false);
  
  // AI RAG State
  const [aiResponse, setAiResponse] = useState("");
  const [aiStreaming, setAiStreaming] = useState(false);
  const [aiSources, setAiSources] = useState([]);
  const [aiVerification, setAiVerification] = useState(null);

  // History State
  const [searchHistory, setSearchHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Notes State
  const [notes, setNotes] = useState([]);
  const [newNoteText, setNewNoteText] = useState("");
  const [activeNoteId, setActiveNoteId] = useState(null);

  // Settings State
  const [profileForm, setProfileForm] = useState({ firstName: "", lastName: "" });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState({ type: "", text: "" });

  useEffect(() => {
    let cancelled = false;

    async function hydrateUserContext() {
      await Promise.resolve();
      if (cancelled) return;

      const storedUser = getStoredUser();
      setUser(storedUser);

      if (storedUser) {
        setProfileForm({ firstName: storedUser.firstName, lastName: storedUser.lastName });

        getMySubscription()
          .then((res) => setSubscription(res.data))
          .catch(() => {})
          .finally(() => {
            if (!cancelled) setPageReady(true);
          });

        getMyFirms()
          .then((res) => {
            if (cancelled) return;
            if (res.data && res.data.length > 0) {
              setActiveFirm(res.data[0]);
            } else {
              setActiveFirm(null);
            }
          })
          .catch(() => {});
      } else {
        setSubscription({ planName: "Misafir Kullanıcı", maxSearchLimit: 3 });
        setPageReady(true);
      }
    }

    hydrateUserContext();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleSearch = async (query, type, filters = {}) => {
    setSearching(true);
    setSearchError("");
    setSearchResults(null);
    setAiResponse("");
    setAiSources([]);
    setAiVerification(null);
    setLastSearch({ query, filters });

    try {
      let res;
      if (type === "semantic") {
        res = await searchSemantic(query, filters);
      } else {
        res = await searchKeyword(query, 1, 20, filters);
      }
      setSearchResults(res.data);
    } catch (err) {
      if (err.code === "SUBSCRIPTION_REQUIRED") {
        setSearchError("Aboneliğiniz sona ermiş. Lütfen aboneliğinizi yenileyerek aramaya devam edin.");
      } else if (err.code === "GUEST_LIMIT_EXCEEDED") {
        setShowGuestModal(true);
      } else {
        setSearchError(err.message);
      }
    } finally {
      setSearching(false);
    }
  };

  const triggerAI = async (query, filters = {}) => {
    setAiStreaming(true);
    setAiResponse("");
    setAiSources([]);
    setAiVerification(null);
    try {
      const response = await askAI(query, filters);
      const fullText = response.data.answer;
      setAiSources(response.data.sources || []);
      setAiVerification(response.data.verification || null);
      
      // Simülasyon: Kelime kelime yazma efekti (Streaming)
      let currentText = "";
      const words = fullText.split(" ");
      let i = 0;
      
      const interval = setInterval(() => {
        if (i < words.length) {
          currentText += words[i] + " ";
          setAiResponse(currentText);
          i++;
        } else {
          clearInterval(interval);
          setAiStreaming(false);
        }
      }, 50); // Her kelime arası 50ms bekle
      
    } catch (err) {
      setAiResponse("Yapay zeka asistanı şu anda yanıt veremiyor: " + err.message);
      setAiStreaming(false);
    }
  };

  const handleNavigate = (page) => {
    if (!user && page !== "search") {
      router.push("/auth"); // Misafirler sadece aramayı görebilir, geçmiş/ayarlar için kayıt lazım
      return;
    }
    setActivePage(page);
    if (page === "recent") {
      fetchUserHistory();
    } else if (page === "notes") {
      const loadedNotes = getNotes();
      setNotes(loadedNotes);
      if (loadedNotes.length > 0 && !activeNoteId) {
        setActiveNoteId(loadedNotes[0].id);
      }
    }
  };

  const fetchUserHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await getHistory();
      setSearchHistory(res.data);
    } catch (err) {
      console.error("Geçmiş yüklenemedi", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleDeleteHistory = async (id, e) => {
    e.stopPropagation(); // Satıra tıklamayı engelle
    try {
      await deleteHistory(id);
      setSearchHistory(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      console.error("Geçmiş silinemedi", err);
    }
  };

  const handleClearAllHistory = async () => {
    if (!window.confirm("Tüm arama geçmişinizi silmek istediğinize emin misiniz?")) return;
    try {
      await clearHistory();
      setSearchHistory([]);
    } catch (err) {
      console.error("Geçmiş temizlenemedi", err);
    }
  };

  const handleReSearch = (query, type) => {
    setActivePage("search");
    // handleSearch'ü çağır, SearchBar bileşenine query'yi aktarmanın en kolay yolu 
    // şimdilik direkt aramayı tetiklemek
    handleSearch(query, type);
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setSettingsMessage({ type: "", text: "" });
    setSettingsLoading(true);
    try {
      const res = await updateProfile({ firstName: profileForm.firstName, lastName: profileForm.lastName });
      setSettingsMessage({ type: "success", text: "Profiliniz başarıyla güncellendi." });
      
      const updatedUser = { ...user, firstName: profileForm.firstName, lastName: profileForm.lastName };
      setUser(updatedUser);
      updateStoredUser(updatedUser);
    } catch (err) {
      setSettingsMessage({ type: "error", text: err.message || "Profil güncellenemedi." });
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setSettingsMessage({ type: "", text: "" });

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      return setSettingsMessage({ type: "error", text: "Yeni şifreler eşleşmiyor." });
    }

    setSettingsLoading(true);
    try {
      await updatePassword({ 
        currentPassword: passwordForm.currentPassword, 
        newPassword: passwordForm.newPassword 
      });
      setSettingsMessage({ type: "success", text: "Şifreniz başarıyla güncellendi." });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) {
      setSettingsMessage({ type: "error", text: err.message || "Şifre güncellenemedi." });
    } finally {
      setSettingsLoading(false);
    }
  };

  if (!pageReady) {
    return (
      <div style={loadingStyles.wrapper}>
        <div style={loadingStyles.spinner} />
      </div>
    );
  }

  return (
    <div style={styles.layout}>
      <Sidebar
        user={user}
        activePage={activePage}
        onNavigate={handleNavigate}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <main style={styles.main}>
        {/* Top bar removed to save screen space */}

        {/* Content Area */}
        <div style={{ ...styles.content, padding: (activePage === "notes" || activePage === "ai_chat") ? 0 : "40px 28px" }}>
          {activePage === "workdesk" && (
            <div className="animate-fade-in" style={{ flex: 1, backgroundColor: 'var(--color-bg)', height: '100%', overflow: 'auto' }}>
              <Workdesk
                activeFirm={activeFirm}
                user={user}
                onNavigate={handleNavigate}
              />
            </div>
          )}

          {activePage === "ai_chat" && (
            <div style={{ height: "100%", width: "100%" }}>
              <AIChat />
            </div>
          )}

          {activePage === "search" && (
            <div style={styles.searchPage}>
              <SearchBar onSearch={handleSearch} subscription={subscription} />

              {/* Loading state */}
              {searching && (
                <div style={styles.resultSection}>
                  <div style={styles.loadingBar}>
                    <div style={styles.loadingBarInner} />
                  </div>
                  <p style={styles.loadingText}>Emsal kararlar aranıyor...</p>
                </div>
              )}

              {/* Error */}
              {searchError && (
                <div style={styles.errorCard}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <circle cx="10" cy="10" r="10" fill="#FEE2E2" />
                    <path d="M10 7v3m0 3h.01" stroke="#DC2626" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                  <div>
                    <p style={styles.errorTitle}>Arama yapılamadı</p>
                    <p style={styles.errorDesc}>{searchError}</p>
                  </div>
                </div>
              )}

              {/* RAG AI Assistant UI */}
              {(aiResponse || aiStreaming) && (
                <div style={styles.aiCard} className="animate-fade-in">
                  <div style={styles.aiHeader}>
                    <div style={styles.aiHeaderLeft}>
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className={aiStreaming ? "animate-pulse" : ""}>
                        <rect width="18" height="18" rx="4" fill="var(--color-accent)" />
                        <path d="M4 9l3 3 7-7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span style={styles.aiTitle}>Legal Zeka AI Asistanı</span>
                    </div>
                    {aiStreaming && <span style={styles.aiStreamingBadge}>Yanıt Üretiliyor...</span>}
                  </div>
                  
                  <div style={styles.aiContent}>
                    {/* Render basic markdown/bolding simulated by regex */}
                    <p dangerouslySetInnerHTML={{ __html: aiResponse.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n\n/g, '<br/><br/>') }} />
                  </div>
                  
                  {aiSources.length > 0 && !aiStreaming && (
                    <div style={styles.aiSources}>
                      <span style={styles.aiSourceLabel}>Kaynaklar:</span>
                      {aiSources.map((s, index) => {
                        const status = s.verificationStatus === "verified" ? "Doğrulandı" : "Kontrol";
                        return (
                          <span key={`${s.document_id || s.karar_no || s.esas_no || index}-${index}`} style={styles.aiSourceTag}>
                            {`K${index + 1}`} · {s.origin || s.source_label || s.type || "Kaynak"} · {status}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {aiVerification && !aiStreaming && (
                    <div style={styles.trustPanel}>
                      <div style={styles.trustMetric}>
                        <span style={styles.trustLabel}>Güven</span>
                        <strong>%{Math.round((aiVerification.confidence || 0) * 100)}</strong>
                      </div>
                      <div style={styles.trustMetric}>
                        <span style={styles.trustLabel}>Doğrulanmış kaynak</span>
                        <strong>{aiVerification.verifiedSourceCount}/{aiSources.length}</strong>
                      </div>
                      <div style={styles.trustMetric}>
                        <span style={styles.trustLabel}>Kontrol gerektiren</span>
                        <strong>{aiVerification.needsReviewCount}</strong>
                      </div>
                    </div>
                  )}
                  {!aiStreaming && aiResponse && (
                    <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                      <button 
                        onClick={() => {
                          const newNote = addNote(aiResponse, "ai");
                          setNotes(getNotes());
                          setActiveNoteId(newNote.id);
                          alert("AI yanıtı notlarınıza eklendi!");
                        }}
                        style={{...styles.logoutBtn, fontSize: 12, padding: "6px 12px", background: "var(--color-bg-elevated)", color: "var(--color-text-primary)"}}
                      >
                        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 3h12a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1z" />
                          <path d="M8 7h4M8 11h4" />
                        </svg>
                        Notlarıma Ekle
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Results */}
              {searchResults && !searching && (
                <div style={styles.resultSection} className="animate-fade-in">
                  <div style={styles.resultHeader}>
                    <span style={styles.resultCount}>
                      <strong>&quot;{searchResults.query}&quot;</strong> için {searchResults.totalResults} sonuç
                    </span>
                    {searchResults.totalResults > 0 && lastSearch && (
                      <button
                        type="button"
                        onClick={() => triggerAI(lastSearch.query, lastSearch.filters)}
                        disabled={aiStreaming}
                        style={{ ...styles.logoutBtn, fontSize: 12, padding: "7px 12px", background: "var(--color-bg-elevated)", color: "var(--color-text-primary)" }}
                      >
                        {aiStreaming ? "Yanıt hazırlanıyor..." : "Kaynaklı AI Yanıtı Üret"}
                      </button>
                    )}
                  </div>

                  {searchResults.totalResults === 0 ? (
                    <div style={styles.emptyState}>
                      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="#D4D4D4" strokeWidth="1.5">
                        <circle cx="20" cy="20" r="14" />
                        <path d="M30 30l10 10" strokeLinecap="round" />
                        <path d="M14 20h12" strokeLinecap="round" />
                      </svg>
                      <p style={styles.emptyTitle}>Sonuç bulunamadı</p>
                      <p style={styles.emptyDesc}>
                        Güvenilir ve doğrulanmış sonuç bulunamadı. Daha dar bir hukuki kavram, mahkeme türü veya tarih aralığı deneyin.
                      </p>
                    </div>
                  ) : (
                    <div style={styles.resultList}>
                      {searchResults.results.map((result, index) => {
                        const stableKey = result.id || result.document_id || `${result.source || "source"}-${result.karar_no || result.esas_no || index}`;
                        const highlights = result.highlights || {};
                        const keywords = Array.isArray(result.anahtar_kelimeler) ? result.anahtar_kelimeler : [];
                        const snippet = result.snippet || result.ozet || result.metin || "Bu sonuç için gösterilebilir özet bulunamadı.";
                        const confidence = typeof result.confidence === "number" ? Math.round(result.confidence * 100) : null;
                        const cacheLabel = result.cache_status === "cached_mcp"
                          ? "Cache"
                          : result.source === "local"
                            ? "Yerel"
                            : "Canlı";
                        const verificationLabel = result.fetch_status === "fetched" || result.fetch_status === "verified" || result.fetch_status === "indexed"
                          ? "Doğrulandı"
                          : "Kontrol";

                        return (
                          <div key={stableKey} style={styles.resultCard} className="animate-slide-in">
                            <div style={styles.resultCardHeader}>
                              <div style={styles.resultTags}>
                                <span style={styles.tagMahkeme}>{result.mahkeme || result.court || "Mahkeme belirtilmemiş"}</span>
                                {(result.karar_yili || result.date) && <span style={styles.tagYil}>{result.karar_yili || result.date}</span>}
                                {result.karar_no && <span style={styles.tagNo}>{result.karar_no}</span>}
                                {result.source_label && <span style={styles.keywordTag}>{result.source_label}</span>}
                                <span style={cacheLabel === "Canlı" ? styles.liveTag : styles.cacheTag}>{cacheLabel}</span>
                                <span style={verificationLabel === "Doğrulandı" ? styles.verifiedTag : styles.reviewTag}>{verificationLabel}</span>
                              </div>
                              <span style={styles.resultScore}>
                                {confidence !== null ? `Güven: %${confidence}` : `Skor: ${Number(result.score || 0).toFixed(2)}`}
                              </span>
                            </div>

                            <h4 style={styles.resultTitle}>{result.konu || result.court || "Başlık belirtilmemiş"}</h4>

                            <div style={styles.resultSnippet}>
                              {Array.isArray(highlights.ozet) && highlights.ozet.length > 0 ? (
                                <p dangerouslySetInnerHTML={{ __html: highlights.ozet.join(' ... ') }} />
                              ) : Array.isArray(highlights.metin) && highlights.metin.length > 0 ? (
                                <p dangerouslySetInnerHTML={{ __html: highlights.metin.join(' ... ') }} />
                              ) : (
                                <p>{snippet}</p>
                              )}
                            </div>

                            {(keywords.length > 0 || result.matched_terms?.length > 0) && (
                              <div style={styles.resultKeywords}>
                                {(keywords.length > 0 ? keywords : result.matched_terms).map(kw => (
                                  <span key={kw} style={styles.keywordTag}>#{kw}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activePage === "recent" && (
            <div style={styles.historyPage} className="animate-fade-in">
              <div style={styles.historyHeader}>
                <div>
                  <h3 style={styles.subTitle}>Geçmiş Aramalarınız</h3>
                  <p style={{ color: "var(--color-text-tertiary)", fontSize: 14 }}>
                    Daha önce yaptığınız aramaları buradan görebilir veya silebilirsiniz.
                  </p>
                </div>
                {searchHistory.length > 0 && (
                  <button onClick={handleClearAllHistory} style={styles.clearAllBtn}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M2 3.5h10M4.5 3.5V2a1 1 0 011-1h3a1 1 0 011 1v1.5M5.5 6v4M8.5 6v4M3 3.5l1 8.5a1 1 0 001 1h4a1 1 0 001-1l1-8.5" />
                    </svg>
                    Tümünü Temizle
                  </button>
                )}
              </div>

              {historyLoading ? (
                <div style={styles.loadingBar}>
                  <div style={styles.loadingBarInner} />
                </div>
              ) : searchHistory.length === 0 ? (
                <div style={styles.emptyState}>
                  <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="#D4D4D4" strokeWidth="1.5">
                    <circle cx="24" cy="24" r="16" />
                    <path d="M24 16v8l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p style={styles.emptyTitle}>Henüz bir arama yapmadınız</p>
                </div>
              ) : (
                <div style={styles.historyList}>
                  {searchHistory.map(item => (
                    <div 
                      key={item.id} 
                      style={styles.historyCard}
                      onClick={() => handleReSearch(item.query, item.search_type)}
                    >
                      <div style={styles.historyCardLeft}>
                        {item.search_type === 'semantic' ? (
                          <div style={{...styles.historyIcon, background: '#DBEAFE', color: '#3B82F6'}}>
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M8 3v10M3 8h10" />
                            </svg>
                          </div>
                        ) : (
                          <div style={{...styles.historyIcon, background: '#F1F5F9', color: '#64748B'}}>
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M7 12a5 5 0 100-10 5 5 0 000 10zM14 14l-3.5-3.5" />
                            </svg>
                          </div>
                        )}
                        <div>
                          <p style={styles.historyQuery}>&quot;{item.query}&quot;</p>
                          <div style={styles.historyMeta}>
                            <span style={styles.historyType}>
                              {item.search_type === 'semantic' ? 'Semantik Arama' : 'Kelime Araması'}
                            </span>
                            <span>•</span>
                            <span style={styles.historyDate}>
                              {new Date(item.created_at).toLocaleString("tr-TR")}
                            </span>
                          </div>
                        </div>
                      </div>
                      <button 
                        onClick={(e) => handleDeleteHistory(item.id, e)} 
                        style={styles.deleteHistoryBtn}
                        title="Bu aramayı sil"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M12 4L4 12M4 4l8 8" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}



          {activePage === "notes" && (
            <div style={{flexDirection: "row", gap: 0, padding: 0, margin: 0, height: "100%", width: "100%", overflow: "hidden", display: "flex"}} className="animate-fade-in">
              {/* Left sidebar for notes */}
              <div style={{ width: 320, borderRight: "1px solid var(--color-border-subtle)", display: "flex", flexDirection: "column", background: "var(--color-bg-subtle)" }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--color-border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ fontSize: 18, fontWeight: 600, color: "var(--color-text-primary)" }}>Notlar</h3>
                  <button 
                    onClick={() => {
                      const newNote = addNote("", "manual");
                      setNotes(getNotes());
                      setActiveNoteId(newNote.id);
                    }}
                    style={{ background: "#000", border: "none", cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "var(--radius-sm)", transition: "opacity 0.2s" }}
                    onMouseOver={(e) => e.currentTarget.style.opacity = "0.8"}
                    onMouseOut={(e) => e.currentTarget.style.opacity = "1"}
                    title="Yeni Not Ekle"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                  </button>
                </div>
                <div style={{ flex: 1, overflowY: "auto" }}>
                  {notes.length === 0 ? (
                    <div style={{ padding: 20, textAlign: "center", color: "var(--color-text-tertiary)", fontSize: 13 }}>
                      Henüz notunuz yok. Yeni bir not oluşturun.
                    </div>
                  ) : (
                    notes.map(note => {
                      const firstLine = note.content.split('\n')[0].trim() || "Yeni Not";
                      const contentPreview = note.content.replace(firstLine, '').trim().slice(0, 40) || (firstLine === "Yeni Not" ? "" : "Ek metin yok...");
                      const isActive = activeNoteId === note.id;
                      
                      return (
                        <div 
                          key={note.id} 
                          onClick={() => setActiveNoteId(note.id)}
                          style={{
                            padding: "16px 20px",
                            borderBottom: "1px solid var(--color-border-subtle)",
                            background: isActive ? "var(--color-bg-elevated)" : "transparent",
                            cursor: "pointer",
                            transition: "background 0.2s"
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, alignItems: "center" }}>
                            <h4 style={{ fontSize: 14, fontWeight: isActive ? 600 : 500, color: "var(--color-text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "70%" }}>
                              {firstLine}
                            </h4>
                            <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", flexShrink: 0 }}>
                              {new Date(note.createdAt).toLocaleDateString("tr-TR")}
                            </span>
                          </div>
                          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {contentPreview}
                          </p>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Right content area */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--color-bg)", height: "100%" }}>
                {activeNoteId ? (
                  (() => {
                    const activeNote = notes.find(n => n.id === activeNoteId);
                    if (!activeNote) return null;
                    return (
                      <>
                        <div style={{ padding: "16px 28px", borderBottom: "1px solid var(--color-border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--color-bg-elevated)" }}>
                          <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
                            {new Date(activeNote.createdAt).toLocaleString("tr-TR")}
                            {activeNote.source === 'ai' && " • Yapay Zeka Notu"}
                          </span>
                          <button 
                            onClick={() => {
                              if (window.confirm("Bu notu silmek istediğinize emin misiniz?")) {
                                deleteNote(activeNote.id);
                                const newNotes = getNotes();
                                setNotes(newNotes);
                                setActiveNoteId(newNotes.length > 0 ? newNotes[0].id : null);
                              }
                            }}
                            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--color-text-secondary)" }}
                            title="Notu Sil"
                          >
                            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path d="M4 5h12M9 9v4M11 9v4M5 5v11a1 1 0 001 1h8a1 1 0 001-1V5M7 5V3a1 1 0 011-1h4a1 1 0 011 1v2" />
                            </svg>
                          </button>
                        </div>
                        <textarea
                          value={activeNote.content}
                          onChange={(e) => {
                            updateNote(activeNote.id, e.target.value);
                            setNotes(getNotes());
                          }}
                          placeholder="Notunuzu yazmaya başlayın..."
                          style={{
                            flex: 1,
                            border: "none",
                            resize: "none",
                            padding: "28px",
                            fontSize: 15,
                            lineHeight: 1.6,
                            background: "transparent",
                            color: "var(--color-text-primary)",
                            outline: "none"
                          }}
                        />
                      </>
                    )
                  })()
                ) : (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", color: "var(--color-text-tertiary)" }}>
                    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1">
                      <path d="M12 8h24a2 2 0 012 2v30l-14-7-14 7V10a2 2 0 012-2z" />
                    </svg>
                    <p style={{ marginTop: 12, fontSize: 14 }}>Görüntülemek veya düzenlemek için sol taraftan bir not seçin</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activePage === "devils_advocate" && (
            <div className="animate-fade-in" style={{ display: "flex", justifyContent: "center" }}>
              <DevilsAdvocate onSaveNote={(text) => {
                  const newNote = addNote(text, "ai");
                  setNotes(getNotes());
                  setActiveNoteId(newNote.id);
                  alert("Yapay zeka analizi notlarınıza eklendi!");
              }} />
            </div>
          )}

          {activePage === "contract_review" && (
            <div className="animate-fade-in" style={{ display: "flex", justifyContent: "center" }}>
              <ContractReview onSaveNote={(text) => {
                  const newNote = addNote(text, "ai");
                  setNotes(getNotes());
                  setActiveNoteId(newNote.id);
                  alert("Sözleşme analizi notlarınıza eklendi!");
              }} />
            </div>
          )}

          {activePage === "expert_agents" && (
            <div className="animate-fade-in" style={{ flex: 1, backgroundColor: 'var(--color-bg)', height: '100%', overflow: 'auto' }}>
              <ExpertAgents
                activeFirmId={activeFirm?.id}
                onSaveNote={(text) => {
                  const newNote = addNote(text, "ai");
                  setNotes(getNotes());
                  setActiveNoteId(newNote.id);
                  alert("Uzman ajan çıktısı notlarınıza eklendi!");
                }}
              />
            </div>
          )}

          {activePage === "tevkil" && (
            <div className="animate-fade-in" style={{ display: "flex", justifyContent: "center" }}>
              <TevkilBoard />
            </div>
          )}

          {activePage === "petitions" && (
            <div className="animate-fade-in" style={{ display: "flex", justifyContent: "center" }}>
              <PetitionManagement />
            </div>
          )}

          {activePage === "simulation" && (
            <div className="animate-fade-in" style={{ flex: 1, backgroundColor: 'var(--color-bg)', padding: '24px', height: '100%', overflow: 'hidden' }}>
              <Simulation />
            </div>
          )}

          {activePage === "criminal_execution" && (
            <div className="animate-fade-in" style={{ display: "flex", justifyContent: "center" }}>
              <ExecutionCalculator />
            </div>
          )}

          {activePage === "civil_execution" && (
            <div className="animate-fade-in" style={{ display: "flex", justifyContent: "center" }}>
              <CivilExecutionCalculator />
            </div>
          )}

          {activePage === "fee_calculator" && (
            <div className="animate-fade-in" style={{ display: "flex", justifyContent: "center" }}>
              <FeeCalculator />
            </div>
          )}

          {activePage === "financial_calculator" && (
            <div className="animate-fade-in" style={{ display: "flex", justifyContent: "center" }}>
              <FinancialCalculator />
            </div>
          )}

          {activePage === "term_calculator" && (
            <div className="animate-fade-in" style={{ display: "flex", justifyContent: "center" }}>
              <TermCalculator />
            </div>
          )}

          {activePage === "labor_calculator" && (
            <div className="animate-fade-in" style={{ display: "flex", justifyContent: "center" }}>
              <LaborCalculator />
            </div>
          )}

          {activePage === "compensation" && (
            <div className="animate-fade-in" style={{ display: "flex", justifyContent: "center" }}>
              <CompensationCalculator />
            </div>
          )}

          {activePage === "family_law" && (
            <div className="animate-fade-in" style={{ display: "flex", justifyContent: "center" }}>
              <FamilyLawCalculator />
            </div>
          )}

          {activePage === "inheritance_law" && (
            <div className="animate-fade-in" style={{ display: "flex", justifyContent: "center" }}>
              <InheritanceCalculator />
            </div>
          )}

          {activePage === "crm" && (
            <div className="animate-fade-in" style={{ flex: 1, backgroundColor: 'var(--color-bg)', padding: '24px', height: '100%', overflow: 'hidden' }}>
              <CRMBoard activeFirmId={activeFirm?.id} />
            </div>
          )}

          {activePage === "finance" && (
            <div className="animate-fade-in" style={{ flex: 1, backgroundColor: 'var(--color-bg)', height: '100%', overflow: 'hidden' }}>
              <FinanceDashboard activeFirmId={activeFirm?.id} />
            </div>
          )}

          {activePage === "corporate" && (
            <div className="animate-fade-in" style={{ flex: 1, backgroundColor: 'var(--color-bg)', height: '100%', overflow: 'hidden' }}>
              <CorporateNetwork activeFirmId={activeFirm?.id} />
            </div>
          )}

          {activePage === "firm_management" && (
            <div className="animate-fade-in" style={{ flex: 1, backgroundColor: 'var(--color-bg)', height: '100%', overflow: 'hidden' }}>
              <FirmManagement 
                user={user} 
                onFirmChange={(firmId) => {
                  getMyFirms().then(res => {
                    const firm = res.data.find(f => f.id === firmId);
                    if (firm) setActiveFirm(firm);
                  });
                }} 
              />
            </div>
          )}

          {activePage === "firm_templates" && (
            <div className="animate-fade-in" style={{ flex: 1, backgroundColor: 'var(--color-bg)', height: '100%', overflow: 'auto' }}>
              <FirmTemplates firmId={activeFirm?.id} />
            </div>
          )}

          {activePage === "cases" && (
            <div className="animate-fade-in" style={{ flex: 1, backgroundColor: 'var(--color-bg)', height: '100%', overflow: 'auto' }}>
              <CaseManagement firmId={activeFirm?.id} />
            </div>
          )}

          {activePage === "tasks" && (
            <div className="animate-fade-in" style={{ flex: 1, backgroundColor: 'var(--color-bg)', height: '100%', overflow: 'auto' }}>
              <TaskBoard firmId={activeFirm?.id} />
            </div>
          )}

          {activePage === "chat" && (
            <div className="animate-fade-in" style={{ flex: 1, backgroundColor: 'var(--color-bg)', height: '100%', overflow: 'auto' }}>
              <InternalChat firmId={activeFirm?.id} user={user} />
            </div>
          )}

          {activePage === "collections" && (
            <div className="animate-fade-in" style={{ flex: 1, height: '100%', overflow: 'hidden' }}>
              <CollectionsManagement />
            </div>
          )}

          {activePage === "uyap" && (
            <div className="animate-fade-in" style={{ flex: 1, backgroundColor: 'var(--color-bg)', height: '100%', overflow: 'auto' }}>
              <UyapIntegration firmId={activeFirm?.id} />
            </div>
          )}

          {activePage === "deadline_tracker" && (
            <div className="animate-fade-in" style={{ flex: 1, backgroundColor: 'var(--color-bg)', height: '100%', overflow: 'auto' }}>
              <DeadlineTracker firmId={activeFirm?.id} />
            </div>
          )}

          {activePage === "law_timeline" && (
            <div className="animate-fade-in" style={{ flex: 1, backgroundColor: 'var(--color-bg)', height: '100%', overflow: 'auto' }}>
              <LawTimeline />
            </div>
          )}

          {activePage === "subscription" && (
            <div style={styles.subscriptionPage} className="animate-fade-in">
              <h3 style={styles.subTitle}>Abonelik Bilgileri</h3>
              {subscription ? (
                <div style={styles.subCard}>
                  <div style={styles.subRow}>
                    <span style={styles.subLabel}>Plan</span>
                    <span style={styles.subValue}>{subscription.planName}</span>
                  </div>
                  <div style={styles.subDivider} />
                  <div style={styles.subRow}>
                    <span style={styles.subLabel}>Arama Limiti</span>
                    <span style={styles.subValue}>
                      {subscription.maxSearchLimit === -1 ? "Sınırsız" : subscription.maxSearchLimit}
                    </span>
                  </div>
                  <div style={styles.subDivider} />
                  <div style={styles.subRow}>
                    <span style={styles.subLabel}>Bitiş Tarihi</span>
                    <span style={styles.subValue}>
                      {new Date(subscription.endDate).toLocaleDateString("tr-TR")}
                    </span>
                  </div>
                  <div style={styles.subDivider} />
                  <div style={styles.subRow}>
                    <span style={styles.subLabel}>Durum</span>
                    <span style={{
                      ...styles.subBadge,
                      background: subscription.isActive ? "#DCFCE7" : "#FEE2E2",
                      color: subscription.isActive ? "#16A34A" : "#DC2626",
                    }}>
                      {subscription.isActive ? "Aktif" : "Pasif"}
                    </span>
                  </div>
                </div>
              ) : (
                <div style={styles.subCard}>
                  <p style={{ color: "var(--color-text-tertiary)", fontSize: 14 }}>
                    Aktif abonelik bilgisi yüklenemedi.
                  </p>
                </div>
              )}
            </div>
          )}

          {activePage === "settings" && (
            <div style={styles.settingsPage} className="animate-fade-in">
              <div style={styles.settingsHeader}>
                <h3 style={styles.subTitle}>Profil ve Ayarlar</h3>
                <p style={{ color: "var(--color-text-tertiary)", fontSize: 14 }}>
                  Hesap bilgilerinizi ve şifrenizi buradan güncelleyebilirsiniz.
                </p>
              </div>

              {settingsMessage.text && (
                <div style={{
                  ...styles.alertBox,
                  backgroundColor: settingsMessage.type === "success" ? "#DCFCE7" : "#FEE2E2",
                  color: settingsMessage.type === "success" ? "#16A34A" : "#DC2626",
                  border: `1px solid ${settingsMessage.type === "success" ? "#BBF7D0" : "#FECACA"}`
                }}>
                  {settingsMessage.text}
                </div>
              )}

              <div style={styles.settingsGrid}>
                {/* Profil Güncelleme Formu */}
                <div style={styles.settingsCard}>
                  <h4 style={styles.settingsCardTitle}>Kişisel Bilgiler</h4>
                  <form onSubmit={handleUpdateProfile} style={styles.settingsForm}>
                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>Ad</label>
                      <input 
                        type="text" 
                        style={styles.formInput} 
                        value={profileForm.firstName}
                        onChange={(e) => setProfileForm({...profileForm, firstName: e.target.value})}
                        required
                      />
                    </div>
                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>Soyad</label>
                      <input 
                        type="text" 
                        style={styles.formInput} 
                        value={profileForm.lastName}
                        onChange={(e) => setProfileForm({...profileForm, lastName: e.target.value})}
                        required
                      />
                    </div>
                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>E-posta (Değiştirilemez)</label>
                      <input 
                        type="email" 
                        style={{...styles.formInput, backgroundColor: "var(--color-bg-muted)", color: "var(--color-text-tertiary)"}} 
                        value={user.email}
                        disabled
                      />
                    </div>
                    <button 
                      type="submit" 
                      style={{...styles.saveBtn, color: "#000000"}}
                      disabled={settingsLoading}
                    >
                      {settingsLoading ? "Kaydediliyor..." : "Bilgileri Güncelle"}
                    </button>
                  </form>
                </div>

                {/* Şifre Güncelleme Formu */}
                <div style={styles.settingsCard}>
                  <h4 style={styles.settingsCardTitle}>Şifre Değiştir</h4>
                  <form onSubmit={handleUpdatePassword} style={styles.settingsForm}>
                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>Mevcut Şifre</label>
                      <input 
                        type="password" 
                        style={styles.formInput} 
                        value={passwordForm.currentPassword}
                        onChange={(e) => setPasswordForm({...passwordForm, currentPassword: e.target.value})}
                        required
                      />
                    </div>
                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>Yeni Şifre</label>
                      <input 
                        type="password" 
                        style={styles.formInput} 
                        value={passwordForm.newPassword}
                        onChange={(e) => setPasswordForm({...passwordForm, newPassword: e.target.value})}
                        required
                        minLength={6}
                      />
                    </div>
                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>Yeni Şifre (Tekrar)</label>
                      <input 
                        type="password" 
                        style={styles.formInput} 
                        value={passwordForm.confirmPassword}
                        onChange={(e) => setPasswordForm({...passwordForm, confirmPassword: e.target.value})}
                        required
                        minLength={6}
                      />
                    </div>
                    <button 
                      type="submit" 
                      style={{...styles.saveBtn, backgroundColor: "var(--color-text-primary)", color: "var(--color-bg)"}}
                      disabled={settingsLoading}
                    >
                      {settingsLoading ? "Kaydediliyor..." : "Şifreyi Güncelle"}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Guest Limit Modal */}
      {showGuestModal && (
        <div style={guestModalStyles.overlay} onClick={() => setShowGuestModal(false)}>
          <div style={guestModalStyles.modal} onClick={(e) => e.stopPropagation()} className="animate-fade-in">
            <button onClick={() => setShowGuestModal(false)} style={guestModalStyles.closeBtn}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M15 5L5 15M5 5l10 10" />
              </svg>
            </button>

            <div style={guestModalStyles.iconCircle}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>

            <h2 style={guestModalStyles.title}>Günlük Limitinize Ulaştınız</h2>
            <p style={guestModalStyles.desc}>
              Misafir kullanıcılar günde en fazla <strong>3 arama</strong> yapabilir. 
              Sınırsız arama, AI hukuki analiz ve arama geçmişi gibi tüm özelliklere erişmek için ücretsiz kayıt olun.
            </p>

            <div style={guestModalStyles.features}>
              {[
                "Sınırsız emsal karar araması",
                "AI destekli hukuki analiz",
                "Arama geçmişi ve kaydetme",
                "Kişiselleştirilmiş öneriler"
              ].map((f) => (
                <div key={f} style={guestModalStyles.featureRow}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round">
                    <path d="M3 8l3.5 3.5L13 5" />
                  </svg>
                  <span>{f}</span>
                </div>
              ))}
            </div>

            <button 
              onClick={() => router.push("/auth")} 
              style={guestModalStyles.primaryBtn}
            >
              Ücretsiz Kayıt Ol
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </button>
            <button 
              onClick={() => router.push("/auth")} 
              style={guestModalStyles.secondaryBtn}
            >
              Zaten hesabım var · Giriş Yap
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Styles
   ============================================================ */

const loadingStyles = {
  wrapper: {
    height: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--color-bg)",
  },
  spinner: {
    width: 24,
    height: 24,
    border: "2px solid var(--color-border)",
    borderTopColor: "var(--color-accent)",
    borderRadius: "50%",
    animation: "spin 0.6s linear infinite",
  },
};

const styles = {
  layout: {
    display: "flex",
    height: "100vh",
    overflow: "hidden",
    background: "var(--color-bg)",
  },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    minWidth: 0,
  },

  /* Top bar */
  topBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 28px",
    borderBottom: "1px solid var(--color-border-subtle)",
    background: "var(--color-bg-elevated)",
    flexShrink: 0,
  },
  topBarLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  pageTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: "var(--color-text-primary)",
    letterSpacing: "-0.01em",
  },
  topBarRight: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  logoutBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 14px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--color-border)",
    background: "var(--color-bg-elevated)",
    color: "var(--color-text-secondary)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    transition: "all var(--transition-fast)",
  },

  /* Content */
  content: {
    flex: 1,
    overflowY: "auto",
    padding: "40px 28px",
  },

  /* Search page */
  searchPage: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 32,
    paddingTop: 40,
  },

  /* Results */
  resultSection: {
    width: "100%",
    maxWidth: 720,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  resultHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  resultCount: {
    fontSize: 14,
    color: "var(--color-text-secondary)",
  },

  /* Loading */
  loadingBar: {
    width: "100%",
    height: 3,
    borderRadius: 999,
    background: "var(--color-bg-muted)",
    overflow: "hidden",
  },
  loadingBarInner: {
    width: "40%",
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(90deg, var(--color-accent), #60A5FA)",
    animation: "shimmer 1.2s ease-in-out infinite",
  },
  loadingText: {
    fontSize: 13,
    color: "var(--color-text-tertiary)",
    textAlign: "center",
  },

  /* Error card */
  errorCard: {
    width: "100%",
    maxWidth: 720,
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "16px 20px",
    borderRadius: "var(--radius-md)",
    background: "#FEF2F2",
    border: "1px solid #FECACA",
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "#DC2626",
    marginBottom: 2,
  },
  errorDesc: {
    fontSize: 13,
    color: "#B91C1C",
  },

  /* AI Assistant Card */
  aiCard: {
    width: "100%",
    maxWidth: 720,
    background: "var(--color-bg-subtle)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-lg)",
    padding: "20px 24px",
    boxShadow: "var(--shadow-sm)",
  },
  aiHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  aiHeaderLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  aiTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--color-accent)",
  },
  aiStreamingBadge: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--color-accent)",
    background: "var(--color-accent-light)",
    padding: "2px 8px",
    borderRadius: 999,
    animation: "pulse-ring 1.5s infinite",
  },
  aiContent: {
    fontSize: 14,
    lineHeight: 1.6,
    color: "var(--color-text-primary)",
    marginBottom: 16,
  },
  aiSources: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    borderTop: "1px solid var(--color-border-subtle)",
    paddingTop: 12,
  },
  aiSourceLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--color-text-secondary)",
  },
  aiSourceTag: {
    fontSize: 11,
    color: "var(--color-accent)",
    background: "var(--color-accent-light)",
    border: "1px solid var(--color-border)",
    padding: "2px 6px",
    borderRadius: 4,
  },
  trustPanel: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTop: "1px solid var(--color-border-subtle)",
  },
  trustMetric: {
    padding: "8px 10px",
    borderRadius: 8,
    background: "var(--color-bg-elevated)",
    border: "1px solid var(--color-border-subtle)",
    display: "flex",
    flexDirection: "column",
    gap: 3,
    minWidth: 0,
  },
  trustLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: "var(--color-text-tertiary)",
    textTransform: "uppercase",
    letterSpacing: 0,
  },

  /* Empty state */
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    padding: "48px 20px",
    textAlign: "center",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: "var(--color-text-secondary)",
  },
  emptyDesc: {
    fontSize: 13,
    color: "var(--color-text-tertiary)",
    maxWidth: 320,
  },

  /* Search Result Cards */
  resultList: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  resultCard: {
    padding: "20px",
    borderRadius: "var(--radius-lg)",
    background: "var(--color-bg-elevated)",
    border: "1px solid var(--color-border-subtle)",
    boxShadow: "var(--shadow-xs)",
    transition: "all var(--transition-fast)",
    cursor: "pointer",
  },
  resultCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  resultTags: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
  },
  tagMahkeme: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--color-accent)",
    background: "var(--color-accent-light)",
    padding: "2px 8px",
    borderRadius: "var(--radius-sm)",
  },
  tagYil: {
    fontSize: 12,
    fontWeight: 500,
    color: "var(--color-text-secondary)",
    background: "var(--color-bg-muted)",
    padding: "2px 8px",
    borderRadius: "var(--radius-sm)",
  },
  tagNo: {
    fontSize: 12,
    fontWeight: 500,
    color: "var(--color-text-secondary)",
    border: "1px solid var(--color-border)",
    padding: "1px 8px",
    borderRadius: "var(--radius-sm)",
  },
  resultScore: {
    fontSize: 11,
    color: "var(--color-text-tertiary)",
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: "var(--color-text-primary)",
    marginBottom: 8,
  },
  resultSnippet: {
    fontSize: 14,
    color: "var(--color-text-secondary)",
    lineHeight: 1.6,
    marginBottom: 14,
  },
  resultKeywords: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
  },
  keywordTag: {
    fontSize: 11,
    color: "var(--color-text-tertiary)",
    background: "var(--color-bg-subtle)",
    padding: "2px 8px",
    borderRadius: 999,
  },
  cacheTag: {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--color-text-secondary)",
    background: "var(--color-bg-muted)",
    border: "1px solid var(--color-border-subtle)",
    padding: "2px 8px",
    borderRadius: 999,
  },
  liveTag: {
    fontSize: 11,
    fontWeight: 700,
    color: "#047857",
    background: "#D1FAE5",
    border: "1px solid #A7F3D0",
    padding: "2px 8px",
    borderRadius: 999,
  },
  verifiedTag: {
    fontSize: 11,
    fontWeight: 700,
    color: "#166534",
    background: "#DCFCE7",
    border: "1px solid #BBF7D0",
    padding: "2px 8px",
    borderRadius: 999,
  },
  reviewTag: {
    fontSize: 11,
    fontWeight: 700,
    color: "#92400E",
    background: "#FEF3C7",
    border: "1px solid #FDE68A",
    padding: "2px 8px",
    borderRadius: 999,
  },

  /* Placeholder pages */
  placeholderPage: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingTop: 120,
    textAlign: "center",
  },
  placeholderTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: "var(--color-text-secondary)",
  },
  placeholderDesc: {
    fontSize: 14,
    color: "var(--color-text-tertiary)",
  },

  /* Subscription page */
  subscriptionPage: {
    maxWidth: 520,
  },
  subTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: "var(--color-text-primary)",
    marginBottom: 20,
  },
  subCard: {
    padding: "20px 24px",
    borderRadius: "var(--radius-lg)",
    border: "1px solid var(--color-border-subtle)",
    background: "var(--color-bg-elevated)",
    boxShadow: "var(--shadow-xs)",
  },
  subRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 0",
  },
  subLabel: {
    fontSize: 14,
    color: "var(--color-text-secondary)",
  },
  subValue: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--color-text-primary)",
  },
  subDivider: {
    height: 1,
    background: "var(--color-border-subtle)",
  },
  subBadge: {
    fontSize: 12,
    fontWeight: 600,
    padding: "3px 10px",
    borderRadius: 999,
  },

  /* History Page */
  historyPage: {
    maxWidth: 720,
    width: "100%",
    margin: "0 auto",
  },
  historyHeader: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: 16,
    marginBottom: 24,
    paddingBottom: 16,
    borderBottom: "1px solid var(--color-border)",
  },
  clearAllBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    background: "#FEF2F2",
    color: "#DC2626",
    border: "1px solid #FECACA",
    borderRadius: "var(--radius-sm)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    transition: "all var(--transition-fast)",
  },
  historyList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  historyCard: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px",
    background: "var(--color-bg-elevated)",
    border: "1px solid var(--color-border-subtle)",
    borderRadius: "var(--radius-md)",
    cursor: "pointer",
    transition: "all var(--transition-fast)",
    boxShadow: "var(--shadow-xs)",
  },
  historyCardLeft: {
    display: "flex",
    alignItems: "center",
    gap: 16,
  },
  historyIcon: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  historyQuery: {
    fontSize: 15,
    fontWeight: 600,
    color: "var(--color-text-primary)",
    marginBottom: 4,
  },
  historyMeta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    color: "var(--color-text-tertiary)",
  },
  historyType: {
    fontWeight: 500,
    color: "var(--color-text-secondary)",
  },
  historyDate: {
    color: "var(--color-text-tertiary)",
  },
  deleteHistoryBtn: {
    background: "transparent",
    border: "none",
    color: "#9CA3AF",
    cursor: "pointer",
    padding: 8,
    borderRadius: "var(--radius-sm)",
    transition: "all var(--transition-fast)",
  },

  /* Settings Page */
  settingsPage: {
    maxWidth: 800,
    width: "100%",
  },
  settingsHeader: {
    marginBottom: 24,
  },
  settingsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 24,
  },
  settingsCard: {
    padding: "24px",
    background: "var(--color-bg-elevated)",
    border: "1px solid var(--color-border-subtle)",
    borderRadius: "var(--radius-lg)",
    boxShadow: "var(--shadow-xs)",
  },
  settingsCardTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: "var(--color-text-primary)",
    marginBottom: 20,
    paddingBottom: 12,
    borderBottom: "1px solid var(--color-border-subtle)",
  },
  settingsForm: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: 500,
    color: "var(--color-text-secondary)",
  },
  formInput: {
    padding: "10px 14px",
    fontSize: 14,
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-border)",
    background: "var(--color-bg)",
    color: "var(--color-text-primary)",
    outline: "none",
    transition: "all var(--transition-fast)",
  },
  saveBtn: {
    marginTop: 8,
    padding: "10px 16px",
    background: "var(--color-accent)",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius-md)",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    transition: "all var(--transition-fast)",
    alignSelf: "flex-start",
  },
  alertBox: {
    padding: "12px 16px",
    borderRadius: "var(--radius-md)",
    marginBottom: 24,
    fontSize: 14,
    fontWeight: 500,
  },
};

const guestModalStyles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0, 0, 0, 0.5)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  modal: {
    position: "relative",
    width: "100%",
    maxWidth: 440,
    margin: "0 20px",
    padding: "40px 32px 32px",
    background: "var(--color-bg-elevated)",
    borderRadius: "var(--radius-lg)",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    border: "1px solid var(--color-border-subtle)",
  },
  closeBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    color: "var(--color-text-tertiary)",
    padding: 4,
    borderRadius: "var(--radius-sm)",
    transition: "all var(--transition-fast)",
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: "50%",
    background: "rgba(37, 99, 235, 0.1)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: "var(--color-text-primary)",
    marginBottom: 8,
    letterSpacing: "-0.02em",
  },
  desc: {
    fontSize: 14,
    color: "var(--color-text-secondary)",
    lineHeight: 1.6,
    marginBottom: 24,
  },
  features: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    width: "100%",
    marginBottom: 28,
    textAlign: "left",
  },
  featureRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--color-text-secondary)",
    fontWeight: 500,
  },
  primaryBtn: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "12px 24px",
    background: "#2563EB",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius-md)",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all var(--transition-fast)",
    marginBottom: 10,
  },
  secondaryBtn: {
    width: "100%",
    padding: "10px 24px",
    background: "transparent",
    color: "var(--color-text-secondary)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    transition: "all var(--transition-fast)",
  },
};
