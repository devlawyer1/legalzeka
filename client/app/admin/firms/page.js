"use client";

import { useState, useEffect } from "react";
import { getStoredUser } from "@/lib/api";
import { Building2, Users } from "lucide-react";

export default function AdminFirmsPage() {
  const [firms, setFirms] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFirms = async () => {
      try {
        const token = localStorage.getItem("accessToken");
        const res = await fetch("/api/admin/firms", {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
          setFirms(data.data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchFirms();
  }, []);

  return (
    <div style={{ padding: "40px" }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Hukuk Büroları</h1>
        <p style={{ color: "var(--color-text-secondary)" }}>Sisteme kayıtlı büroları ve üye sayılarını görüntüleyin.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 24 }}>
        {loading ? (
          <div>Yükleniyor...</div>
        ) : firms.length === 0 ? (
          <div>Kayıtlı büro bulunamadı.</div>
        ) : (
          firms.map((firm) => (
            <div key={firm.id} style={{
              background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)", padding: 24
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <div style={{ width: 40, height: 40, borderRadius: 8, background: "rgba(59, 130, 246, 0.1)", color: "#3B82F6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Building2 size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>{firm.name}</h3>
                  <div style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>{firm.city}</div>
                </div>
              </div>
              
              <div style={{ display: "flex", flexDirection: "column", gap: 12, borderTop: "1px solid var(--color-border)", paddingTop: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                  <span style={{ color: "var(--color-text-secondary)" }}>Kurucu:</span>
                  <span style={{ fontWeight: 500 }}>{firm.owner_first} {firm.owner_last}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                  <span style={{ color: "var(--color-text-secondary)" }}>Ekip Sayısı:</span>
                  <span style={{ fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}><Users size={14}/> {firm.member_count}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                  <span style={{ color: "var(--color-text-secondary)" }}>Kayıt Tarihi:</span>
                  <span style={{ fontWeight: 500 }}>{new Date(firm.created_at).toLocaleDateString("tr-TR")}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                  <span style={{ color: "var(--color-text-secondary)" }}>Durum:</span>
                  <span style={{ fontWeight: 500, color: firm.is_active ? "#10B981" : "#EF4444" }}>{firm.is_active ? "Aktif" : "Pasif"}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
