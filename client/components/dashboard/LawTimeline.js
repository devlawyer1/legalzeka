"use client";

import { useState, useEffect } from "react";
import { ScrollText, Search, AlertTriangle, Book, Calendar, FileText, Link as LinkIcon, CheckCircle, RefreshCw, X } from "lucide-react";

export default function LawTimeline() {
  const [searchQuery, setSearchQuery] = useState("");
  const [targetDate, setTargetDate] = useState(new Date().toISOString().split("T")[0]);
  const [results, setResults] = useState([]);
  const [history, setHistory] = useState([]);
  const [lawList, setLawList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedLaw, setSelectedLaw] = useState(null);
  const [activeView, setActiveView] = useState("browse"); // browse | search | history
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Sayfa yüklendiğinde kanun kataloğunu çek
  useEffect(() => {
    loadLawList();
  }, []);

  const loadLawList = async () => {
    try {
      const { getLawList } = await import("@/lib/api");
      const res = await getLawList();
      setLawList(res.data || []);
    } catch (err) {
      console.error("Kanun listesi yüklenemedi:", err);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      const { searchLaws } = await import("@/lib/api");
      const res = await searchLaws(searchQuery, targetDate);
      setResults(res.data || []);
      setActiveView("search");
    } catch (err) {
      console.error("Arama hatası:", err);
      setError(err.message || "Arama sırasında bir hata oluştu.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleViewHistory = async (lawNumber, articleNumber) => {
    setLoading(true);
    setError(null);
    try {
      const { getLawHistory } = await import("@/lib/api");
      const res = await getLawHistory(lawNumber, articleNumber);
      setHistory(res.data || []);
      setSelectedLaw({ lawNumber, articleNumber });
      setActiveView("history");
    } catch (err) {
      console.error("Geçmiş yüklenemedi:", err);
      setError(err.message || "Versiyon geçmişi yüklenirken bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickSearch = (lawNumber, lawName) => {
    setSearchQuery(lawName || lawNumber);
    setActiveView("search");
    setLoading(true);
    setError(null);
    setHasSearched(true);
    import("@/lib/api").then(({ searchLaws }) => {
      searchLaws(lawName || lawNumber, targetDate)
        .then((res) => {
          setResults(res.data || []);
        })
        .catch((err) => {
          console.error("Arama hatası:", err);
          setError(err.message || "Arama sırasında bir hata oluştu.");
          setResults([]);
        })
        .finally(() => setLoading(false));
    });
  };

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <h2 style={s.title}>
            <span style={s.titleIcon}><ScrollText size={26} /></span>
            Kanun ve Mevzuat Versiyonlama
          </h2>
          <p style={s.subtitle}>
            Geçmiş tarihteki kanun metinlerine erişin · Time-Travel özelliği ile tarihsel karşılaştırma yapın
          </p>
        </div>
      </div>

      {/* Search Form */}
      <form onSubmit={handleSearch} style={s.searchForm}>
        <div style={s.searchRow}>
          <div style={{ flex: 3, minWidth: 0 }}>
            <label style={s.label}>Kanun / Madde Ara</label>
            <input
              style={s.input}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Örn: Borçlar Kanunu, İş Kanunu, 6098, Madde 344..."
            />
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={s.label}>Tarih (Time-Travel)</label>
            <input
              type="date"
              style={s.input}
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>
          <button type="submit" style={s.searchBtn} disabled={loading || !searchQuery.trim()}>
            {loading ? (
              <span style={s.spinner}><RefreshCw size={14} /></span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Search size={14} /> Ara</span>
            )}
          </button>
        </div>
        <div style={s.hint}>
          Seçtiğiniz tarihteki geçerli kanun metni gösterilir. Farklı tarih seçerek eski versiyonları karşılaştırabilirsiniz.
        </div>
      </form>

      {/* Error */}
      {error && (
        <div style={s.errorBox}>
          <span style={{ marginRight: 8, display: 'flex' }}><AlertTriangle size={18} /></span>
          {error}
          <button onClick={() => setError(null)} style={s.errorClose}><X size={16} /></button>
        </div>
      )}

      {/* Law Catalog — shown when no search done yet */}
      {activeView === "browse" && lawList.length > 0 && (
        <div style={s.catalogSection}>
          <h3 style={s.sectionTitle}><span style={{display: 'inline-flex', alignItems: 'center', gap: 6}}><Book size={18} /> Mevzuat Kataloğu</span></h3>
          <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", marginBottom: 16 }}>
            Veritabanında kayıtlı {lawList.length} kanun bulunuyor. Hızlı erişim için tıklayın:
          </p>
          <div style={s.catalogGrid}>
            {lawList.map((law, idx) => (
              <button
                key={idx}
                style={s.catalogCard}
                onClick={() => handleQuickSearch(law.law_number, law.law_name)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-accent)";
                  e.currentTarget.style.background = "rgba(0,112,243,0.04)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-border-subtle)";
                  e.currentTarget.style.background = "var(--color-bg-elevated)";
                }}
              >
                <span style={s.catalogNumber}>{law.law_number}</span>
                <span style={s.catalogName}>{law.law_name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search Results */}
      {activeView === "search" && (
        <div style={s.results}>
          {results.length > 0 && (
            <>
              <div style={s.resultHeader}>
                <h3 style={s.sectionTitle}>
                  Sonuçlar ({results.length}) — {new Date(targetDate).toLocaleDateString("tr-TR")} tarihine göre
                </h3>
                <button onClick={() => { setActiveView("browse"); setHasSearched(false); setResults([]); }} style={s.backBtn}>
                  ← Kataloğa Dön
                </button>
              </div>
              {results.map((law, idx) => (
                <div key={idx} style={s.lawCard}>
                  <div style={s.lawHeader}>
                    <div style={s.lawHeaderLeft}>
                      <span style={s.lawNumber}>{law.law_number}</span>
                      <span style={s.lawName}>{law.law_name}</span>
                    </div>
                    <button
                      onClick={() => handleViewHistory(law.law_number, law.article_number)}
                      style={s.historyBtn}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-accent)"; e.currentTarget.style.color = "var(--color-text-inverse)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "var(--color-bg-subtle)"; e.currentTarget.style.color = "var(--color-text-secondary)"; }}
                    >
                      <span style={{display: 'flex', alignItems: 'center', gap: 6}}><ScrollText size={14} /> Değişiklik Geçmişi</span>
                    </button>
                  </div>
                  {law.article_number && (
                    <div style={s.articleBadge}>
                      Madde {law.article_number} {law.article_title ? `— ${law.article_title}` : ""}
                    </div>
                  )}
                  <div style={s.articleText}>{law.article_text}</div>
                  <div style={s.lawMeta}>
                    <span style={s.metaTag}>
                      <span style={{display: 'inline-flex', alignItems: 'center', gap: 4}}><Calendar size={12} /> Yürürlük:</span> {new Date(law.effective_from).toLocaleDateString("tr-TR")}
                      {law.effective_to ? ` → ${new Date(law.effective_to).toLocaleDateString("tr-TR")}` : ""}
                    </span>
                    {!law.effective_to && <span style={s.activeBadge}>● Güncel</span>}
                    {law.effective_to && <span style={s.expiredBadge}>○ Tarihi Versiyon</span>}
                  </div>
                </div>
              ))}
            </>
          )}

          {results.length === 0 && !loading && hasSearched && (
            <div style={s.empty}>
              <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}><Search size={40} /></div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Sonuç Bulunamadı</div>
              <div>
                &quot;<strong>{searchQuery}</strong>&quot; araması için {new Date(targetDate).toLocaleDateString("tr-TR")} tarihinde sonuç bulunamadı.
                <br />Farklı bir anahtar kelime veya kanun numarası deneyin.
              </div>
              <button onClick={() => { setActiveView("browse"); setHasSearched(false); }} style={{ ...s.backBtn, marginTop: 16 }}>
                ← Kataloğa Dön
              </button>
            </div>
          )}
        </div>
      )}

      {/* History View */}
      {activeView === "history" && (
        <div style={s.results}>
          <div style={s.resultHeader}>
            <h3 style={s.sectionTitle}>
              <span style={{display: 'inline-flex', alignItems: 'center', gap: 6}}><ScrollText size={18} /> Değişiklik Geçmişi:</span> {selectedLaw?.lawNumber} {selectedLaw?.articleNumber ? `Madde ${selectedLaw.articleNumber}` : ""}
            </h3>
            <button onClick={() => setActiveView("search")} style={s.backBtn}>← Aramaya Dön</button>
          </div>

          {history.length === 0 ? (
            <div style={s.empty}>
              <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}><FileText size={40} /></div>
              <div>Versiyon geçmişi bulunamadı.</div>
            </div>
          ) : (
            <div style={s.historyTimeline}>
              {history.map((ver, idx) => {
                const isCurrent = idx === 0 && !ver.effective_to;
                return (
                  <div key={idx} style={s.timelineItem}>
                    <div style={s.timelineDot(isCurrent)} />
                    {idx < history.length - 1 && <div style={s.timelineLine} />}
                    <div style={{ ...s.versionCard, borderLeftColor: isCurrent ? "#22C55E" : "var(--color-border)" }}>
                      <div style={s.versionHeader}>
                        <span style={{
                          ...s.versionBadge,
                          background: isCurrent ? "rgba(34,197,94,0.12)" : "rgba(107,114,128,0.08)",
                          color: isCurrent ? "var(--color-success)" : "var(--color-text-tertiary)",
                          display: 'flex', alignItems: 'center', gap: 4
                        }}>
                          {isCurrent ? <><CheckCircle size={12} /> Güncel Versiyon</> : <><FileText size={12} /> Eski Versiyon ({idx})</>}
                        </span>
                        <span style={s.versionDate}>
                          {new Date(ver.effective_from).toLocaleDateString("tr-TR")}
                          {ver.effective_to ? ` → ${new Date(ver.effective_to).toLocaleDateString("tr-TR")}` : " → Hâlâ Yürürlükte"}
                        </span>
                      </div>
                      {ver.article_title && (
                        <div style={s.versionTitle}>{ver.article_title}</div>
                      )}
                      <div style={s.articleText}>{ver.article_text}</div>
                      {ver.source_url && (
                        <a href={ver.source_url} target="_blank" rel="noreferrer" style={s.sourceLink}>
                          <span style={{display: 'flex', alignItems: 'center', gap: 4}}><LinkIcon size={12} /> Resmi Kaynak</span>
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Initial Empty state (no catalog loaded) */}
      {activeView === "browse" && lawList.length === 0 && !loading && (
        <div style={s.emptyState}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }}>
            <path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
          </svg>
          <h3 style={{ fontSize: 18, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 8 }}>Kanun Versiyonlama</h3>
          <p style={{ fontSize: 14, color: "var(--color-text-tertiary)", maxWidth: 400, lineHeight: 1.6 }}>
            Bir kanun veya madde arayarak, seçtiğiniz tarihteki geçerli metni görüntüleyin.
            Hukukta olayın gerçekleştiği tarihteki kanun maddesi geçerlidir.
          </p>
        </div>
      )}

      {/* Loading overlay */}
      {loading && (
        <div style={s.loadingOverlay}>
          <div style={s.loadingSpinner} />
          <div style={{ marginTop: 12, color: "var(--color-text-tertiary)" }}>Yükleniyor...</div>
        </div>
      )}
    </div>
  );
}

const s = {
  container: { maxWidth: 900, margin: "0 auto", padding: 20, position: "relative" },
  header: { marginBottom: 24 },
  title: { fontSize: 22, fontWeight: 700, color: "var(--color-text-primary)", margin: 0, display: "flex", alignItems: "center", gap: 8 },
  titleIcon: { fontSize: 26 },
  subtitle: { fontSize: 13, color: "var(--color-text-tertiary)", marginTop: 4 },

  searchForm: { background: "var(--color-bg-elevated)", borderRadius: 12, border: "1px solid var(--color-border-subtle)", padding: 20, marginBottom: 20 },
  searchRow: { display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" },
  label: { fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 },
  input: { width: "100%", padding: "10px 14px", fontSize: 14, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-text-primary)", outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" },
  searchBtn: { padding: "10px 24px", fontSize: 14, fontWeight: 600, background: "var(--color-accent)", color: "var(--color-text-inverse)", border: "none", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap", transition: "opacity 0.2s", minWidth: 90 },
  spinner: { display: "flex", alignItems: "center", justifyContent: "center", animation: "spin 1s linear infinite" },
  hint: { fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 10 },

  errorBox: { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, padding: "12px 16px", fontSize: 14, color: "var(--color-error)", marginBottom: 16, display: "flex", alignItems: "center" },
  errorClose: { marginLeft: "auto", background: "none", border: "none", color: "var(--color-error)", cursor: "pointer", display: "flex", alignItems: "center", padding: "0 4px" },

  catalogSection: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 12, margin: 0 },
  catalogGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 },
  catalogCard: {
    display: "flex", flexDirection: "column", gap: 6, padding: "14px 16px",
    background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)", borderRadius: 10,
    cursor: "pointer", textAlign: "left", transition: "all 0.2s", outline: "none"
  },
  catalogNumber: { fontSize: 12, fontWeight: 700, color: "var(--color-accent)", background: "rgba(0,112,243,0.08)", padding: "2px 8px", borderRadius: 6, width: "fit-content" },
  catalogName: { fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)", lineHeight: 1.4 },

  results: { marginTop: 8 },
  resultHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 },

  lawCard: { background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)", borderRadius: 12, padding: 20, marginBottom: 12, transition: "box-shadow 0.2s" },
  lawHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 },
  lawHeaderLeft: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  lawNumber: { fontSize: 12, fontWeight: 700, color: "var(--color-accent)", background: "rgba(0,112,243,0.1)", padding: "3px 10px", borderRadius: 6 },
  lawName: { fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)" },
  articleBadge: { fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 10, background: "var(--color-bg-subtle)", padding: "6px 12px", borderRadius: 8, display: "inline-block" },
  articleText: { fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.75, whiteSpace: "pre-wrap" },
  lawMeta: { fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 12, borderTop: "1px solid var(--color-border-subtle)", paddingTop: 10, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  metaTag: { fontSize: 12, display: 'flex', alignItems: 'center' },
  activeBadge: { fontSize: 11, fontWeight: 600, color: "var(--color-success)", background: "rgba(34,197,94,0.1)", padding: "2px 8px", borderRadius: 999 },
  expiredBadge: { fontSize: 11, fontWeight: 600, color: "var(--color-text-tertiary)", background: "rgba(107,114,128,0.08)", padding: "2px 8px", borderRadius: 999 },

  historyBtn: { padding: "7px 14px", fontSize: 12, fontWeight: 500, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-text-secondary)", cursor: "pointer", transition: "all 0.2s" },
  backBtn: { padding: "7px 14px", fontSize: 12, fontWeight: 500, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-text-secondary)", cursor: "pointer" },

  historyTimeline: { position: "relative" },
  timelineItem: { position: "relative", paddingLeft: 28, marginBottom: 16 },
  timelineDot: (isCurrent) => ({ position: "absolute", left: 0, top: 18, width: 12, height: 12, borderRadius: "50%", background: isCurrent ? "var(--color-success)" : "var(--color-border)", border: "2px solid var(--color-bg-elevated)", zIndex: 1 }),
  timelineLine: { position: "absolute", left: 5, top: 30, width: 2, height: "calc(100% - 10px)", background: "var(--color-border-subtle)" },
  versionCard: { background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-subtle)", borderLeft: "3px solid", borderRadius: 10, padding: 20 },
  versionHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 },
  versionBadge: { fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 999 },
  versionDate: { fontSize: 12, color: "var(--color-text-tertiary)" },
  versionTitle: { fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 8 },
  sourceLink: { display: "inline-block", marginTop: 10, fontSize: 12, color: "var(--color-accent)", textDecoration: "none" },

  empty: { padding: 40, textAlign: "center", color: "var(--color-text-tertiary)", fontSize: 14 },
  emptyState: { display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 20px", textAlign: "center" },

  loadingOverlay: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 0" },
  loadingSpinner: {
    width: 32, height: 32, border: "3px solid var(--color-border)",
    borderTop: "3px solid var(--color-accent)", borderRadius: "50%",
    animation: "spin 0.8s linear infinite"
  },
};
