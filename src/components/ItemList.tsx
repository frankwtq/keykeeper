import { useRef } from 'react';
import type { Item, Tag } from '../types';
import ItemCard from './ItemCard';

interface Props {
  items: Item[];
  selectedId: string | null;
  highlight?: string;
  multiSelect?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  onItemClick: (item: Item) => void;
  onToggleFavorite: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (item: Item) => void;
  onReorder?: (items: { id: string; sort_order: number }[]) => void;
  onMoveItem?: (itemId: string, categoryId: string) => Promise<void>;
  allTags?: Tag[];
  selectedTagIds?: Set<string>;
  onTagSelect?: (tagId: string) => void;
  onClearTags?: () => void;
}

export default function ItemList({ items, selectedId, highlight, multiSelect, selectedIds, onSelectionChange, onItemClick, onToggleFavorite, onDelete, onEdit, onReorder, onMoveItem, allTags, selectedTagIds, onTagSelect, onClearTags }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    itemId: string;
    ghost: HTMLDivElement;
    offsetX: number;
    offsetY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const movedRef = useRef(false);
  const highlightedCatRef = useRef<HTMLElement | null>(null);

  const getDropIndex = (clientY: number): number => {
    if (!containerRef.current) return 0;
    const cards = containerRef.current.querySelectorAll<HTMLElement>('[data-item-id]');
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i].getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return i;
    }
    return cards.length;
  };

  const clearIndicators = () => {
    if (!containerRef.current) return;
    containerRef.current.querySelectorAll<HTMLElement>('[data-item-id]').forEach(c => {
      c.style.borderTop = '';
    });
  };

  const clearSidebarHighlight = () => {
    if (highlightedCatRef.current) {
      highlightedCatRef.current.style.background = '';
      highlightedCatRef.current = null;
    }
  };

  const endDrag = () => {
    if (dragRef.current) {
      dragRef.current.ghost.remove();
    }
    clearIndicators();
    clearSidebarHighlight();
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    (window as any).__dragItemId = null;
    dragRef.current = null;
    movedRef.current = false;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || dragRef.current) return;

    const card = (e.target as HTMLElement).closest<HTMLElement>('[data-item-id]');
    if (!card) return;

    const itemId = card.getAttribute('data-item-id');
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    e.preventDefault();

    const rect = card.getBoundingClientRect();

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';

    const ghost = document.createElement('div');
    ghost.textContent = item.title || (item.content || '').substring(0, 50) || 'Untitled';
    Object.assign(ghost.style, {
      position: 'fixed',
      left: rect.left + 'px',
      top: rect.top + 'px',
      width: rect.width + 'px',
      padding: '8px 12px',
      background: 'var(--bg-card)',
      border: '1px solid var(--accent)',
      borderRadius: 'var(--radius)',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      opacity: '0.9',
      pointerEvents: 'none',
      zIndex: '9999',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      fontSize: '14px',
    });
    document.body.appendChild(ghost);

    dragRef.current = {
      itemId: item.id,
      ghost,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      startX: e.clientX,
      startY: e.clientY,
    };
    movedRef.current = true;
    (window as any).__dragItemId = item.id;

    const onMove = (ev: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      drag.ghost.style.left = (ev.clientX - drag.offsetX) + 'px';
      drag.ghost.style.top = (ev.clientY - drag.offsetY) + 'px';

      // ItemList drop indicator
      clearIndicators();
      const dropIdx = getDropIndex(ev.clientY);
      if (containerRef.current) {
        const cards = containerRef.current.querySelectorAll<HTMLElement>('[data-item-id]');
        if (cards[dropIdx]) {
          cards[dropIdx].style.borderTop = '2px solid var(--accent)';
        }
      }

      // Sidebar category highlight
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const catEl = el?.closest<HTMLElement>('[data-category-id]') ?? null;
      if (catEl !== highlightedCatRef.current) {
        clearSidebarHighlight();
        if (catEl) {
          catEl.style.background = 'var(--accent-light)';
          highlightedCatRef.current = catEl;
        }
      }
    };

    const onUp = (ev: PointerEvent) => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);

      const drag = dragRef.current;
      if (!drag) { endDrag(); return; }

      drag.ghost.remove();
      clearIndicators();
      clearSidebarHighlight();
      document.body.style.userSelect = '';
      document.body.style.cursor = '';

      // Check if dropped on a sidebar category
      const target = document.elementFromPoint(ev.clientX, ev.clientY);
      const catEl = target?.closest<HTMLElement>('[data-category-id]');
      if (catEl) {
        const catId = catEl.getAttribute('data-category-id');
        if (catId && onMoveItem) {
          onMoveItem(drag.itemId, catId).catch(() => {});
        }
      } else {
        // Reorder within list
        const dropIdx = getDropIndex(ev.clientY);
        const fromIdx = items.findIndex(i => i.id === drag.itemId);
        if (fromIdx !== -1 && fromIdx !== dropIdx) {
          const newItems = [...items];
          const [moved] = newItems.splice(fromIdx, 1);
          const adjustedDrop = dropIdx > fromIdx ? dropIdx - 1 : dropIdx;
          newItems.splice(adjustedDrop, 0, moved);
          onReorder?.(newItems.map((item, i) => ({ id: item.id, sort_order: i })));
        }
      }

      (window as any).__dragItemId = null;
      dragRef.current = null;
      movedRef.current = false;
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

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
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      {selectedTagIds && selectedTagIds.size > 0 && allTags && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 10px', background: 'var(--bg-active)',
          borderRadius: 'var(--radius)', fontSize: 12,
        }}>
          <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>🏷 过滤</span>
          {Array.from(selectedTagIds).map(tid => {
            const tag = allTags.find(t => t.id === tid);
            if (!tag) return null;
            return (
              <span
                key={tid}
                onClick={() => onTagSelect?.(tid)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  padding: '2px 8px', borderRadius: 10, fontSize: 11,
                  cursor: 'pointer', background: tag.color + '20',
                  color: tag.color, border: `1px solid ${tag.color}40`,
                }}
              >{tag.name} <span style={{ opacity: 0.5, fontSize: 10 }}>✕</span></span>
            );
          })}
          <button
            onClick={() => onClearTags?.()}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 11 }}
          >清除</button>
        </div>
      )}
      {items.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          isSelected={selectedId === item.id}
          highlight={highlight}
          multiSelect={multiSelect}
          checked={selectedIds?.has(item.id) || false}
          onCheckChange={(checked) => {
            const next = new Set(selectedIds);
            if (checked) next.add(item.id); else next.delete(item.id);
            onSelectionChange?.(next);
          }}
          onClick={() => multiSelect ? undefined : onItemClick(item)}
          onToggleFavorite={() => onToggleFavorite(item.id)}
          onEdit={() => onEdit(item)}
          onDelete={() => onDelete(item.id)}
        />
      ))}
    </div>
  );
}
