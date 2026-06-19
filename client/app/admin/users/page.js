"use client";

import { useState, useEffect } from "react";
import { getStoredUser } from "@/lib/api";
import { Search, Ban, CheckCircle } from "lucide-react";

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setUsers(data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const toggleUserStatus = async (userId, currentStatus) => {
    if (!confirm(`Kullanıcıyı ${currentStatus ? 'dondurmak' : 'aktifleştirmek'} istediğinize emin misiniz?`)) return;
    
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`/api/admin/users/${userId}/status`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ isActive: !currentStatus })
      });
      const data = await res.json();
      if (data.success) {
        fetchUsers(); // Refresh list
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert("İşlem sırasında bir hata oluştu.");
    }
  };

  const filteredUsers = users.filter(u => 
    u.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ padding: "40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Kullanıcı Yönetimi</h1>
          <p style={{ color: "var(--color-text-secondary)" }}>Sistemdeki tüm kayıtlı kullanıcıları listeleyin ve hesap durumlarını yönetin.</p>
        </div>
        
        <div style={{ position: "relative", width: 300 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-tertiary)" }} />
          <input 
            type="text" 
            placeholder="İsim veya e-posta ile ara..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ 
              width: "100%", padding: "10px 10px 10px 36px", borderRadius: "var(--radius-md)", 
              border: "1px solid var(--color-border)", background: "var(--color-bg-elevated)", 
              color: "var(--color-text-primary)", outline: "none" 
            }}
          />
        </div>
      </div>

      <div style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead>
            <tr style={{ background: "var(--color-bg-subtle)", borderBottom: "1px solid var(--color-border)" }}>
              <th style={{ padding: "16px 20px", fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)" }}>Kullanıcı</th>
              <th style={{ padding: "16px 20px", fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)" }}>E-posta</th>
              <th style={{ padding: "16px 20px", fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)" }}>Rol</th>
              <th style={{ padding: "16px 20px", fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)" }}>Kayıt Tarihi</th>
              <th style={{ padding: "16px 20px", fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)" }}>Durum</th>
              <th style={{ padding: "16px 20px", fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", textAlign: "right" }}>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" style={{ padding: 40, textAlign: "center" }}>Yükleniyor...</td></tr>
            ) : filteredUsers.length === 0 ? (
              <tr><td colSpan="6" style={{ padding: 40, textAlign: "center" }}>Kullanıcı bulunamadı.</td></tr>
            ) : (
              filteredUsers.map((u) => (
                <tr key={u.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "16px 20px", fontWeight: 500 }}>{u.first_name} {u.last_name}</td>
                  <td style={{ padding: "16px 20px", color: "var(--color-text-secondary)", fontSize: 14 }}>{u.email}</td>
                  <td style={{ padding: "16px 20px" }}>
                    <span style={{ padding: "4px 8px", borderRadius: 4, background: u.role_name === 'Admin' ? 'rgba(59, 130, 246, 0.1)' : 'var(--color-bg)', color: u.role_name === 'Admin' ? '#3B82F6' : 'var(--color-text-secondary)', fontSize: 12, fontWeight: 600 }}>
                      {u.role_name}
                    </span>
                  </td>
                  <td style={{ padding: "16px 20px", color: "var(--color-text-secondary)", fontSize: 14 }}>
                    {new Date(u.created_at).toLocaleDateString("tr-TR")}
                  </td>
                  <td style={{ padding: "16px 20px" }}>
                    {u.is_active ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#10B981", fontSize: 13, fontWeight: 500 }}><CheckCircle size={14}/> Aktif</span>
                    ) : (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#EF4444", fontSize: 13, fontWeight: 500 }}><Ban size={14}/> Dondurulmuş</span>
                    )}
                  </td>
                  <td style={{ padding: "16px 20px", textAlign: "right" }}>
                    {u.role_name !== 'Admin' && (
                      <button 
                        onClick={() => toggleUserStatus(u.id, u.is_active)}
                        style={{ padding: "6px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-bg)", cursor: "pointer", fontSize: 13, fontWeight: 500, color: u.is_active ? "#EF4444" : "#10B981", transition: "all 0.2s" }}
                      >
                        {u.is_active ? "Dondur" : "Aktifleştir"}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
