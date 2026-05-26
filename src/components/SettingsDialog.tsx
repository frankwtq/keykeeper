import { useState, useEffect, useCallback } from 'react';
import type { AppConfig } from '../types';

interface Props {
  config: AppConfig;
  onSave: (shortcut: string, translationHistoryMax: number, aiProvider: string, aiApiUrl: string, aiApiKey: string, aiModel: string) => Promise<void>;
  onClose: () => void;
}

function keysToShortcut(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey) parts.push('Cmd');
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  const key = e.key === ' ' ? 'Space' : e.key;
  if (['Meta', 'Shift', 'Control', 'Alt'].includes(key)) return '';
  parts.push(key);
  return parts.join('+');
}

function displayShortcut(s: string): string {
  if (!s) return '未设置';
  return s
    .replace('Cmd', '⌘')
    .replace('Ctrl', '⌃')
    .replace('Alt', '⌥')
    .replace('Shift', '⇧')
    .replace('Space', '␣');
}

export default function SettingsDialog({ config: initialConfig, onSave, onClose }: Props) {
  const [shortcut, setShortcut] = useState(initialConfig.global_shortcut);
  const [translationHistoryMax, setTranslationHistoryMax] = useState(initialConfig.translation_history_max);
  const [aiProvider, setAiProvider] = useState(initialConfig.ai_provider);
  const [aiApiUrl, setAiApiUrl] = useState(initialConfig.ai_api_url);
  const [aiApiKey, setAiApiKey] = useState(initialConfig.ai_api_key);
  const [aiModel, setAiModel] = useState(initialConfig.ai_model);
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    const s = keysToShortcut(e);
    if (s) {
      setShortcut(s);
      setRecording(false);
    }
  }, [recording]);

  useEffect(() => {
    if (recording) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [recording, handleKeyDown]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      if (translationHistoryMax < 0) {
        setError('保留条数不能为负数');
        setSaving(false);
        return;
      }
      await onSave(shortcut, translationHistoryMax, aiProvider, aiApiUrl, aiApiKey, aiModel);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setShortcut('Alt+Space');
    setRecording(false);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: 12,
        padding: 24,
        width: 420,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>⚙ 设置</h2>

        <div>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
            全局快捷键（任意界面按下显示/隐藏窗口）
          </label>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <div style={{
              flex: 1,
              padding: '8px 12px',
              border: `2px solid ${recording ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius)',
              background: recording ? 'var(--accent-light)' : 'var(--bg)',
              color: 'var(--text)',
              fontSize: 15,
              fontFamily: 'monospace',
              textAlign: 'center',
              transition: 'all 0.15s',
            }}>
              {recording ? '按下快捷键...' : displayShortcut(shortcut) || '未设置'}
            </div>
            <button
              className="btn btn-sm"
              onClick={() => setRecording(!recording)}
              style={{ minWidth: 60 }}
            >
              {recording ? '取消' : '录制'}
            </button>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            支持组合: ⌘ / ⌃ / ⌥ / ⇧ + 任意键<br />
            推荐: ⌥ Space
            <button
              onClick={handleReset}
              style={{
                marginLeft: 8,
                background: 'none',
                border: 'none',
                color: 'var(--accent)',
                cursor: 'pointer',
                fontSize: 11,
                textDecoration: 'underline',
              }}
            >恢复默认</button>
          </div>
        </div>

        <div>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
            翻译历史保留条数
          </label>
          <input
            type="number"
            min={0}
            max={999}
            value={translationHistoryMax}
            onChange={e => setTranslationHistoryMax(Number(e.target.value))}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: 'var(--bg)',
              color: 'var(--text)',
              fontSize: 14,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-secondary)' }}>默认为 50，设为 0 则不保留</div>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, display: 'block', fontWeight: 600 }}>
            🤖 AI 自动归类
          </label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <select
              value={aiProvider}
              onChange={e => setAiProvider(e.target.value)}
              style={{
                flex: 1, padding: '6px 10px', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', background: 'var(--bg)', color: 'var(--text)',
                fontSize: 13, outline: 'none',
              }}
            >
              <option value="off">关闭</option>
              <option value="ollama">Ollama（本地）</option>
              <option value="openai">OpenAI 兼容</option>
            </select>
          </div>
          {aiProvider !== 'off' && (
            <>
              <div style={{ marginBottom: 6 }}>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>API URL</label>
                <input
                  value={aiApiUrl}
                  onChange={e => setAiApiUrl(e.target.value)}
                  placeholder="http://localhost:11434/v1"
                  style={{
                    width: '100%', padding: '6px 10px', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)', background: 'var(--bg)', color: 'var(--text)',
                    fontSize: 13, outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ marginBottom: 6 }}>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>API Key（可选）</label>
                <input
                  type="password"
                  value={aiApiKey}
                  onChange={e => setAiApiKey(e.target.value)}
                  placeholder="sk-..."
                  style={{
                    width: '100%', padding: '6px 10px', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)', background: 'var(--bg)', color: 'var(--text)',
                    fontSize: 13, outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ marginBottom: 4 }}>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>模型</label>
                <input
                  value={aiModel}
                  onChange={e => setAiModel(e.target.value)}
                  placeholder="qwen2.5"
                  style={{
                    width: '100%', padding: '6px 10px', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)', background: 'var(--bg)', color: 'var(--text)',
                    fontSize: 13, outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
            </>
          )}
        </div>

        {error && (
          <div style={{ fontSize: 12, color: 'var(--danger)', background: 'var(--danger)', backgroundClip: 'padding-box', padding: '6px 10px', borderRadius: 4 }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
