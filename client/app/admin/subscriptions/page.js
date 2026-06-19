"use client";

import { useState, useEffect } from "react";
import { CreditCard, CheckCircle, XCircle } from "lucide-react";

export default function AdminSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSubscriptions = async () => {
      try {
        const token = localStorage.getItem("accessToken");
        const res = await fetch("/api/admin/subscriptions", {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
          setSubscriptions(data.data);
        }
      } catch (err) {
        console.error("Error fetching subscriptions:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSubscriptions();
  }, []);

  return (
    <div style={{ padding: "40px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Abonelik Yönetimi</h1>
      <p style={{ color: "var(--color-text-secondary)", marginBottom: 32 }}>Sistemdeki tüm abonelikleri ve paket detaylarını bu alandan takip edebilirsiniz.</p>

      <div style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>Yükleniyor...</div>
        ) : subscriptions.length === 0 ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 40, color: "var(--color-text-secondary)" }}>Kayıtlı abonelik bulunamadı.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ background: "var(--color-bg-subtle)", borderBottom: "1px solid var(--color-border)" }}>
                <th style={{ padding: "16px 24px", fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)" }}>KULLANICI</th>
                <th style={{ padding: "16px 24px", fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)" }}>PAKET ADI</th>
                <th style={{ padding: "16px 24px", fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)" }}>AYLIK ÜCRET</th>
                <th style={{ padding: "16px 24px", fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)" }}>BAŞLANGIÇ</th>
                <th style={{ padding: "16px 24px", fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)" }}>BİTİŞ</th>
                <th style={{ padding: "16px 24px", fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", textAlign: "center" }}>DURUM</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((sub) => (
                <tr key={sub.id} style={{ borderBottom: "1px solid var(--color-border-subtle)", transition: "background 0.2s" }}>
                  <td style={{ padding: "16px 24px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--color-accent)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 600 }}>
                        {sub.first_name?.[0]}{sub.last_name?.[0]}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>{sub.first_name} {sub.last_name}</div>
                        <div style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>{sub.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "16px 24px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>
                      <CreditCard size={16} style={{ color: "var(--color-text-secondary)" }} />
                      {sub.plan_name}
                    </div>
                  </td>
                  <td style={{ padding: "16px 24px", fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>
                    ₺{sub.price_monthly}
                  </td>
                  <td style={{ padding: "16px 24px", fontSize: 14, color: "var(--color-text-secondary)" }}>
                    {new Date(sub.start_date).toLocaleDateString("tr-TR")}
                  </td>
                  <td style={{ padding: "16px 24px", fontSize: 14, color: "var(--color-text-secondary)" }}>
                    {sub.end_date ? new Date(sub.end_date).toLocaleDateString("tr-TR") : "-"}
                  </td>
                  <td style={{ padding: "16px 24px", textAlign: "center" }}>
                    {sub.status === "active" ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 20, background: "rgba(16, 185, 129, 0.1)", color: "#10B981", fontSize: 12, fontWeight: 600 }}>
                        <CheckCircle size={14} />
                        Aktif
                      </span>
                    ) : (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 20, background: "rgba(239, 68, 68, 0.1)", color: "#EF4444", fontSize: 12, fontWeight: 600 }}>
                        <XCircle size={14} />
                        İptal / Pasif
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
