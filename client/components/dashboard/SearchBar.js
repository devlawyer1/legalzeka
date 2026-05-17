"use client";

import { useState } from "react";

/* ============================================================
   Emsal Atlası - SearchBar Component
   Apple-style centered search experience
   ============================================================ */

export default function SearchBar({ onSearch, subscription }) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim(), "semantic");
    }
  };

  return (
    <div style={styles.wrapper}>
      {/* Hero heading */}
      <div style={styles.hero} className="animate-fade-in">
        <h1 style={styles.title}>Emsal Karar Ara</h1>
        <p style={styles.subtitle}>
          Yargıtay, Danıştay ve yerel mahkeme kararlarında arama yapın
        </p>
      </div>

      {/* Search Input */}
      <form onSubmit={handleSubmit} style={styles.searchForm} className="animate-fade-in">
        <div
          style={{
            ...styles.searchContainer,
            ...(focused ? styles.searchContainerFocused : {}),
          }}
        >
          {/* Search icon */}
          <svg
            width="22"
            height="22"
            viewBox="0 0 22 22"
            fill="none"
            stroke={focused ? "#2563EB" : "#A3A3A3"}
            strokeWidth="2"
            strokeLinecap="round"
            style={{ flexShrink: 0, transition: "stroke var(--transition-fast)" }}
          >
            <circle cx="10" cy="10" r="7" />
            <path d="M15 15l4 4" />
          </svg>

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Karar numarası, anahtar kelime veya doğal dilde sorunuzu yazın..."
            style={styles.searchInput}
          />

          {/* Submit button */}
          <button type="submit" style={styles.searchBtn} disabled={!query.trim()}>
            Ara
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M1 7h12M9 3l4 4-4 4" />
            </svg>
          </button>
        </div>

        {/* Keyboard shortcut hint */}
        <div style={styles.hints}>
          <span style={styles.hint}>
            <kbd style={styles.kbd}>Enter</kbd> ile arayın
          </span>
          {subscription && subscription.planName === "Misafir Kullanıcı" ? (
            <span style={styles.hint}>
              Misafir · Günlük {subscription.maxSearchLimit} ücretsiz arama hakkı
            </span>
          ) : subscription && (
            <span style={styles.hint}>
              Plan: <strong>{subscription.planName}</strong> · Kalan arama: {subscription.maxSearchLimit === -1 ? "∞" : subscription.maxSearchLimit}
            </span>
          )}
        </div>
      </form>

      {/* Quick suggestions */}
      <div style={styles.suggestions} className="animate-fade-in">
        <span style={styles.suggestLabel}>Popüler aramalar:</span>
        {["iş kazası tazminat", "kira tahliye", "boşanma nafaka", "ticari dava zamanaşımı"].map((s) => (
          <button
            key={s}
            onClick={() => { setQuery(s); onSearch(s, "semantic"); }}
            style={styles.suggestChip}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    width: "100%",
    maxWidth: 720,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 24,
  },
  hero: {
    textAlign: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: 700,
    color: "var(--color-text-primary)",
    letterSpacing: "-0.03em",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: "var(--color-text-tertiary)",
    fontWeight: 400,
  },

  /* Search form */
  searchForm: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  searchContainer: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 16px",
    background: "var(--color-bg-elevated)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-lg)",
    boxShadow: "var(--shadow-sm)",
    transition: "all var(--transition-base)",
  },
  searchContainerFocused: {
    border: "1px solid var(--color-accent)",
    boxShadow: "0 0 0 3px rgba(37, 99, 235, 0.08), var(--shadow-md)",
  },
  searchInput: {
    flex: 1,
    border: "none",
    outline: "none",
    background: "transparent",
    fontSize: 15,
    color: "var(--color-text-primary)",
    lineHeight: 1.5,
  },
  searchBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "9px 18px",
    borderRadius: "var(--radius-sm)",
    border: "none",
    background: "var(--color-text-primary)",
    color: "var(--color-text-inverse)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all var(--transition-fast)",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },

  /* Hints */
  hints: {
    display: "flex",
    justifyContent: "space-between",
    padding: "0 4px",
  },
  hint: {
    fontSize: 12,
    color: "var(--color-text-tertiary)",
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  kbd: {
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 6px",
    borderRadius: 4,
    background: "var(--color-bg-subtle)",
    border: "1px solid var(--color-border)",
    fontSize: 11,
    fontWeight: 500,
    color: "var(--color-text-secondary)",
    fontFamily: "'Inter', monospace",
  },

  /* Suggestions */
  suggestions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  suggestLabel: {
    fontSize: 12,
    color: "var(--color-text-tertiary)",
    fontWeight: 500,
  },
  suggestChip: {
    padding: "5px 12px",
    borderRadius: 999,
    border: "1px solid var(--color-border)",
    background: "var(--color-bg-elevated)",
    color: "var(--color-text-secondary)",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    transition: "all var(--transition-fast)",
    whiteSpace: "nowrap",
  },
};
