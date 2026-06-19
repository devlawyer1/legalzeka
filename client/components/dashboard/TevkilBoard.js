import React, { useState, useEffect } from 'react';
import { createTevkilAd, getTevkilAds, getMyTevkilAds, applyToTevkilAd, getMyTevkilApplications, handleTevkilApplication, improveTevkilDescriptionAI } from '../../lib/api';

const CITIES = [
  "Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Amasya", "Ankara", "Antalya", "Artvin", "Aydın", "Balıkesir", "Bilecik", "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa", "Çanakkale", "Çankırı", "Çorum", "Denizli", "Diyarbakır", "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir", "Gaziantep", "Giresun", "Gümüşhane", "Hakkari", "Hatay", "Isparta", "Mersin", "İstanbul", "İzmir", "Kars", "Kastamonu", "Kayseri", "Kırklareli", "Kırşehir", "Kocaeli", "Konya", "Kütahya", "Malatya", "Manisa", "Kahramanmaraş", "Mardin", "Muğla", "Muş", "Nevşehir", "Niğde", "Ordu", "Rize", "Sakarya", "Samsun", "Siirt", "Sinop", "Sivas", "Tekirdağ", "Tokat", "Trabzon", "Tunceli", "Şanlıurfa", "Uşak", "Van", "Yozgat", "Zonguldak", "Aksaray", "Bayburt", "Karaman", "Kırıkkale", "Batman", "Şırnak", "Bartın", "Ardahan", "Iğdır", "Yalova", "Karabük", "Kilis", "Osmaniye", "Düzce"
];

const styles = {
  container: {
    padding: '24px',
    maxWidth: '1200px',
    margin: '0 auto',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    minHeight: '85vh',
  },
  header: {
    marginBottom: '2rem',
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    marginBottom: '8px',
  },
  subtitle: {
    fontSize: '15px',
    color: 'var(--color-text-secondary)',
  },
  tabs: {
    display: 'flex',
    gap: '2rem',
    marginBottom: '2rem',
    borderBottom: '1px solid var(--color-border-subtle)',
    paddingBottom: '0.5rem',
  },
  tabBtn: {
    background: 'none',
    border: 'none',
    padding: '0.5rem 0',
    fontSize: '15px',
    fontWeight: '600',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    position: 'relative',
  },
  tabBtnActive: {
    color: 'var(--color-accent)',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: '-0.5rem',
    left: 0,
    right: 0,
    height: '2px',
    backgroundColor: 'var(--color-accent)',
    borderRadius: '2px',
  },
  mainCard: {
    backgroundColor: 'var(--color-bg-elevated)',
    borderRadius: '16px',
    padding: '32px',
    boxShadow: 'var(--shadow-sm)',
    border: '1px solid var(--color-border-subtle)',
    minHeight: '60vh',
    position: 'relative',
  },
  innerCard: {
    backgroundColor: 'var(--color-bg-subtle)',
    borderRadius: '12px',
    padding: '24px',
    border: '1px solid var(--color-border-subtle)',
    marginBottom: '1rem',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '1.5rem',
  },
  fullWidth: {
    gridColumn: '1 / -1',
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--color-text-primary)',
  },
  input: {
    width: '100%',
    padding: '0.75rem',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    backgroundColor: 'var(--color-bg-subtle)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  textarea: {
    width: '100%',
    minHeight: '120px',
    padding: '0.75rem',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    backgroundColor: 'var(--color-bg-subtle)',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    resize: 'vertical',
    outline: 'none',
  },
  button: {
    padding: '0.75rem 1.5rem',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: 'var(--color-accent)',
    color: '#000',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  buttonOutline: {
    padding: '0.75rem 1.5rem',
    borderRadius: '8px',
    border: '1px solid var(--color-accent)',
    backgroundColor: 'transparent',
    color: 'var(--color-accent)',
    fontWeight: '600',
    cursor: 'pointer',
  },
  aiBtn: {
    background: 'rgba(59, 130, 246, 0.1)',
    color: 'var(--color-accent)',
    border: '1px solid var(--color-accent)',
    padding: '0.6rem 1.2rem',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginTop: '0.75rem',
    transition: 'all 0.2s',
  },
  adGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: '1.5rem',
  },
  adCard: {
    backgroundColor: 'var(--color-bg-subtle)',
    borderRadius: '12px',
    padding: '20px',
    border: '1px solid var(--color-border-subtle)',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  adHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  adTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    margin: 0,
  },
  badgeOpen: { background: '#dcfce7', color: '#166534', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' },
  badgeClosed: { background: '#f1f5f9', color: '#475569', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' },
  badgePending: { background: '#fef08a', color: '#854d0e', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' },
  badgeAccepted: { background: '#bbf7d0', color: '#166534', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' },
  badgeRejected: { background: '#fecaca', color: '#991b1b', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' },
  infoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
  },
  priceTag: {
    fontSize: '18px',
    fontWeight: '800',
    color: 'var(--color-accent)',
    marginTop: 'auto',
  },
  appCard: {
    padding: '12px',
    backgroundColor: 'var(--color-bg-subtle)',
    borderRadius: '8px',
    marginTop: '8px',
    border: '1px solid var(--color-border-subtle)',
  }
};

export default function TevkilBoard() {
  const [activeTab, setActiveTab] = useState('market'); // market, create, myads, myapps
  const [loading, setLoading] = useState(false);
  const [ads, setAds] = useState([]);
  const [myAds, setMyAds] = useState([]);
  const [myApps, setMyApps] = useState([]);
  const [selectedAd, setSelectedAd] = useState(null); // Başvuru modalı için
  const [applyMessage, setApplyMessage] = useState('');
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  // İlan oluşturma formu
  const [form, setForm] = useState({
    title: '', description: '', case_type: '', city: '', courthouse: '', case_side: '', hearing_date: '', hearing_time: '', fee: ''
  });

  useEffect(() => {
    if (activeTab === 'market') fetchAds();
    if (activeTab === 'myads') fetchMyAds();
    if (activeTab === 'myapps') fetchMyApps();
  }, [activeTab]);

  const fetchAds = async () => {
    setLoading(true);
    try {
      const res = await getTevkilAds();
      setAds(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchMyAds = async () => {
    setLoading(true);
    try {
      const res = await getMyTevkilAds();
      setMyAds(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchMyApps = async () => {
    setLoading(true);
    try {
      const res = await getMyTevkilApplications();
      setMyApps(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAd = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createTevkilAd(form);
      showToast('İlan başarıyla oluşturuldu!', 'success');
      setForm({ title: '', description: '', case_type: '', city: '', courthouse: '', case_side: '', hearing_date: '', hearing_time: '', fee: '' });
      setActiveTab('market');
    } catch (e) {
      showToast(e.message || 'Hata oluştu', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!applyMessage.trim()) return showToast("Lütfen başvuru notu yazın.", "error");
    setLoading(true);
    try {
      await applyToTevkilAd(selectedAd.id, applyMessage);
      showToast('Başvurunuz iletildi.', 'success');
      setSelectedAd(null);
      setApplyMessage('');
    } catch (e) {
      showToast(e.message || 'Hata oluştu', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (appId, action) => {
    if (!window.confirm(`Bu başvuruyu ${action === 'accept' ? 'onaylamak' : 'reddetmek'} istediğinize emin misiniz?`)) return;
    setLoading(true);
    try {
      await handleTevkilApplication(appId, action);
      showToast('İşlem başarılı.', 'success');
      fetchMyAds(); // Refresh
    } catch (e) {
      showToast(e.message || 'Hata oluştu', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAIImprove = async () => {
    if (!form.description) return showToast("Önce bir taslak açıklama yazmalısınız.", "error");
    setLoading(true);
    try {
      const res = await improveTevkilDescriptionAI(form.description);
      setForm({ ...form, description: res.data });
    } catch (e) {
      showToast("AI Hatası: " + e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Tevkil Pazarı</h1>
        <p style={styles.subtitle}>Meslektaşlarınızla iş ve duruşma tevkili süreçlerini kolayca yönetin.</p>
      </div>

      <div style={styles.tabs}>
        {[
          { id: 'market', label: 'İlan Pazarı' },
          { id: 'create', label: 'Yeni İlan Oluştur' },
          { id: 'myads', label: 'Benim İlanlarım' },
          { id: 'myapps', label: 'Başvurularım' }
        ].map(tab => (
          <button 
            key={tab.id} 
            style={{ ...styles.tabBtn, ...(activeTab === tab.id ? styles.tabBtnActive : {}) }}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {activeTab === tab.id && <div style={styles.activeIndicator} />}
          </button>
        ))}
      </div>

      <div style={styles.mainCard}>
        {loading && <p>Yükleniyor...</p>}

        {activeTab === 'market' && (
          <div style={styles.adGrid}>
            {ads.length === 0 && !loading && <p>Şu an açık bir tevkil ilanı bulunmuyor.</p>}
            {ads.map(ad => (
              <div key={ad.id} style={styles.adCard}>
                <div style={styles.adHeader}>
                  <h3 style={styles.adTitle}>{ad.title}</h3>
                  <span style={styles.badgeOpen}>Açık İlan</span>
                </div>
                <div style={styles.infoRow}>📍 {ad.city} - {ad.courthouse}</div>
                <div style={styles.infoRow}>📅 {new Date(ad.hearing_date).toLocaleDateString()} 🕒 {ad.hearing_time}</div>
                <div style={styles.infoRow}>⚖️ {ad.case_type} ({ad.case_side})</div>
                <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: '8px 0', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {ad.description}
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto' }}>
                  <span style={styles.priceTag}>₺{ad.fee}</span>
                  <button style={{...styles.button, padding: '0.5rem 1rem'}} onClick={() => setSelectedAd(ad)}>İncele & Başvur</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'create' && (
          <form onSubmit={handleCreateAd}>
            <div style={styles.formGrid}>
              <div style={styles.fullWidth}>
                <label style={styles.label}>İlan Başlığı</label>
                <input required style={styles.input} placeholder="Örn: Ankara BAM Duruşma Tevkili" value={form.title} onChange={e=>setForm({...form, title: e.target.value})} />
              </div>
              <div>
                <label style={styles.label}>Şehir</label>
                <select required style={styles.input} value={form.city} onChange={e=>setForm({...form, city: e.target.value})}>
                  <option value="">İl Seçiniz...</option>
                  {CITIES.map(city => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={styles.label}>Adliye / Mahkeme</label>
                <input required style={styles.input} placeholder="Örn: Ankara 2. Tüketici Mahkemesi" value={form.courthouse} onChange={e=>setForm({...form, courthouse: e.target.value})} />
              </div>
              <div>
                <label style={styles.label}>Dava Türü</label>
                <input required style={styles.input} placeholder="Örn: İş Davası" value={form.case_type} onChange={e=>setForm({...form, case_type: e.target.value})} />
              </div>
              <div>
                <label style={styles.label}>Taraf</label>
                <select style={styles.input} value={form.case_side} onChange={e=>setForm({...form, case_side: e.target.value})}>
                  <option value="">Seçiniz...</option>
                  <option value="Davacı">Davacı</option>
                  <option value="Davalı">Davalı</option>
                  <option value="Müşteki">Müşteki</option>
                  <option value="Sanık">Sanık</option>
                </select>
              </div>
              <div>
                <label style={styles.label}>Duruşma/İşlem Tarihi</label>
                <input required type="date" style={styles.input} value={form.hearing_date} onChange={e=>setForm({...form, hearing_date: e.target.value})} />
              </div>
              <div>
                <label style={styles.label}>Duruşma/İşlem Saati</label>
                <input required type="time" style={styles.input} value={form.hearing_time} onChange={e=>setForm({...form, hearing_time: e.target.value})} />
              </div>
              <div style={styles.fullWidth}>
                <label style={styles.label}>Tevkil Ücreti (₺)</label>
                <input required type="number" style={styles.input} value={form.fee} onChange={e=>setForm({...form, fee: e.target.value})} />
              </div>
              <div style={styles.fullWidth}>
                <label style={styles.label}>Açıklama & Detaylar</label>
                <textarea required style={styles.textarea} placeholder="Duruşma içeriği, talep edilecek hususlar vs..." value={form.description} onChange={e=>setForm({...form, description: e.target.value})} />
                <button type="button" style={styles.aiBtn} onClick={handleAIImprove} disabled={loading}>
                  ✨ AI ile Profesyonelleştir
                </button>
              </div>
              <div style={styles.fullWidth}>
                <button type="submit" style={styles.button} disabled={loading}>İlanı Yayınla</button>
              </div>
            </div>
          </form>
        )}

        {activeTab === 'myads' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {myAds.length === 0 && !loading && <p>Henüz bir ilan açmadınız.</p>}
            {myAds.map(ad => (
              <div key={ad.id} style={{...styles.innerCard}}>
                <div style={{display: 'flex', justifyContent: 'space-between'}}>
                  <h3 style={{margin: '0 0 10px 0'}}>{ad.title} <span style={ad.status==='open' ? styles.badgeOpen : styles.badgeClosed}>{ad.status === 'open' ? 'Açık' : 'Kapalı'}</span></h3>
                  <span style={{fontWeight: 'bold', color: 'var(--color-accent)'}}>₺{ad.fee}</span>
                </div>
                <div style={{display: 'flex', gap: '20px', fontSize: '13px', color: '#666', marginBottom: '1rem'}}>
                  <span>📍 {ad.city} - {ad.courthouse}</span>
                  <span>📅 {new Date(ad.hearing_date).toLocaleDateString()} {ad.hearing_time}</span>
                </div>
                
                <div style={{borderTop: '1px solid var(--color-border-subtle)', paddingTop: '1rem'}}>
                  <h4 style={{fontSize: '14px', margin: '0 0 10px 0'}}>Gelen Başvurular ({ad.applications ? ad.applications.length : 0})</h4>
                  {(!ad.applications || ad.applications.length === 0) && <span style={{fontSize: '13px', color: '#999'}}>Başvuru yok.</span>}
                  {ad.applications && ad.applications.map(app => (
                    <div key={app.id} style={styles.appCard}>
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                        <strong>{app.applicant_name}</strong>
                        <span style={app.status==='pending' ? styles.badgePending : app.status==='accepted' ? styles.badgeAccepted : styles.badgeRejected}>
                          {app.status}
                        </span>
                      </div>
                      <p style={{fontSize: '13px', marginTop: '8px'}}>{app.message}</p>
                      
                      {app.status === 'pending' && ad.status === 'open' && (
                        <div style={{display: 'flex', gap: '10px', marginTop: '10px'}}>
                          <button onClick={() => handleAction(app.id, 'accept')} style={{...styles.button, padding: '4px 12px', fontSize: '12px', background: '#16a34a', color: '#fff'}}>Onayla</button>
                          <button onClick={() => handleAction(app.id, 'reject')} style={{...styles.button, padding: '4px 12px', fontSize: '12px', background: '#dc2626', color: '#fff'}}>Reddet</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'myapps' && (
          <div style={styles.adGrid}>
            {myApps.length === 0 && !loading && <p>Henüz hiçbir ilana başvurmadınız.</p>}
            {myApps.map(app => (
              <div key={app.id} style={styles.adCard}>
                <div style={styles.adHeader}>
                  <h3 style={styles.adTitle}>{app.title}</h3>
                  <span style={app.status==='pending' ? styles.badgePending : app.status==='accepted' ? styles.badgeAccepted : styles.badgeRejected}>
                    {app.status === 'pending' ? 'Bekliyor' : app.status === 'accepted' ? 'Onaylandı' : 'Reddedildi'}
                  </span>
                </div>
                <div style={styles.infoRow}>👤 İlan Sahibi: {app.author_first_name} {app.author_last_name}</div>
                <div style={styles.infoRow}>📍 {app.city} - {app.courthouse}</div>
                <div style={styles.infoRow}>📅 {new Date(app.hearing_date).toLocaleDateString()} 🕒 {app.hearing_time}</div>
                <div style={{borderTop: '1px solid var(--color-border-subtle)', marginTop: '8px', paddingTop: '8px'}}>
                  <span style={{fontSize: '12px', color: '#666', fontWeight: 'bold'}}>Başvuru Notunuz:</span>
                  <p style={{fontSize: '13px', margin: '4px 0'}}>{app.message}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Başvuru Modalı */}
      {selectedAd && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000}}>
          <div style={{...styles.innerCard, width: '90%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto', backgroundColor: 'var(--color-bg-elevated)'}}>
            <h2 style={{marginTop: 0}}>{selectedAd.title}</h2>
            <div style={{display: 'grid', gap: '8px', marginBottom: '16px', fontSize: '14px'}}>
              <div><strong>Adliye:</strong> {selectedAd.city} - {selectedAd.courthouse}</div>
              <div><strong>Tarih/Saat:</strong> {new Date(selectedAd.hearing_date).toLocaleDateString()} {selectedAd.hearing_time}</div>
              <div><strong>Tür/Taraf:</strong> {selectedAd.case_type} ({selectedAd.case_side})</div>
              <div><strong>Ücret:</strong> ₺{selectedAd.fee}</div>
              <div><strong>İlan Sahibi:</strong> {selectedAd.first_name} {selectedAd.last_name}</div>
            </div>
            <div style={{padding: '12px', background: 'var(--color-bg-subtle)', borderRadius: '8px', fontSize: '13px', marginBottom: '16px', lineHeight: 1.5}}>
              {selectedAd.description}
            </div>
            
            <label style={styles.label}>Başvuru Notunuz</label>
            <textarea 
              style={styles.textarea} 
              placeholder="İlan sahibine iletmek istediğiniz mesaj (Örn: Bu adliyede o gün başka duruşmam da var, yardımcı olabilirim...)"
              value={applyMessage}
              onChange={e => setApplyMessage(e.target.value)}
            />
            
            <div style={{display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem'}}>
              <button style={styles.buttonOutline} onClick={() => setSelectedAd(null)}>İptal</button>
              <button style={styles.button} onClick={handleApply} disabled={loading}>Başvuruyu Gönder</button>
            </div>
          </div>
        </div>
      )}

      {/* Modern Toast Notification */}
      {toast.show && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          backgroundColor: toast.type === 'success' ? '#10b981' : '#ef4444',
          color: '#ffffff',
          padding: '12px 24px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 9999,
          fontWeight: '500',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          animation: 'fade-in 0.3s ease-out'
        }}>
          {toast.type === 'success' ? '✅' : '❌'} {toast.message}
        </div>
      )}
    </div>
  );
}
