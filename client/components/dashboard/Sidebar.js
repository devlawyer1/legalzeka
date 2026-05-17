"use client";

import { useState } from "react";

/* ============================================================
   Emsal Atlası - Sidebar Component
   Apple/Linear style minimal sidebar navigation
   ============================================================ */

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
    id: "calculator",
    label: "İnfaz Hesaplama",
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
    id: "fee_calculator",
    label: "Harç & Vekalet",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
        <line x1="6" y1="8" x2="6" y2="8.01" />
        <line x1="10" y1="8" x2="18" y2="8" />
        <line x1="6" y1="12" x2="6" y2="12.01" />
        <line x1="10" y1="12" x2="18" y2="12" />
        <line x1="6" y1="16" x2="6" y2="16.01" />
        <line x1="10" y1="16" x2="18" y2="16" />
      </svg>
    ),
  },
  {
    id: "term_calculator",
    label: "Süre Hesaplama",
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
    label: "Kıdem & İhbar",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
      </svg>
    ),
  },
];

export default function Sidebar({ user, activePage, onNavigate, collapsed, onToggle }) {
  const [calcOpen, setCalcOpen] = useState(false);

  const isCalcActive = calculatorSubItems.some((i) => i.id === activePage);

  const menuItems = [
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
      id: "saved",
      label: "Kaydedilenler",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 3h10a1 1 0 011 1v13l-6-3-6 3V4a1 1 0 011-1z" />
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
      id: "subscription",
      label: "Abonelik",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="14" height="11" rx="2" />
          <path d="M3 9h14" />
        </svg>
      ),
    },
  ];

  const bottomItems = [
    {
      id: "settings",
      label: "Ayarlar",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
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
      <div style={styles.logoSection}>
        <button onClick={onToggle} style={styles.hamburgerBtn} title={collapsed ? "Menüyü Genişlet" : "Menüyü Daralt"}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
        {!collapsed && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect width="24" height="24" rx="6" fill="var(--color-accent)" />
              <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="var(--color-text-inverse)" fontSize="11" fontWeight="700" fontFamily="sans-serif">LZ</text>
            </svg>
            <span style={styles.logoText}>Legal Zeka</span>
          </div>
        )}
      </div>

      {/* Nav Items */}
      <nav style={styles.nav}>
        <div style={styles.navSection}>
          {!collapsed && <span style={styles.navLabel}>MENÜ</span>}
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              style={{
                ...styles.navItem,
                ...(activePage === item.id ? styles.navItemActive : {}),
                justifyContent: collapsed ? "center" : "flex-start",
                padding: collapsed ? "10px" : "9px 12px",
              }}
              title={collapsed ? item.label : undefined}
            >
              <span style={styles.navIcon}>{item.icon}</span>
              {!collapsed && <span style={styles.navText}>{item.label}</span>}
            </button>
          ))}

          {/* Hesaplamalar Accordion */}
          <button
            onClick={() => collapsed ? onNavigate("calculator") : setCalcOpen((o) => !o)}
            style={{
              ...styles.navItem,
              ...(isCalcActive ? styles.navItemActive : {}),
              justifyContent: collapsed ? "center" : "flex-start",
              padding: collapsed ? "10px" : "9px 12px",
            }}
            title={collapsed ? "Hesaplamalar" : undefined}
          >
            <span style={styles.navIcon}>{calcIcon}</span>
            {!collapsed && (
              <>
                <span style={{ ...styles.navText, flex: 1 }}>Hesaplamalar</span>
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={{ flexShrink: 0, transition: "transform 0.2s", transform: calcOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </>
            )}
          </button>

          {/* Sub-items */}
          {!collapsed && calcOpen && (
            <div style={styles.subGroup}>
              {calculatorSubItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  style={{
                    ...styles.navItem,
                    ...styles.subItem,
                    ...(activePage === item.id ? styles.navItemActive : {}),
                  }}
                >
                  <span style={{ ...styles.navIcon, width: 16, height: 16 }}>{item.icon}</span>
                  <span style={styles.navText}>{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* Bottom */}
      <div style={styles.bottom}>
        {bottomItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            style={{
              ...styles.navItem,
              ...(activePage === item.id ? styles.navItemActive : {}),
              justifyContent: collapsed ? "center" : "flex-start",
              padding: collapsed ? "10px" : "9px 12px",
            }}
            title={collapsed ? item.label : undefined}
          >
            <span style={styles.navIcon}>{item.icon}</span>
            {!collapsed && <span style={styles.navText}>{item.label}</span>}
          </button>
        ))}

        {/* User profile or Guest login */}
        {user ? (
          <div
            style={{
              ...styles.userCard,
              justifyContent: collapsed ? "center" : "flex-start",
              padding: collapsed ? "10px" : "10px 12px",
            }}
          >
            <div style={styles.avatar}>{initials}</div>
            {!collapsed && (
              <div style={styles.userInfo}>
                <span style={styles.userName}>
                  {user?.firstName} {user?.lastName}
                </span>
                <span style={styles.userEmail}>{user?.email}</span>
              </div>
            )}
          </div>
        ) : (
          <a
            href="/auth"
            style={{
              ...styles.guestLoginBtn,
              justifyContent: collapsed ? "center" : "flex-start",
              padding: collapsed ? "10px" : "10px 12px",
            }}
            title={collapsed ? "Giriş Yap" : undefined}
          >
            <div style={styles.guestLoginIcon}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 2h3a1 1 0 011 1v10a1 1 0 01-1 1h-3M7 11l3-3-3-3M10 8H2" />
              </svg>
            </div>
            {!collapsed && <span style={styles.guestLoginText}>Giriş Yap / Kayıt Ol</span>}
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
    background: "linear-gradient(135deg, #2563EB, #3B82F6)",
    color: "#fff",
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
};
