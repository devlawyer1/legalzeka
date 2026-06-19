"use client";

import React, { useState, useEffect } from "react";
import { 
  getFirmDetails, 
  getFirmMembers, 
  getFirmInvitations, 
  updateFirm, 
  inviteFirmMember, 
  updateFirmMemberRole, 
  removeFirmMember 
} from "@/lib/api";

export default function FirmManagement({ activeFirmId }) {
  const [activeTab, setActiveTab] = useState("members"); // "members" | "settings"
  const [firmDetails, setFirmDetails] = useState(null);
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("avukat");
  const [firmName, setFirmName] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  
  // Notice state
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (activeFirmId) {
      fetchData();
    }
  }, [activeFirmId, activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const detailsRes = await getFirmDetails(activeFirmId);
      if (detailsRes.data) {
        setFirmDetails(detailsRes.data);
        setFirmName(detailsRes.data.name || "");
        setTaxNumber(detailsRes.data.tax_number || "");
        setAddress(detailsRes.data.address || "");
        setPhone(detailsRes.data.phone || "");
      }

      if (activeTab === "members") {
        const memRes = await getFirmMembers(activeFirmId);
        if (memRes.data) setMembers(memRes.data);

        const invRes = await getFirmInvitations(activeFirmId);
        if (invRes.data) setInvitations(invRes.data);
      }
    } catch (error) {
      console.error("Büro verileri çekilirken hata:", error);
    } finally {
      setLoading(false);
    }
  };

  const showNotice = (msg, type = "success") => {
    setNotice({ msg, type });
    setTimeout(() => setNotice(null), 3000);
  };

  const handleUpdateFirm = async (e) => {
    e.preventDefault();
    try {
      await updateFirm(activeFirmId, {
        name: firmName,
        tax_number: taxNumber,
        address: address,
        phone: phone
      });
      showNotice("Büro ayarları güncellendi.");
      fetchData();
    } catch (error) {
      showNotice("Büro ayarları güncellenirken hata oluştu.", "error");
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail) return;
    try {
      await inviteFirmMember(activeFirmId, { email: inviteEmail, firmRole: inviteRole });
      showNotice("Davet başarıyla gönderildi.");
      setInviteEmail("");
      fetchData();
    } catch (error) {
      showNotice("Davet gönderilemedi.", "error");
    }
  };

  const handleUpdateRole = async (userId, newRole) => {
    try {
      await updateFirmMemberRole(activeFirmId, userId, newRole);
      showNotice("Kullanıcı rolü güncellendi.");
      fetchData();
    } catch (error) {
      showNotice("Rol güncellenirken hata oluştu.", "error");
    }
  };

  const handleRemoveMember = async (userId) => {
    if (!window.confirm("Bu üyeyi bürodan çıkarmak istediğinize emin misiniz?")) return;
    try {
      await removeFirmMember(activeFirmId, userId);
      showNotice("Üye başarıyla bürodan çıkarıldı.");
      fetchData();
    } catch (error) {
      showNotice("Üye çıkarılırken hata oluştu.", "error");
    }
  };

  if (!activeFirmId) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "var(--color-text-secondary)" }}>
        Lütfen önce bir büro seçin veya oluşturun.
      </div>
    );
  }

  const roleLabels = {
    'kurucu': 'Kurucu',
    'ortak': 'Ortak',
    'avukat': 'Avukat',
    'stajyer': 'Stajyer',
    'asistan': 'Asistan'
  };

  return (
    <div style={{ padding: "24px", height: "100%", overflowY: "auto", backgroundColor: "var(--color-bg)" }}>
      {notice && (
        <div style={{
          position: "fixed", top: "20px", right: "20px", zIndex: 1000,
          backgroundColor: notice.type === "error" ? "var(--color-danger)" : "var(--color-success)",
          color: "#fff", padding: "12px 24px", borderRadius: "var(--radius-md)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)", fontWeight: "500"
        }}>
          {notice.msg}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h2 style={{ fontSize: "24px", fontWeight: "700", margin: "0 0 8px", color: "var(--color-text-primary)" }}>
            Büro Yönetimi
          </h2>
          <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
            {firmDetails?.name || "Yükleniyor..."} - Organizasyon ve üye ayarları
          </p>
        </div>
        
        <div style={{ display: "flex", backgroundColor: "var(--color-bg-subtle)", padding: "4px", borderRadius: "var(--radius-md)" }}>
          <button 
            onClick={() => setActiveTab("members")}
            style={{ padding: "8px 16px", border: "none", background: activeTab === "members" ? "var(--color-bg)" : "transparent", borderRadius: "var(--radius-sm)", fontWeight: activeTab === "members" ? "600" : "500", cursor: "pointer", boxShadow: activeTab === "members" ? "0 1px 3px rgba(0,0,0,0.1)" : "none", color: activeTab === "members" ? "var(--color-text-primary)" : "var(--color-text-secondary)" }}
          >
            Üyeler & Davetler
          </button>
          <button 
            onClick={() => setActiveTab("settings")}
            style={{ padding: "8px 16px", border: "none", background: activeTab === "settings" ? "var(--color-bg)" : "transparent", borderRadius: "var(--radius-sm)", fontWeight: activeTab === "settings" ? "600" : "500", cursor: "pointer", boxShadow: activeTab === "settings" ? "0 1px 3px rgba(0,0,0,0.1)" : "none", color: activeTab === "settings" ? "var(--color-text-primary)" : "var(--color-text-secondary)" }}
          >
            Büro Ayarları
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: "40px", textAlign: "center", color: "var(--color-text-tertiary)" }}>Yükleniyor...</div>
      ) : activeTab === "settings" ? (
        <div style={{ maxWidth: "600px", backgroundColor: "var(--color-bg-elevated)", padding: "24px", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)" }}>
          <h3 style={{ margin: "0 0 20px", fontSize: "16px", fontWeight: "600" }}>Genel Bilgiler</h3>
          <form onSubmit={handleUpdateFirm}>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", fontWeight: "500", color: "var(--color-text-secondary)" }}>Büro Adı</label>
              <input type="text" value={firmName} onChange={e => setFirmName(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", backgroundColor: "var(--color-bg)" }} required />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", fontWeight: "500", color: "var(--color-text-secondary)" }}>Vergi Numarası</label>
              <input type="text" value={taxNumber} onChange={e => setTaxNumber(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", backgroundColor: "var(--color-bg)" }} />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", fontWeight: "500", color: "var(--color-text-secondary)" }}>Telefon</label>
              <input type="text" value={phone} onChange={e => setPhone(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", backgroundColor: "var(--color-bg)" }} />
            </div>
            <div style={{ marginBottom: "24px" }}>
              <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", fontWeight: "500", color: "var(--color-text-secondary)" }}>Adres</label>
              <textarea value={address} onChange={e => setAddress(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", backgroundColor: "var(--color-bg)", minHeight: "80px", resize: "vertical" }} />
            </div>
            <button type="submit" style={{ padding: "10px 24px", backgroundColor: "var(--color-accent)", color: "var(--color-text-inverse)", border: "none", borderRadius: "var(--radius-md)", fontWeight: "600", cursor: "pointer", width: "100%" }}>
              Değişiklikleri Kaydet
            </button>
          </form>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 350px", gap: "24px", alignItems: "start" }}>
          
          {/* Members List */}
          <div style={{ backgroundColor: "var(--color-bg-elevated)", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--color-border)", backgroundColor: "var(--color-bg-subtle)" }}>
              <h3 style={{ margin: 0, fontSize: "15px", fontWeight: "600" }}>Mevcut Üyeler ({members.length})</h3>
            </div>
            <div style={{ padding: "20px" }}>
              {members.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--color-text-tertiary)", padding: "20px 0" }}>Henüz üye bulunmuyor.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {members.map(member => (
                    <div key={member.user_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", backgroundColor: "var(--color-bg)" }}>
                      <div>
                        <div style={{ fontWeight: "600", color: "var(--color-text-primary)" }}>{member.users?.first_name} {member.users?.last_name}</div>
                        <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "4px" }}>{member.users?.email}</div>
                      </div>
                      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                        <select 
                          value={member.firm_role} 
                          onChange={(e) => handleUpdateRole(member.user_id, e.target.value)}
                          disabled={member.firm_role === 'kurucu'}
                          style={{ padding: "6px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", backgroundColor: "var(--color-bg-elevated)", fontSize: "13px", cursor: member.firm_role === 'kurucu' ? 'not-allowed' : 'pointer' }}
                        >
                          <option value="kurucu">Kurucu</option>
                          <option value="ortak">Ortak</option>
                          <option value="avukat">Avukat</option>
                          <option value="stajyer">Stajyer</option>
                          <option value="asistan">Asistan</option>
                        </select>
                        {member.firm_role !== 'kurucu' && (
                          <button onClick={() => handleRemoveMember(member.user_id)} style={{ padding: "6px 12px", backgroundColor: "transparent", color: "var(--color-danger)", border: "1px solid var(--color-danger)", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: "13px", fontWeight: "500" }}>
                            Çıkar
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Invitations & New Invite */}
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            
            <div style={{ backgroundColor: "var(--color-bg-elevated)", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)", padding: "20px" }}>
              <h3 style={{ margin: "0 0 16px", fontSize: "15px", fontWeight: "600" }}>Yeni Üye Davet Et</h3>
              <form onSubmit={handleInvite}>
                <div style={{ marginBottom: "12px" }}>
                  <input 
                    type="email" 
                    placeholder="E-posta Adresi" 
                    value={inviteEmail} 
                    onChange={e => setInviteEmail(e.target.value)} 
                    style={{ width: "100%", padding: "10px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", backgroundColor: "var(--color-bg)", fontSize: "14px" }} 
                    required 
                  />
                </div>
                <div style={{ marginBottom: "16px" }}>
                  <select 
                    value={inviteRole} 
                    onChange={e => setInviteRole(e.target.value)}
                    style={{ width: "100%", padding: "10px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", backgroundColor: "var(--color-bg)", fontSize: "14px" }}
                  >
                    <option value="ortak">Ortak</option>
                    <option value="avukat">Avukat</option>
                    <option value="stajyer">Stajyer</option>
                    <option value="asistan">Asistan</option>
                  </select>
                </div>
                <button type="submit" style={{ width: "100%", padding: "10px", backgroundColor: "var(--color-accent)", color: "var(--color-text-inverse)", border: "none", borderRadius: "var(--radius-md)", fontWeight: "600", cursor: "pointer" }}>
                  Davet Gönder
                </button>
              </form>
            </div>

            <div style={{ backgroundColor: "var(--color-bg-elevated)", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)", padding: "20px" }}>
              <h3 style={{ margin: "0 0 16px", fontSize: "15px", fontWeight: "600" }}>Bekleyen Davetler ({invitations.length})</h3>
              {invitations.length === 0 ? (
                <div style={{ fontSize: "13px", color: "var(--color-text-tertiary)" }}>Bekleyen davet bulunmuyor.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {invitations.map(inv => (
                    <div key={inv.id} style={{ padding: "12px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", backgroundColor: "var(--color-bg)" }}>
                      <div style={{ fontWeight: "500", fontSize: "14px" }}>{inv.email}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
                        <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Rol: {roleLabels[inv.firm_role]}</span>
                        <span style={{ fontSize: "11px", padding: "2px 8px", backgroundColor: "var(--color-warning)", color: "#fff", borderRadius: "10px", fontWeight: "600" }}>Bekliyor</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

        </div>
      )}
    </div>
  );
}
