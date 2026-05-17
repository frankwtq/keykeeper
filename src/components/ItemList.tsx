import type { Item } from '../types';
import ItemCard from './ItemCard';

interface Props {
  items: Item[];
  selectedId: string | null;
  onItemClick: (item: Item) => void;
  onToggleFavorite: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (item: Item) => void;
}

export default function ItemList({ items, selectedId, onItemClick, onToggleFavorite, onDelete, onEdit }: Props) {
  if (items.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--text-secondary)',
        gap: 8,
      }}>
        <span style={{ fontSize: 32 }}>📭</span>
        <p>暂无内容，点击右上角「+ 新增」添加</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map(item => (
        <ItemCard
          key={item.id}
          item={item}
          isSelected={selectedId === item.id}
          onClick={() => onItemClick(item)}
          onToggleFavorite={() => onToggleFavorite(item.id)}
          onEdit={() => onEdit(item)}
          onDelete={() => onDelete(item.id)}
        />
      ))}
    </div>
  );
}
