"use client";

import React, { useState, useEffect } from 'react';
import { getTickets, getCorporateTree, createTicket, createCorporateEntity } from '@/lib/api';

export default function CorporateNetwork({ activeFirmId }) {
  const [activeTab, setActiveTab] = useState('tickets'); // 'tickets' veya 'tree'
  const [tickets, setTickets] = useState([]);
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [ticketFormLoading, setTicketFormLoading] = useState(false);
  const [companyFormLoading, setCompanyFormLoading] = useState(false);
  const [ticketForm, setTicketForm] = useState({ client_name: '', subject: '', priority: 'medium', is_vip: false, due_date: '' });
  const [companyForm, setCompanyForm] = useState({ name: '', type: 'İştirak', industry: '', share_percentage: '', parent_id: null });

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'tickets') {
        const res = await getTickets(activeFirmId);
        setTickets(res || []);
      } else {
        const res = await getCorporateTree(activeFirmId);
        setTree(res || []);
      }
    } catch (error) {
      console.error('Veri çekme hatası:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeFirmId) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [activeFirmId, activeTab]);

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent': return 'var(--color-danger)';
      case 'high': return 'var(--color-warning)';
      case 'medium': return 'var(--color-accent)';
      default: return 'var(--color-text-secondary)';
    }
  };

  const renderTree = (nodes) => {
    return (
      <ul style={{ listStyleType: 'none', paddingLeft: '20px', borderLeft: '1px dashed var(--color-border)' }}>
        {nodes.map(node => (
          <li key={node.id} style={{ position: 'relative', padding: '10px 0 10px 15px' }}>
            <div style={{ position: 'absolute', left: '-20px', top: '24px', width: '20px', borderTop: '1px dashed var(--color-border)' }}></div>
            <div style={{ backgroundColor: 'var(--color-bg-elevated)', padding: '12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', display: 'inline-block', minWidth: '250px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: '600', color: 'var(--color-text-primary)' }}>{node.name}</span>
                <span style={{ fontSize: '11px', padding: '2px 6px', backgroundColor: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-sm)' }}>{node.type}</span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                {node.industry && <div>Sektör: {node.industry}</div>}
                {node.share_percentage && <div>Hisse Oranı: %{node.share_percentage}</div>}
              </div>
            </div>
            {node.children && node.children.length > 0 && renderTree(node.children)}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div style={{ padding: '24px', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 8px', color: 'var(--color-text-primary)' }}>
            Kurumsal Yönetim & VIP İş Akışları
          </h2>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
            VIP müvekkil taleplerini ve holding / iştirak şirket yapılarını yönetin.
          </p>
        </div>
        
        <div style={{ display: 'flex', backgroundColor: 'var(--color-bg-subtle)', padding: '4px', borderRadius: 'var(--radius-md)' }}>
          <button 
            onClick={() => setActiveTab('tickets')}
            style={{ padding: '8px 16px', border: 'none', background: activeTab === 'tickets' ? 'var(--color-bg)' : 'transparent', borderRadius: 'var(--radius-sm)', fontWeight: activeTab === 'tickets' ? '600' : '500', cursor: 'pointer', boxShadow: activeTab === 'tickets' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', color: activeTab === 'tickets' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}
          >
            SLA & Talepler
          </button>
          <button 
            onClick={() => setActiveTab('tree')}
            style={{ padding: '8px 16px', border: 'none', background: activeTab === 'tree' ? 'var(--color-bg)' : 'transparent', borderRadius: 'var(--radius-sm)', fontWeight: activeTab === 'tree' ? '600' : '500', cursor: 'pointer', boxShadow: activeTab === 'tree' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', color: activeTab === 'tree' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}
          >
            Şirket Ağacı
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>Yükleniyor...</div>
      ) : !activeFirmId ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>Lütfen önce bir büro seçin veya oluşturun.</div>
      ) : activeTab === 'tickets' ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <button onClick={() => setShowTicketModal(true)} style={{ padding: '8px 16px', backgroundColor: 'var(--color-accent)', color: 'var(--color-text-inverse)', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: '600', cursor: 'pointer' }}>
              + Yeni Talep Ekle
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            {['open', 'in_progress', 'resolved'].map(status => (
              <div key={status} style={{ backgroundColor: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-lg)', padding: '16px', minHeight: '400px' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: '600', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                  {status === 'open' ? 'Açık Talepler' : status === 'in_progress' ? 'İşlemde' : 'Çözülenler'}
                </h3>
                {tickets.filter(t => t.status === status).map(ticket => (
                  <div key={ticket.id} style={{ backgroundColor: 'var(--color-bg-elevated)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: ticket.is_vip ? 'var(--color-warning)' : 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {ticket.is_vip && <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>}
                        {ticket.client_name}
                      </span>
                      <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '10px', backgroundColor: 'var(--color-bg-subtle)', color: getPriorityColor(ticket.priority), border: `1px solid ${getPriorityColor(ticket.priority)}` }}>
                        {ticket.priority.toUpperCase()}
                      </span>
                    </div>
                    <h4 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: '500' }}>{ticket.subject}</h4>
                    {ticket.due_date && (
                      <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '8px' }}>
                        Hedef: {new Date(ticket.due_date).toLocaleString('tr-TR')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius-lg)', padding: '24px', border: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px' }}>
            <button onClick={() => setShowCompanyModal(true)} style={{ padding: '8px 16px', backgroundColor: 'var(--color-accent)', color: 'var(--color-text-inverse)', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: '600', cursor: 'pointer' }}>
              + Şirket Ekle
            </button>
          </div>
          {tree.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', padding: '40px' }}>
              Henüz bir şirket ağacı tanımlanmamış.
            </div>
          ) : (
            <div style={{ paddingLeft: '20px' }}>
              {renderTree(tree)}
            </div>
          )}
        </div>
      )}
      {/* Yeni Talep Modal */}
      {showTicketModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '28px', width: '520px', maxWidth: '90vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: 'var(--color-text-primary)' }}>Yeni Talep Ekle</h3>
              <button onClick={() => setShowTicketModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: 'var(--color-text-secondary)' }}>✕</button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!ticketForm.client_name.trim() || !ticketForm.subject.trim()) return;
              setTicketFormLoading(true);
              try {
                await createTicket(activeFirmId, ticketForm);
                setShowTicketModal(false);
                setTicketForm({ client_name: '', subject: '', priority: 'medium', is_vip: false, due_date: '' });
                fetchData();
              } catch (err) { console.error('Talep oluşturma hatası:', err); }
              finally { setTicketFormLoading(false); }
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Müvekkil *</label>
                  <input value={ticketForm.client_name} onChange={(e) => setTicketForm({...ticketForm, client_name: e.target.value})} required placeholder="Müvekkil adı" style={{ padding: '10px 14px', fontSize: '14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-subtle)', color: 'var(--color-text-primary)', outline: 'none' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Öncelik</label>
                  <select value={ticketForm.priority} onChange={(e) => setTicketForm({...ticketForm, priority: e.target.value})} style={{ padding: '10px 14px', fontSize: '14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-subtle)', color: 'var(--color-text-primary)', outline: 'none' }}>
                    <option value="low">Düşük</option>
                    <option value="medium">Orta</option>
                    <option value="high">Yüksek</option>
                    <option value="urgent">Acil</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Konu *</label>
                  <input value={ticketForm.subject} onChange={(e) => setTicketForm({...ticketForm, subject: e.target.value})} required placeholder="Talep konusu" style={{ padding: '10px 14px', fontSize: '14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-subtle)', color: 'var(--color-text-primary)', outline: 'none' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Hedef Tarihi</label>
                  <input type="datetime-local" value={ticketForm.due_date} onChange={(e) => setTicketForm({...ticketForm, due_date: e.target.value})} style={{ padding: '10px 14px', fontSize: '14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-subtle)', color: 'var(--color-text-primary)', outline: 'none' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '20px' }}>
                  <input type="checkbox" id="vipCheck" checked={ticketForm.is_vip} onChange={(e) => setTicketForm({...ticketForm, is_vip: e.target.checked})} style={{ width: '18px', height: '18px' }} />
                  <label htmlFor="vipCheck" style={{ fontSize: '14px', color: 'var(--color-text-primary)', cursor: 'pointer' }}>⭐ VIP Müvekkil</label>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
                <button type="button" onClick={() => setShowTicketModal(false)} style={{ padding: '8px 16px', fontSize: '14px', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>İptal</button>
                <button type="submit" disabled={ticketFormLoading} style={{ padding: '8px 20px', fontSize: '14px', fontWeight: '600', background: 'var(--color-accent)', color: 'var(--color-text-inverse)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>{ticketFormLoading ? 'Kaydediliyor...' : 'Talep Oluştur'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Yeni Şirket Modal */}
      {showCompanyModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '28px', width: '480px', maxWidth: '90vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: 'var(--color-text-primary)' }}>Şirket Ekle</h3>
              <button onClick={() => setShowCompanyModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: 'var(--color-text-secondary)' }}>✕</button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!companyForm.name.trim()) return;
              setCompanyFormLoading(true);
              try {
                await createCorporateEntity(activeFirmId, companyForm);
                setShowCompanyModal(false);
                setCompanyForm({ name: '', type: 'İştirak', industry: '', share_percentage: '', parent_id: null });
                fetchData();
              } catch (err) { console.error('Şirket ekleme hatası:', err); }
              finally { setCompanyFormLoading(false); }
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Şirket Adı *</label>
                  <input value={companyForm.name} onChange={(e) => setCompanyForm({...companyForm, name: e.target.value})} required placeholder="Şirket adı" style={{ padding: '10px 14px', fontSize: '14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-subtle)', color: 'var(--color-text-primary)', outline: 'none' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Tür</label>
                  <select value={companyForm.type} onChange={(e) => setCompanyForm({...companyForm, type: e.target.value})} style={{ padding: '10px 14px', fontSize: '14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-subtle)', color: 'var(--color-text-primary)', outline: 'none' }}>
                    <option value="Holding">Holding</option>
                    <option value="İştirak">İştirak</option>
                    <option value="Bağlı Ortaklık">Bağlı Ortaklık</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Sektör</label>
                  <input value={companyForm.industry} onChange={(e) => setCompanyForm({...companyForm, industry: e.target.value})} placeholder="Örn: Enerji" style={{ padding: '10px 14px', fontSize: '14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-subtle)', color: 'var(--color-text-primary)', outline: 'none' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Hisse Oranı (%)</label>
                  <input type="number" min="0" max="100" value={companyForm.share_percentage} onChange={(e) => setCompanyForm({...companyForm, share_percentage: e.target.value})} placeholder="0" style={{ padding: '10px 14px', fontSize: '14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-subtle)', color: 'var(--color-text-primary)', outline: 'none' }} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
                <button type="button" onClick={() => setShowCompanyModal(false)} style={{ padding: '8px 16px', fontSize: '14px', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>İptal</button>
                <button type="submit" disabled={companyFormLoading} style={{ padding: '8px 20px', fontSize: '14px', fontWeight: '600', background: 'var(--color-accent)', color: 'var(--color-text-inverse)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>{companyFormLoading ? 'Kaydediliyor...' : 'Şirket Ekle'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
