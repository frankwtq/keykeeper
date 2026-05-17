import type { Item } from '../types';

const TYPE_ICONS: Record<string, string> = {
  url: '🔗',
  text: '📝',
  image: '🖼',
  table: '📊',
};

interface Props {
  item: Item;
  isSelected: boolean;
  onClick: () => void;
  onToggleFavorite: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export default function ItemCard({ item, isSelected, onClick, onToggleFavorite, onEdit, onDelete }: Props) {
  return (
    <div
      onClick={onClick}
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
      }}
    >
      <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>
        {TYPE_ICONS[item.type] || '📄'}
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
          {item.title || '(无标题)'}
        </div>
        <div style={{
          fontSize: 12,
          color: 'var(--text-secondary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {item.preview || item.content?.slice(0, 80) || ''}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
          <span>使用 {item.usage_count} 次</span>
          {item.is_favorite && <span>⭐ 收藏</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
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
