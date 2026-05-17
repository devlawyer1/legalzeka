"use client";

/* ============================================================
   ChatWindow — Ana sohbet penceresi
   Mesaj listesi + giriş alanı + boş durum ekranı
   ============================================================ */

import { useState, useEffect, useRef } from "react";
import MessageBubble from "./MessageBubble";
import ChatInput from "./ChatInput";
import { createConversation, getConversationMessages, sendChatMessage } from "@/lib/api";

export default function ChatWindow({ conversationId, onConversationCreated, onNewMessage }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const messagesEndRef = useRef(null);

  // Sohbet değiştiğinde mesajları yükle
  useEffect(() => {
    if (conversationId) {
      loadMessages(conversationId);
    } else {
      setMessages([]);
    }
  }, [conversationId]);

  // Otomatik scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  const loadMessages = async (id) => {
    try {
      const res = await getConversationMessages(id);
      setMessages(res.data || []);
    } catch (err) {
      console.error("Mesajlar yüklenemedi:", err);
    }
  };

  const handleSend = async (text) => {
    let activeConvId = conversationId;

    // Eğer aktif sohbet yoksa yeni sohbet oluştur
    if (!activeConvId) {
      try {
        const res = await createConversation();
        activeConvId = res.data.id;
        onConversationCreated?.(activeConvId);
      } catch (err) {
        console.error("Sohbet oluşturulamadı:", err);
        return;
      }
    }

    // Kullanıcı mesajını anında göster
    const userMsg = { role: "user", content: text, created_at: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setStreaming(true);

    try {
      const res = await sendChatMessage(activeConvId, text);

      // AI yanıtını ekle
      setMessages(prev => [...prev, {
        role: "assistant",
        content: res.data.content,
        tool_used: res.data.tool_used,
        created_at: res.data.created_at,
      }]);

      onNewMessage?.();
    } catch (err) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `⚠️ Hata: ${err.message || "Yanıt alınamadı."}`,
        created_at: new Date(),
      }]);
    } finally {
      setStreaming(false);
    }
  };

  // Boş durum ekranı
  if (messages.length === 0 && !loading) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M24 4L4 14l20 10 20-10L24 4z" />
              <path d="M4 34l20 10 20-10" />
              <path d="M4 24l20 10 20-10" />
            </svg>
          </div>
          <h2 style={styles.emptyTitle}>Atlas Hukuk Asistanı</h2>
          <p style={styles.emptyDesc}>Emsal karar arama, dilekçe yazma, mevzuat sorgulama ve daha fazlası...</p>

          {/* Öneri çipleri */}
          <div style={styles.suggestions}>
            {[
              { icon: "⚖️", text: "Kira ödemeyen kiracı için tahliye dilekçesi yaz" },
              { icon: "📚", text: "TCK 157. madde dolandırıcılık suçunu açıkla" },
              { icon: "🔍", text: "İş kazası tazminat emsal kararları" },
              { icon: "🎓", text: "Borçlar hukuku pratik çalışma sorusu sor" },
            ].map((s) => (
              <button
                key={s.text}
                onClick={() => handleSend(s.text)}
                style={styles.suggestionChip}
              >
                <span style={{ fontSize: 18 }}>{s.icon}</span>
                <span>{s.text}</span>
              </button>
            ))}
          </div>
        </div>

        <ChatInput onSend={handleSend} disabled={streaming} />
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Mesaj listesi */}
      <div style={styles.messageList}>
        {messages.map((msg, i) => (
          <MessageBubble
            key={i}
            role={msg.role}
            content={msg.content}
            toolUsed={msg.tool_used}
          />
        ))}

        {/* Streaming indicator */}
        {streaming && (
          <MessageBubble
            role="assistant"
            content=""
            isStreaming={true}
          />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Mesaj girişi */}
      <ChatInput onSend={handleSend} disabled={streaming} />
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
  },
  messageList: {
    flex: 1,
    overflow: "auto",
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    maxWidth: 800,
    width: "100%",
    margin: "0 auto",
  },
  emptyState: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "40px 24px",
    gap: 12,
  },
  emptyIcon: {
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 700,
    color: "var(--color-text-primary)",
    letterSpacing: "-0.03em",
  },
  emptyDesc: {
    fontSize: 14,
    color: "var(--color-text-tertiary)",
    textAlign: "center",
    maxWidth: 400,
    marginBottom: 24,
  },
  suggestions: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    maxWidth: 560,
    width: "100%",
  },
  suggestionChip: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "14px 16px",
    background: "var(--color-bg-elevated)",
    border: "1px solid var(--color-border-subtle)",
    borderRadius: "var(--radius-md)",
    cursor: "pointer",
    fontSize: 13,
    color: "var(--color-text-secondary)",
    textAlign: "left",
    lineHeight: 1.5,
    transition: "all var(--transition-fast)",
    fontFamily: "inherit",
  },
};
