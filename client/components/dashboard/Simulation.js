'use client';

import { useState, useEffect, useRef } from 'react';

const styles = {
  container: {
    padding: '0.5rem',
    maxWidth: '1200px',
    margin: '0 auto',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: 'var(--color-text-primary)'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.5rem',
    flexShrink: 0,
  },
  stageIndicator: {
    display: 'flex',
    gap: '1rem',
    marginBottom: '1rem',
    alignItems: 'center',
    flexWrap: 'wrap',
    flexShrink: 0,
  },
  chip: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '8px 16px',
    borderRadius: '999px',
    fontSize: '14px',
    fontWeight: '600',
    border: '1px solid var(--color-border-subtle)',
    color: 'var(--color-text-secondary)',
    backgroundColor: 'var(--color-bg-subtle)',
    minHeight: '36px'
  },
  chipActive: {
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-text-inverse)',
    border: '1px solid var(--color-accent)'
  },
  chipCompleted: {
    backgroundColor: 'var(--color-bg-elevated)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border-subtle)'
  },
  chatContainer: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '1.5rem',
    backgroundColor: 'var(--color-bg-subtle)',
    borderRadius: '12px',
    marginBottom: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    border: '1px solid var(--color-border)',
    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
  },
  messageBox: {
    maxWidth: '70%',
    padding: '1rem',
    borderRadius: '12px',
    lineHeight: '1.5'
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-text-inverse)',
    borderRadius: '16px 16px 4px 16px',
  },
  aiMessage: {
    alignSelf: 'flex-start',
    backgroundColor: 'var(--color-bg-elevated)',
    color: 'var(--color-text-primary)',
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
    borderRadius: '12px 12px 12px 0',
    border: '1px solid var(--color-border-subtle)'
  },
  systemMessage: {
    alignSelf: 'center',
    backgroundColor: 'var(--color-bg-elevated)',
    color: 'var(--color-text-secondary)',
    fontStyle: 'italic',
    maxWidth: '90%',
    fontSize: '0.875rem',
    border: '1px solid var(--color-border-subtle)'
  },
  inputArea: {
    display: 'flex',
    gap: '1rem',
    flexShrink: 0,
    marginTop: 'auto',
    paddingTop: '1rem'
  },
  input: {
    flex: 1,
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    outline: 'none',
    fontSize: '1rem',
    backgroundColor: 'var(--color-bg)',
    color: 'var(--color-text-primary)'
  },
  button: {
    padding: '12px 24px',
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-text-inverse)',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontWeight: '600',
    fontSize: '14px',
    transition: 'opacity 0.2s'
  },
  buttonOutline: {
    padding: '8px 16px',
    backgroundColor: 'var(--color-bg-elevated)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '14px',
    transition: 'all 0.2s'
  },
  evalCard: {
    marginTop: '1.5rem',
    padding: '1.5rem',
    backgroundColor: 'var(--color-bg-subtle)',
    borderRadius: '16px',
    border: '1px solid var(--color-border)',
    overflowY: 'auto',
    flexShrink: 0,
    maxHeight: '45%'
  },
  select: {
    padding: '0.5rem',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    marginRight: '1rem',
    backgroundColor: 'var(--color-bg)',
    color: 'var(--color-text-primary)'
  }
};

export default function SimulationPage() {
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [evaluation, setEvaluation] = useState(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [caseType, setCaseType] = useState('İş Kazası');
  
  const chatEndRef = useRef(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const authFetch = async (url, options = {}) => {
    const token = localStorage.getItem('accessToken');
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers
    };
    
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) throw new Error('API Hatası');
    return res.json();
  };

  const startSimulation = async () => {
    setLoading(true);
    try {
      const data = await authFetch('http://localhost:3001/api/simulations/start', {
        method: 'POST',
        body: JSON.stringify({ caseType })
      });
      
      setSession(data.data.session);
      setMessages([{ sender: 'ai_client', content: data.data.initialMessage }]);
      setEvaluation(null);
    } catch (error) {
      console.error('Simülasyon başlatılamadı:', error);
      alert('Simülasyon başlatılırken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !session) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { sender: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const data = await authFetch('http://localhost:3001/api/simulations/message', {
        method: 'POST',
        body: JSON.stringify({ sessionId: session.id, content: userMsg })
      });
      
      setMessages(prev => [
        ...prev, 
        { sender: data.data.sender, content: data.data.content }
      ]);
    } catch (error) {
      console.error('Mesaj hatası:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const nextStage = async () => {
    if (!session) return;
    if (session.current_stage === 2) {
      evaluateSimulation();
      return;
    }

    setLoading(true);
    try {
      const data = await authFetch('http://localhost:3001/api/simulations/next-stage', {
        method: 'POST',
        body: JSON.stringify({ sessionId: session.id })
      });
      
      setSession({ ...session, current_stage: data.stage });
      setMessages(prev => [
        ...prev, 
        { sender: 'system', content: '>>> AŞAMA 2: Karşı Tarafın Avukatıyla Görüşme (Argümanlarınızı Sunun)' }
      ]);
    } catch (error) {
      console.error('Aşama atlama hatası:', error);
    } finally {
      setLoading(false);
    }
  };

  const evaluateSimulation = async () => {
    setLoading(true);
    try {
      const data = await authFetch('http://localhost:3001/api/simulations/evaluate', {
        method: 'POST',
        body: JSON.stringify({ sessionId: session.id })
      });
      
      setEvaluation(data.data);
      setSession({ ...session, current_stage: 3, score: data.data.score });
    } catch (error) {
      console.error('Değerlendirme hatası:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStageLabel = (stage) => {
    if (stage === 1) return { label: 'Aşama 1: Müvekkil Görüşmesi', icon: null };
    if (stage === 2) return { label: 'Aşama 2: Karşı Avukat', icon: null };
    return { label: 'Aşama 3: Hakim Değerlendirmesi', icon: null };
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={{ margin: 0, fontSize: '1.875rem', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>Öğrenci Dava Simülasyonu</h1>
        {!session && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <select 
              style={styles.select}
              value={caseType}
              onChange={(e) => setCaseType(e.target.value)}
            >
              <option value="İş Kazası">İş Kazası</option>
              <option value="Boşanma">Boşanma</option>
              <option value="Kiracı Tahliyesi">Kiracı Tahliyesi</option>
            </select>
            <button style={styles.button} onClick={startSimulation} disabled={loading}>
              Simülasyonu Başlat
            </button>
          </div>
        )}
      </div>

      {session && (
        <>
          <div style={styles.stageIndicator}>
            {[1, 2, 3].map(stage => {
              const info = getStageLabel(stage);
              const isCurrent = session.current_stage === stage;
              const isCompleted = session.current_stage > stage;
              return (
                <div key={stage} style={{ 
                  ...styles.chip, 
                  ...(isCurrent ? styles.chipActive : isCompleted ? styles.chipCompleted : {}) 
                }}>
                  {info.icon}
                  <span>{info.label}</span>
                </div>
              );
            })}
            
            {session.current_stage < 3 && (
              <button 
                style={{ ...styles.buttonOutline, marginLeft: 'auto' }}
                onClick={nextStage}
                disabled={loading}
              >
                {session.current_stage === 1 ? 'Karşı Avukata Geç' : 'Simülasyonu Bitir ve Değerlendir'}
              </button>
            )}
          </div>

          <div style={styles.chatContainer}>
            {messages.map((msg, idx) => {
              const isUser = msg.sender === 'user';
              const isSystem = msg.sender === 'system';
              return (
                <div 
                  key={idx} 
                  style={{
                    ...styles.messageBox,
                    ...(isUser ? styles.userMessage : isSystem ? styles.systemMessage : styles.aiMessage)
                  }}
                >
                  <span style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px', opacity: 0.8 }}>
                    {isUser ? 'Siz (Avukat)' : 
                     msg.sender === 'ai_client' ? 'Müvekkil' : 
                     msg.sender === 'ai_lawyer' ? 'Karşı Avukat' : 'Sistem'}
                  </span>
                  <div>{msg.content}</div>
                </div>
              );
            })}
            {loading && (
              <div style={{ ...styles.messageBox, ...styles.aiMessage, fontStyle: 'italic', color: '#64748b' }}>
                Yazıyor...
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {session.current_stage < 3 && (
            <div style={styles.inputArea}>
              <input
                style={styles.input}
                placeholder={session.current_stage === 1 ? "Müvekkilinize sorular sorun (Örn: Kusurunuz var mıydı?)" : "Karşı avukata itirazınızı sunun..."}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                disabled={loading}
              />
              <button 
                style={styles.button}
                onClick={sendMessage}
                disabled={loading || !input.trim()}
              >
                Gönder
              </button>
            </div>
          )}

          {evaluation && (
            <div style={styles.evalCard}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#166534', margin: '0 0 1rem 0' }}>
                Hakim Değerlendirmesi
              </h2>
              <hr style={{ borderColor: '#bbf7d0', marginBottom: '1rem' }} />
              <div style={{ textAlign: 'center', margin: '1.5rem 0' }}>
                <span style={{ fontSize: '3rem', fontWeight: 'bold', color: evaluation.score > 70 ? '#16a34a' : '#dc2626' }}>
                  {evaluation.score}
                </span>
                <span style={{ fontSize: '1.5rem', color: '#475569' }}> / 100</span>
              </div>
              <p style={{ lineHeight: '1.6' }}><strong>Geri Bildirim:</strong> {evaluation.feedback}</p>
              <p style={{ lineHeight: '1.6', color: '#475569' }}><strong>Kaçırılan Sorular:</strong> {evaluation.missed_questions}</p>
              <p style={{ lineHeight: '1.6', color: '#475569' }}><strong>Eksik Emsaller:</strong> {evaluation.missed_precedents}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
