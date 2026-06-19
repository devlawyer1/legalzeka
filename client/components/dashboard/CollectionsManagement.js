"use client";

import { useState, useEffect } from "react";
import { getCollections, createCollection, deleteCollection, getCollectionItems, removeItemFromCollection } from "../../lib/api";

export default function CollectionsManagement() {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3000);
  };
  
  const [activeCollectionId, setActiveCollectionId] = useState(null);
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  const [newCollectionName, setNewCollectionName] = useState("");
  const [newCollectionDesc, setNewCollectionDesc] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    fetchCollections();
  }, []);

  useEffect(() => {
    if (activeCollectionId) {
      fetchItems(activeCollectionId);
    }
  }, [activeCollectionId]);

  async function fetchCollections() {
    setLoading(true);
    setError(null);
    try {
      const res = await getCollections();
      const data = Array.isArray(res) ? res : (res?.data || res?.collections || []);
      setCollections(data);
      if (data.length > 0 && !activeCollectionId) {
        setActiveCollectionId(data[0].id);
      }
    } catch (err) {
      console.error(err);
      setError("Koleksiyonlar yüklenirken bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchItems(colId) {
    setItemsLoading(true);
    try {
      const res = await getCollectionItems(colId);
      const data = Array.isArray(res) ? res : (res?.data || res?.items || []);
      setItems(data);
    } catch (err) {
      console.error(err);
    } finally {
      setItemsLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newCollectionName.trim()) return;
    
    try {
      await createCollection({ name: newCollectionName, description: newCollectionDesc });
      setNewCollectionName("");
      setNewCollectionDesc("");
      setIsCreating(false);
      await fetchCollections();
    } catch (err) {
      console.error(err);
      showToast("Koleksiyon oluşturulamadı.", "error");
    }
  }

  async function handleDeleteCollection(id) {
    if (!confirm("Koleksiyonu silmek istediğinize emin misiniz?")) return;
    try {
      await deleteCollection(id);
      if (activeCollectionId === id) {
        setActiveCollectionId(null);
        setItems([]);
      }
      await fetchCollections();
    } catch (err) {
      console.error(err);
      showToast("Silme işlemi başarısız.", "error");
    }
  }

  async function handleRemoveItem(itemId) {
    try {
      await removeItemFromCollection(activeCollectionId, itemId);
      await fetchItems(activeCollectionId);
    } catch (err) {
      console.error(err);
      showToast("Karar koleksiyondan kaldırılamadı.", "error");
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 40, color: "var(--color-text-secondary)" }}>
        Koleksiyonlar yükleniyor...
      </div>
    );
  }

  return (
    <div style={styles.container} className="animate-fade-in">
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <h3 style={styles.title}>Koleksiyonlarım</h3>
          <button style={styles.addBtn} onClick={() => setIsCreating(!isCreating)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
        </div>

        {isCreating && (
          <form onSubmit={handleCreate} style={styles.createForm}>
            <input
              type="text"
              placeholder="Koleksiyon Adı"
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              style={styles.input}
              autoFocus
            />
            <input
              type="text"
              placeholder="Açıklama (İsteğe bağlı)"
              value={newCollectionDesc}
              onChange={(e) => setNewCollectionDesc(e.target.value)}
              style={styles.input}
            />
            <div style={styles.formActions}>
              <button type="button" onClick={() => setIsCreating(false)} style={styles.cancelBtn}>İptal</button>
              <button type="submit" style={styles.submitBtn}>Oluştur</button>
            </div>
          </form>
        )}

        <div style={styles.list}>
          {error ? (
            <div style={{ color: "var(--color-error)" }}>{error}</div>
          ) : collections.length === 0 && !isCreating ? (
            <div style={{ padding: "20px 0", color: "var(--color-text-tertiary)", fontSize: 13 }}>
              Henüz bir koleksiyonunuz yok.
            </div>
          ) : (
            collections.map(c => (
              <div 
                key={c.id} 
                style={{
                  ...styles.colItem,
                  background: activeCollectionId === c.id ? "var(--color-bg-elevated)" : "transparent",
                  borderColor: activeCollectionId === c.id ? "var(--color-border)" : "transparent"
                }}
                onClick={() => setActiveCollectionId(c.id)}
              >
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div style={styles.colName}>{c.name}</div>
                  {c.description && <div style={styles.colDesc}>{c.description}</div>}
                </div>
                <button 
                  style={styles.deleteBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteCollection(c.id);
                  }}
                  title="Koleksiyonu Sil"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={styles.main}>
        {!activeCollectionId ? (
          <div style={styles.emptyState}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1">
              <path d="M5 3h10a1 1 0 011 1v13l-6-3-6 3V4a1 1 0 011-1z" />
            </svg>
            <div style={{ marginTop: 16, color: "var(--color-text-secondary)" }}>
              Görüntülemek için bir koleksiyon seçin
            </div>
          </div>
        ) : (
          <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <div style={styles.mainHeader}>
              <h2 style={styles.mainTitle}>
                {collections.find(c => c.id === activeCollectionId)?.name}
              </h2>
            </div>
            
            <div style={styles.itemsList}>
              {itemsLoading ? (
                <div style={{ padding: 20, color: "var(--color-text-tertiary)" }}>Yükleniyor...</div>
              ) : items.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-tertiary)" }}>
                  Bu koleksiyonda henüz kaydedilmiş karar yok.
                </div>
              ) : (
                items.map(item => (
                  <div key={item.id} style={styles.card}>
                    <div style={styles.cardHeader}>
                      <span style={styles.cardMahkeme}>{item.emsal_karar?.mahkeme || "Bilinmiyor"}</span>
                      <button 
                        style={styles.cardRemoveBtn}
                        onClick={() => handleRemoveItem(item.emsal_karar_id)}
                        title="Koleksiyondan Çıkar"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                    </div>
                    <div style={styles.cardTitle}>{item.emsal_karar?.esas_no} - {item.emsal_karar?.karar_no}</div>
                    <div style={styles.cardOzet}>{item.emsal_karar?.ozet}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

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

const styles = {
  container: {
    display: "flex",
    height: "100%",
    width: "100%",
    background: "var(--color-bg-default)",
  },
  sidebar: {
    width: 300,
    borderRight: "1px solid var(--color-border-subtle)",
    display: "flex",
    flexDirection: "column",
    background: "var(--color-bg-subtle)",
  },
  sidebarHeader: {
    padding: "20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid var(--color-border-subtle)",
  },
  title: {
    fontSize: 16,
    fontWeight: 600,
    color: "var(--color-text-primary)",
  },
  addBtn: {
    background: "var(--color-bg-elevated)",
    border: "1px solid var(--color-border)",
    borderRadius: 6,
    width: 28,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: "var(--color-text-primary)",
  },
  createForm: {
    padding: 16,
    borderBottom: "1px solid var(--color-border-subtle)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    background: "var(--color-bg-default)",
  },
  input: {
    padding: "8px 12px",
    borderRadius: 6,
    border: "1px solid var(--color-border)",
    background: "var(--color-bg-elevated)",
    color: "var(--color-text-primary)",
    fontSize: 13,
    outline: "none",
  },
  formActions: {
    display: "flex",
    gap: 8,
    justifyContent: "flex-end",
  },
  cancelBtn: {
    padding: "6px 12px",
    fontSize: 12,
    background: "transparent",
    border: "1px solid var(--color-border)",
    borderRadius: 6,
    color: "var(--color-text-secondary)",
    cursor: "pointer",
  },
  submitBtn: {
    padding: "6px 12px",
    fontSize: 12,
    background: "var(--color-accent)",
    border: "none",
    borderRadius: 6,
    color: "#fff",
    cursor: "pointer",
  },
  list: {
    flex: 1,
    overflowY: "auto",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  colItem: {
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid transparent",
    cursor: "pointer",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  colName: {
    fontSize: 14,
    fontWeight: 500,
    color: "var(--color-text-primary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  colDesc: {
    fontSize: 12,
    color: "var(--color-text-tertiary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    marginTop: 2,
  },
  deleteBtn: {
    background: "transparent",
    border: "none",
    color: "var(--color-text-tertiary)",
    cursor: "pointer",
    padding: 4,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
  },
  mainHeader: {
    padding: "24px 32px",
    borderBottom: "1px solid var(--color-border-subtle)",
  },
  mainTitle: {
    fontSize: 20,
    fontWeight: 600,
    color: "var(--color-text-primary)",
  },
  itemsList: {
    flex: 1,
    overflowY: "auto",
    padding: 32,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  card: {
    background: "var(--color-bg-elevated)",
    border: "1px solid var(--color-border)",
    borderRadius: 12,
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cardMahkeme: {
    fontSize: 12,
    fontWeight: 500,
    color: "var(--color-accent)",
    background: "rgba(0,112,243,0.1)",
    padding: "4px 8px",
    borderRadius: 12,
  },
  cardRemoveBtn: {
    background: "transparent",
    border: "none",
    color: "var(--color-text-tertiary)",
    cursor: "pointer",
    padding: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: "var(--color-text-primary)",
  },
  cardOzet: {
    fontSize: 14,
    color: "var(--color-text-secondary)",
    lineHeight: 1.5,
  },
};
