"use client";

/* ============================================================
   MessageBubble — Tek bir sohbet mesajı baloncuğu
   Markdown desteği ile kullanıcı ve asistan mesajlarını gösterir
   ============================================================ */

import { useState } from "react";

export default function MessageBubble({ role, content, toolUsed, isStreaming }) {
  const [copied, setCopied] = useState(false);
  const isUser = role === "user";

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Basit markdown renderer
  const renderContent = (text) => {
    if (!text) return null;

    // Bold
    let html = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code style="background:var(--color-bg-subtle);padding:2px 6px;border-radius:4px;font-size:13px;">$1</code>');
    // Headers
    html = html.replace(/^### (.*$)/gm, '<h4 style="font-size:15px;font-weight:700;margin:16px 0 8px;color:var(--color-text-primary)">$1</h4>');
    html = html.replace(/^## (.*$)/gm, '<h3 style="font-size:17px;font-weight:700;margin:20px 0 8px;color:var(--color-text-primary)">$1</h3>');
    html = html.replace(/^# (.*$)/gm, '<h2 style="font-size:20px;font-weight:700;margin:24px 0 12px;color:var(--color-text-primary)">$1</h2>');
    // Bullet lists
    html = html.replace(/^- (.*$)/gm, '<li style="margin-left:16px;margin-bottom:4px;">$1</li>');
    // Numbered lists
    html = html.replace(/^\d+\. (.*$)/gm, '<li style="margin-left:16px;margin-bottom:4px;">$1</li>');
    // Line breaks
    html = html.replace(/\n/g, '<br/>');

    return <div dangerouslySetInnerHTML={{ __html: html }} />;
  };

  return (
    <div style={{
      ...styles.wrapper,
      justifyContent: isUser ? "flex-end" : "flex-start",
    }}>
      {/* Avatar */}
      {!isUser && (
        <div style={styles.avatar}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
      )}

      <div style={{
        ...styles.bubble,
        ...(isUser ? styles.userBubble : styles.assistantBubble),
      }}>
        {/* Tool badge */}
        {toolUsed && (
          <div style={styles.toolBadge}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2l-5 5M9.5 2H14v4.5M2 9.5V14h4.5L14 6.5" />
            </svg>
            {toolUsed}
          </div>
        )}

        {/* Content */}
        <div style={styles.content}>
          {renderContent(content)}
          {isStreaming && <span style={styles.cursor}>▊</span>}
        </div>

        {/* Actions */}
        {!isUser && !isStreaming && content && (
          <div style={styles.actions}>
            <button onClick={handleCopy} style={styles.actionBtn} title="Kopyala">
              {copied ? (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round">
                  <path d="M3 8l3.5 3.5L13 5" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="5" width="8" height="8" rx="1.5" />
                  <path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" />
                </svg>
              )}
            </button>
          </div>
        )}
      </div>

      {/* User avatar */}
      {isUser && (
        <div style={styles.userAvatar}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="5" r="3" />
            <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" />
          </svg>
        </div>
      )}
    </div>
  );
}

const styles = {
  wrapper: {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    padding: "4px 0",
  },
  avatar: {
    flexShrink: 0,
    width: 32,
    height: 32,
    borderRadius: "var(--radius-sm)",
    background: "var(--color-bg-subtle)",
    border: "1px solid var(--color-border-subtle)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--color-text-secondary)",
  },
  userAvatar: {
    flexShrink: 0,
    width: 32,
    height: 32,
    borderRadius: "var(--radius-sm)",
    background: "var(--color-text-primary)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--color-bg)",
  },
  bubble: {
    maxWidth: "75%",
    borderRadius: "var(--radius-md)",
    padding: "12px 16px",
    fontSize: 14,
    lineHeight: 1.7,
  },
  userBubble: {
    background: "var(--color-text-primary)",
    color: "var(--color-bg)",
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    background: "var(--color-bg-elevated)",
    color: "var(--color-text-primary)",
    border: "1px solid var(--color-border-subtle)",
    borderBottomLeftRadius: 4,
  },
  toolBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11,
    fontWeight: 600,
    color: "var(--color-text-tertiary)",
    background: "var(--color-bg-subtle)",
    padding: "3px 8px",
    borderRadius: 999,
    marginBottom: 8,
  },
  content: {
    wordBreak: "break-word",
  },
  cursor: {
    display: "inline-block",
    animation: "blink 1s step-end infinite",
    color: "var(--color-accent)",
    marginLeft: 2,
  },
  actions: {
    display: "flex",
    gap: 4,
    marginTop: 8,
    paddingTop: 8,
    borderTop: "1px solid var(--color-border-subtle)",
  },
  actionBtn: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    color: "var(--color-text-tertiary)",
    padding: 4,
    borderRadius: "var(--radius-sm)",
    display: "flex",
    alignItems: "center",
    transition: "all var(--transition-fast)",
  },
};
