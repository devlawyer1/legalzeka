"use client";

import { useState, useEffect } from "react";
import { getCollections, addItemToCollection } from "../../lib/api";

export default function SaveToCollection({ kararId }) {
  const [isOpen, setIsOpen] = useState(false);
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchCollections();
    }
  }, [isOpen]);

  async function fetchCollections() {
    setLoading(true);
    try {
      const data = await getCollections();
      setCollections(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(collectionId) {
    try {
      await addItemToCollection(collectionId, kararId);
      alert("Koleksiyona eklendi!");
      setIsOpen(false);
    } catch (err) {
      console.error(err);
      alert("Eklenirken bir hata oluştu veya zaten ekli.");
    }
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button 
        style={styles.saveBtn} 
        onClick={() => setIsOpen(!isOpen)}
        title="Koleksiyona Ekle"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
        </svg>
        <span style={{marginLeft: 4, fontSize: 12}}>Kaydet</span>
      </button>

      {isOpen && (
        <div style={styles.dropdown} className="animate-fade-in">
          <div style={styles.dropdownHeader}>Koleksiyon Seçin</div>
          {loading ? (
            <div style={styles.loading}>Yükleniyor...</div>
          ) : collections.length === 0 ? (
            <div style={styles.empty}>Henüz koleksiyonunuz yok. Önce "Koleksiyonlarım" sekmesinden oluşturun.</div>
          ) : (
            <div style={styles.list}>
              {collections.map(c => (
                <button 
                  key={c.id} 
                  style={styles.listItem}
                  onClick={() => handleSave(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  saveBtn: {
    background: "transparent",
    border: "1px solid var(--color-border)",
    color: "var(--color-text-secondary)",
    borderRadius: 6,
    padding: "4px 8px",
    display: "flex",
    alignItems: "center",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  dropdown: {
    position: "absolute",
    top: "100%",
    right: 0,
    marginTop: 4,
    width: 220,
    background: "var(--color-bg-elevated)",
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    zIndex: 10,
    display: "flex",
    flexDirection: "column",
  },
  dropdownHeader: {
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--color-text-tertiary)",
    borderBottom: "1px solid var(--color-border-subtle)",
  },
  loading: {
    padding: 12,
    fontSize: 12,
    color: "var(--color-text-secondary)",
    textAlign: "center",
  },
  empty: {
    padding: 12,
    fontSize: 12,
    color: "var(--color-text-secondary)",
    textAlign: "center",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    maxHeight: 200,
    overflowY: "auto",
  },
  listItem: {
    padding: "8px 12px",
    background: "transparent",
    border: "none",
    textAlign: "left",
    fontSize: 13,
    color: "var(--color-text-primary)",
    cursor: "pointer",
    transition: "background 0.2s",
  }
};
