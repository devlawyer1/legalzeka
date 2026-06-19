"use client";

import { useState, useEffect } from "react";
import { Mail } from "lucide-react";
import {
  getMyFirms,
  createFirm,
  getFirmDetails,
  getFirmMembers,
  getFirmInvitations,
  inviteFirmMember,
  updateFirmMemberRole,
  removeFirmMember,
  updateFirm,
} from "@/lib/api";

export default function FirmManagement({ user, onFirmChange }) {
  const [firms, setFirms] = useState([]);
  const [activeFirm, setActiveFirm] = useState(null);
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: "", text: "" });

  const [showMembersPopup, setShowMembersPopup] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);

  const [createForm, setCreateForm] = useState({ name: "", taxNumber: "", address: "", phone: "" });
  const [inviteForm, setInviteForm] = useState({ email: "", firmRole: "avukat" });
  const [editForm, setEditForm] = useState({ name: "", taxNumber: "", address: "", phone: "" });

  useEffect(() => {
    loadFirms();
  }, []);

  const showToast = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: "", text: "" }), 3000);
  };

  const loadFirms = async () => {
    setLoading(true);
    try {
      const res = await getMyFirms();
      const firmList = res.data || [];
      setFirms(firmList);
      if (firmList.length > 0) {
        await loadFirmDetails(firmList[0].id);
      }
    } catch (err) {
      console.error("Büro listesi yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadFirmDetails = async (firmId) => {
    try {
      const [detailRes, membersRes] = await Promise.all([
        getFirmDetails(firmId),
        getFirmMembers(firmId),
      ]);
      const firm = detailRes.data;
      setActiveFirm(firm);
      if (onFirmChange) onFirmChange(firm.id);
      let firmMembers = [];
      if (Array.isArray(membersRes.data?.members)) firmMembers = membersRes.data.members;
      else if (Array.isArray(membersRes.data)) firmMembers = membersRes.data;
      else if (Array.isArray(firm?.members)) firmMembers = firm.members;
      
      setMembers(firmMembers);
      setEditForm({
        name: firm?.name || "",
        taxNumber: firm?.tax_number || "",
        address: firm?.address || "",
        phone: firm?.phone || "",
      });
      try {
        const invRes = await getFirmInvitations(firmId);
        setInvitations(invRes.data || []);
      } catch { setInvitations([]); }
    } catch (err) {
      console.error("Büro detayı yüklenemedi:", err);
    }
  };

  const handleCreateFirm = async (e) => {
    e.preventDefault();
    try {
      await createFirm(createForm);
      showToast("success", "Büro başarıyla oluşturuldu!");
      setShowCreateForm(false);
      setCreateForm({ name: "", taxNumber: "", address: "", phone: "" });
      await loadFirms();
    } catch (err) {
      showToast("error", err.message);
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    try {
      await inviteFirmMember(activeFirm.id, inviteForm);
      showToast("success", `${inviteForm.email} adresine davet gönderildi!`);
      setShowInviteForm(false);
      setInviteForm({ email: "", firmRole: "avukat" });
      try {
        const invRes = await getFirmInvitations(activeFirm.id);
        setInvitations(invRes.data || []);
      } catch {}
    } catch (err) {
      showToast("error", err.message);
    }
  };

  const handleUpdateRole = async (userId, newRole) => {
    try {
      await updateFirmMemberRole(activeFirm.id, userId, newRole);
      showToast("success", "Rol güncellendi.");
      const membersRes = await getFirmMembers(activeFirm.id);
      setMembers(membersRes.data?.members || []);
    } catch (err) {
      showToast("error", err.message);
    }
  };

  const handleRemoveMember = async (userId, name) => {
    if (!window.confirm(`${name} adlı üyeyi bürodan çıkarmak istediğinize emin misiniz?`)) return;
    try {
      await removeFirmMember(activeFirm.id, userId);
      showToast("success", "Üye bürodan çıkarıldı.");
      const membersRes = await getFirmMembers(activeFirm.id);
      setMembers(membersRes.data?.members || []);
    } catch (err) {
      showToast("error", err.message);
    }
  };

  const handleUpdateFirm = async (e) => {
    e.preventDefault();
    try {
      await updateFirm(activeFirm.id, editForm);
      showToast("success", "Büro bilgileri güncellendi.");
      setShowEditForm(false);
      await loadFirmDetails(activeFirm.id);
    } catch (err) {
      showToast("error", err.message);
    }
  };

  const roleLabels = { kurucu: "Kurucu", ortak: "Ortak", avukat: "Avukat", stajyer: "Stajyer", asistan: "Asistan" };
  const roleBadgeColors = {
    kurucu: { background: "rgba(234,179,8,0.15)", color: "#EAB308" },
    ortak: { background: "rgba(139,92,246,0.15)", color: "#8B5CF6" },
    avukat: { background: "rgba(59,130,246,0.15)", color: "#3B82F6" },
    stajyer: { background: "rgba(34,197,94,0.15)", color: "#22C55E" },
    asistan: { background: "rgba(107,114,128,0.15)", color: "#6B7280" },
  };

  const activeMembers = members.filter(m => m.is_active !== false);
  const founderName = activeMembers.find(m => m.firm_role === "kurucu");

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300 }}>
        <div style={{ width: 32, height: 32, border: "3px solid var(--color-border)", borderTopColor: "var(--color-accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  if (firms.length === 0 && !showCreateForm) {
    return (
      <div style={{ maxWidth: 500, margin: "60px auto", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }}>
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><path d="M9 22V12h6v10" />
        </svg>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 8 }}>Henüz bir hukuk büronuz yok</h3>
        <p style={{ fontSize: 14, color: "var(--color-text-tertiary)", marginBottom: 24 }}>Bir büro oluşturarak ekibinizi davet edin ve birlikte çalışmaya başlayın.</p>
        <button onClick={() => setShowCreateForm(true)} style={s.primaryBtn}>+ Büro Oluştur</button>
      </div>
    );
  }

  if (showCreateForm && firms.length === 0) {
    return (
      <div style={{ maxWidth: 500, margin: "40px auto" }}>
        <div style={s.card}>
          <h3 style={{ fontSize: 18, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 20, textAlign: "center" }}>Yeni Büro Oluştur</h3>
          {message.text && <div style={{ ...s.toast, background: message.type === "success" ? "#DCFCE7" : "#FEE2E2", color: message.type === "success" ? "#16A34A" : "#DC2626" }}>{message.text}</div>}
          <form onSubmit={handleCreateFirm} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={s.label}>Büro Adı *</label>
              <input style={s.input} value={createForm.name} onChange={(e) => setCreateForm({...createForm, name: e.target.value})} required placeholder="Örn: Yılmaz & Kaya Hukuk Bürosu" />
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={s.label}>Vergi No</label>
                <input style={s.input} value={createForm.taxNumber} onChange={(e) => setCreateForm({...createForm, taxNumber: e.target.value})} placeholder="Opsiyonel" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={s.label}>Telefon</label>
                <input style={s.input} value={createForm.phone} onChange={(e) => setCreateForm({...createForm, phone: e.target.value})} placeholder="Opsiyonel" />
              </div>
            </div>
            <div>
              <label style={s.label}>Adres</label>
              <input style={s.input} value={createForm.address} onChange={(e) => setCreateForm({...createForm, address: e.target.value})} placeholder="Opsiyonel" />
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 12 }}>
              <button type="button" onClick={() => setShowCreateForm(false)} style={s.ghostBtn}>İptal</button>
              <button type="submit" style={s.primaryBtn}>Oluştur</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20, position: "relative" }}>
      {message.text && (
        <div style={{ ...s.toast, background: message.type === "success" ? "#DCFCE7" : "#FEE2E2", color: message.type === "success" ? "#16A34A" : "#DC2626" }}>
          {message.text}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 16, background: "var(--color-bg-subtle)", padding: "16px 20px", borderRadius: 12, border: "1px solid var(--color-border-subtle)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-secondary)" }}>Aktif Büro:</span>
          {firms.length > 1 ? (
            <select value={activeFirm?.id || ""} onChange={(e) => loadFirmDetails(e.target.value)} style={s.select}>
              {firms.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          ) : (
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>{activeFirm?.name}</span>
          )}
        </div>
        <button onClick={() => setShowCreateForm(!showCreateForm)} style={s.ghostBtn}>
          {showCreateForm ? "İptal" : "+ Yeni Büro"}
        </button>
      </div>

      {showCreateForm && (
        <div style={s.card}>
          <h3 style={{ fontSize: 18, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 20, textAlign: "center" }}>Yeni Büro Oluştur</h3>
          <form onSubmit={handleCreateFirm} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div><label style={s.label}>Büro Adı *</label><input style={s.input} value={createForm.name} onChange={(e) => setCreateForm({...createForm, name: e.target.value})} required placeholder="Örn: Yılmaz & Kaya Hukuk Bürosu" /></div>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}><label style={s.label}>Vergi No</label><input style={s.input} value={createForm.taxNumber} onChange={(e) => setCreateForm({...createForm, taxNumber: e.target.value})} placeholder="Opsiyonel" /></div>
              <div style={{ flex: 1 }}><label style={s.label}>Telefon</label><input style={s.input} value={createForm.phone} onChange={(e) => setCreateForm({...createForm, phone: e.target.value})} placeholder="Opsiyonel" /></div>
            </div>
            <div><label style={s.label}>Adres</label><input style={s.input} value={createForm.address} onChange={(e) => setCreateForm({...createForm, address: e.target.value})} placeholder="Opsiyonel" /></div>
            <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 12 }}>
              <button type="button" onClick={() => setShowCreateForm(false)} style={s.ghostBtn}>İptal</button>
              <button type="submit" style={s.primaryBtn}>Oluştur</button>
            </div>
          </form>
        </div>
      )}

      {activeFirm && (
        <div onClick={() => setShowMembersPopup(true)} style={s.compactHeader} title="Tıklayarak üyeleri görüntüleyin">
          <div style={s.compactLeft}>
            <div style={s.firmAvatar}>{activeFirm.name?.charAt(0)?.toUpperCase()}</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)" }}>{activeFirm.name}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 2 }}>
                {founderName ? `Kurucu: ${founderName.first_name} ${founderName.last_name}` : ""}
                {founderName ? " · " : ""}
                {activeMembers.length} üye
              </div>
            </div>
          </div>
          <div style={s.compactRight}>
            <button onClick={(e) => { e.stopPropagation(); setShowEditForm(!showEditForm); }} style={s.iconBtn} title="Düzenle">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
            </button>
            <button onClick={(e) => { e.stopPropagation(); setShowInviteForm(!showInviteForm); }} style={s.primaryBtn} title="Üye Davet Et">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></svg> Davet Et
            </button>
          </div>
        </div>
      )}

      {showMembersPopup && (
        <div style={s.overlay} onClick={() => setShowMembersPopup(false)}>
          <div style={s.popup} onClick={(e) => e.stopPropagation()}>
            <div style={s.popupHeader}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", margin: 0 }}>Büro Üyeleri ({activeMembers.length})</h3>
              <button onClick={() => setShowMembersPopup(false)} style={s.closeBtn}>✕</button>
            </div>
            <div style={s.popupBody}>
              {activeMembers.map((member) => (
                <div key={member.id || member.user_id} style={s.memberRow}>
                  <div style={s.memberAvatar}>{member.first_name?.charAt(0)}{member.last_name?.charAt(0)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>{member.first_name} {member.last_name}</div>
                    <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>{member.email}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {member.firm_role === "kurucu" ? (
                      <span style={{ ...s.roleBadge, ...(roleBadgeColors[member.firm_role] || { background: "#eee", color: "#333" }) }}>
                        {roleLabels[member.firm_role] || member.firm_role}
                      </span>
                    ) : (
                      <select style={{ ...s.roleSelect, ...(roleBadgeColors[member.firm_role] || { background: "#eee", color: "#333" }) }} value={member.firm_role} onChange={(e) => handleUpdateRole(member.user_id, e.target.value)}>
                        <option value="ortak">Ortak</option><option value="avukat">Avukat</option><option value="stajyer">Stajyer</option><option value="asistan">Asistan</option>
                      </select>
                    )}
                    {member.firm_role !== "kurucu" && (
                      <button onClick={() => handleRemoveMember(member.user_id, `${member.first_name} ${member.last_name}`)} style={s.removeBtn} title="Çıkar">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {invitations.length > 0 && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 16, marginBottom: 8 }}>Bekleyen Davetler</div>
                  {invitations.map((inv) => (
                    <div key={inv.id} style={{ ...s.memberRow, opacity: 0.6 }}>
                      <div style={{ ...s.memberAvatar, background: "var(--color-bg-muted)" }}><Mail size={16} /></div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>{inv.email}</div>
                        <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>Davet bekliyor</div>
                      </div>
                      <span style={{ ...s.roleBadge, ...(roleBadgeColors[inv.firm_role] || { background: "#eee", color: "#333" }) }}>
                        {roleLabels[inv.firm_role] || inv.firm_role}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showEditForm && activeFirm && (
        <div style={s.card}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 16, margin: 0 }}>Büro Bilgilerini Düzenle</h3>
          <form onSubmit={handleUpdateFirm} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}><label style={s.label}>Büro Adı</label><input style={s.input} value={editForm.name} onChange={(e) => setEditForm({...editForm, name: e.target.value})} /></div>
              <div style={{ flex: 1 }}><label style={s.label}>Vergi No</label><input style={s.input} value={editForm.taxNumber} onChange={(e) => setEditForm({...editForm, taxNumber: e.target.value})} /></div>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}><label style={s.label}>Adres</label><input style={s.input} value={editForm.address} onChange={(e) => setEditForm({...editForm, address: e.target.value})} /></div>
              <div style={{ flex: 1 }}><label style={s.label}>Telefon</label><input style={s.input} value={editForm.phone} onChange={(e) => setEditForm({...editForm, phone: e.target.value})} /></div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" onClick={() => setShowEditForm(false)} style={s.ghostBtn}>İptal</button>
              <button type="submit" style={s.primaryBtn}>Kaydet</button>
            </div>
          </form>
        </div>
      )}

      {showInviteForm && activeFirm && (
        <div style={s.card}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 16, margin: 0 }}>Yeni Üye Davet Et</h3>
          <form onSubmit={handleInvite} style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
            <div style={{ flex: 2 }}><label style={s.label}>E-posta *</label><input style={s.input} type="email" value={inviteForm.email} onChange={(e) => setInviteForm({...inviteForm, email: e.target.value})} required placeholder="ornek@email.com" /></div>
            <div style={{ flex: 1 }}><label style={s.label}>Rol</label>
              <select style={s.select} value={inviteForm.firmRole} onChange={(e) => setInviteForm({...inviteForm, firmRole: e.target.value})}>
                <option value="ortak">Ortak</option><option value="avukat">Avukat</option><option value="stajyer">Stajyer</option><option value="asistan">Asistan</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setShowInviteForm(false)} style={s.ghostBtn}>İptal</button>
              <button type="submit" style={s.primaryBtn}>Gönder</button>
            </div>
          </form>
        </div>
      )}

      {activeFirm && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <div style={s.statCard}><div style={s.statValue}>{activeMembers.length}</div><div style={s.statLabel}>Aktif Üye</div></div>
          <div style={s.statCard}><div style={s.statValue}>{invitations.length}</div><div style={s.statLabel}>Bekleyen Davet</div></div>
          <div style={s.statCard}><div style={s.statValue}>{activeMembers.filter(m => m.firm_role === "avukat").length}</div><div style={s.statLabel}>Avukat</div></div>
          <div style={s.statCard}><div style={s.statValue}>{activeFirm.created_at ? new Date(activeFirm.created_at).toLocaleDateString("tr-TR") : "—"}</div><div style={s.statLabel}>Kuruluş Tarihi</div></div>
        </div>
      )}
    </div>
  );
}

const s = {
  compactHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "14px 20px", background: "var(--color-bg-elevated)", borderRadius: 12,
    border: "1px solid var(--color-border-subtle)", cursor: "pointer",
    transition: "all 0.2s ease",
  },
  compactLeft: { display: "flex", alignItems: "center", gap: 14 },
  compactRight: { display: "flex", gap: 8, alignItems: "center" },
  firmAvatar: { width: 40, height: 40, borderRadius: 10, background: "var(--color-accent)", color: "var(--color-text-inverse)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18, flexShrink: 0 },
  overlay: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(4px)" },
  popup: { background: "var(--color-bg-elevated)", borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "80vh", display: "flex", flexDirection: "column", border: "1px solid var(--color-border-subtle)", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" },
  popupHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", borderBottom: "1px solid var(--color-border-subtle)" },
  popupBody: { padding: "16px 24px", overflowY: "auto", flex: 1 },
  closeBtn: { background: "none", border: "none", color: "var(--color-text-tertiary)", fontSize: 18, cursor: "pointer", padding: 4 },
  memberRow: { display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--color-border-subtle)" },
  memberAvatar: { width: 36, height: 36, borderRadius: "50%", background: "var(--color-bg-muted)", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, flexShrink: 0 },
  roleBadge: { padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600 },
  roleSelect: { padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, border: "1px solid var(--color-border)", cursor: "pointer", outline: "none" },
  removeBtn: { padding: 4, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, color: "var(--color-error)", cursor: "pointer", display: "flex" },
  card: { padding: 20, background: "var(--color-bg-elevated)", borderRadius: 12, border: "1px solid var(--color-border-subtle)" },
  statCard: { padding: "16px 20px", background: "var(--color-bg-elevated)", borderRadius: 12, border: "1px solid var(--color-border-subtle)", textAlign: "center" },
  statValue: { fontSize: 22, fontWeight: 700, color: "var(--color-text-primary)" },
  statLabel: { fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 4 },
  label: { fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4 },
  input: { width: "100%", padding: "9px 12px", fontSize: 14, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-text-primary)", outline: "none", boxSizing: "border-box" },
  select: { width: "100%", padding: "9px 12px", fontSize: 14, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-text-primary)", outline: "none", cursor: "pointer", boxSizing: "border-box" },
  primaryBtn: { padding: "8px 16px", fontSize: 13, fontWeight: 600, background: "var(--color-accent)", color: "var(--color-text-inverse)", border: "none", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" },
  ghostBtn: { padding: "8px 16px", fontSize: 13, fontWeight: 500, background: "transparent", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)", borderRadius: 8, cursor: "pointer" },
  iconBtn: { padding: 8, background: "transparent", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-text-secondary)", cursor: "pointer", display: "flex" },
  toast: { position: "fixed", top: 24, right: 24, padding: "12px 20px", borderRadius: 8, fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", zIndex: 9999, boxShadow: "0 10px 25px rgba(0,0,0,0.1)", animation: "slideIn 0.3s ease forwards" },
};
