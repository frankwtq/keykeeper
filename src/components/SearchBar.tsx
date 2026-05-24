import { useState } from 'react';

interface Props {
  value: string;
  onChange: (query: string) => void;
}

export default function SearchBar({ value, onChange }: Props) {
  const [focused, setFocused] = useState(false);

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      maxWidth: 400,
    }}>
      <span style={{
        position: 'absolute',
        left: 10,
        top: '50%',
        transform: 'translateY(-50%)',
        color: 'var(--text-secondary)',
        fontSize: 14,
        pointerEvents: 'none',
      }}>🔍</span>
      <input
        type="text"
        placeholder="⌘F 搜索..."
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%',
          padding: '6px 12px 6px 32px',
          border: `1px solid ${focused ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 'var(--radius)',
          background: 'var(--bg)',
          color: 'var(--text)',
          outline: 'none',
          fontSize: 13,
          transition: 'border-color 0.15s',
        }}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          style={{
            position: 'absolute',
            right: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            border: 'none',
            background: 'transparent',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >✕</button>
      )}
    </div>
  );
}
