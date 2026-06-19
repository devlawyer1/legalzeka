"use client";

import { useState, useRef } from "react";
import { analyzeDevilsAdvocate } from "@/lib/api";
import { Ghost } from "lucide-react";

export default function DevilsAdvocate({ onSaveNote }) {
  const [file, setFile] = useState(null);
  const [textMode, setTextMode] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async () => {
    if (!file && !textInput.trim()) {
      setError("Lütfen incelemek için bir dosya yükleyin veya metin girin.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      if (!textMode && file) {
        formData.append("document", file);
      } else {
        formData.append("text", textInput);
      }

      const response = await analyzeDevilsAdvocate(formData);
      setResult(response.data.analysis);
    } catch (err) {
      setError(err.message || "Analiz sırasında bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container} className="animate-fade-in">
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Şeytanın Avukatı</h2>
          <p style={styles.subtitle}>
            Dilekçenizi veya argümanınızı yükleyin. Yapay zeka karşı tarafın acımasız avukatı rolüne bürünerek tezlerinizdeki zayıf noktaları ve çelişkileri bulsun.
          </p>
        </div>
      </div>

      <div style={styles.content}>
        {/* Toggle Mode */}
        <div style={styles.toggleContainer}>
          <button 
            style={{...styles.toggleBtn, ...(textMode ? {} : styles.toggleActive)}}
            onClick={() => setTextMode(false)}
          >
            Dosya Yükle
          </button>
          <button 
            style={{...styles.toggleBtn, ...(textMode ? styles.toggleActive : {})}}
            onClick={() => setTextMode(true)}
          >
            Metin Gir
          </button>
        </div>

        {/* Input Area */}
        <div style={styles.inputSection}>
          {textMode ? (
            <textarea
              style={styles.textArea}
              placeholder="İncelenecek metni buraya yapıştırın..."
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
            />
          ) : (
            <div 
              style={styles.dropZone}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                style={{ display: "none" }}
                accept=".pdf, .jpg, .jpeg, .png"
              />
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-text-tertiary)", marginBottom: 12 }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {file ? (
                <div style={{ color: "var(--color-accent)", fontWeight: 600 }}>{file.name}</div>
              ) : (
                <>
                  <div style={{ color: "var(--color-text-secondary)", fontWeight: 500 }}>Sürükleyip bırakın veya seçmek için tıklayın</div>
                  <div style={{ color: "var(--color-text-tertiary)", fontSize: 13, marginTop: 4 }}>Desteklenen formatlar: PDF, JPG, PNG (Maks 10MB)</div>
                </>
              )}
            </div>
          )}
        </div>

        {error && (
          <div style={styles.errorCard}>{error}</div>
        )}

        <button 
          style={styles.submitBtn} 
          onClick={handleSubmit}
          disabled={loading || (!textMode && !file) || (textMode && !textInput)}
        >
          {loading ? (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
                <line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
              </svg>
              Yapay Zeka Analiz Ediyor...
            </>
          ) : (
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>Dilekçeyi Çürüt <Ghost size={18} /></span>
          )}
        </button>

        {/* Result Area */}
        {result && (
          <div style={styles.resultContainer} className="animate-slide-in">
            <div style={styles.resultHeader}>
              <h3 style={styles.resultTitle}>Analiz Sonucu</h3>
              <button 
                onClick={() => onSaveNote(result)}
                style={styles.saveNoteBtn}
              >
                Notlara Ekle
              </button>
            </div>
            <div style={styles.resultBody}>
               <p dangerouslySetInnerHTML={{ __html: result.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n\n/g, '<br/><br/>').replace(/\n/g, '<br/>') }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: 900,
    margin: "0 auto",
    padding: "20px 0",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 20,
    marginBottom: 30,
    padding: "0 20px",
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: "var(--color-text-primary)",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: "var(--color-text-secondary)",
    lineHeight: 1.5,
  },
  content: {
    background: "var(--color-bg-elevated)",
    border: "1px solid var(--color-border-subtle)",
    borderRadius: "var(--radius-lg)",
    padding: 30,
    boxShadow: "var(--shadow-sm)",
  },
  toggleContainer: {
    display: "flex",
    background: "var(--color-bg-subtle)",
    padding: 4,
    borderRadius: "var(--radius-md)",
    marginBottom: 20,
    width: "max-content",
  },
  toggleBtn: {
    padding: "8px 16px",
    borderRadius: "var(--radius-sm)",
    border: "none",
    background: "transparent",
    color: "var(--color-text-secondary)",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 500,
    transition: "all 0.2s",
  },
  toggleActive: {
    background: "var(--color-bg-elevated)",
    color: "var(--color-text-primary)",
    boxShadow: "var(--shadow-sm)",
  },
  inputSection: {
    marginBottom: 20,
  },
  dropZone: {
    border: "2px dashed var(--color-border)",
    borderRadius: "var(--radius-md)",
    padding: "40px 20px",
    textAlign: "center",
    cursor: "pointer",
    transition: "border-color 0.2s, background 0.2s",
    background: "var(--color-bg-subtle)",
  },
  textArea: {
    width: "100%",
    minHeight: 200,
    padding: 16,
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-border)",
    background: "var(--color-bg)",
    color: "var(--color-text-primary)",
    fontSize: 15,
    fontFamily: "inherit",
    resize: "vertical",
    outline: "none",
  },
  submitBtn: {
    width: "100%",
    padding: "14px 20px",
    background: "var(--color-accent)",
    color: "var(--color-text-inverse)",
    border: "none",
    borderRadius: "var(--radius-md)",
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    transition: "opacity 0.2s",
  },
  errorCard: {
    background: "rgba(239, 68, 68, 0.1)",
    color: "var(--color-error)",
    padding: 12,
    borderRadius: "var(--radius-sm)",
    marginBottom: 20,
    fontSize: 14,
    border: "1px solid rgba(239, 68, 68, 0.2)",
  },
  resultContainer: {
    marginTop: 30,
    borderTop: "1px solid var(--color-border-subtle)",
    paddingTop: 30,
  },
  resultHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: "var(--color-text-primary)",
  },
  saveNoteBtn: {
    background: "var(--color-bg-subtle)",
    border: "1px solid var(--color-border)",
    padding: "6px 12px",
    borderRadius: "var(--radius-sm)",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--color-text-secondary)",
    cursor: "pointer",
  },
  resultBody: {
    background: "var(--color-bg-subtle)",
    padding: 24,
    borderRadius: "var(--radius-md)",
    fontSize: 15,
    lineHeight: 1.7,
    color: "var(--color-text-primary)",
  }
};
