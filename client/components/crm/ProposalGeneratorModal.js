"use client";

import React, { useState } from 'react';
import jsPDF from 'jspdf';

export default function ProposalGeneratorModal({ isOpen, onClose, lead, activeFirmId }) {
  const [items, setItems] = useState([{ description: '', amount: '' }]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !lead) return null;

  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  const addItem = () => {
    setItems([...items, { description: '', amount: '' }]);
  };

  const removeItem = (index) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  const calculateTotal = () => {
    return items.reduce((total, item) => total + (parseFloat(item.amount) || 0), 0);
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    const total = calculateTotal();

    // Font settings
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("HUKUKI HIZMET TEKLIFI", 105, 20, { align: "center" });

    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(`Tarih: ${new Date().toLocaleDateString('tr-TR')}`, 150, 40);

    doc.setFont("helvetica", "bold");
    doc.text("Musteri Bilgileri:", 20, 50);
    doc.setFont("helvetica", "normal");
    doc.text(`Sayin ${lead.name}`, 20, 60);
    if (lead.email) doc.text(`E-posta: ${lead.email}`, 20, 70);

    doc.setFont("helvetica", "bold");
    doc.text("Hizmet Kalemleri:", 20, 90);
    
    let y = 100;
    items.forEach((item, index) => {
      doc.setFont("helvetica", "normal");
      doc.text(`${index + 1}. ${item.description}`, 20, y);
      doc.text(`${parseFloat(item.amount || 0).toLocaleString('tr-TR')} TL`, 160, y);
      y += 10;
    });

    doc.line(20, y, 190, y);
    y += 10;
    doc.setFont("helvetica", "bold");
    doc.text("TOPLAM:", 120, y);
    doc.text(`${total.toLocaleString('tr-TR')} TL (KDV Haric)`, 160, y);

    if (notes) {
      y += 20;
      doc.text("Ek Notlar:", 20, y);
      doc.setFont("helvetica", "normal");
      const splitNotes = doc.splitTextToSize(notes, 170);
      doc.text(splitNotes, 20, y + 10);
    }

    // Save PDF
    doc.save(`Teklif_${lead.name.replace(/\s+/g, '_')}.pdf`);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // 1. Generate PDF
      generatePDF();

      // 2. Save Proposal to backend
      const token = localStorage.getItem('accessToken');
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";
      const res = await fetch(`${API_BASE}/firms/${activeFirmId}/crm/leads/${lead.id}/proposals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title: `${lead.subject || 'Hukuki Hizmet'} Teklifi`,
          content: notes || 'Hukuki hizmet teklif taslağı',
          amount: calculateTotal(),
          status: 'sent',
          valid_until: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(), // 15 days validity
          notes: notes
        })
      });

      if (!res.ok) {
        throw new Error('Teklif kaydedilemedi.');
      }

      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        backgroundColor: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-lg)',
        width: '100%', maxWidth: '600px', padding: '24px', boxShadow: 'var(--shadow-lg)',
        maxHeight: '90vh', overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>Teklif Jeneratörü</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>&times;</button>
        </div>

        {error && <div style={{ color: 'var(--color-danger)', marginBottom: '16px', fontSize: '14px' }}>{error}</div>}

        <div style={{ marginBottom: '20px', padding: '12px', backgroundColor: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-md)' }}>
          <p style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: '600' }}>Müvekkil: {lead.name}</p>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-secondary)' }}>Konu: {lead.subject || '-'}</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '8px', color: 'var(--color-text-secondary)' }}>Hizmet Kalemleri</label>
            {items.map((item, index) => (
              <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input 
                  type="text" 
                  placeholder="Hizmet açıklaması (örn: Danışmanlık Ücreti)"
                  value={item.description}
                  onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                  required
                  style={{ flex: 2, padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)' }}
                />
                <input 
                  type="number" 
                  placeholder="Tutar (₺)"
                  value={item.amount}
                  onChange={(e) => handleItemChange(index, 'amount', e.target.value)}
                  required
                  style={{ flex: 1, padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)' }}
                />
                {items.length > 1 && (
                  <button type="button" onClick={() => removeItem(index)} style={{ padding: '0 12px', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
                    Sil
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={addItem} style={{ fontSize: '13px', color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '500', padding: 0, marginTop: '4px' }}>
              + Yeni Kalem Ekle
            </button>
          </div>

          <div style={{ textAlign: 'right', fontSize: '16px', fontWeight: '600', padding: '12px 0', borderTop: '1px solid var(--color-border)' }}>
            Ara Toplam: {calculateTotal().toLocaleString('tr-TR')} ₺
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px', color: 'var(--color-text-secondary)' }}>Ek Notlar (İsteğe Bağlı)</label>
            <textarea 
              rows="3"
              value={notes} 
              onChange={(e) => setNotes(e.target.value)} 
              placeholder="Teklifin geçerlilik süresi, KDV durumu veya özel şartlar..."
              style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text-primary)', resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
            <button type="button" onClick={onClose} style={{ padding: '10px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'transparent', cursor: 'pointer', fontWeight: '500' }}>
              İptal
            </button>
            <button type="submit" disabled={loading} style={{ padding: '10px 16px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--color-accent)', color: 'var(--color-text-inverse)', cursor: 'pointer', fontWeight: '500', opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Oluşturuluyor...' : 'PDF Oluştur ve Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
