"use client";

import Link from "next/link";
import "../landing.css";

export default function TermsPage() {
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
        <h1 style={{ fontSize: 36, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 24 }}>Kullanım Şartları</h1>
        <p style={{ marginBottom: 16 }}>Son güncellenme tarihi: 24 Mayıs 2026</p>
        
        <h2 style={{ fontSize: 24, fontWeight: 600, color: "var(--color-text-primary)", marginTop: 32, marginBottom: 16 }}>1. Hizmetin Kapsamı</h2>
        <p style={{ marginBottom: 16 }}>
          Legal Zeka, avukatlara ve hukuk profesyonellerine yönelik yapay zeka destekli bir asistan yazılımıdır. Platform üzerinden sunulan emsal aramalar, hesaplamalar ve sözleşme analizleri yalnızca "tavsiye niteliğinde" bilgi sağlamaktadır.
        </p>

        <h2 style={{ fontSize: 24, fontWeight: 600, color: "var(--color-text-primary)", marginTop: 32, marginBottom: 16 }}>2. Sorumluluk Reddi</h2>
        <p style={{ marginBottom: 16 }}>
          Legal Zeka'nın sağladığı tüm sonuçlar (yapay zeka analizleri, süre ve harç hesaplamaları) kullanıcı tarafından kontrol edilmeli ve doğrulanmalıdır. Çıkan sonuçlardan kaynaklanabilecek herhangi bir hukuki veya maddi zarardan platformumuz ve geliştirici şirket sorumlu tutulamaz. Yazılımımız avukatlık hizmeti veya hukuki danışmanlık yerine geçmez.
        </p>

        <h2 style={{ fontSize: 24, fontWeight: 600, color: "var(--color-text-primary)", marginTop: 32, marginBottom: 16 }}>3. Hesap ve Abonelik</h2>
        <p style={{ marginBottom: 16 }}>
          Hesabınızın güvenliğinden ve şifrenizin korunmasından siz sorumlusunuz. Deneme süresi bitiminde veya seçilen abonelik planının ödeme döngülerinde gerekli ücretlerin ödenmemesi durumunda hesabınız dondurulabilir.
        </p>
      </div>
    </div>
  );
}
