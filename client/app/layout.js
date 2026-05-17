import "./globals.css";

export const metadata = {
  title: "Legal Zeka — Emsal Karar Arama Platformu",
  description:
    "Avukatlar için emsal kararları anahtar kelimeler ve semantik arama ile hızla bulun. Türkiye'nin en kapsamlı yapay zeka destekli emsal karar veritabanı.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
