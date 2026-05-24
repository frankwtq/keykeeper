import { useEffect, useState } from 'react';
import { translateText, addTranslationHistory, getTranslationHistory, clearTranslationHistory } from '../api';
import type { TranslationHistory } from '../types';

interface Props {
  onClose: () => void;
}

export default function TranslateDialog({ onClose }: Props) {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [detectedLang, setDetectedLang] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<TranslationHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const loadHistory = async () => {
    const h = await getTranslationHistory();
    setHistory(h);
  };

  useEffect(() => { loadHistory(); }, []);

  const handleTranslate = async () => {
    const text = input.trim();
    if (!text) return;
    setTranslating(true);
    setError('');
    try {
      const r = await translateText(text);
      setResult(r.translated_text);
      setDetectedLang(r.detected_lang);
      const dir = r.detected_lang.startsWith('zh') ? 'en' : 'zh-CN';
      addTranslationHistory(text, r.translated_text, r.detected_lang, dir).catch(() => {});
      loadHistory();
    } catch (e) {
      setError(String(e));
    } finally {
      setTranslating(false);
    }
  };

  const handleClearHistory = async () => {
    await clearTranslationHistory();
    setHistory([]);
  };

  const langLabel = (lang: string) => {
    const map: Record<string, string> = { en: '英语', 'zh-CN': '中文(简体)', 'zh-TW': '中文(繁体)', ja: '日语', ko: '韩语', fr: '法语', de: '德语', es: '西班牙语', pt: '葡萄牙语', ru: '俄语', it: '意大利语', auto: '自动检测' };
    return map[lang] || lang;
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
        padding: 24,
        width: 640,
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>🌐 翻译</h2>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              className="btn btn-sm"
              onClick={() => setShowHistory(!showHistory)}
            >📜 历史 ({history.length})</button>
            <button className="btn-icon" onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>原文</label>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleTranslate(); }}
              placeholder="输入或粘贴要翻译的文字..."
              style={{
                flex: 1,
                padding: 10,
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                background: 'var(--bg)',
                color: 'var(--text)',
                fontSize: 13,
                outline: 'none',
                resize: 'none',
                minHeight: 120,
              }}
            />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              译文
              {detectedLang && <span style={{ marginLeft: 8, color: 'var(--accent)' }}> 检测到: {langLabel(detectedLang)}</span>}
            </label>
            <div style={{
              flex: 1,
              padding: 10,
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: 'var(--bg)',
              color: 'var(--text)',
              fontSize: 13,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              minHeight: 120,
              overflow: 'auto',
            }}>
              {translating ? '翻译中...' : result || <span style={{ color: 'var(--text-secondary)' }}>翻译结果将显示在此处</span>}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {error && <span style={{ fontSize: 12, color: 'var(--danger)', flex: 1 }}>{error}</span>}
          <button className="btn" disabled={!input.trim()} onClick={() => { setInput(''); setResult(null); setDetectedLang(null); setError(''); }}>清空</button>
          <button className="btn btn-primary" disabled={!input.trim() || translating} onClick={handleTranslate}>
            {translating ? '翻译中...' : '🌐 翻译'}
          </button>
        </div>

        {showHistory && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>翻译历史</span>
              {history.length > 0 && (
                <button className="btn btn-sm" onClick={handleClearHistory}>清空全部</button>
              )}
            </div>
            {history.map(h => (
              <div key={h.id} style={{
                padding: '8px 10px',
                borderRadius: 6,
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                fontSize: 12,
              }}>
                <div style={{ color: 'var(--text)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.source_text}</div>
                <div style={{ color: 'var(--text-secondary)', marginBottom: 2 }}>→ {h.translated_text}</div>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{h.created_at}</div>
              </div>
            ))}
            {history.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12, padding: 16 }}>暂无翻译历史</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
