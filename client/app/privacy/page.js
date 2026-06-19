"use client";

import Link from "next/link";
import "../landing.css";

export default function PrivacyPage() {
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

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "60px 20px 0", color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
        <h1 style={{ fontSize: 36, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 24 }}>Gizlilik Politikası</h1>
        <p style={{ marginBottom: 16 }}>Son güncellenme tarihi: 24 Mayıs 2026</p>
        
        <h2 style={{ fontSize: 24, fontWeight: 600, color: "var(--color-text-primary)", marginTop: 32, marginBottom: 16 }}>1. Toplanan Veriler</h2>
        <p style={{ marginBottom: 16 }}>
          Legal Zeka olarak size en iyi hizmeti sunabilmek için ad, soyad, e-posta adresi gibi temel iletişim bilgilerinizi ve uygulamayı kullanım verilerinizi topluyoruz. Ayrıca yapay zeka analizleri için platforma yüklediğiniz dilekçe ve sözleşme metinleri yalnızca sizin izninizle ve geçici olarak işlenmektedir.
        </p>

        <h2 style={{ fontSize: 24, fontWeight: 600, color: "var(--color-text-primary)", marginTop: 32, marginBottom: 16 }}>2. Verilerin Kullanımı</h2>
        <p style={{ marginBottom: 16 }}>
          Topladığımız veriler, size sağladığımız hizmetlerin yürütülmesi, yapay zeka destekli araçların (Şeytanın Avukatı, Sözleşme İnceleme vb.) performansının optimize edilmesi ve hesabınızın güvenliğinin sağlanması amacıyla kullanılmaktadır.
        </p>

        <h2 style={{ fontSize: 24, fontWeight: 600, color: "var(--color-text-primary)", marginTop: 32, marginBottom: 16 }}>3. Veri Güvenliği</h2>
        <p style={{ marginBottom: 16 }}>
          Platforma yüklediğiniz hukuki dokümanlar ve UYAP entegrasyonu aracılığıyla çekilen veriler, uçtan uca şifreleme yöntemleriyle korunmaktadır. Verileriniz hiçbir üçüncü tarafla veya reklam verenle paylaşılmaz.
        </p>

        <p style={{ marginTop: 40 }}>
          Daha fazla bilgi için bizimle <Link href="/contact" style={{ color: "var(--color-accent)", textDecoration: "underline" }}>iletişime</Link> geçebilirsiniz.
        </p>
      </div>
    </div>
  );
}
