"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, FileDown, MessageSquare, RefreshCw, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import responsive from "./page.module.css";
import {
  downloadPortalDocument,
  getPortalCase,
  getPortalCases,
  getPortalMessages,
  isAuthenticated,
  sendPortalMessage,
} from "@/lib/api";

export default function ClientPortalPage() {
  const router = useRouter();
  const [cases, setCases] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [detail, setDetail] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadCases() {
    setLoading(true);
    setStatus("");
    try {
      const response = await getPortalCases();
      const rows = response.data || [];
      setCases(rows);
      setSelectedCaseId((current) => current || rows[0]?.id || "");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(caseId) {
    if (!caseId) {
      setDetail(null);
      setMessages([]);
      return;
    }
    setLoading(true);
    try {
      const [caseResponse, messageResponse] = await Promise.all([
        getPortalCase(caseId),
        getPortalMessages(caseId),
      ]);
      setDetail(caseResponse.data);
      setMessages(messageResponse.data || []);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/auth");
      return;
    }
    loadCases();
  }, [router]);

  useEffect(() => {
    loadDetail(selectedCaseId);
  }, [selectedCaseId]);

  async function submitMessage(event) {
    event.preventDefault();
    if (!message.trim() || !selectedCaseId) return;
    try {
      await sendPortalMessage({ caseId: selectedCaseId, senderType: "CLIENT", body: message.trim() });
      setMessage("");
      const response = await getPortalMessages(selectedCaseId);
      setMessages(response.data || []);
    } catch (error) {
      setStatus(error.message);
    }
  }

  const sharedDocuments = (detail?.sharedItems || []).filter((item) => item.item_type === "DOCUMENT");

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <button type="button" title="Dashboarda don" onClick={() => router.push("/dashboard")} style={styles.iconButton}>
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 style={styles.title}>Muvekkil Portali</h1>
          <p style={styles.subtitle}>Sizinle paylasilan dosya gelismeleri ve belgeler</p>
        </div>
        <button type="button" title="Yenile" onClick={loadCases} style={styles.iconButton}>
          <RefreshCw size={18} />
        </button>
      </header>

      {status && <div style={styles.alert}>{status}</div>}

      <div className={responsive.layout} style={styles.layout}>
        <aside style={styles.sidebar}>
          <div style={styles.sectionLabel}>Dosyalar</div>
          {cases.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => setSelectedCaseId(item.id)}
              style={{ ...styles.caseButton, ...(selectedCaseId === item.id ? styles.caseButtonActive : {}) }}
            >
              <strong>{item.konu || "Hukuki dosya"}</strong>
              <span>{item.esas_no || item.mahkeme || "Paylasilan matter"}</span>
            </button>
          ))}
          {!loading && cases.length === 0 && <p style={styles.empty}>Aktif portal dosyaniz bulunmuyor.</p>}
        </aside>

        <section style={styles.content}>
          {loading && !detail ? (
            <p style={styles.empty}>Yukleniyor...</p>
          ) : detail ? (
            <>
              <section style={styles.band}>
                <h2 style={styles.heading}>Dosya gelismeleri</h2>
                <div style={styles.list}>
                  {(detail.updates || []).map((item) => (
                    <article key={item.id} style={styles.item}>
                      <strong>{item.title}</strong>
                      <p>{item.content}</p>
                    </article>
                  ))}
                  {(detail.updates || []).length === 0 && <p style={styles.empty}>Paylasilan gelisme yok.</p>}
                </div>
              </section>

              <section style={styles.band}>
                <h2 style={styles.heading}>Belgeler</h2>
                <div style={styles.list}>
                  {sharedDocuments.map((item) => (
                    <div key={item.id} style={styles.documentRow}>
                      <span>{item.title}</span>
                      <button
                        type="button"
                        title="Belgeyi indir"
                        onClick={() => downloadPortalDocument(selectedCaseId, item.item_id, item.title)}
                        style={styles.iconButton}
                      >
                        <FileDown size={18} />
                      </button>
                    </div>
                  ))}
                  {sharedDocuments.length === 0 && <p style={styles.empty}>Paylasilan belge yok.</p>}
                </div>
              </section>

              <section style={styles.band}>
                <div style={styles.headingRow}>
                  <h2 style={styles.heading}>Mesajlar</h2>
                  <MessageSquare size={18} />
                </div>
                <div style={styles.messages}>
                  {messages.map((item) => (
                    <div key={item.id} style={{ ...styles.message, ...(item.sender_type === "CLIENT" ? styles.ownMessage : {}) }}>
                      {item.subject && <strong>{item.subject}</strong>}
                      <p>{item.body}</p>
                    </div>
                  ))}
                </div>
                <form className={responsive.composer} onSubmit={submitMessage} style={styles.composer}>
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Mesajinizi yazin"
                    rows={3}
                    style={styles.textarea}
                  />
                  <button type="submit" title="Mesaji gonder" style={styles.sendButton}>
                    <Send size={17} />
                    Gonder
                  </button>
                </form>
              </section>
            </>
          ) : (
            <p style={styles.empty}>Goruntulenecek dosya secin.</p>
          )}
        </section>
      </div>
    </main>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "var(--color-bg)", color: "var(--color-text-primary)" },
  header: {
    minHeight: 76,
    display: "grid",
    gridTemplateColumns: "40px minmax(0, 1fr) 40px",
    alignItems: "center",
    gap: 16,
    padding: "14px clamp(16px, 4vw, 40px)",
    borderBottom: "1px solid var(--color-border)",
    background: "var(--color-bg-elevated)",
  },
  title: { fontSize: 20, lineHeight: 1.2, letterSpacing: 0 },
  subtitle: { marginTop: 3, color: "var(--color-text-tertiary)", fontSize: 12 },
  iconButton: {
    width: 36,
    height: 36,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid var(--color-border)",
    borderRadius: 6,
    background: "var(--color-bg-subtle)",
    color: "var(--color-text-primary)",
    cursor: "pointer",
    flexShrink: 0,
  },
  alert: { margin: "16px auto 0", maxWidth: 1180, padding: "10px 14px", color: "#FCA5A5", fontSize: 13 },
  layout: {
    width: "min(1180px, 100%)",
    minHeight: "calc(100vh - 76px)",
    margin: "0 auto",
    display: "grid",
  },
  sidebar: { padding: 20, borderRight: "1px solid var(--color-border)" },
  sectionLabel: { marginBottom: 10, color: "var(--color-text-tertiary)", fontSize: 11, fontWeight: 700, textTransform: "uppercase" },
  caseButton: {
    width: "100%",
    minHeight: 68,
    padding: "12px",
    marginBottom: 8,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 4,
    overflow: "hidden",
    border: "1px solid transparent",
    borderRadius: 6,
    background: "transparent",
    color: "var(--color-text-primary)",
    textAlign: "left",
    cursor: "pointer",
  },
  caseButtonActive: { borderColor: "var(--color-border)", background: "var(--color-bg-elevated)" },
  content: { minWidth: 0, padding: "24px clamp(16px, 4vw, 40px)" },
  band: { padding: "0 0 26px", marginBottom: 26, borderBottom: "1px solid var(--color-border)" },
  headingRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 14 },
  heading: { marginBottom: 14, fontSize: 15, letterSpacing: 0 },
  list: { display: "grid", gap: 8 },
  item: { padding: "14px 0", borderBottom: "1px solid var(--color-border-subtle)" },
  documentRow: {
    minHeight: 48,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderBottom: "1px solid var(--color-border-subtle)",
  },
  empty: { color: "var(--color-text-tertiary)", fontSize: 13 },
  messages: { display: "grid", gap: 8, maxHeight: 360, overflowY: "auto", marginBottom: 14 },
  message: {
    width: "min(540px, 88%)",
    padding: "10px 12px",
    border: "1px solid var(--color-border)",
    borderRadius: 6,
    background: "var(--color-bg-subtle)",
  },
  ownMessage: { justifySelf: "end", background: "var(--color-bg-elevated)" },
  composer: { display: "grid", gap: 10, alignItems: "end" },
  textarea: {
    width: "100%",
    resize: "vertical",
    padding: 12,
    border: "1px solid var(--color-border)",
    borderRadius: 6,
    background: "var(--color-bg-subtle)",
    color: "var(--color-text-primary)",
  },
  sendButton: {
    minHeight: 40,
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "0 14px",
    border: 0,
    borderRadius: 6,
    background: "var(--color-accent)",
    color: "var(--color-text-inverse)",
    fontWeight: 700,
    cursor: "pointer",
  },
};
