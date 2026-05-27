import type { Item } from '../types';
import { open } from '@tauri-apps/plugin-shell';

const TYPE_ICONS: Record<string, string> = {
  url: '🔗',
  text: '📝',
  image: '🖼',
  table: '📊',
};

interface Props {
  item: Item;
  isSelected: boolean;
  highlight?: string;
  multiSelect?: boolean;
  checked?: boolean;
  onCheckChange?: (checked: boolean) => void;
  onClick?: () => void;
  onToggleFavorite: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function highlightText(text: string, query: string) {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} style={{ background: 'var(--accent-light)', color: 'var(--text)', borderRadius: 2, padding: '0 2px' }}>{part}</mark>
      : part
  );
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export default function ItemCard({ item, isSelected, highlight, multiSelect, checked, onCheckChange, onClick, onToggleFavorite, onEdit, onDelete }: Props) {
  return (
    <div
      data-item-id={item.id}
      onClick={multiSelect ? (e) => { e.stopPropagation(); onCheckChange?.(!checked); } : onClick}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '10px 12px',
        background: isSelected ? 'var(--bg-active)' : 'var(--bg-card)',
        border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        cursor: 'pointer',
        transition: 'all 0.15s',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <input
        type="checkbox"
        checked={checked || false}
        onChange={() => onCheckChange?.(!checked)}
        onClick={e => e.stopPropagation()}
        style={{
          display: multiSelect ? 'block' : 'none',
          margin: '1px 0 0 0',
          accentColor: 'var(--accent)',
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1, display: 'flex', alignItems: 'center', gap: 2, minWidth: 20, justifyContent: 'center' }}>
        {item.type === 'url' ? (
          <img
            src={`https://www.google.com/s2/favicons?domain=${getDomain(item.content)}&sz=16`}
            style={{ width: 16, height: 16 }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.removeAttribute('hidden'); }}
            alt=""
          />
        ) : null}
        <span hidden={item.type === 'url'}>{TYPE_ICONS[item.type] || '📄'}</span>
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 500,
          fontSize: 14,
          marginBottom: 2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {highlightText(item.title || '(无标题)', highlight || '')}
        </div>
        <div style={{
          fontSize: 12,
          color: 'var(--text-secondary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {highlightText(item.preview || item.content?.slice(0, 80) || '', highlight || '')}
        </div>
        {item.tags && item.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 3, marginTop: 4, flexWrap: 'wrap' }}>
            {item.tags.map(t => (
              <span key={t.id} style={{
                display: 'inline-block', padding: '0 6px', borderRadius: 8, fontSize: 10,
                background: t.color + '20', color: t.color, border: `1px solid ${t.color}40`,
                lineHeight: '16px',
              }}>{t.name}</span>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
          <span>使用 {item.usage_count} 次</span>
          {item.is_favorite && <span>⭐ 收藏</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
        {item.type === 'url' && (
          <button
            className="btn-icon"
            onClick={e => { e.stopPropagation(); open(item.content); }}
            title="打开链接"
          >↗</button>
        )}
        <button
          className="btn-icon"
          onClick={e => { e.stopPropagation(); onToggleFavorite(); }}
          title="收藏"
        >
          {item.is_favorite ? '⭐' : '☆'}
        </button>
        <button
          className="btn-icon"
          onClick={e => { e.stopPropagation(); onEdit(); }}
          title="编辑"
        >✎</button>
        <button
          className="btn-icon"
          onClick={e => { e.stopPropagation(); onDelete(); }}
          title="删除"
        >🗑</button>
      </div>
    </div>
  );
}
