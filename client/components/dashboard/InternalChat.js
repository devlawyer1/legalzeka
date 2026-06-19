
"use client";

import { useState, useEffect, useRef } from "react";
import { getInternalMessages, sendInternalMessage } from "@/lib/api";

export default function InternalChat({ firmId, user }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inputVal, setInputVal] = useState("");
  const [toast, setToast] = useState(null);
  const messagesEndRef = useRef(null);
  const prevCountRef = useRef(0);

  const showToast = (message, type = "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (firmId) {
      loadMessages();
      const interval = setInterval(loadMessages, 5000);
      return () => clearInterval(interval);
    }
  }, [firmId]);

  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      prevCountRef.current = messages.length;
    }
  }, [messages]);

  const loadMessages = async () => {
    try {
      const res = await getInternalMessages(firmId);
      if (res.success) setMessages(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputVal.trim()) return;

    try {
      const sent = await sendInternalMessage(firmId, inputVal);
      if (sent.success) {
        setMessages([...messages, { ...sent.data, first_name: user?.firstName, last_name: user?.lastName }]);
        setInputVal("");
      } else {
        showToast("Mesaj gönderilemedi.");
      }
    } catch (err) {
      showToast("Mesaj gönderilirken hata oluştu.");
    }
  };

  if (!firmId) {
    return (
      <div style={{ textAlign: "center", padding: 60, background: "var(--color-bg-elevated)", borderRadius: 12, border: "1px solid var(--color-border-subtle)", marginTop: 20 }}>
        <h3 style={{ fontSize: 20, marginBottom: 15, color: "var(--color-text-primary)" }}>Lütfen önce bir büro oluşturun veya seçin.</h3>
        <p style={{ color: "var(--color-text-tertiary)", marginBottom: 25, fontSize: 15 }}>Takım içi mesajlaşmayı kullanabilmek için bir hukuk bürosuna dahil olmanız gerekmektedir. Sol menüden <strong>Büro Yönetimi</strong> sekmesine giderek yeni bir büro oluşturabilirsiniz.</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Takım İçi Mesajlaşma</h2>
        <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
          Büronuzdaki diğer avukat ve personeller ile iletişim kurun
        </p>
      </div>

      <div style={styles.chatArea}>
        {loading && messages.length === 0 ? (
          <div style={styles.loading}>Yükleniyor...</div>
        ) : messages.length === 0 ? (
          <div style={styles.empty}>Henüz mesaj bulunmuyor. Ekibinizle şimdi mesajlaşmaya başlayın.</div>
        ) : null}
        
        {messages.map((m, i) => {
          const isMe = String(m.gonderen_id) === String(user?.id);
          return (
            <div key={m.id || i} style={{ ...styles.messageRow, justifyContent: isMe ? "flex-end" : "flex-start" }}>
              {!isMe && (
                <div style={styles.avatar}>
                  {m.first_name ? m.first_name.charAt(0).toUpperCase() : "U"}
                </div>
              )}
              <div style={{ ...styles.messageWrap, alignItems: isMe ? "flex-end" : "flex-start" }}>
                <div style={{ ...styles.messageName, textAlign: isMe ? "right" : "left", display: isMe ? "none" : "block" }}>
                  {m.first_name || ""} {m.last_name || ""}
                </div>
                <div style={{
                  ...styles.bubble,
                  background: isMe ? "var(--color-accent)" : "var(--color-bg)",
                  color: isMe ? "var(--color-text-inverse)" : "var(--color-text-primary)",
                  border: isMe ? "none" : "1px solid var(--color-border-subtle)",
                  borderBottomRightRadius: isMe ? 4 : 16,
                  borderBottomLeftRadius: isMe ? 16 : 4,
                }}>
                  {m.icerik}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} style={styles.inputArea}>
        <input 
          value={inputVal} 
          onChange={(e) => setInputVal(e.target.value)} 
          placeholder="Mesaj gönderin..." 
          style={styles.input} 
        />
        <button type="submit" style={styles.sendButton} disabled={!inputVal.trim()}>
          Gönder
        </button>
      </form>

      {/* Toast Bildirimi */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, padding: "12px 20px",
          background: toast.type === "error" ? "var(--color-error)" : "var(--color-success)",
          color: "#fff", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          zIndex: 9999, animation: "slideIn 0.3s ease-out"
        }}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "calc(100vh - 170px)",
    background: "var(--color-bg)",
    borderRadius: "16px",
    boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)",
    overflow: "hidden",
    border: "1px solid var(--color-border-subtle)",
  },
  header: {
    padding: "20px 24px",
    borderBottom: "1px solid var(--color-border-subtle)",
    background: "var(--color-bg-elevated)",
  },
  title: {
    margin: "0 0 4px 0",
    fontSize: "1.25rem",
    fontWeight: "600",
    color: "var(--color-text-primary)",
  },
  chatArea: {
    flex: 1,
    padding: "24px",
    overflowY: "auto",
    background: "var(--color-bg-secondary)",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  messageRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: "10px",
  },
  avatar: {
    minWidth: "32px",
    height: "32px",
    borderRadius: "50%",
    background: "var(--color-text-secondary)",
    color: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "bold",
    fontSize: "0.85rem",
  },
  messageWrap: {
    display: "flex",
    flexDirection: "column",
    maxWidth: "70%",
  },
  messageName: {
    fontSize: "0.75rem",
    color: "var(--color-text-secondary)",
    marginBottom: "4px",
    fontWeight: "500",
    paddingInline: "4px",
  },
  bubble: {
    padding: "12px 16px",
    borderRadius: "16px",
    fontSize: "0.95rem",
    lineHeight: "1.5",
    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
  },
  inputArea: {
    display: "flex",
    gap: "12px",
    padding: "16px 20px",
    background: "var(--color-bg)",
    borderTop: "1px solid var(--color-border-subtle)",
  },
  input: {
    flex: 1,
    padding: "12px 16px",
    border: "1px solid var(--color-border-subtle)",
    borderRadius: "12px",
    fontSize: "1rem",
    outline: "none",
    background: "var(--color-bg-secondary)",
    color: "var(--color-text-primary)",
  },
  sendButton: {
    padding: "0 24px",
    background: "var(--color-accent)",
    color: "var(--color-text-inverse)",
    border: "none",
    borderRadius: "12px",
    cursor: "pointer",
    fontWeight: "500",
  },
  loading: {
    textAlign: "center",
    padding: "20px",
    color: "var(--color-text-secondary)",
    fontStyle: "italic",
  },
  empty: {
    textAlign: "center",
    padding: "40px 20px",
    color: "var(--color-text-secondary)",
  },
  errorBox: {
    padding: "20px",
    background: "var(--color-error-bg, #fee2e2)",
    color: "var(--color-error-text, #ef4444)",
    borderRadius: "8px",
    margin: "20px",
    border: "1px solid var(--color-error-border, #fca5a5)",
  }
};
