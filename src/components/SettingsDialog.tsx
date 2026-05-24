import { useState, useEffect, useCallback } from 'react';

interface Props {
  shortcut: string;
  translationHistoryMax: number;
  onSave: (shortcut: string, translationHistoryMax: number) => Promise<void>;
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

export default function SettingsDialog({ shortcut: initialShortcut, translationHistoryMax: initialMax, onSave, onClose }: Props) {
  const [shortcut, setShortcut] = useState(initialShortcut);
  const [translationHistoryMax, setTranslationHistoryMax] = useState(initialMax);
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
      await onSave(shortcut, translationHistoryMax);
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
