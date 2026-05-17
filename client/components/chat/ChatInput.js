"use client";

/* ============================================================
   ChatInput — Mesaj giriş alanı
   ChatGPT benzeri alt barda mesaj yazma ve gönderme
   ============================================================ */

import { useState, useRef, useEffect } from "react";

export default function ChatInput({ onSend, disabled }) {
  const [value, setValue] = useState("");
  const textareaRef = useRef(null);

  // Textarea otomatik yükseklik ayarı
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [value]);

  const handleSubmit = () => {
    if (value.trim() && !disabled) {
      onSend(value.trim());
      setValue("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Hukuki sorunuzu yazın... (Shift+Enter ile yeni satır)"
          style={styles.textarea}
          rows={1}
          disabled={disabled}
        />
        <button
          onClick={handleSubmit}
          disabled={!value.trim() || disabled}
          style={{
            ...styles.sendBtn,
            opacity: (!value.trim() || disabled) ? 0.4 : 1,
          }}
          title="Gönder"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2L11 13" />
            <path d="M22 2L15 22l-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>
      <p style={styles.disclaimer}>
        Atlas hukuki bilgi sağlar, kesin danışmanlık değildir. Önemli kararlar için bir avukata danışın.
      </p>
    </div>
  );
}

const styles = {
  wrapper: {
    padding: "16px 24px 20px",
    borderTop: "1px solid var(--color-border-subtle)",
    background: "var(--color-bg)",
  },
  container: {
    display: "flex",
    alignItems: "flex-end",
    gap: 10,
    padding: "10px 14px",
    background: "var(--color-bg-elevated)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-lg)",
    transition: "all var(--transition-fast)",
    maxWidth: 800,
    margin: "0 auto",
  },
  textarea: {
    flex: 1,
    border: "none",
    outline: "none",
    background: "transparent",
    fontSize: 14,
    lineHeight: 1.6,
    color: "var(--color-text-primary)",
    resize: "none",
    minHeight: 24,
    maxHeight: 200,
    fontFamily: "inherit",
  },
  sendBtn: {
    flexShrink: 0,
    width: 36,
    height: 36,
    borderRadius: "var(--radius-sm)",
    background: "var(--color-text-primary)",
    color: "var(--color-bg)",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all var(--transition-fast)",
  },
  disclaimer: {
    textAlign: "center",
    fontSize: 11,
    color: "var(--color-text-tertiary)",
    marginTop: 8,
    maxWidth: 800,
    margin: "8px auto 0",
  },
};
