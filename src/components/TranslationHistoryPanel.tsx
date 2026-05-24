import { useEffect, useState } from 'react';
import { getTranslationHistory, clearTranslationHistory } from '../api';
import type { TranslationHistory } from '../types';

interface Props {
  onClose: () => void;
}

export default function TranslationHistoryPanel({ onClose }: Props) {
  const [history, setHistory] = useState<TranslationHistory[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = async () => {
    const h = await getTranslationHistory();
    setHistory(h);
  };

  useEffect(() => { load(); }, []);

  const handleClear = async () => {
    await clearTranslationHistory();
    setHistory([]);
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: 12,
        padding: 20,
        width: 520,
        maxHeight: '70vh',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>📜 翻译历史</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {history.map(h => (
            <div
              key={h.id}
              onClick={() => setExpandedId(expandedId === h.id ? null : h.id)}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: expandedId === h.id ? 'normal' : 'nowrap' }}>
                {h.source_text}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: expandedId === h.id ? 'normal' : 'nowrap' }}>
                → {h.translated_text}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {h.created_at}
              </div>
            </div>
          ))}
          {history.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13, padding: 40 }}>
              暂无翻译历史
            </div>
          )}
        </div>
        {history.length > 0 && (
          <button className="btn btn-sm" onClick={handleClear} style={{ alignSelf: 'flex-end' }}>
            清空历史
          </button>
        )}
      </div>
    </div>
  );
}
