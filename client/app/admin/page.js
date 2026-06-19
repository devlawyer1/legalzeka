"use client";

import { useState, useEffect } from "react";
import { Users, Building2, CreditCard, Activity } from "lucide-react";
import { getStoredUser } from "@/lib/api";

export default function AdminDashboardPage() {
  const [stats, setStats] = useState({ totalUsers: 0, totalFirms: 0, activeSubscriptions: 0, estimatedMrr: 0, recentActivities: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem("accessToken");
        const res = await fetch("/api/admin/stats", {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
          setStats(data.data);
        }
      } catch (err) {
        console.error("Error fetching admin stats:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const statCards = [
    { title: "Toplam Kullanıcı", value: stats.totalUsers, icon: Users, color: "#3B82F6" },
    { title: "Aktif Bürolar", value: stats.totalFirms, icon: Building2, color: "#10B981" },
    { title: "Aktif Abonelikler", value: stats.activeSubscriptions, icon: CreditCard, color: "#8B5CF6" },
    { title: "Tahmini Aylık Gelir", value: `₺${stats.estimatedMrr}`, icon: Activity, color: "#F59E0B" },
  ];

  return (
    <div style={{ padding: "40px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Sistem Özeti</h1>
      <p style={{ color: "var(--color-text-secondary)", marginBottom: 32 }}>Legal Zeka platformunun genel durumunu buradan takip edebilirsiniz.</p>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>Yükleniyor...</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 24 }}>
          {statCards.map((card, i) => {
            const Icon = card.icon;
            return (
              <div key={i} style={{
                background: "var(--color-bg-elevated)", padding: 24, borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)", display: "flex", alignItems: "center", gap: 20
              }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: `${card.color}15`, color: card.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={24} />
                </div>
                <div>
                  <div style={{ fontSize: 13, color: "var(--color-text-secondary)", fontWeight: 500, marginBottom: 4 }}>{card.title}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-text-primary)" }}>{card.value}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      
      {/* Son Aktiviteler */}
      <div style={{ marginTop: 40, padding: 30, background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)" }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Son Aktiviteler</h3>
        
        {stats.recentActivities && stats.recentActivities.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {stats.recentActivities.map((activity, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "flex-start", gap: 12, paddingBottom: 16, borderBottom: idx !== stats.recentActivities.length - 1 ? "1px solid var(--color-border-subtle)" : "none" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-accent)", marginTop: 6 }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>{activity.title}</div>
                  <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 2 }}>{activity.description}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 4 }}>
                    {new Date(activity.date).toLocaleString('tr-TR')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: "var(--color-text-tertiary)", fontSize: 14 }}>Henüz gösterilecek bir aktivite yok.</div>
        )}
      </div>
    </div>
  );
}
