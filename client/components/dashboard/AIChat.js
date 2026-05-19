"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { createConversation, getConversations, getConversationMessages, deleteConversation } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

// ─── Markdown-lite renderer ───────────────────────────────────
function renderMd(t) {
  if (!t) return "";
  return t
    .replace(/```([\s\S]*?)```/g, '<pre style="background:var(--color-bg-subtle);padding:14px 18px;border-radius:8px;overflow-x:auto;font-size:13px;line-height:1.6;margin:12px 0;border:1px solid var(--color-border-subtle);font-family:monospace"><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code style="background:var(--color-bg-subtle);padding:2px 6px;border-radius:4px;font-size:13px">$1</code>')
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br/>");
}

// ─── Typing indicator ────────────────────────────────────────
function TypingIndicator() {
  return (
    <div style={{ padding: "16px 0", maxWidth: 780, margin: "0 auto", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {[0, 0.15, 0.3].map((d, i) => (
            <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-text-tertiary)", animation: "pulse-ring 1.2s ease-in-out infinite", animationDelay: `${d}s`, display: "inline-block", opacity: 0.5 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Message row ─────────────────────────────────────────────
function MessageRow({ msg, onCopy, onRegenerate }) {
  const isUser = msg.role === "user";
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    onCopy?.();
  };

  if (isUser) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 0" }}>
        <div style={{
          background: "var(--color-bg-elevated)",
          color: "var(--color-text-primary)",
          padding: "10px 16px",
          borderRadius: 18,
          maxWidth: "70%",
          fontSize: 15,
          lineHeight: 1.6,
          wordBreak: "break-word",
        }}>
          {msg.content}
        </div>
      </div>
    );
  }

  // AI message
  return (
    <div style={{ padding: "16px 0" }}>
      <div style={{
        fontSize: 15,
        lineHeight: 1.75,
        color: "var(--color-text-primary)",
        wordBreak: "break-word",
      }} dangerouslySetInnerHTML={{ __html: renderMd(msg.content) }} />
      {/* Action buttons */}
      {msg.content && (
        <div style={{ display: "flex", gap: 2, marginTop: 12 }}>
          <button onClick={handleCopy} title={copied ? "Kopyalandı!" : "Kopyala"}
            style={actionBtnStyle}>
            {copied ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            )}
          </button>
          <button title="Beğen" style={actionBtnStyle}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>
          </button>
          <button title="Beğenme" style={actionBtnStyle}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"/></svg>
          </button>
          <button onClick={() => onRegenerate?.()} title="Yeniden Üret" style={actionBtnStyle}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/></svg>
          </button>
        </div>
      )}
    </div>
  );
}

const actionBtnStyle = {
  width: 32,
  height: 32,
  borderRadius: 8,
  border: "none",
  background: "transparent",
  color: "var(--color-text-tertiary)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  transition: "all 0.15s",
};

// ─── Welcome screen ──────────────────────────────────────────
function Welcome({ onSend }) {
  const tips = [
    { t: "İş kazası sonucu tazminat hesaplama kriterleri nedir?", i: "⚖️" },
    { t: "Kıdem tazminatı tavanı aşılabilir mi?", i: "📋" },
    { t: "Boşanma davasında mal paylaşımı nasıl yapılır?", i: "🏠" },
    { t: "İcra takibinde zamanaşımı süreleri nelerdir?", i: "⏳" },
  ];
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", gap: 16, textAlign: "center" }}>
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none"><rect width="48" height="48" rx="14" fill="var(--color-accent)"/><text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="var(--color-text-inverse)" fontSize="18" fontWeight="700" fontFamily="Inter, sans-serif">LZ</text></svg>
      <h2 style={{ fontSize: 28, fontWeight: 700, color: "var(--color-text-primary)", letterSpacing: "-0.03em" }}>Legal Zeka</h2>
      <p style={{ fontSize: 15, color: "var(--color-text-secondary)", maxWidth: 520, lineHeight: 1.6 }}>Hukuki sorularınızı sorun, emsal kararları analiz edin, dilekçe taslakları oluşturun.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, maxWidth: 560, width: "100%", marginTop: 28 }}>
        {tips.map((s, i) => (
          <button key={i} onClick={() => onSend(s.t)} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "14px 16px", borderRadius: 12, border: "1px solid var(--color-border)", background: "var(--color-bg-elevated)", cursor: "pointer", textAlign: "left", transition: "all 0.2s", fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.5 }}
            onMouseOver={e => { e.currentTarget.style.borderColor = "var(--color-text-tertiary)"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "var(--shadow-sm)"; }}
            onMouseOut={e => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{s.i}</span>
            <span style={{ fontSize: 13, lineHeight: 1.45 }}>{s.t}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function AIChat() {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [convId, setConvId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  const endRef = useRef(null);
  const inputRef = useRef(null);

  const scrollBottom = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollBottom(); }, [messages, isLoading, scrollBottom]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const loadConversations = async () => {
    try {
      const res = await getConversations();
      setConversations(res.data || []);
    } catch (e) { console.error(e); }
  };

  const loadConversation = async (id) => {
    try {
      const res = await getConversationMessages(id);
      const msgs = (res.data || []).map(m => ({
        id: m.id, role: m.role, content: m.content,
        timestamp: m.created_at,
      }));
      setMessages(msgs);
      setConvId(id);
      setShowHistory(false);
    } catch (e) { console.error(e); }
  };

  const handleDeleteConv = async (id, e) => {
    e.stopPropagation();
    try {
      await deleteConversation(id);
      setConversations(prev => prev.filter(c => c.id !== id));
      if (convId === id) { setMessages([]); setConvId(null); }
    } catch (e) { console.error(e); }
  };

  const handleSend = async (overrideMsg) => {
    const text = (overrideMsg || inputValue).trim();
    if (!text || isLoading) return;

    const userMsg = { id: Date.now().toString(), role: "user", content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInputValue("");
    setIsLoading(true);

    try {
      let activeConvId = convId;
      if (!activeConvId) {
        const convRes = await createConversation();
        activeConvId = convRes.data.id;
        setConvId(activeConvId);
      }

      const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
      const response = await fetch(`${API_BASE}/chat/conversations/${activeConvId}/messages/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: text }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || "Sunucu hatası");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const streamMsgId = (Date.now() + 1).toString();
      let fullText = "";

      setMessages(prev => [...prev, { id: streamMsgId, role: "assistant", content: "", timestamp: new Date().toISOString() }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter(l => l.startsWith("data: "));

        for (const line of lines) {
          try {
            const json = JSON.parse(line.slice(6));
            if (json.error) throw new Error(json.error);
            if (json.content) {
              fullText += json.content;
              setMessages(prev => prev.map(m => m.id === streamMsgId ? { ...m, content: fullText } : m));
            }
          } catch (parseErr) {
            if (parseErr.message && parseErr.message !== "Unexpected end of JSON input") {
              console.warn("SSE parse:", parseErr);
            }
          }
        }
      }

      if (!fullText.trim()) {
        setMessages(prev => prev.map(m => m.id === streamMsgId
          ? { ...m, content: "⚠️ Yapay zeka yanıt üretemedi. Lütfen tekrar deneyin." } : m));
      }
    } catch (error) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(), role: "assistant",
        content: `⚠️ Hata: ${error.message || "Bağlantı hatası"}. Lütfen tekrar deneyin.`,
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } };
  const handleNewChat = () => { setMessages([]); setConvId(null); inputRef.current?.focus(); };
  const hasMessages = messages.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", overflow: "hidden", background: "var(--color-bg)" }}>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column" }}>
        {!hasMessages ? <Welcome onSend={(t) => handleSend(t)} /> : (
          <div style={{ maxWidth: 780, width: "100%", margin: "0 auto", padding: "24px 24px 16px" }}>
            {messages.map(m => <MessageRow key={m.id} msg={m} />)}
            {isLoading && <TypingIndicator />}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* History popup */}
      {showHistory && (
        <div style={{ position: "absolute", bottom: 120, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 600, background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)", borderRadius: 12, boxShadow: "var(--shadow-lg)", maxHeight: 320, overflowY: "auto", zIndex: 100 }} className="animate-fade-in">
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--color-border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>Sohbet Geçmişi</span>
            <button onClick={() => setShowHistory(false)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--color-text-tertiary)", padding: 4 }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 4L4 12M4 4l8 8"/></svg>
            </button>
          </div>
          {conversations.length === 0 ? (
            <p style={{ padding: 24, textAlign: "center", color: "var(--color-text-tertiary)", fontSize: 13 }}>Henüz sohbet geçmişiniz yok.</p>
          ) : conversations.map(c => (
            <div key={c.id} onClick={() => loadConversation(c.id)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", cursor: "pointer", borderBottom: "1px solid var(--color-border-subtle)", transition: "background 0.15s", background: c.id === convId ? "var(--color-bg-subtle)" : "transparent" }}
              onMouseOver={e => e.currentTarget.style.background = "var(--color-bg-subtle)"}
              onMouseOut={e => e.currentTarget.style.background = c.id === convId ? "var(--color-bg-subtle)" : "transparent"}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.title || "Yeni Sohbet"}</p>
                <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{new Date(c.created_at).toLocaleString("tr-TR")}</span>
              </div>
              <button onClick={(e) => handleDeleteConv(c.id, e)}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--color-text-tertiary)", padding: 4, flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 4L4 12M4 4l8 8"/></svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ flexShrink: 0, padding: "0 24px 20px", background: "var(--color-bg)", position: "relative" }}>
        <div style={{ maxWidth: 780, margin: "0 auto", background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)", borderRadius: 16, padding: "12px 12px 12px 18px", boxShadow: "var(--shadow-sm)" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
            <textarea ref={inputRef} value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyDown={handleKeyDown}
              placeholder="Legal Zeka'ya sorunuzu yazın..." rows={1} disabled={isLoading}
              style={{ flex: 1, border: "none", outline: "none", resize: "none", background: "transparent", fontSize: 15, lineHeight: 1.5, color: "var(--color-text-primary)", minHeight: 24, maxHeight: 160, padding: "4px 0", fontFamily: "'Inter', sans-serif" }}
              onInput={e => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px"; }} />
            <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
              <button onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadConversations(); }}
                title="Sohbet Geçmişi"
                style={{ width: 34, height: 34, borderRadius: 10, border: "none", background: showHistory ? "var(--color-bg-subtle)" : "transparent", color: "var(--color-text-tertiary)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 0.15s" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              </button>
              <button onClick={handleNewChat}
                title="Yeni Sohbet"
                style={{ width: 34, height: 34, borderRadius: 10, border: "none", background: "transparent", color: "var(--color-text-tertiary)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 0.15s" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
              <button onClick={() => handleSend()} disabled={!inputValue.trim() || isLoading}
                style={{ width: 34, height: 34, borderRadius: 10, border: "none", background: "var(--color-accent)", color: "var(--color-text-inverse)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s", opacity: (!inputValue.trim() || isLoading) ? 0.35 : 1, cursor: (!inputValue.trim() || isLoading) ? "not-allowed" : "pointer" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
              </button>
            </div>
          </div>
        </div>
        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", textAlign: "center", margin: "10px auto 0", maxWidth: 780, opacity: 0.6 }}>Legal Zeka hukuki bilgi amaçlıdır, avukatlık hizmeti yerine geçmez.</p>
      </div>
    </div>
  );
}
