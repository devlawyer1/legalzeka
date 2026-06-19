"use client";

import React, { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export default function FinanceDashboard({ activeFirmId }) {
  const [stats, setStats] = useState({
    total_pending: 0,
    total_paid: 0,
    total_overdue: 0,
    mrr: 0
  });
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceFormLoading, setInvoiceFormLoading] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    client_name: '', invoice_number: '', total_amount: '', due_date: '', status: 'pending', description: ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";
      const [statsRes, invoicesRes] = await Promise.all([
        fetch(`${API_BASE}/firms/${activeFirmId}/finance/stats`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/firms/${activeFirmId}/finance/invoices`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
      
      if (invoicesRes.ok) {
        const invoicesData = await invoicesRes.json();
        setInvoices(invoicesData);
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
  }, [activeFirmId]);

  const chartData = {
    labels: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz'],
    datasets: [
      {
        label: 'Tahsil Edilen',
        data: [12000, 19000, 15000, 22000, 28000, stats.total_paid || 0],
        borderColor: 'rgb(34, 197, 94)',
        backgroundColor: 'rgba(34, 197, 94, 0.5)',
        tension: 0.4
      },
      {
        label: 'Bekleyen',
        data: [5000, 3000, 8000, 4000, 6000, stats.total_pending || 0],
        borderColor: 'rgb(234, 179, 8)',
        backgroundColor: 'rgba(234, 179, 8, 0.5)',
        tension: 0.4
      }
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: false,
      },
    },
  };

  if (loading) return <div style={{ padding: '24px', textAlign: 'center' }}>Yükleniyor...</div>;
  if (!activeFirmId && !loading) return (
    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
      Lütfen önce bir büro seçin veya oluşturun.
    </div>
  );

  return (
    <div style={{ padding: '24px', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 8px', color: 'var(--color-text-primary)' }}>
            Finans ve Tahsilat
          </h2>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
            Gelirlerinizi, bekleyen ödemeleri ve MRR'ı (Aylık Tekrarlayan Gelir) takip edin.
          </p>
        </div>
        <button onClick={() => setShowInvoiceModal(true)} style={{
          padding: '8px 16px',
          backgroundColor: 'var(--color-accent)',
          color: 'var(--color-text-inverse)',
          border: 'none',
          borderRadius: 'var(--radius-md)',
          fontWeight: '600',
          cursor: 'pointer'
        }}>
          + Yeni Fatura / Gelir
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '32px' }}>
        <div style={{ backgroundColor: 'var(--color-bg-subtle)', padding: '20px', borderRadius: 'var(--radius-lg)' }}>
          <p style={{ margin: '0 0 8px', fontSize: '14px', color: 'var(--color-text-secondary)' }}>Aylık Düzenli Gelir (MRR)</p>
          <h3 style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: 'var(--color-text-primary)' }}>
            {stats.mrr.toLocaleString('tr-TR')} ₺
          </h3>
        </div>
        <div style={{ backgroundColor: 'var(--color-bg-subtle)', padding: '20px', borderRadius: 'var(--radius-lg)' }}>
          <p style={{ margin: '0 0 8px', fontSize: '14px', color: 'var(--color-text-secondary)' }}>Toplam Tahsil Edilen</p>
          <h3 style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: 'var(--color-success)' }}>
            {stats.total_paid.toLocaleString('tr-TR')} ₺
          </h3>
        </div>
        <div style={{ backgroundColor: 'var(--color-bg-subtle)', padding: '20px', borderRadius: 'var(--radius-lg)' }}>
          <p style={{ margin: '0 0 8px', fontSize: '14px', color: 'var(--color-text-secondary)' }}>Bekleyen Tahsilat</p>
          <h3 style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: 'var(--color-warning)' }}>
            {stats.total_pending.toLocaleString('tr-TR')} ₺
          </h3>
        </div>
        <div style={{ backgroundColor: 'var(--color-bg-subtle)', padding: '20px', borderRadius: 'var(--radius-lg)' }}>
          <p style={{ margin: '0 0 8px', fontSize: '14px', color: 'var(--color-text-secondary)' }}>Geciken Tahsilat</p>
          <h3 style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: 'var(--color-danger)' }}>
            {stats.total_overdue.toLocaleString('tr-TR')} ₺
          </h3>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '24px', marginBottom: '32px', height: '350px' }}>
        <div style={{ flex: 2, backgroundColor: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '20px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '600' }}>Tahsilat Trendi (Son 6 Ay)</h3>
          <div style={{ height: 'calc(100% - 40px)' }}>
            <Line options={chartOptions} data={chartData} />
          </div>
        </div>

        <div style={{ flex: 1, backgroundColor: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '20px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '600' }}>Akıllı Tahsilat Asistanı</h3>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {stats.total_overdue > 0 && (
              <div style={{ padding: '12px', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderLeft: '4px solid var(--color-danger)', borderRadius: '0 var(--radius-md) var(--radius-md) 0', marginBottom: '12px' }}>
                <p style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: '600', color: 'var(--color-danger)' }}>Geciken Ödemeler Var!</p>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-secondary)' }}>3 müvekkilinizin toplam {stats.total_overdue.toLocaleString('tr-TR')} ₺ gecikmiş borcu bulunuyor. Hatırlatma e-postası göndermek ister misiniz?</p>
                <button onClick={() => alert('Hatırlatma başarıyla kuyruğa eklendi.')} style={{ marginTop: '8px', padding: '4px 12px', fontSize: '12px', backgroundColor: 'var(--color-danger)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>Hatırlatma Gönder</button>
              </div>
            )}
            <div style={{ padding: '12px', backgroundColor: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-md)', marginBottom: '12px' }}>
              <p style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: '600' }}>Yaklaşan Ödemeler</p>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-secondary)' }}>Önümüzdeki 7 gün içinde 2 tahsilat bekleniyor.</p>
            </div>
          </div>
        </div>
      </div>

      <div style={{ backgroundColor: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '20px' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '600' }}>Son İşlemler</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)', textAlign: 'left' }}>
              <th style={{ padding: '12px 8px', fontWeight: '500' }}>Müvekkil</th>
              <th style={{ padding: '12px 8px', fontWeight: '500' }}>Fatura No</th>
              <th style={{ padding: '12px 8px', fontWeight: '500' }}>Tutar</th>
              <th style={{ padding: '12px 8px', fontWeight: '500' }}>Son Ödeme Tarihi</th>
              <th style={{ padding: '12px 8px', fontWeight: '500' }}>Durum</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>Henüz işlem bulunmuyor.</td>
              </tr>
            ) : (
              invoices.map(invoice => (
                <tr key={invoice.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ padding: '12px 8px', fontWeight: '500' }}>{invoice.client_name}</td>
                  <td style={{ padding: '12px 8px', color: 'var(--color-text-secondary)' }}>{invoice.invoice_number || '-'}</td>
                  <td style={{ padding: '12px 8px' }}>{parseFloat(invoice.total_amount).toLocaleString('tr-TR')} ₺</td>
                  <td style={{ padding: '12px 8px' }}>{new Date(invoice.due_date).toLocaleDateString('tr-TR')}</td>
                  <td style={{ padding: '12px 8px' }}>
                    <span style={{ 
                      padding: '4px 8px', 
                      borderRadius: '12px', 
                      fontSize: '12px', 
                      fontWeight: '500',
                      backgroundColor: invoice.status === 'paid' ? 'rgba(34, 197, 94, 0.1)' : invoice.status === 'overdue' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(234, 179, 8, 0.1)',
                      color: invoice.status === 'paid' ? 'var(--color-success)' : invoice.status === 'overdue' ? 'var(--color-danger)' : 'var(--color-warning)'
                    }}>
                      {invoice.status === 'paid' ? 'Ödendi' : invoice.status === 'overdue' ? 'Gecikti' : 'Bekliyor'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Yeni Fatura Modal */}
      {showInvoiceModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '28px', width: '520px', maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: 'var(--color-text-primary)' }}>Yeni Fatura / Gelir</h3>
              <button onClick={() => setShowInvoiceModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: 'var(--color-text-secondary)' }}>✕</button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!invoiceForm.client_name.trim() || !invoiceForm.total_amount || !invoiceForm.due_date) return;
              setInvoiceFormLoading(true);
              try {
                const token = localStorage.getItem('accessToken');
                const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
                const res = await fetch(`${API_BASE}/firms/${activeFirmId}/finance/invoices`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                  body: JSON.stringify(invoiceForm)
                });
                if (res.ok) {
                  setShowInvoiceModal(false);
                  setInvoiceForm({ client_name: '', invoice_number: '', total_amount: '', due_date: '', status: 'pending', description: '' });
                  fetchData();
                }
              } catch (err) {
                console.error('Fatura oluşturma hatası:', err);
              } finally {
                setInvoiceFormLoading(false);
              }
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Müvekkil Adı *</label>
                  <input value={invoiceForm.client_name} onChange={(e) => setInvoiceForm({...invoiceForm, client_name: e.target.value})} required placeholder="Müvekkil adı" style={{ padding: '10px 14px', fontSize: '14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-subtle)', color: 'var(--color-text-primary)', outline: 'none' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Fatura No</label>
                  <input value={invoiceForm.invoice_number} onChange={(e) => setInvoiceForm({...invoiceForm, invoice_number: e.target.value})} placeholder="FTR-2024-001" style={{ padding: '10px 14px', fontSize: '14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-subtle)', color: 'var(--color-text-primary)', outline: 'none' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Tutar (₺) *</label>
                  <input type="number" min="0" step="0.01" value={invoiceForm.total_amount} onChange={(e) => setInvoiceForm({...invoiceForm, total_amount: e.target.value})} required placeholder="0.00" style={{ padding: '10px 14px', fontSize: '14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-subtle)', color: 'var(--color-text-primary)', outline: 'none' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Son Ödeme Tarihi *</label>
                  <input type="date" value={invoiceForm.due_date} onChange={(e) => setInvoiceForm({...invoiceForm, due_date: e.target.value})} required style={{ padding: '10px 14px', fontSize: '14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-subtle)', color: 'var(--color-text-primary)', outline: 'none' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Durum</label>
                  <select value={invoiceForm.status} onChange={(e) => setInvoiceForm({...invoiceForm, status: e.target.value})} style={{ padding: '10px 14px', fontSize: '14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-subtle)', color: 'var(--color-text-primary)', outline: 'none' }}>
                    <option value="pending">Bekliyor</option>
                    <option value="paid">Ödendi</option>
                    <option value="overdue">Gecikti</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Açıklama</label>
                  <textarea value={invoiceForm.description} onChange={(e) => setInvoiceForm({...invoiceForm, description: e.target.value})} placeholder="İsteğe bağlı açıklama..." style={{ padding: '10px 14px', fontSize: '14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-subtle)', color: 'var(--color-text-primary)', outline: 'none', minHeight: '60px', resize: 'vertical' }} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
                <button type="button" onClick={() => setShowInvoiceModal(false)} style={{ padding: '8px 16px', fontSize: '14px', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>İptal</button>
                <button type="submit" disabled={invoiceFormLoading} style={{ padding: '8px 20px', fontSize: '14px', fontWeight: '600', background: 'var(--color-accent)', color: 'var(--color-text-inverse)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>{invoiceFormLoading ? 'Kaydediliyor...' : 'Fatura Oluştur'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
