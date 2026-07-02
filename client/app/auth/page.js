"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { login, register, isAuthenticated } from "@/lib/api";
import responsive from "./page.module.css";

/* ============================================================
   Emsal Atlası - Auth Page
   Login / Register with tab-switching, Apple/Linear aesthetic
   ============================================================ */

export default function AuthPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState("");

  // Register state
  const [regFirstName, setRegFirstName] = useState("");
  const [regLastName, setRegLastName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPasswordConfirm, setRegPasswordConfirm] = useState("");

  useEffect(() => {
    if (isAuthenticated()) router.replace("/dashboard");
  }, [router]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await login({ email: loginEmail, password: loginPassword, mfaCode: mfaRequired ? mfaCode : undefined });
      if (result.data?.mfaRequired) {
        setMfaRequired(true);
        setSuccess("Dogrulama uygulamanizdaki kodu veya bir kurtarma kodunu girin.");
        return;
      }
      router.push("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register({
        firstName: regFirstName,
        lastName: regLastName,
        email: regEmail,
        password: regPassword,
        passwordConfirm: regPasswordConfirm,
      });
      router.push("/dashboard");
    } catch (err) {
      setError(err.data?.errors ? err.data.errors.map((e) => e.message).join(", ") : err.message);
    } finally {
      setLoading(false);
    }
  };

  const switchTab = (tab) => {
    setActiveTab(tab);
    setError("");
    setSuccess("");
    setMfaRequired(false);
    setMfaCode("");
  };

  return (
    <div style={styles.page} className={responsive.page}>
      {/* Left: Visual / Branding */}
      <div style={styles.leftPanel} className={responsive.leftPanel}>
        <div style={styles.brandingContent} className={responsive.brandingContent}>
          {/* Logo */}
          <div style={styles.logo} className={responsive.logo}>
            <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
              <rect width="44" height="44" rx="12" fill="var(--color-accent)" />
              <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="var(--color-text-inverse)" fontSize="18" fontWeight="800" fontFamily="sans-serif">LZ</text>
            </svg>
            <span style={styles.logoText}>Legal Zeka</span>
          </div>

          <h1 style={styles.heroTitle} className={responsive.heroTitle}>
            Hukuki Süreçlerinizde
            <br />
            <span style={styles.heroAccent}>Yapay Zeka Gücü.</span>
          </h1>
          <p style={styles.heroDesc} className={responsive.heroDesc}>
            Legal Zeka ile dilekçelerinizi oluşturun, sözleşmelerinizi analiz edin ve emsal kararlara saniyeler içinde ulaşın.
          </p>

          {/* Feature bullets */}
          <div style={styles.features} className={responsive.features}>
            {[
              "Yapay Zeka ile Dilekçe & Sözleşme İnceleme",
              "Semantik Emsal Arama ve Time-Travel Mevzuat",
              "Büro Yönetimi ve UYAP Entegrasyonu",
            ].map((f, i) => (
              <div key={i} style={styles.featureItem}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <circle cx="9" cy="9" r="9" fill="var(--color-accent-subtle)" />
                  <path d="M5.5 9l2.5 2.5L12.5 7" stroke="var(--color-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span style={styles.featureText}>{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Auth Form */}
      <div style={styles.rightPanel} className={responsive.rightPanel}>
        <div style={styles.formContainer} className={`animate-fade-in ${responsive.formContainer}`}>
          {/* Tab Switcher */}
          <div style={styles.tabBar}>
            <button
              onClick={() => switchTab("login")}
              style={{
                ...styles.tab,
                ...(activeTab === "login" ? styles.tabActive : {}),
              }}
            >
              Giriş Yap
            </button>
            <button
              onClick={() => switchTab("register")}
              style={{
                ...styles.tab,
                ...(activeTab === "register" ? styles.tabActive : {}),
              }}
            >
              Kayıt Ol
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div style={styles.errorBox}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="8" fill="#FEE2E2" />
                <path d="M8 5v3m0 2h.01" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span>{error}</span>
            </div>
          )}
          {success && <div role="status" style={styles.successBox}>{success}</div>}

          {/* Login Form */}
          {activeTab === "login" && (
            <form onSubmit={handleLogin} style={styles.form}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>E-posta</label>
                <input
                  type="email"
                  placeholder="ornek@avukat.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                  style={styles.input}
                />
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Şifre</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                  style={styles.input}
                />
              </div>
              {mfaRequired && <div style={styles.inputGroup}>
                <label htmlFor="mfa-code" style={styles.label}>Dogrulama kodu</label>
                <input
                  id="mfa-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.trim())}
                  required
                  autoFocus
                  style={styles.input}
                />
              </div>}
              <button type="submit" disabled={loading} style={styles.submitBtn}>
                {loading ? <span style={styles.spinner} /> : mfaRequired ? "Dogrula" : "Giriş Yap"}
              </button>
            </form>
          )}

          {/* Register Form */}
          {activeTab === "register" && (
            <form onSubmit={handleRegister} style={styles.form}>
              <div style={styles.row} className={responsive.row}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Ad</label>
                  <input
                    type="text"
                    placeholder="Ahmet"
                    value={regFirstName}
                    onChange={(e) => setRegFirstName(e.target.value)}
                    required
                    style={styles.input}
                  />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Soyad</label>
                  <input
                    type="text"
                    placeholder="Yılmaz"
                    value={regLastName}
                    onChange={(e) => setRegLastName(e.target.value)}
                    required
                    style={styles.input}
                  />
                </div>
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>E-posta</label>
                <input
                  type="email"
                  placeholder="ornek@avukat.com"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  required
                  style={styles.input}
                />
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Şifre</label>
                <input
                  type="password"
                  placeholder="En az 8 karakter (Aa1...)"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  required
                  style={styles.input}
                />
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Şifre Tekrar</label>
                <input
                  type="password"
                  placeholder="Şifrenizi tekrar girin"
                  value={regPasswordConfirm}
                  onChange={(e) => setRegPasswordConfirm(e.target.value)}
                  required
                  style={styles.input}
                />
              </div>
              <button type="submit" disabled={loading} style={styles.submitBtn}>
                {loading ? <span style={styles.spinner} /> : "Kayıt Ol"}
              </button>
              <p style={styles.trialNote}>
                🎁 Kayıt olduğunuzda 7 günlük ücretsiz deneme başlar
              </p>
            </form>
          )}

          {/* Footer */}
          <p style={styles.footerText}>
            {activeTab === "login" ? "Hesabınız yok mu? " : "Zaten hesabınız var mı? "}
            <button
              onClick={() => switchTab(activeTab === "login" ? "register" : "login")}
              style={styles.linkBtn}
            >
              {activeTab === "login" ? "Kayıt Ol" : "Giriş Yap"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Inline Styles — Apple/Notion/Linear design language
   ============================================================ */
const styles = {
  page: {
    display: "flex",
    minHeight: "100vh",
    backgroundImage: "linear-gradient(145deg, rgba(22, 22, 22, 0.8) 0%, rgba(22, 22, 22, 0.95) 100%), url('/auth-bg.jpg')",
    backgroundSize: "cover",
    backgroundPosition: "center",
  },

  /* Left branding panel */
  leftPanel: {
    flex: "0 0 48%",
    background: "transparent",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "60px",
    position: "relative",
    overflow: "hidden",
  },
  brandingContent: {
    maxWidth: 460,
    position: "relative",
    zIndex: 1,
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 48,
  },
  logoText: {
    fontSize: 20,
    fontWeight: 700,
    color: "var(--color-text-primary)",
    letterSpacing: "-0.02em",
  },
  heroTitle: {
    fontSize: 42,
    fontWeight: 700,
    lineHeight: 1.15,
    color: "var(--color-text-primary)",
    letterSpacing: "-0.03em",
    marginBottom: 20,
  },
  heroAccent: {
    color: "var(--color-accent)",
  },
  heroDesc: {
    fontSize: 16,
    lineHeight: 1.7,
    color: "var(--color-text-secondary)",
    marginBottom: 36,
  },
  features: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  featureItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  featureText: {
    fontSize: 14,
    color: "var(--color-text-secondary)",
    fontWeight: 500,
  },

  /* Right form panel */
  rightPanel: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "60px 40px",
  },
  formContainer: {
    width: "100%",
    maxWidth: 420,
  },

  /* Tabs */
  tabBar: {
    display: "flex",
    background: "var(--color-bg-subtle)",
    borderRadius: "var(--radius-md)",
    padding: 4,
    marginBottom: 28,
  },
  tab: {
    flex: 1,
    padding: "10px 16px",
    border: "none",
    borderRadius: "var(--radius-sm)",
    background: "transparent",
    color: "var(--color-text-tertiary)",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    transition: "all var(--transition-fast)",
  },
  tabActive: {
    background: "var(--color-bg-elevated)",
    color: "var(--color-text-primary)",
    boxShadow: "var(--shadow-sm)",
  },

  /* Form */
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
  },
  row: {
    display: "flex",
    gap: 12,
  },
  inputGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    flex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: 500,
    color: "var(--color-text-secondary)",
  },
  input: {
    padding: "11px 14px",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-border)",
    background: "var(--color-bg-elevated)",
    fontSize: 14,
    color: "var(--color-text-primary)",
    transition: "all var(--transition-fast)",
    outline: "none",
    width: "100%",
  },
  submitBtn: {
    marginTop: 4,
    padding: "12px 20px",
    borderRadius: "var(--radius-md)",
    border: "none",
    background: "var(--color-text-primary)",
    color: "var(--color-text-inverse)",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all var(--transition-fast)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  spinner: {
    width: 18,
    height: 18,
    border: "2px solid rgba(255,255,255,0.3)",
    borderTopColor: "#fff",
    borderRadius: "50%",
    display: "inline-block",
    animation: "spin 0.6s linear infinite",
  },
  trialNote: {
    fontSize: 13,
    color: "var(--color-text-tertiary)",
    textAlign: "center",
  },

  /* Error */
  errorBox: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    borderRadius: "var(--radius-md)",
    background: "#FEF2F2",
    border: "1px solid #FECACA",
    color: "#DC2626",
    fontSize: 13,
    marginBottom: 4,
  },
  successBox: {
    padding: "10px 14px",
    borderRadius: "var(--radius-md)",
    background: "#142d20",
    border: "1px solid #2d6a43",
    color: "#8ee0aa",
    fontSize: 13,
    marginBottom: 4,
  },

  /* Footer */
  footerText: {
    marginTop: 24,
    textAlign: "center",
    fontSize: 13,
    color: "var(--color-text-tertiary)",
  },
  linkBtn: {
    background: "none",
    border: "none",
    color: "var(--color-accent)",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 13,
  },
};
