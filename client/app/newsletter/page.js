"use client";

import { useState } from "react";
import { subscribeToNewsletter } from "@/lib/api";

export default function NewsletterPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'success' | 'error', message: '' }

  const handleSubscribe = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    try {
      await subscribeToNewsletter(email, ["Tümü"]);
      setStatus({ type: 'success', message: 'Tebrikler! Bültene başarıyla abone oldunuz.' });
      setEmail("");
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Bir hata oluştu.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.header}>
          <div style={styles.logo}>
            <svg width="40" height="40" viewBox="0 0 44 44" fill="none">
              <rect width="44" height="44" rx="12" fill="var(--color-accent)" />
              <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="white" fontSize="18" fontWeight="800" fontFamily="sans-serif">LZ</text>
            </svg>
          </div>
          <h1 style={styles.title}>Haftalık Hukuk Bülteni</h1>
          <p style={styles.subtitle}>
            Resmi Gazete'deki en güncel kanunlar, AYM kararları ve yönetmelikler
            yapay zeka tarafından özetlenip her Cuma e-postanıza gelsin.
          </p>
        </div>

        <form onSubmit={handleSubscribe} style={styles.form}>
          <div style={styles.inputWrapper}>
            <input
              type="email"
              placeholder="E-posta adresiniz..."
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={styles.input}
            />
            <button type="submit" disabled={loading} style={styles.button}>
              {loading ? "Kaydediliyor..." : "Abone Ol"}
            </button>
          </div>
        </form>

        {status && (
          <div style={{ ...styles.statusMessage, background: status.type === 'success' ? '#dcfce7' : '#fee2e2', color: status.type === 'success' ? '#166534' : '#991b1b' }}>
            {status.message}
          </div>
        )}

        <div style={styles.features}>
          <div style={styles.feature}>
            <span style={styles.icon}>📰</span>
            <p><strong>Özetlenmiş İçerik</strong><br/>Uzun metinler yerine hukuki analizler.</p>
          </div>
          <div style={styles.feature}>
            <span style={styles.icon}>⚡</span>
            <p><strong>Hızlı Okuma</strong><br/>Sadece önemli detaylar cebinizde.</p>
          </div>
          <div style={styles.feature}>
            <span style={styles.icon}>🎯</span>
            <p><strong>İlgili Kararlar</strong><br/>Emsal Atlası veri tabanından içtihatlar.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "var(--color-bg)",
    padding: "20px",
  },
  container: {
    maxWidth: "600px",
    width: "100%",
    backgroundColor: "var(--color-bg-subtle)",
    borderRadius: "16px",
    padding: "40px",
    boxShadow: "var(--shadow-sm)",
    textAlign: "center",
  },
  header: {
    marginBottom: "30px",
  },
  logo: {
    display: "inline-flex",
    marginBottom: "20px",
  },
  title: {
    fontSize: "28px",
    fontWeight: "700",
    color: "var(--color-text-primary)",
    marginBottom: "12px",
  },
  subtitle: {
    fontSize: "16px",
    color: "var(--color-text-secondary)",
    lineHeight: "1.5",
  },
  form: {
    marginBottom: "20px",
  },
  inputWrapper: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap"
  },
  input: {
    flex: 1,
    padding: "14px 20px",
    borderRadius: "8px",
    border: "1px solid var(--color-border)",
    fontSize: "16px",
    outline: "none",
  },
  button: {
    padding: "14px 24px",
    backgroundColor: "var(--color-accent)",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "background 0.2s",
  },
  statusMessage: {
    padding: "12px 16px",
    borderRadius: "8px",
    marginBottom: "30px",
    fontSize: "14px",
    fontWeight: "500",
  },
  features: {
    display: "flex",
    gap: "20px",
    marginTop: "40px",
    borderTop: "1px solid var(--color-border)",
    paddingTop: "30px",
    textAlign: "left",
  },
  feature: {
    flex: 1,
  },
  icon: {
    fontSize: "24px",
    display: "block",
    marginBottom: "10px",
  }
};
