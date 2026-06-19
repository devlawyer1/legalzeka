"use client";

import { useState, useEffect, useCallback } from "react";

/* ============================================================
   Emsal Atlası - Sidebar Component
   Apple/Linear style minimal sidebar navigation
   ============================================================ */

const aiIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
    <path d="M12 12 2.1 12" />
    <path d="M12 12l8.5 4.9" />
  </svg>
);

const calcIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
    <line x1="8" y1="6" x2="16" y2="6" />
    <line x1="8" y1="10" x2="8" y2="10.01" />
    <line x1="12" y1="10" x2="12" y2="10.01" />
    <line x1="16" y1="10" x2="16" y2="10.01" />
    <line x1="8" y1="14" x2="8" y2="14.01" />
    <line x1="12" y1="14" x2="12" y2="14.01" />
    <line x1="16" y1="14" x2="16" y2="14.01" />
  </svg>
);

const calculatorSubItems = [
  {
    id: "criminal_execution",
    label: "Ceza İnfaz & Karar",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
        <line x1="8" y1="6" x2="16" y2="6" />
        <line x1="8" y1="10" x2="8" y2="10.01" />
        <line x1="12" y1="10" x2="12" y2="10.01" />
        <line x1="16" y1="10" x2="16" y2="10.01" />
      </svg>
    ),
  },
  {
    id: "civil_execution",
    label: "İcra Dosyası Kapak",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    id: "fee_calculator",
    label: "Harç & Vekalet",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
        <line x1="6" y1="8" x2="6" y2="8.01" />
        <line x1="10" y1="8" x2="18" y2="8" />
        <line x1="6" y1="12" x2="6" y2="12.01" />
        <line x1="10" y1="12" x2="18" y2="12" />
      </svg>
    ),
  },
  {
    id: "financial_calculator",
    label: "Mali & SMM",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
  },
  {
    id: "term_calculator",
    label: "Adli Süre & Zamanaşımı",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <circle cx="12" cy="15" r="1.5" />
      </svg>
    ),
  },
  {
    id: "labor_calculator",
    label: "İş & Tazminat",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
      </svg>
    ),
  },
  {
    id: "compensation",
    label: "Tazminat & Sigorta",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
        <path d="M22 12A10 10 0 0 0 12 2v10z" />
      </svg>
    ),
  },
  {
    id: "family_law",
    label: "Aile Hukuku",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    id: "inheritance_law",
    label: "Miras Hukuku",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
];

// Build a flat map of ALL navigable items (id -> {label, icon}) for favorites lookup
const buildAllItemsMap = (menuItems) => {
  const map = {};
  menuItems.forEach(item => { map[item.id] = { label: item.label, icon: item.icon }; });
  calculatorSubItems.forEach(item => { map[item.id] = { label: item.label, icon: item.icon }; });
  return map;
};

const FAVORITES_STORAGE_KEY = "legalzeka_sidebar_favorites";

function loadFavorites() {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

function saveFavorites(favs) {
  if (typeof window === "undefined") return;
  localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favs));
}

const aiToolsSubItems = [
  {
    id: "devils_advocate",
    label: "Şeytanın Avukatı",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
      </svg>
    ),
  },
  {
    id: "contract_review",
    label: "Sözleşme İnceleme",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    id: "petitions",
    label: "Dilekçe İşlemleri",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    ),
  },
  {
    id: "simulation",
    label: "Dava Simülasyonu",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
        <path d="M6 12v5c3 3 9 3 12 0v-5" />
      </svg>
    ),
  },
];

const firmSubItems = [
  {
    id: "firm_management",
    label: "Büro Yönetimi",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </svg>
    ),
  },
  {
    id: "firm_templates",
    label: "Kurumsal Şablonlar",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
        <path d="M14 3v5h5M16 13H8M16 17H8M10 9H8" />
      </svg>
    ),
  },
  {
    id: "cases",
    label: "Dava Dosyaları",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    id: "tasks",
    label: "Görevlerim",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  {
    id: "chat",
    label: "Büro İçi İletişim",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },

  {
    id: "crm",
    label: "CRM & Aday Müvekkil",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    id: "finance",
    label: "Finans & Tahsilat",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    id: "corporate",
    label: "Kurumsal Ağ & VIP",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
];

export default function Sidebar({ user, activePage, onNavigate, collapsed, onToggle }) {
  const [calcOpen, setCalcOpen] = useState(false);
  const [aiToolsOpen, setAiToolsOpen] = useState(false);
  const [firmOpen, setFirmOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const [hoveredItemId, setHoveredItemId] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function hydrateFavorites() {
      await Promise.resolve();
      if (!cancelled) setFavorites(loadFavorites());
    }

    hydrateFavorites();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleFavorite = useCallback((itemId, e) => {
    e.stopPropagation();
    setFavorites(prev => {
      const next = prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId];
      saveFavorites(next);
      return next;
    });
  }, []);

  const isCalcActive = calculatorSubItems.some((i) => i.id === activePage);
  const isAiToolsActive = aiToolsSubItems.some((i) => i.id === activePage);
  const isFirmActive = firmSubItems.some((i) => i.id === activePage);

  const firmIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );

  const menuItems = [
    {
      id: "workdesk",
      label: "Çalışma Masası",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 8h6M7 12h10M7 16h4" />
        </svg>
      ),
    },
    {
      id: "ai_chat",
      label: "AI Asistan",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
    {
      id: "search",
      label: "Emsal Arama",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="9" r="6" />
          <path d="M13.5 13.5L17 17" />
        </svg>
      ),
    },
    {
      id: "expert_agents",
      label: "Uzman Ajanlar",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
          <path d="M12 8v8" />
          <path d="M8.5 10.5h7" />
          <path d="M8.5 13.5h7" />
        </svg>
      ),
    },
    {
      id: "recent",
      label: "Son Aramalar",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="10" cy="10" r="7" />
          <path d="M10 6.5V10l2.5 2.5" />
        </svg>
      ),
    },

    {
      id: "notes",
      label: "Notlarım",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 3h12a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1z" />
          <path d="M8 7h4M8 11h4" />
        </svg>
      ),
    },
    {
      id: "uyap",
      label: "UYAP Entegrasyon",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
          <line x1="12" y1="22.08" x2="12" y2="12"></line>
        </svg>
      ),
    },
    {
      id: "tevkil",
      label: "Tevkil Pazarı",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      id: "deadline_tracker",
      label: "Süre Takibi",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
    },
    {
      id: "law_timeline",
      label: "Mevzuat Versiyonlama",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
        </svg>
      ),
    },
  ];

  const initials = user
    ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase()
    : "EA";

  return (
    <aside style={{ ...styles.sidebar, width: collapsed ? 72 : 260 }}>
      {/* Logo & Toggle */}
      <div style={{
        ...styles.logoSection,
        justifyContent: "flex-start",
        padding: "16px 20px"
      }}>
        <button 
          onClick={onToggle} 
          style={{
            ...styles.hamburgerBtn,
            marginLeft: "-6px"
          }} 
          title={collapsed ? "Menüyü Genişlet" : "Menüyü Daralt"}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: collapsed ? 0 : 1, transition: "opacity 0.2s" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect width="24" height="24" rx="6" fill="var(--color-accent)" />
              <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="var(--color-text-inverse)" fontSize="11" fontWeight="700" fontFamily="sans-serif">LZ</text>
            </svg>
            <span style={styles.logoText}>Legal Zeka</span>
          </div>
      </div>

      {/* Nav Items */}
      <nav style={styles.nav}>
        <div style={styles.navSection}>

          {/* ★ SIK KULLANILANLAR (Favorites) */}
          {favorites.length > 0 && (() => {
            // Build allItemsMap inside render so menuItems is in scope
            const allItemsMap = {};
            menuItems.forEach(item => { allItemsMap[item.id] = { label: item.label, icon: item.icon }; });
            calculatorSubItems.forEach(item => { allItemsMap[item.id] = { label: item.label, icon: item.icon }; });
            aiToolsSubItems.forEach(item => { allItemsMap[item.id] = { label: item.label, icon: item.icon }; });
            firmSubItems.forEach(item => { allItemsMap[item.id] = { label: item.label, icon: item.icon }; });

            const favItems = favorites.map(id => allItemsMap[id]).filter(Boolean);
            if (favItems.length === 0) return null;

            return (
              <>
                {!collapsed && <span style={styles.favLabel}>SIK KULLANILANLAR</span>}
                {favorites.map(id => {
                  const item = allItemsMap[id];
                  if (!item) return null;
                  return (
                    <button
                      key={`fav-${id}`}
                      onClick={() => onNavigate(id)}
                      onMouseEnter={() => setHoveredItemId(`fav-${id}`)}
                      onMouseLeave={() => setHoveredItemId(null)}
                      style={{
                        ...styles.navItem,
                        ...(activePage === id ? styles.navItemActive : {}),
                        justifyContent: "flex-start",
                        padding: "9px 12px",
                        position: "relative",
                      }}
                      title={collapsed ? item.label : undefined}
                    >
                      <span style={styles.navIcon}>{item.icon}</span>
                      <span style={{ ...styles.navText, flex: 1, opacity: collapsed ? 0 : 1, transition: "opacity 0.2s" }}>{item.label}</span>
                      {!collapsed && (
                        <span
                          onClick={(e) => toggleFavorite(id, e)}
                          style={{ ...styles.starBtnActive, opacity: hoveredItemId === `fav-${id}` ? 1 : 0 }}
                          title="Sık kullanılanlardan kaldır"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                          </svg>
                        </span>
                      )}
                    </button>
                  );
                })}
                {!collapsed && <div style={styles.favDivider} />}
              </>
            );
          })()}

          {!collapsed && <span style={styles.navLabel}>MENÜ</span>}
          
          {menuItems.slice(0, 3).map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              onMouseEnter={() => setHoveredItemId(item.id)}
              onMouseLeave={() => setHoveredItemId(null)}
              style={{
                ...styles.navItem,
                ...(activePage === item.id ? styles.navItemActive : {}),
                justifyContent: "flex-start",
                padding: "9px 12px",
                position: "relative",
              }}
              title={collapsed ? item.label : undefined}
            >
              <span style={styles.navIcon}>{item.icon}</span>
              <span style={{ ...styles.navText, flex: 1, opacity: collapsed ? 0 : 1, transition: "opacity 0.2s" }}>{item.label}</span>
              {!collapsed && (
                <span
                  onClick={(e) => toggleFavorite(item.id, e)}
                  style={{ ...(favorites.includes(item.id) ? styles.starBtnActive : styles.starBtn), opacity: (hoveredItemId === item.id || favorites.includes(item.id)) ? 1 : 0 }}
                  title={favorites.includes(item.id) ? "Sık kullanılanlardan kaldır" : "Sık kullanılanlara ekle"}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill={favorites.includes(item.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </span>
              )}
            </button>
          ))}
{/* AI Tools Accordion */}
          <button
            onClick={() => collapsed ? onNavigate("devils_advocate") : setAiToolsOpen((o) => !o)}
            style={{
              ...styles.navItem,
              ...(isAiToolsActive ? styles.navItemActive : {}),
              justifyContent: "flex-start",
              padding: "9px 12px",
            }}
            title={collapsed ? "Yapay Zeka Araçları" : undefined}
          >
            <span style={styles.navIcon}>{aiIcon}</span>
            <div style={{ display: "flex", alignItems: "center", flex: 1, opacity: collapsed ? 0 : 1, transition: "opacity 0.2s" }}>
              <span style={{ ...styles.navText, flex: 1 }}>AI Araçları</span>
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ flexShrink: 0, transition: "transform 0.2s", transform: aiToolsOpen ? "rotate(180deg)" : "rotate(0deg)" }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </button>

          {/* AI Tools Sub-items */}
          {!collapsed && aiToolsOpen && (
            <div style={styles.subGroup}>
              {aiToolsSubItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  onMouseEnter={() => setHoveredItemId(item.id)}
                  onMouseLeave={() => setHoveredItemId(null)}
                  style={{
                    ...styles.navItem,
                    ...styles.subItem,
                    ...(activePage === item.id ? styles.navItemActive : {}),
                    position: "relative",
                  }}
                >
                  <span style={{ ...styles.navIcon, width: 16, height: 16 }}>{item.icon}</span>
                  <span style={{ ...styles.navText, flex: 1 }}>{item.label}</span>
                  <span
                    onClick={(e) => toggleFavorite(item.id, e)}
                    style={{ ...(favorites.includes(item.id) ? styles.starBtnActive : styles.starBtn), opacity: (hoveredItemId === item.id || favorites.includes(item.id)) ? 1 : 0 }}
                    title={favorites.includes(item.id) ? "Sık kullanılanlardan kaldır" : "Sık kullanılanlara ekle"}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill={favorites.includes(item.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Hesaplamalar Accordion */}
          <button
            onClick={() => collapsed ? onNavigate("calculator") : setCalcOpen((o) => !o)}
            style={{
              ...styles.navItem,
              ...(isCalcActive ? styles.navItemActive : {}),
              justifyContent: "flex-start",
              padding: "9px 12px",
            }}
            title={collapsed ? "Hesaplamalar" : undefined}
          >
            <span style={styles.navIcon}>{calcIcon}</span>
            <div style={{ display: "flex", alignItems: "center", flex: 1, opacity: collapsed ? 0 : 1, transition: "opacity 0.2s" }}>
              <span style={{ ...styles.navText, flex: 1 }}>Hesaplamalar</span>
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ flexShrink: 0, transition: "transform 0.2s", transform: calcOpen ? "rotate(180deg)" : "rotate(0deg)" }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </button>

          {/* Sub-items */}
          {!collapsed && calcOpen && (
            <div style={styles.subGroup}>
              {calculatorSubItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  onMouseEnter={() => setHoveredItemId(item.id)}
                  onMouseLeave={() => setHoveredItemId(null)}
                  style={{
                    ...styles.navItem,
                    ...styles.subItem,
                    ...(activePage === item.id ? styles.navItemActive : {}),
                    position: "relative",
                  }}
                >
                  <span style={{ ...styles.navIcon, width: 16, height: 16 }}>{item.icon}</span>
                  <span style={{ ...styles.navText, flex: 1 }}>{item.label}</span>
                  <span
                    onClick={(e) => toggleFavorite(item.id, e)}
                    style={{ ...(favorites.includes(item.id) ? styles.starBtnActive : styles.starBtn), opacity: (hoveredItemId === item.id || favorites.includes(item.id)) ? 1 : 0 }}
                    title={favorites.includes(item.id) ? "Sık kullanılanlardan kaldır" : "Sık kullanılanlara ekle"}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill={favorites.includes(item.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  </span>
                </button>
              ))}
            </div>
          )}
        
          {menuItems.slice(3).map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              onMouseEnter={() => setHoveredItemId(item.id)}
              onMouseLeave={() => setHoveredItemId(null)}
              style={{
                ...styles.navItem,
                ...(activePage === item.id ? styles.navItemActive : {}),
                justifyContent: "flex-start",
                padding: "9px 12px",
                position: "relative",
              }}
              title={collapsed ? item.label : undefined}
            >
              <span style={styles.navIcon}>{item.icon}</span>
              <span style={{ ...styles.navText, flex: 1, opacity: collapsed ? 0 : 1, transition: "opacity 0.2s" }}>{item.label}</span>
              {!collapsed && (
                <span
                  onClick={(e) => toggleFavorite(item.id, e)}
                  style={{ ...(favorites.includes(item.id) ? styles.starBtnActive : styles.starBtn), opacity: (hoveredItemId === item.id || favorites.includes(item.id)) ? 1 : 0 }}
                  title={favorites.includes(item.id) ? "Sık kullanılanlardan kaldır" : "Sık kullanılanlara ekle"}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill={favorites.includes(item.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </span>
              )}
            </button>
          ))}
{/* Büro Yönetimi Accordion */}
          <button
            onClick={() => collapsed ? onNavigate("firm_management") : setFirmOpen((o) => !o)}
            style={{
              ...styles.navItem,
              ...(isFirmActive ? styles.navItemActive : {}),
              justifyContent: "flex-start",
              padding: "9px 12px",
            }}
            title={collapsed ? "Büro Yönetimi" : undefined}
          >
            <span style={styles.navIcon}>{firmIcon}</span>
            <div style={{ display: "flex", alignItems: "center", flex: 1, opacity: collapsed ? 0 : 1, transition: "opacity 0.2s" }}>
              <span style={{ ...styles.navText, flex: 1 }}>Büro Yönetimi</span>
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ flexShrink: 0, transition: "transform 0.2s", transform: firmOpen ? "rotate(180deg)" : "rotate(0deg)" }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </button>

          {/* Büro Yönetimi Sub-items */}
          {!collapsed && firmOpen && (
            <div style={styles.subGroup}>
              {firmSubItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  onMouseEnter={() => setHoveredItemId(item.id)}
                  onMouseLeave={() => setHoveredItemId(null)}
                  style={{
                    ...styles.navItem,
                    ...styles.subItem,
                    ...(activePage === item.id ? styles.navItemActive : {}),
                    position: "relative",
                  }}
                >
                  <span style={{ ...styles.navIcon, width: 16, height: 16 }}>{item.icon}</span>
                  <span style={{ ...styles.navText, flex: 1 }}>{item.label}</span>
                  <span
                    onClick={(e) => toggleFavorite(item.id, e)}
                    style={{ ...(favorites.includes(item.id) ? styles.starBtnActive : styles.starBtn), opacity: (hoveredItemId === item.id || favorites.includes(item.id)) ? 1 : 0 }}
                    title={favorites.includes(item.id) ? "Sık kullanılanlardan kaldır" : "Sık kullanılanlara ekle"}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill={favorites.includes(item.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  </span>
                </button>
              ))}
            </div>
          )}

          </div>
      </nav>

      <div style={{...styles.bottom, position: "relative"}}>
        {user?.role === "Admin" && !collapsed && (
          <a href="/admin" style={{
            display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", marginBottom: 8,
            borderRadius: "var(--radius-sm)", background: "rgba(59, 130, 246, 0.1)",
            color: "#3B82F6", textDecoration: "none", fontSize: 13, fontWeight: 600,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
            </svg>
            Admin Paneli
          </a>
        )}
        
        {/* User dropdown popup */}
        {userMenuOpen && user && (
          <div style={styles.userDropdown} className="animate-fade-in">
            {/* Email */}
            <div style={styles.dropdownEmail}>{user?.email}</div>
            <div style={styles.dropdownDivider} />

            {/* Ayarlar */}
            <button onClick={() => { onNavigate("settings"); setUserMenuOpen(false); }} style={styles.dropdownItem}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span>Ayarlar</span>
            </button>

            {/* Abonelik */}
            <button onClick={() => { onNavigate("subscription"); setUserMenuOpen(false); }} style={styles.dropdownItem}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M3 10h18" />
              </svg>
              <span>Abonelik</span>
            </button>

            <div style={styles.dropdownDivider} />

            {/* Çıkış Yap */}
            <button onClick={() => { if (typeof window !== "undefined") { localStorage.removeItem("accessToken"); localStorage.removeItem("refreshToken"); localStorage.removeItem("user"); localStorage.removeItem("subscription"); window.location.href = "/auth"; } }} style={styles.dropdownItem}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>Çıkış Yap</span>
            </button>
          </div>
        )}

        {/* Clickable user card */}
        {user ? (
          <div
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            style={{
              ...styles.userCard,
              justifyContent: "flex-start",
              padding: "10px 12px",
              cursor: "pointer",
              overflow: "hidden",
            }}
          >
            <div style={styles.avatar}>{initials}</div>
            <div style={{ display: "flex", alignItems: "center", flex: 1, opacity: collapsed ? 0 : 1, transition: "opacity 0.2s" }}>
              <div style={{...styles.userInfo, flex: 1}}>
                <span style={styles.userName}>
                  {user?.firstName} {user?.lastName}
                </span>
                <span style={styles.userEmail}>Ücretsiz plan</span>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
              </svg>
            </div>
          </div>
        ) : (
          <a
            href="/auth"
            style={{
              ...styles.guestLoginBtn,
              justifyContent: "flex-start",
              padding: "10px 12px",
              overflow: "hidden",
            }}
            title={collapsed ? "Giriş Yap" : undefined}
          >
            <div style={styles.guestLoginIcon}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 2h3a1 1 0 011 1v10a1 1 0 01-1 1h-3M7 11l3-3-3-3M10 8H2" />
              </svg>
            </div>
            <span style={{...styles.guestLoginText, opacity: collapsed ? 0 : 1, transition: "opacity 0.2s"}}>Giriş Yap / Kayıt Ol</span>
          </a>
        )}
      </div>
    </aside>
  );
}

const styles = {
  sidebar: {
    height: "100vh",
    background: "var(--color-bg-elevated)",
    borderRight: "1px solid var(--color-border-subtle)",
    display: "flex",
    flexDirection: "column",
    transition: "width var(--transition-slow)",
    overflow: "hidden",
    flexShrink: 0,
    position: "relative",
  },
  logoSection: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "16px 20px",
  },
  hamburgerBtn: {
    flexShrink: 0,
    width: 32,
    height: 32,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "var(--radius-sm)",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    color: "var(--color-text-secondary)",
    transition: "all var(--transition-fast)",
    marginLeft: "-6px", /* To align icon nicely with left padding */
  },
  logoText: {
    fontSize: 16,
    fontWeight: 700,
    color: "var(--color-text-primary)",
    letterSpacing: "-0.02em",
    whiteSpace: "nowrap",
  },
  nav: {
    flex: 1,
    padding: "8px 10px",
    overflowY: "auto",
  },
  navSection: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  navLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--color-text-tertiary)",
    letterSpacing: "0.06em",
    padding: "8px 12px 6px",
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    borderRadius: "var(--radius-sm)",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    transition: "all var(--transition-fast)",
    color: "var(--color-text-secondary)",
    width: "100%",
    textAlign: "left",
    fontSize: 14,
    overflow: "hidden",
  },
  navItemActive: {
    background: "var(--color-bg-subtle)",
    color: "var(--color-text-primary)",
    fontWeight: 500,
  },
  navIcon: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 20,
    height: 20,
  },
  navText: {
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  bottom: {
    padding: "8px 10px 16px",
    borderTop: "1px solid var(--color-border-subtle)",
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  userCard: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
    borderRadius: "var(--radius-sm)",
    transition: "all var(--transition-fast)",
    cursor: "default",
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: "var(--radius-sm)",
    background: "var(--color-accent)",
    color: "var(--color-text-inverse)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
    letterSpacing: "0.02em",
  },
  userInfo: {
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    minWidth: 0,
  },
  userName: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--color-text-primary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  userEmail: {
    fontSize: 11,
    color: "var(--color-text-tertiary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  guestLoginBtn: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
    borderRadius: "var(--radius-sm)",
    transition: "all var(--transition-fast)",
    cursor: "pointer",
    textDecoration: "none",
    background: "var(--color-bg-subtle)",
    border: "1px solid var(--color-border)",
  },
  guestLoginIcon: {
    width: 34,
    height: 34,
    borderRadius: "var(--radius-sm)",
    background: "var(--color-bg-elevated)",
    color: "var(--color-text-secondary)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  guestLoginText: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--color-text-primary)",
    whiteSpace: "nowrap",
  },
  subGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 1,
    marginLeft: 8,
    paddingLeft: 12,
    borderLeft: "1px solid var(--color-border-subtle)",
  },
  subItem: {
    justifyContent: "flex-start",
    padding: "7px 10px",
    fontSize: 13,
  },
  favLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--color-text-tertiary)",
    letterSpacing: "0.06em",
    padding: "8px 12px 6px",
  },
  favDivider: {
    height: 1,
    margin: "8px 12px",
    background: "var(--color-border-subtle)",
  },
  starBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    width: 24,
    height: 24,
    borderRadius: 6,
    cursor: "pointer",
    color: "var(--color-text-secondary)",
    transition: "opacity 0.15s",
  },
  starBtnActive: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    width: 24,
    height: 24,
    borderRadius: 6,
    cursor: "pointer",
    color: "var(--color-text-primary)",
    transition: "opacity 0.15s",
  },
  userDropdown: {
    position: "absolute",
    bottom: "100%",
    left: 10,
    right: 10,
    marginBottom: 8,
    background: "var(--color-bg-elevated)",
    border: "1px solid var(--color-border)",
    borderRadius: 12,
    boxShadow: "0 8px 30px rgba(0,0,0,0.15)",
    zIndex: 200,
    overflow: "hidden",
  },
  dropdownEmail: {
    padding: "12px 14px 8px",
    fontSize: 13,
    color: "var(--color-text-tertiary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  dropdownDivider: {
    height: 1,
    background: "var(--color-border-subtle)",
    margin: "4px 0",
  },
  dropdownItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "10px 14px",
    border: "none",
    background: "transparent",
    color: "var(--color-text-primary)",
    fontSize: 14,
    cursor: "pointer",
    textAlign: "left",
    transition: "background 0.15s",
  },
};
