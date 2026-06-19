"use client";

import Link from "next/link";
import "../landing.css";

export default function ContactPage() {
  return (
    <div className="landing-page" style={{ background: "var(--color-bg)", minHeight: "100vh", paddingBottom: "100px" }}>
      <nav className="landing-nav">
        <Link href="/" className="landing-nav__logo">
          <div className="landing-nav__logo-icon">LZ</div>
          <div className="landing-nav__logo-text">Legal Zeka</div>
        </Link>
        <ul className="landing-nav__links">
          <li><Link href="/">Ana Sayfa</Link></li>
          <li><Link href="/auth" className="landing-nav__cta">Giriş Yap</Link></li>
        </ul>
      </nav>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "60px 20px 0", color: "var(--color-text-secondary)", lineHeight: 1.8, textAlign: "center" }}>
        <h1 style={{ fontSize: 36, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 16 }}>İletişim</h1>
        <p style={{ marginBottom: 40 }}>
          Soru, görüş veya destek talepleriniz için bize her zaman ulaşabilirsiniz.
        </p>

        <div style={{ background: "var(--color-bg-elevated)", padding: 40, borderRadius: 16, border: "1px solid var(--color-border)" }}>
          <h3 style={{ fontSize: 20, color: "var(--color-text-primary)", marginBottom: 8 }}>E-posta</h3>
          <p style={{ fontSize: 18, color: "var(--color-accent)", fontWeight: 600, marginBottom: 24 }}>destek@legalzeka.com</p>

          <h3 style={{ fontSize: 20, color: "var(--color-text-primary)", marginBottom: 8 }}>Müşteri Hizmetleri</h3>
          <p style={{ fontSize: 18, color: "var(--color-text-secondary)", marginBottom: 24 }}>Hafta içi 09:00 - 18:00 arasında canlı destek sistemimiz üzerinden bize yazabilirsiniz.</p>

          <h3 style={{ fontSize: 20, color: "var(--color-text-primary)", marginBottom: 8 }}>Adres</h3>
          <p style={{ fontSize: 16, color: "var(--color-text-secondary)" }}>
            Bilişim Vadisi, Teknoloji Geliştirme Bölgesi<br/>
            Muallimköy Mah. Deniz Cad.<br/>
            Gebze / Kocaeli
          </p>
        </div>
      </div>
    </div>
  );
}
