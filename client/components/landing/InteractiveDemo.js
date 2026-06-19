"use client";

import { useState, useEffect } from "react";

export default function InteractiveDemo() {
  const [activeTab, setActiveTab] = useState("ai_chat");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState(null);
  const [typedPlaceholder, setTypedPlaceholder] = useState("");
  
  // Expanded Sidebar groupings
  const menuItems = [
    { id: "ai_chat", label: "AI Asistan" },
    { id: "search", label: "Emsal Arama" },
    { id: "recent", label: "Son Aramalar" },
    { id: "collections", label: "Koleksiyonlarım" },
    { id: "notes", label: "Notlarım" },
    { id: "uyap", label: "UYAP Entegrasyon" },
    { id: "deadline_tracker", label: "Süre Takibi" },
    { id: "law_timeline", label: "Mevzuat Versiyonlama" },
  ];
  
  const firmItems = [
    { id: "firm_management", label: "Büro Yönetimi" },
    { id: "firm_templates", label: "Kurumsal Şablonlar" },
    { id: "cases", label: "Dava Dosyaları" },
    { id: "tasks", label: "Görevlerim" },
    { id: "chat", label: "Büro İçi İletişim" },
    { id: "crm", label: "CRM & Aday Müvekkil" },
    { id: "finance", label: "Finans & Tahsilat" },
    { id: "corporate", label: "Kurumsal Ağ & VIP" },
  ];

  const aiItems = [
    { id: "devils_advocate", label: "Şeytanın Avukatı" },
    { id: "contract_review", label: "Sözleşme İnceleme" },
    { id: "petitions", label: "Dilekçe İşlemleri" },
  ];

  const calcItems = [
    { id: "criminal_execution", label: "Ceza İnfaz & Karar" },
    { id: "civil_execution", label: "İcra Dosyası Kapak" },
    { id: "fee_calculator", label: "Harç & Vekalet" },
    { id: "financial_calculator", label: "Mali & SMM" },
    { id: "term_calculator", label: "Adli Süre & Zamanaşımı" },
    { id: "labor_calculator", label: "İş & Tazminat" },
    { id: "compensation", label: "Tazminat & Sigorta" },
    { id: "family_law", label: "Aile Hukuku" },
    { id: "inheritance_law", label: "Miras Hukuku" },
  ];

  const placeholderText = "Örn: Kıdem tazminatı giydirilmiş ücret emsalleri...";

  useEffect(() => {
    if (activeTab !== "search") return;
    let i = 0;
    const interval = setInterval(() => {
      setTypedPlaceholder(placeholderText.substring(0, i));
      i++;
      if (i > placeholderText.length) clearInterval(interval);
    }, 50);
    return () => clearInterval(interval);
  }, [activeTab]);

  const handleSearch = (e) => {
    e?.preventDefault();
    if (!searchQuery.trim() && !typedPlaceholder) return;
    setIsSearching(true);
    setResults(null);
    setTimeout(() => {
      setIsSearching(false);
      setResults([
        {
          id: 1,
          karar: "Yargıtay 9. Hukuk Dairesi",
          tarih: "2024",
          ozet: "Kıdem tazminatı hesabında işçiye ödenen düzenli primlerin giydirilmiş ücrete dahil edilmesi gerektiğine hükmedilmiştir.",
          skor: "98%"
        },
        {
          id: 2,
          karar: "Yargıtay 22. Hukuk Dairesi",
          tarih: "2023",
          ozet: "Fazla mesai ücreti hesaplanırken hakkaniyet indirimi yapılması zorunludur.",
          skor: "85%"
        }
      ]);
    }, 1200);
  };

  const renderIcon = (id) => {
    switch(id) {
      case "ai_chat": return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>;
      case "search": return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>;
      case "contract_review": return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>;
      case "devils_advocate": return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path></svg>;
      default: return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>;
    }
  };

  const NavItem = ({ item }) => (
    <div 
      className={`demo-sidebar-item ${activeTab === item.id ? 'active' : ''}`}
      onClick={() => { setActiveTab(item.id); setResults(null); setSearchQuery(''); }}
      style={{ padding: "8px 16px", fontSize: 12, marginBottom: 2 }}
    >
      {renderIcon(item.id)}
      {item.label}
    </div>
  );

  return (
    <div className="demo-container animate-fade-in" style={{ width: "100%", height: "80vh", minHeight: 650 }}>
      <div className="demo-window" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        
        {/* Fake Browser Header */}
        <div className="demo-header" style={{ flexShrink: 0 }}>
          <div className="demo-dots">
            <span className="dot red"></span>
            <span className="dot yellow"></span>
            <span className="dot green"></span>
          </div>
          <div className="demo-title">Legal Zeka Asistanı - v2.0 Demo</div>
        </div>

        {/* Demo Body with Sidebar */}
        <div className="demo-body" style={{ flex: 1, display: "flex", flexDirection: "row", overflow: "hidden" }}>
          
          <div className="demo-sidebar" style={{ width: 240, overflowY: "auto", paddingBottom: 32 }}>
            <div style={{ padding: "16px 16px 8px", fontSize: 10, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>MENÜ</div>
            {menuItems.map(i => <NavItem key={i.id} item={i} />)}

            <div style={{ padding: "24px 16px 8px", fontSize: 10, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>BÜRO YÖNETİMİ</div>
            {firmItems.map(i => <NavItem key={i.id} item={i} />)}

            <div style={{ padding: "24px 16px 8px", fontSize: 10, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>AI ARAÇLARI</div>
            {aiItems.map(i => <NavItem key={i.id} item={i} />)}

            <div style={{ padding: "24px 16px 8px", fontSize: 10, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>HESAPLAMALAR</div>
            {calcItems.map(i => <NavItem key={i.id} item={i} />)}
          </div>

          <div className="demo-content" style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", position: "relative" }}>
            
            {/* 1. AI CHAT DEMO */}
            {activeTab === 'ai_chat' && (
              <div className="demo-tab-content animate-fade-in" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                <div style={{ borderBottom: "1px solid var(--color-border-subtle)", paddingBottom: 16, marginBottom: 16 }}>
                  <h3 style={{ fontWeight: 600, fontSize: 18, color: "var(--color-text-primary)" }}>Hukuki Asistan</h3>
                  <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", marginTop: 4 }}>Legal Zeka Yapay Zeka Hukuk Modeline sorular sorun.</p>
                </div>
                <div style={{ flex: 1, border: "1px solid var(--color-border-subtle)", borderRadius: 8, padding: 20, background: "var(--color-bg-elevated)", display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
                  <div style={{ background: "var(--color-bg)", padding: "12px 16px", borderRadius: "12px 12px 0 12px", alignSelf: "flex-end", maxWidth: "80%", border: "1px solid var(--color-border-subtle)" }}>
                    <p style={{ fontSize: 14 }}>İş kazası sonucu destekten yoksun kalma tazminatında zaman aşımı süresi ne kadardır?</p>
                  </div>
                  <div style={{ background: "var(--color-bg-subtle)", padding: "16px", borderRadius: "12px 12px 12px 0", alignSelf: "flex-start", maxWidth: "85%", border: "1px solid var(--color-border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="4" fill="var(--color-accent)"/><path d="M7 12l3 3 7-7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>AI Yanıtı</span>
                    </div>
                    <p style={{ fontSize: 14, color: "var(--color-text-primary)", lineHeight: 1.6 }}>Türk Borçlar Kanunu Madde 72 uyarınca, iş kazalarından doğan tazminat davalarında zaman aşımı süresi, zarar görenin zararı ve tazminat yükümlüsünü öğrendiği tarihten başlayarak <strong>2 yıl</strong> ve her hâlükârda fiilin işlendiği tarihten başlayarak <strong>10 yıldır.</strong></p>
                    <div style={{ marginTop: 12, fontSize: 11, color: "var(--color-text-secondary)", display: "flex", gap: 6 }}>
                      <span>Kaynaklar:</span>
                      <span style={{ background: "var(--color-bg-elevated)", padding: "2px 6px", borderRadius: 4, border: "1px solid var(--color-border-subtle)" }}>Yargıtay 21. HD E.2018/1234</span>
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 16, position: "relative" }}>
                  <input type="text" placeholder="Hukuki bir soru sorun..." disabled style={{ width: "100%", padding: "14px 48px 14px 16px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-bg-elevated)", fontSize: 14 }} />
                  <div style={{ position: "absolute", right: 12, top: 12, width: 24, height: 24, background: "var(--color-accent)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                  </div>
                </div>
              </div>
            )}

            {/* 2. SEARCH DEMO */}
            {activeTab === 'search' && (
              <div className="demo-tab-content animate-fade-in">
                <div style={{ borderBottom: "1px solid var(--color-border-subtle)", paddingBottom: 16, marginBottom: 24 }}>
                  <h3 style={{ fontWeight: 600, fontSize: 18, color: "var(--color-text-primary)" }}>Semantik Emsal Arama</h3>
                </div>
                <form onSubmit={handleSearch} className="demo-search-bar">
                  <input 
                    type="text" 
                    placeholder={typedPlaceholder || "Davanızı doğal dille anlatın..."}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <button type="submit" className="demo-btn">
                    Yapay Zeka ile Ara
                  </button>
                </form>

                <div className="demo-results">
                  {isSearching && (
                    <div className="demo-loading">
                      <div className="spinner"></div>
                      <span>Milyonlarca karar yapay zeka ile taranıyor...</span>
                    </div>
                  )}
                  {!isSearching && results && (
                    <div className="demo-result-list animate-slide-in">
                      {results.map(r => (
                        <div key={r.id} className="demo-card">
                          <div className="demo-card-header">
                            <span className="demo-court">{r.karar} • {r.tarih}</span>
                            <span className="demo-score">Eşleşme: {r.skor}</span>
                          </div>
                          <p className="demo-card-text">{r.ozet}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {!isSearching && !results && (
                    <div className="demo-placeholder" onClick={() => { setSearchQuery("Kıdem tazminatı giydirilmiş ücret emsalleri"); handleSearch(); }} style={{ cursor: "pointer" }}>
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                      <p style={{ marginTop: 8 }}>Doğal dilde arama yapmak için sorunuzu yazın veya<br/> <strong style={{ color: "var(--color-accent)" }}>orijinal emsali test etmek için buraya tıklayın.</strong></p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 3. CONTRACT REVIEW DEMO */}
            {activeTab === 'contract_review' && (
              <div className="demo-tab-content animate-fade-in">
                 <div style={{ borderBottom: "1px solid var(--color-border-subtle)", paddingBottom: 16, marginBottom: 24 }}>
                  <h3 style={{ fontWeight: 600, fontSize: 18, color: "var(--color-text-primary)" }}>Sözleşme İnceleme</h3>
                 </div>
                 <div className="demo-upload-area" style={{ cursor: "pointer" }}>
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                    <p style={{ marginTop: 8 }}><strong>Satis_Sozlesmesi_Taslak.docx</strong><br/>tarafından yüklendi, yapay zeka inceliyor...</p>
                 </div>
                 <div className="demo-contract-feedback">
                    <div className="demo-alert warning animate-slide-in">
                      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: "uppercase" }}>RİSKLİ MADDE (Madde 6.2)</div>
                      Fesih bildirim süresi kanuni asgari sürenin altındadır. Hukuka aykırılık riski mevcuttur.
                    </div>
                    <div className="demo-alert success animate-slide-in" style={{ animationDelay: "0.2s" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: "uppercase" }}>UYGUN</div>
                      Damga vergisi ve stopaj yükümlülükleri Vergi Usul Kanunu'na uygun şekilde belirlenmiştir.
                    </div>
                 </div>
              </div>
            )}

            {/* 4. GENERIC / FALLBACK PREVIEW FOR OTHER TOOLS */}
            {['search', 'ai_chat', 'contract_review'].indexOf(activeTab) === -1 && (
              <div className="demo-tab-content animate-fade-in" style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 20px" }}>
                <div style={{ width: 80, height: 80, borderRadius: 20, background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24, boxShadow: "0 10px 30px rgba(0,0,0,0.1)" }}>
                   {renderIcon(activeTab)}
                </div>
                <h3 style={{ fontSize: 24, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 12 }}>
                  {
                    menuItems.concat(firmItems, aiItems, calcItems).find(i => i.id === activeTab)?.label || "Modül"
                  }
                </h3>
                <p style={{ fontSize: 15, color: "var(--color-text-secondary)", lineHeight: 1.6, maxWidth: 400 }}>
                  Bu araç ve 20+ diğer gelişmiş hukuki özellik <strong>Legal Zeka Platformunda</strong> aktif olarak kullanımınızda.
                </p>
                <div style={{ marginTop: 32, display: "flex", gap: 12 }}>
                  <div style={{ height: 12, width: 200, background: "var(--color-bg-elevated)", borderRadius: 6 }}></div>
                </div>
                <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
                  <div style={{ height: 12, width: 140, background: "var(--color-bg-elevated)", borderRadius: 6 }}></div>
                  <div style={{ height: 12, width: 100, background: "var(--color-bg-elevated)", borderRadius: 6 }}></div>
                </div>
                <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
                  <div style={{ height: 12, width: 180, background: "var(--color-bg-elevated)", borderRadius: 6 }}></div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
