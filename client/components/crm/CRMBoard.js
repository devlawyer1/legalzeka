"use client";

import React, { useState, useEffect } from 'react';
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import AddLeadModal from './AddLeadModal';
import ProposalGeneratorModal from './ProposalGeneratorModal';

const COLUMNS = [
  { id: 'ilk_gorusme', title: 'İlk Görüşme' },
  { id: 'teklif_hazirlaniyor', title: 'Teklif Hazırlanıyor' },
  { id: 'pazarlik', title: 'Pazarlık Aşaması' },
  { id: 'sozlesme_imzalandi', title: 'Sözleşme İmzalandı' },
  { id: 'iptal', title: 'İptal / Kaybedildi' }
];

function SortableItem({ lead, onGenerateProposal, onConvertLead }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: lead.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    padding: '12px',
    margin: '8px 0',
    backgroundColor: 'var(--color-bg-elevated)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    cursor: 'grab',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <h4 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: '600', color: 'var(--color-text-primary)' }}>
        {lead.name}
      </h4>
      <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-secondary)' }}>
        {lead.subject || 'Konu belirtilmedi'}
      </p>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '8px' }}>
        {lead.estimated_value > 0 ? (
          <div style={{ fontSize: '12px', fontWeight: '500', color: 'var(--color-success)' }}>
            {Number(lead.estimated_value).toLocaleString('tr-TR')} ₺
          </div>
        ) : <div />}
        
        {lead.stage === 'teklif_hazirlaniyor' && (
          <button 
            onPointerDown={(e) => e.stopPropagation()} // Prevent drag when clicking button
            onClick={() => onGenerateProposal(lead)}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              backgroundColor: 'var(--color-bg-subtle)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              color: 'var(--color-text-primary)',
              fontWeight: '500'
            }}
          >
            Teklif Oluştur
          </button>
        )}
        {lead.stage === 'sozlesme_imzalandi' && !lead.converted_case_id && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onConvertLead(lead)}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              backgroundColor: 'rgba(34,197,94,0.10)',
              border: '1px solid rgba(34,197,94,0.25)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              color: 'var(--color-success)',
              fontWeight: '600'
            }}
          >
            Dosyaya Dönüştür
          </button>
        )}
      </div>
    </div>
  );
}

export default function CRMBoard({ activeFirmId }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [proposalLead, setProposalLead] = useState(null);
  const [message, setMessage] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";
      const res = await fetch(`${API_BASE}/firms/${activeFirmId}/crm/leads`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLeads(data);
      }
    } catch (err) {
      console.error('Error fetching leads:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeFirmId) {
      fetchLeads();
    } else {
      setLoading(false);
    }
  }, [activeFirmId]);

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over) return;

    const leadId = active.id;
    const overId = over.id; // Could be a column ID or another lead ID
    
    // Find the lead
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    // Determine the new stage
    let newStage = lead.stage;
    if (COLUMNS.some(col => col.id === overId)) {
      newStage = overId;
    } else {
      const overLead = leads.find(l => l.id === overId);
      if (overLead) {
        newStage = overLead.stage;
      }
    }

    if (lead.stage !== newStage) {
      // Optimistic UI update
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, stage: newStage } : l));

      // Backend update
      try {
        const token = localStorage.getItem('accessToken');
        const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";
        await fetch(`${API_BASE}/firms/${activeFirmId}/crm/leads/${leadId}/stage`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ stage: newStage })
        });
      } catch (err) {
        console.error('Failed to update lead stage:', err);
        fetchLeads(); // Revert on failure
      }
    }
  };

  const handleConvertLead = async (lead) => {
    if (!window.confirm(`${lead.name} adayını dava dosyasına dönüştürmek istiyor musunuz?`)) return;

    try {
      const token = localStorage.getItem('accessToken');
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";
      const res = await fetch(`${API_BASE}/firms/${activeFirmId}/crm/leads/${lead.id}/convert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ createInvoice: true })
      });

      if (!res.ok) throw new Error('Dönüşüm tamamlanamadı.');
      setMessage('Aday müvekkil dosyaya ve ön faturaya dönüştürüldü.');
      setTimeout(() => setMessage(''), 3500);
      fetchLeads();
    } catch (err) {
      setMessage(err.message || 'Dönüşüm sırasında hata oluştu.');
      setTimeout(() => setMessage(''), 3500);
    }
  };

  if (loading) return <div style={{ padding: '20px', textAlign: 'center' }}>Yükleniyor...</div>;
  if (!activeFirmId && !loading) return (
    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
      Lütfen önce bir büro seçin veya oluşturun.
    </div>
  );

  return (
    <div style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 8px', color: 'var(--color-text-primary)' }}>
            Aday Müvekkiller (CRM)
          </h2>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
            Sürükle bırak ile potansiyel müvekkillerinizi satış tünelinde ilerletin.
          </p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          style={{
            padding: '8px 16px',
            backgroundColor: 'var(--color-accent)',
            color: 'var(--color-text-inverse)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          + Yeni Aday Ekle
        </button>
      </div>

      {message && (
        <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-subtle)', color: 'var(--color-text-primary)', fontSize: 13, fontWeight: 600 }}>
          {message}
        </div>
      )}

      <DndContext 
        sensors={sensors} 
        collisionDetection={closestCorners} 
        onDragEnd={handleDragEnd}
      >
        <div style={{ display: 'flex', gap: '16px', flex: 1, overflowX: 'auto', paddingBottom: '16px' }}>
          {COLUMNS.map(column => {
            const columnLeads = leads.filter(l => l.stage === column.id);
            return (
              <div 
                key={column.id} 
                id={column.id}
                style={{
                  minWidth: '280px',
                  backgroundColor: 'var(--color-bg-subtle)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: 'var(--color-text-primary)' }}>
                    {column.title}
                  </h3>
                  <span style={{ 
                    backgroundColor: 'var(--color-bg-elevated)', 
                    padding: '2px 8px', 
                    borderRadius: '12px', 
                    fontSize: '12px', 
                    fontWeight: '600',
                    color: 'var(--color-text-secondary)'
                  }}>
                    {columnLeads.length}
                  </span>
                </div>
                
                <SortableContext 
                  items={columnLeads.map(l => l.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div style={{ flex: 1, minHeight: '150px' }}>
                    {columnLeads.map(lead => (
                      <SortableItem key={lead.id} lead={lead} onGenerateProposal={setProposalLead} onConvertLead={handleConvertLead} />
                    ))}
                    {columnLeads.length === 0 && (
                      <div style={{ 
                        height: '100%', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        color: 'var(--color-text-tertiary)',
                        fontSize: '13px',
                        border: '2px dashed var(--color-border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        minHeight: '100px'
                      }}>
                        Aday Yok
                      </div>
                    )}
                  </div>
                </SortableContext>
              </div>
            );
          })}
        </div>
      </DndContext>

      <AddLeadModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={() => {
          setIsModalOpen(false);
          fetchLeads();
        }}
        activeFirmId={activeFirmId}
      />

      <ProposalGeneratorModal
        isOpen={!!proposalLead}
        onClose={() => setProposalLead(null)}
        lead={proposalLead}
        activeFirmId={activeFirmId}
      />
    </div>
  );
}
