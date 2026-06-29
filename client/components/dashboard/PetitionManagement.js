"use client";

import { useState, useEffect } from "react";
import { getPetitions, deletePetition, generateAiPetition, createPetition, getPetitionComparisons, compareAiPetitions } from "@/lib/api";
import PetitionGeneratorModal from "./PetitionGeneratorModal";
import PetitionComparisonModal from "./PetitionComparisonModal";
import DraftStudio from "./DraftStudio";
import { ArrowLeft } from "lucide-react";

function normalizeControlReport(report) {
  if (!report) return null;
  if (typeof report === "string") {
    try {
      return JSON.parse(report);
    } catch (_) {
      return null;
    }
  }
  return report;
}

function renderControlReport(report) {
  const value = normalizeControlReport(report);
  if (!value || Object.keys(value).length === 0) {
    return <span style={mutedBadgeStyle}>Yok</span>;
  }

  const issueCount =
    (value.requiredInfoMissing?.length || 0) +
    (value.missingElements?.length || 0) +
    (value.sourceVerification?.status === "missing_sources" ? 1 : 0);
  const ready = value.status === "draft_ready" && issueCount === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={ready ? successBadgeStyle : warningBadgeStyle}>
        {ready ? "Hazır" : `${issueCount || 1} kontrol`}
      </span>
      <small style={{ color: "var(--color-text-tertiary)", lineHeight: 1.3 }}>
        {value.sourceVerification?.status === "missing_sources" ? "Kaynak eksik" : "Kaynak kontrolü"}
      </small>
    </div>
  );
}

export default function PetitionManagement({ firmId, caseId, onBack }) {
  if (firmId && caseId) {
    return (
      <div style={{ height: "min(860px, 86vh)", minHeight: 650, display: "flex", flexDirection: "column", gap: 10 }}>
        <button onClick={onBack} style={{ ...secondaryBtnStyle, alignSelf: "flex-start" }}><ArrowLeft size={16} /> Dava listesine dön</button>
        <div style={{ flex: 1, minHeight: 0, border: "1px solid var(--color-border-subtle)", borderRadius: 8, overflow: "hidden" }}>
          <DraftStudio caseId={caseId} />
        </div>
      </div>
    );
  }
  return <LegacyPetitionManagement firmId={firmId} caseId={caseId} onBack={onBack} />;
}

function LegacyPetitionManagement({ firmId, caseId, onBack }) {
  const [petitions, setPetitions] = useState([]);
  const [comparisons, setComparisons] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const [showGenModal, setShowGenModal] = useState(false);
  const [showCompModal, setShowCompModal] = useState(false);
  
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3000);
  };
  
  const [activeTab, setActiveTab] = useState("petitions"); // petitions, comparisons

  useEffect(() => {
    if (firmId && caseId) {
      loadData();
    }
  }, [firmId, caseId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [resPetitions, resComparisons] = await Promise.all([
        getPetitions(firmId, caseId),
        getPetitionComparisons(firmId, caseId)
      ]);
      setPetitions(resPetitions.data || []);
      setComparisons(resComparisons.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Dilekçeyi silmek istediğinize emin misiniz?")) return;
    try {
      await deletePetition(firmId, caseId, id);
      setPetitions(petitions.filter(p => p.id !== id));
      showToast("Dilekçe başarıyla silindi.");
    } catch (err) {
      showToast("Hata: " + err.message, "error");
    }
  };

  const handleGenerate = async (formData) => {
    try {
      await generateAiPetition(firmId, caseId, { ...formData, save: true });
      setShowGenModal(false);
      loadData();
      showToast("Dilekçe başarıyla üretildi.");
    } catch (err) {
      showToast("Hata: " + err.message, "error");
    }
  };

  const handleCompare = async (p1Id, p2Id) => {
    try {
      await compareAiPetitions(firmId, caseId, { petition1Id: p1Id, petition2Id: p2Id });
      setShowCompModal(false);
      loadData();
      setActiveTab("comparisons");
      showToast("Karşılaştırma tamamlandı.");
    } catch (err) {
      showToast("Hata: " + err.message, "error");
    }
  };

  if (loading) return <div style={{ padding: 20 }}>Yükleniyor...</div>;

  // Standalone mode: no firmId/caseId provided
  if (!firmId || !caseId) {
    return (
      <div style={{ padding: 40, maxWidth: 700, margin: "0 auto" }}>
        <div style={{ textAlign: "center", padding: "20px 20px" }}>
          <h3 style={{ fontSize: 20, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 12 }}>
            Dilekçe İşlemleri
          </h3>
          <p style={{ fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.7, marginBottom: 28, maxWidth: 440, margin: "0 auto 28px" }}>
            Yapay zeka destekli dilekçe oluşturma ve karşılaştırma modülü. 
            Bir dava dosyası üzerinden dilekçe işlemleri başlatabilirsiniz.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => setShowGenModal(true)} style={btnStyle}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              AI ile Dilekçe Üret
            </button>
            <button onClick={() => setShowCompModal(true)} style={secondaryBtnStyle}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 3h5v5M8 3H3v5M3 16v5h5M21 16v5h-5" />
              </svg>
              Dilekçe Karşılaştır
            </button>
          </div>
          <div style={{ marginTop: 40, padding: 20, background: "var(--color-bg-elevated)", borderRadius: 12, border: "1px solid var(--color-border-subtle)", textAlign: "left" }}>
            <h4 style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 12 }}>Nasıl Kullanılır?</h4>
            <ul style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 2, paddingLeft: 20, margin: 0 }}>
              <li><strong>Dilekçe Üretici:</strong> Dava türü, taraflar ve delilleri girerek AI ile profesyonel dilekçe oluşturun.</li>
              <li><strong>Karşılaştırma:</strong> Davacı ve davalı dilekçelerini yükleyerek AI ile çelişki ve eksik analizi yapın.</li>
              <li><strong>Dava Entegrasyonu:</strong> Büro Yönetimi → Dava Dosyaları üzerinden dilekçeleri doğrudan davaya bağlayın.</li>
            </ul>
          </div>
        </div>

        {showGenModal && (
          <PetitionGeneratorModal 
            onClose={() => setShowGenModal(false)} 
            onGenerate={handleGenerate} 
          />
        )}

        {showCompModal && (
          <PetitionComparisonModal 
            petitions={petitions}
            onClose={() => setShowCompModal(false)}
            onCompare={handleCompare}
          />
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
          <button onClick={onBack} style={secondaryBtnStyle}>&larr; Geri</button>
          <h2>Dilekçe İşlemleri (AI)</h2>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setShowCompModal(true)} style={secondaryBtnStyle}>AI ile Karşılaştır</button>
          <button onClick={() => setShowGenModal(true)} style={btnStyle}>+ Yapay Zeka ile Üret</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, marginBottom: 20, borderBottom: '1px solid var(--color-border)' }}>
        <button 
          style={{ ...tabStyle, ...(activeTab === "petitions" ? activeTabStyle : {}) }}
          onClick={() => setActiveTab("petitions")}
        >
          Dilekçeler ({petitions.length})
        </button>
        <button 
          style={{ ...tabStyle, ...(activeTab === "comparisons" ? activeTabStyle : {}) }}
          onClick={() => setActiveTab("comparisons")}
        >
          Karşılaştırma Raporları ({comparisons.length})
        </button>
      </div>

      {activeTab === "petitions" && (
        <div>
          {petitions.length === 0 ? (
            <p>Dava için henüz dilekçe oluşturulmamış.</p>
          ) : (
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Başlık</th>
                  <th style={thStyle}>Tür</th>
                  <th style={thStyle}>Versiyon</th>
                  <th style={thStyle}>Kontrol</th>
                  <th style={thStyle}>Oluşturan</th>
                  <th style={thStyle}>Tarih</th>
                  <th style={thStyle}>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {petitions.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #333' }}>
                    <td style={tdStyle}>{p.title}</td>
                    <td style={tdStyle}>{p.type}</td>
                    <td style={tdStyle}>v{p.version}</td>
                    <td style={tdStyle}>{renderControlReport(p.control_report)}</td>
                    <td style={tdStyle}>{p.first_name} {p.last_name}</td>
                    <td style={tdStyle}>{new Date(p.created_at).toLocaleDateString()}</td>
                    <td style={tdStyle}>
                      <button onClick={() => handleDelete(p.id)} style={{ ...secondaryBtnStyle, color: 'var(--color-error)', borderColor: 'var(--color-error)' }}>Sil</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === "comparisons" && (
        <div>
          {comparisons.length === 0 ? (
            <p>Henüz karşılaştırma raporu bulunmuyor.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
              {comparisons.map((c) => (
                <div key={c.id} style={{ padding: 15, background: 'var(--color-surface)', borderRadius: 8, border: '1px solid var(--color-border)' }}>
                  <h4>{c.petition1_title} <span style={{ color: 'var(--color-text-tertiary)' }}>vs</span> {c.petition2_title}</h4>
                  <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 10 }}>{new Date(c.created_at).toLocaleString()}</p>
                  <div style={{ padding: 15, background: 'var(--color-background)', borderRadius: 8, fontSize: 14 }}
                       dangerouslySetInnerHTML={{ __html: c.ai_report.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>') }} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showGenModal && (
        <PetitionGeneratorModal 
          onClose={() => setShowGenModal(false)} 
          onGenerate={handleGenerate} 
        />
      )}

      {showCompModal && (
        <PetitionComparisonModal 
          petitions={petitions}
          onClose={() => setShowCompModal(false)}
          onCompare={handleCompare}
        />
      )}

      {/* Toast Notification */}
      {toast.show && (
        <div style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          background: toast.type === "success" ? "var(--color-success)" : "var(--color-error)",
          color: "#fff",
          padding: "12px 24px",
          borderRadius: 8,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          fontWeight: 500,
          fontSize: 14,
          zIndex: 9999,
          animation: "slideUp 0.3s ease-out forwards"
        }}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

const btnStyle = { padding: "10px 20px", fontSize: 13, fontWeight: 600, background: "var(--color-accent)", color: "var(--color-text-inverse)", border: "none", borderRadius: 8, cursor: "pointer", transition: "all 0.2s ease" };
const secondaryBtnStyle = { padding: "10px 20px", fontSize: 13, fontWeight: 500, background: "transparent", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)", borderBottom: "2px solid var(--color-border)", borderRadius: 8, cursor: "pointer", transition: "all 0.2s ease" };
const tabStyle = { padding: "10px 20px", background: "transparent", border: "none", color: "var(--color-text-secondary)", cursor: "pointer", fontSize: 14, fontWeight: 500 };
const activeTabStyle = { color: "var(--color-accent)", borderBottom: "2px solid var(--color-accent)" };
const thStyle = { padding: '12px 8px', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' };
const tdStyle = { padding: '12px 8px', borderBottom: '1px solid var(--color-border)' };
const successBadgeStyle = { display: "inline-flex", width: "max-content", padding: "4px 8px", borderRadius: 999, background: "#DCFCE7", color: "#166534", fontSize: 11, fontWeight: 800 };
const warningBadgeStyle = { display: "inline-flex", width: "max-content", padding: "4px 8px", borderRadius: 999, background: "#FEF3C7", color: "#92400E", fontSize: 11, fontWeight: 800 };
const mutedBadgeStyle = { display: "inline-flex", width: "max-content", padding: "4px 8px", borderRadius: 999, background: "var(--color-bg-subtle)", color: "var(--color-text-tertiary)", fontSize: 11, fontWeight: 800 };
