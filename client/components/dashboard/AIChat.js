"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { createConversation, getConversations, getConversationMessages, deleteConversation } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

// ─── Markdown-lite renderer ───────────────────────────────────
function renderMd(t) {
  if (!t) return "";
  return t
    .replace(/```([\s\S]*?)```/g, '<pre style="background:var(--color-bg-subtle);padding:12px 16px;border-radius:var(--radius-sm);overflow-x:auto;font-size:13px;line-height:1.5;margin:8px 0;border:1px solid var(--color-border-subtle)"><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code style="background:var(--color-bg-subtle);padding:2px 6px;border-radius:4px;font-size:13px">$1</code>')
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br/>");
}

// ─── Typing indicator ────────────────────────────────────────
function TypingDots() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", marginLeft: 44 }}>
      <div style={{ display: "flex", gap: 4 }}>
        {[0, 0.2, 0.4].map((d, i) => (
          <span key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-text-tertiary)", animation: "pulse-ring 1.2s ease-in-out infinite", animationDelay: `${d}s`, display: "inline-block" }} />
        ))}
      </div>
      <span style={{ fontSize: 13, color: "var(--color-text-tertiary)", fontStyle: "italic" }}>Legal Zeka düşünüyor...</span>
    </div>
  );
}

// ─── Message bubble ──────────────────────────────────────────
function Bubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", justifyContent: isUser ? "flex-end" : "flex-start" }} className="animate-fade-in">
      {!isUser && (
        <div style={{ width: 34, height: 34, borderRadius: "var(--radius-sm)", background: "var(--color-accent)", color: "var(--color-text-inverse)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a4 4 0 014 4v2a4 4 0 01-8 0V6a4 4 0 014-4z"/><path d="M16 14H8a4 4 0 00-4 4v2h16v-2a4 4 0 00-4-4z"/></svg>
        </div>
      )}
      <div style={{
        maxWidth: "75%", borderRadius: "var(--radius-md)", padding: "12px 16px", lineHeight: 1.6,
        ...(isUser
          ? { background: "var(--color-accent)", color: "var(--color-text-inverse)", borderBottomRightRadius: 4 }
          : { background: "var(--color-bg-elevated)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-subtle)", borderBottomLeftRadius: 4, boxShadow: "var(--shadow-xs)" })
      }}>
        {isUser ? <p style={{ fontSize: 14, lineHeight: 1.65, wordBreak: "break-word" }}>{msg.content}</p>
          : <div style={{ fontSize: 14, lineHeight: 1.65, wordBreak: "break-word" }} dangerouslySetInnerHTML={{ __html: renderMd(msg.content) }} />}
        {msg.timestamp && <span style={{ display: "block", fontSize: 11, color: "rgba(128,128,128,0.6)", marginTop: 6, textAlign: isUser ? "right" : "left" }}>{new Date(msg.timestamp).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span>}
      </div>
      {isUser && (
        <div style={{ width: 34, height: 34, borderRadius: "var(--radius-sm)", background: "linear-gradient(135deg, #2563EB, #3B82F6)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
      )}
    </div>
  );
}

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
      <h2 style={{ fontSize: 26, fontWeight: 700, color: "var(--color-text-primary)", letterSpacing: "-0.03em" }}>Legal Zeka AI Asistanı</h2>
      <p style={{ fontSize: 14, color: "var(--color-text-secondary)", maxWidth: 480, lineHeight: 1.6 }}>Hukuki sorularınızı sorun, emsal kararları analiz edin, mevzuatı inceleyin.<br/>Eğitilmiş yapay zeka modelimiz size yardımcı olsun.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, maxWidth: 560, width: "100%", marginTop: 24 }}>
        {tips.map((s, i) => (
          <button key={i} onClick={() => onSend(s.t)} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "14px 16px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", background: "var(--color-bg-subtle)", cursor: "pointer", textAlign: "left", transition: "all var(--transition-fast)", fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.5 }}
            onMouseOver={e => { e.currentTarget.style.borderColor = "var(--color-text-tertiary)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
            onMouseOut={e => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.transform = "translateY(0)"; }}>
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

  // ─── Load conversations list ────────────────────────────────
  const loadConversations = async () => {
    try {
      const res = await getConversations();
      setConversations(res.data || []);
    } catch (e) { console.error(e); }
  };

  // ─── Load a specific conversation ───────────────────────────
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

  // ─── Delete conversation ───────────────────────────────────
  const handleDeleteConv = async (id, e) => {
    e.stopPropagation();
    try {
      await deleteConversation(id);
      setConversations(prev => prev.filter(c => c.id !== id));
      if (convId === id) { setMessages([]); setConvId(null); }
    } catch (e) { console.error(e); }
  };

  // ─── Send message with streaming ────────────────────────────
  const handleSend = async (overrideMsg) => {
    const text = (overrideMsg || inputValue).trim();
    if (!text || isLoading) return;

    const userMsg = { id: Date.now().toString(), role: "user", content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInputValue("");
    setIsLoading(true);

    try {
      // Conversation yoksa oluştur
      let activeConvId = convId;
      if (!activeConvId) {
        const convRes = await createConversation();
        activeConvId = convRes.data.id;
        setConvId(activeConvId);
      }

      // Streaming request
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
        // Fallback: non-streaming
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || "Sunucu hatası");
      }

      // SSE stream parse
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

      // Eğer streaming'den hiç metin gelemediyse hata göster
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
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid var(--color-border-subtle)", background: "var(--color-bg-elevated)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: "var(--radius-md)", background: "var(--color-accent)", color: "var(--color-text-inverse)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          </div>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)" }}>Legal Zeka AI</h3>
            <span style={{ fontSize: 12, color: "var(--color-text-tertiary)", display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22C55E", display: "inline-block" }} />Çevrimiçi
            </span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Geçmiş sohbetler butonu */}
          <button onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadConversations(); }}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: showHistory ? "var(--color-bg-subtle)" : "transparent", color: "var(--color-text-secondary)", fontSize: 13, cursor: "pointer", transition: "all var(--transition-fast)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            <span>Geçmiş</span>
          </button>
          {/* Yeni sohbet */}
          <button onClick={handleNewChat}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "transparent", color: "var(--color-text-secondary)", fontSize: 13, cursor: "pointer", transition: "all var(--transition-fast)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span>Yeni</span>
          </button>
        </div>
      </div>

      {/* Conversation history dropdown */}
      {showHistory && (
        <div style={{ borderBottom: "1px solid var(--color-border-subtle)", background: "var(--color-bg-elevated)", maxHeight: 260, overflowY: "auto", flexShrink: 0 }} className="animate-fade-in">
          {conversations.length === 0 ? (
            <p style={{ padding: 20, textAlign: "center", color: "var(--color-text-tertiary)", fontSize: 13 }}>Henüz sohbet geçmişiniz yok.</p>
          ) : conversations.map(c => (
            <div key={c.id} onClick={() => loadConversation(c.id)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 24px", cursor: "pointer", borderBottom: "1px solid var(--color-border-subtle)", transition: "background var(--transition-fast)", background: c.id === convId ? "var(--color-bg-subtle)" : "transparent" }}
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

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column" }}>
        {!hasMessages ? <Welcome onSend={(t) => handleSend(t)} /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "24px 24px 16px", maxWidth: 860, width: "100%", margin: "0 auto" }}>
            {messages.map(m => <Bubble key={m.id} msg={m} />)}
            {isLoading && <TypingDots />}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ flexShrink: 0, borderTop: "1px solid var(--color-border-subtle)", padding: "16px 24px 12px", background: "var(--color-bg-elevated)" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, maxWidth: 860, margin: "0 auto", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "8px 8px 8px 16px", transition: "border-color var(--transition-fast)" }}>
          <textarea ref={inputRef} value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="Hukuki sorunuzu yazın..." rows={1} disabled={isLoading}
            style={{ flex: 1, border: "none", outline: "none", resize: "none", background: "transparent", fontSize: 14, lineHeight: 1.5, color: "var(--color-text-primary)", minHeight: 24, maxHeight: 160, padding: "4px 0", fontFamily: "'Inter', sans-serif" }}
            onInput={e => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px"; }} />
          <button onClick={() => handleSend()} disabled={!inputValue.trim() || isLoading}
            style={{ width: 38, height: 38, borderRadius: "var(--radius-md)", border: "none", background: "var(--color-accent)", color: "var(--color-text-inverse)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all var(--transition-fast)", opacity: (!inputValue.trim() || isLoading) ? 0.4 : 1, cursor: (!inputValue.trim() || isLoading) ? "not-allowed" : "pointer" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", textAlign: "center", margin: "8px auto 0", maxWidth: 860 }}>Legal Zeka AI hukuki bilgi amaçlıdır, avukatlık hizmeti yerine geçmez.</p>
      </div>
    </div>
  );
}
