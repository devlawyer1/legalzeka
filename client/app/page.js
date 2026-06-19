"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import InteractiveDemo from "@/components/landing/InteractiveDemo";
import "./landing.css";

/* ============================================================
   Legal Zeka — Landing Page
   Full-featured LegalTech SaaS platform
   ============================================================ */

export default function Home() {
  const revealRefs = useRef([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
          }
        });
      },
      { threshold: 0.15 }
    );

    revealRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const addRevealRef = (el) => {
    if (el && !revealRefs.current.includes(el)) {
      revealRefs.current.push(el);
    }
  };

  return (
    <div className="landing-page">
      {/* ===== HERO ===== */}
      <section className="landing-hero">
        <div className="landing-hero__bg">
          <img
            src="/hero-bg.jpg"
            alt="Hukuk bürosu masası"
            draggable={false}
          />
          <div className="landing-hero__overlay" />
        </div>

        {/* Navbar */}
        <nav className="landing-nav">
          <Link href="/" className="landing-nav__logo">
            <div className="landing-nav__logo-icon">LZ</div>
            <div className="landing-nav__logo-text">Legal Zeka</div>
          </Link>

          <ul className="landing-nav__links">
            <li><a href="#ozellikler">Özellikler</a></li>
            <li><a href="#nasil-calisir">Nasıl Çalışır</a></li>

            <li>
              <Link href="/auth" className="landing-nav__cta">
                Giriş Yap
              </Link>
            </li>
          </ul>
        </nav>

        {/* Hero Content — Centered with Wide Demo Below */}
        <div className="landing-hero__content">
          <div className="landing-hero__text">
            <h1 className="landing-hero__title">
              Hukukun
              <br />
              <em>dijital asistanı.</em>
            </h1>

            <p className="landing-hero__subtitle">
              Yapay zeka ile emsal arama, sözleşme ve dilekçe inceleme, 
              UYAP entegrasyonu ile tam kapsamlı büro yönetimi — hepsi tek platformda.
            </p>

            <div className="landing-hero__actions">
              <Link href="/auth" className="landing-btn landing-btn--primary">
                Ücretsiz Deneyin
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </Link>
              <a href="#demo-section" className="landing-btn" style={{ background: "#ffffff", color: "#000000", border: "none" }}>
                Demoyu Gör
              </a>
              <a href="#ozellikler" className="landing-btn landing-btn--ghost" style={{ border: "none", background: "transparent" }}>
                Özellikleri Keşfedin
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Wide Interactive Demo Section (Separate from Hero Image) */}
      <section className="landing-demo-wrapper" id="demo-section">
        <InteractiveDemo />
      </section>

      {/* ===== FEATURES ===== */}
      <section className="landing-features" id="ozellikler">
        <div className="landing-section__header">
          <div className="landing-section__label landing-reveal" ref={addRevealRef}>
            Özellikler
          </div>
          <h2 className="landing-section__title landing-reveal" ref={addRevealRef}>
            Hukuki süreçlerinizi hızlandıran araçlar
          </h2>
          <p className="landing-section__desc landing-reveal" ref={addRevealRef}>
            Emsal aramadan sözleşme incelemeye, infaz hesaplamadan 
            kıdem tazminatına — tüm hukuki ihtiyaçlarınız tek çatı altında.
          </p>
        </div>

        <div className="landing-features__grid">
          {[
            {
              icon: "🏛️",
              title: "Büro Yönetimi",
              desc: "Büronuzu dijitalleştirin. Ekip üyelerinizi yönetin, dava dosyalarınızı tek merkezden takip edin.",
            },
            {
              icon: "📄",
              title: "Dilekçe İşlemleri (AI)",
              desc: "Yapay zeka ile profesyonel dilekçeler üretin, davacı ve davalı dilekçelerini karşılaştırıp eksiklikleri bulun.",
            },
            {
              icon: "📝",
              title: "Sözleşme İnceleme",
              desc: "Sözleşmenizi yükleyin, yapay zeka riskli maddeleri ve revizyon önerilerini kıdemli bir hukuk müşaviri gibi çıkarsın.",
            },
            {
              icon: "⚖️",
              title: "Şeytanın Avukatı",
              desc: "Argümanınızı yükleyin, yapay zeka karşı tarafın acımasız avukatı rolüne bürünerek tezlerinizdeki zayıf noktaları bulsun.",
            },
            {
              icon: "🔍",
              title: "Semantik Emsal Arama",
              desc: "Yargıtay ve Danıştay kararlarında sadece kelime değil, bağlam ve anlam bazlı arama yaparak en uygun emsallere saniyeler içinde ulaşın.",
            },
            {
              icon: "⏳",
              title: "Mevzuat Versiyonlama",
              desc: "Time-Travel özelliği ile kanunların geçmişteki hallerini ve değişiklik tarihlerini zaman çizelgesi üzerinde inceleyin.",
            },
            {
              icon: "🔌",
              title: "UYAP Entegrasyonu",
              desc: "UYAP ile tam entegre çalışın. Dava dosyalarınızı, evraklarınızı ve duruşma günlerinizi otomatik olarak platforma çekin.",
            },
            {
              icon: "🧮",
              title: "Gelişmiş Hesaplamalar",
              desc: "Harç, vekalet ücreti, infaz, adli süreler ve tazminat hesaplamalarınızı güncel parametrelerle hatasız şekilde yapın.",
            },
            {
              icon: "💬",
              title: "Büro İçi İletişim & Görevler",
              desc: "Ekibinizle dosya bazlı mesajlaşın, görev atamaları yapın ve iş süreçlerinizi Kanban panolarıyla takip edin.",
            },
          ].map((f, i) => (
            <div
              key={i}
              className="landing-feature-card landing-reveal"
              ref={addRevealRef}
            >
              <div className="landing-feature-card__icon">{f.icon}</div>
              <div className="landing-feature-card__title">{f.title}</div>
              <div className="landing-feature-card__desc">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="landing-how" id="nasil-calisir">
        <div className="landing-section__header">
          <div className="landing-section__label landing-reveal" ref={addRevealRef}>
            Nasıl Çalışır
          </div>
          <h2 className="landing-section__title landing-reveal" ref={addRevealRef}>
            3 adımda hukuki süreçlerinizi yönetin
          </h2>
        </div>

        <div className="landing-how__steps">
          {[
            {
              num: "1",
              title: "Büronuzu Oluşturun & UYAP'ı Bağlayın",
              desc: "Legal Zeka platformuna kayıt olun, ekibinizi davet edin ve UYAP entegrasyonu ile tüm dava dosyalarınızı tek tıkla senkronize edin.",
            },
            {
              num: "2",
              title: "AI Araçlarıyla Süreçleri Hızlandırın",
              desc: "Sözleşme inceleme, dilekçe yazdırma veya emsal arama gibi işlemlerde yapay zekanın gücünü kullanarak saatler süren işleri dakikalara indirin.",
            },
            {
              num: "3",
              title: "Her Şeyi Tek Merkezden Yönetin",
              desc: "Duruşmalarınızı, ekibinizin görevlerini ve tüm hukuki hesaplamalarınızı bulut tabanlı güvenli bir platform üzerinden kontrol edin.",
            },
          ].map((s, i) => (
            <div
              key={i}
              className="landing-how__step landing-reveal"
              ref={addRevealRef}
            >
              <div className="landing-how__step-number">{s.num}</div>
              <div className="landing-how__step-title">{s.title}</div>
              <div className="landing-how__step-desc">{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="landing-cta">
        <div className="landing-cta__inner landing-reveal" ref={addRevealRef}>
          <h2 className="landing-cta__title">
            Tüm hukuki araçlarınız tek platformda
          </h2>
          <p className="landing-cta__desc">
            Ücretsiz deneme ile başlayın. Kredi kartı gerekmez.
            Yapay zeka araçlarına ve UYAP entegrasyonlu büro yönetimine hemen erişin.
          </p>
          <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/auth" className="landing-btn landing-btn--primary">
              Hemen Başlayın
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </Link>
            <Link href="/newsletter" className="landing-btn landing-btn--ghost" style={{ background: "rgba(255,255,255,0.1)", color: "#fff", borderColor: "rgba(255,255,255,0.2)" }}>
              Bültene Abone Ol
            </Link>
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="landing-footer">
        <div className="landing-footer__copy">
          © 2026 Legal Zeka. Tüm hakları saklıdır.
        </div>
        <ul className="landing-footer__links">
          <li><Link href="/privacy">Gizlilik Politikası</Link></li>
          <li><Link href="/terms">Kullanım Şartları</Link></li>
          <li><Link href="/contact">İletişim</Link></li>
        </ul>
      </footer>
    </div>
  );
}
