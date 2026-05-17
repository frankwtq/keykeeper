import { useState } from 'react';
import type { Category } from '../types';

interface Props {
  categories: Category[];
  selectedId: string;
  onSelect: (id: string) => void;
  onAdd: (name: string, parentId?: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  maxDepth: number;
}

function buildTree(cats: Category[], parentId: string | null): Category[] {
  return cats
    .filter(c => c.parent_id === parentId)
    .sort((a, b) => a.sort_order - b.sort_order);
}

function TreeNode({ cat, allCats, depth, selectedId, onSelect, onAdd, onRename, onDelete, maxDepth }: {
  cat: Category;
  allCats: Category[];
  depth: number;
  selectedId: string;
  onSelect: (id: string) => void;
  onAdd: (name: string, parentId?: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  maxDepth: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const children = buildTree(allCats, cat.id);
  const isSelected = selectedId === cat.id;

  const handleAdd = async () => {
    if (newName.trim()) {
      await onAdd(newName.trim(), cat.id);
      setNewName('');
      setAdding(false);
    }
  };

  const handleRename = async () => {
    if (newName.trim()) {
      await onRename(cat.id, newName.trim());
      setNewName('');
      setRenaming(false);
    }
  };

  if (renaming) {
    return (
      <div style={{ display: 'flex', gap: 4, padding: '4px 0', marginBottom: 2 }}>
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenaming(false); }}
          placeholder="分类名"
          autoFocus
          style={{
            flex: 1,
            padding: '2px 6px',
            border: '1px solid var(--accent)',
            borderRadius: 4,
            fontSize: 12,
            background: 'var(--bg)',
            color: 'var(--text)',
            outline: 'none',
          }}
        />
        <button className="btn btn-sm" onClick={handleRename}>确定</button>
        <button className="btn btn-sm" onClick={() => setRenaming(false)}>取消</button>
      </div>
    );
  }

  return (
    <div>
      <div
        onClick={() => onSelect(cat.id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 8px 4px 0',
          cursor: 'pointer',
          borderRadius: 4,
          background: isSelected ? 'var(--bg-active)' : 'transparent',
          color: isSelected ? 'var(--accent)' : 'var(--text)',
          fontWeight: isSelected ? 600 : 400,
          fontSize: 13,
          marginBottom: 2,
          position: 'relative',
        }}
      >
        {children.length > 0 && (
          <span
            onClick={e => { e.stopPropagation(); setExpanded(!expanded); }}
            style={{ width: 16, textAlign: 'center', cursor: 'pointer' }}
          >
            {expanded ? '▼' : '▶'}
          </span>
        )}
        {children.length === 0 && <span style={{ width: 16 }} />}
        <span style={{ flex: 1 }}>{cat.name}</span>
        {isSelected && cat.id !== 'root' && (
          <span
            onClick={e => { e.stopPropagation(); setNewName(cat.name); setRenaming(true); }}
            style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 11, opacity: 0.6 }}
          >✎</span>
        )}
        {isSelected && cat.id !== 'root' && (
          <span
            onClick={e => { e.stopPropagation(); onDelete(cat.id); }}
            style={{ cursor: 'pointer', color: 'var(--danger)', fontSize: 12, opacity: 0.6 }}
            title="删除分类"
          >🗑</span>
        )}
        {isSelected && depth < maxDepth && cat.id !== 'root' && (
          <span
            onClick={e => { e.stopPropagation(); setAdding(!adding); }}
            style={{ cursor: 'pointer', color: 'var(--accent)', fontSize: 12 }}
          >+</span>
        )}
      </div>
      {expanded && children.length > 0 && (
        <div style={{ paddingLeft: 16 }}>
          {children.map(child => (
            <TreeNode
              key={child.id}
              cat={child}
              allCats={allCats}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onAdd={onAdd}
              onRename={onRename}
              onDelete={onDelete}
              maxDepth={maxDepth}
            />
          ))}
        </div>
      )}
      {adding && (
        <div style={{ paddingLeft: 16, display: 'flex', gap: 4, marginBottom: 4 }}>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false); }}
            placeholder="子分类名"
            autoFocus
            style={{
              flex: 1,
              padding: '2px 6px',
              border: '1px solid var(--accent)',
              borderRadius: 4,
              fontSize: 12,
              background: 'var(--bg)',
              color: 'var(--text)',
              outline: 'none',
            }}
          />
          <button className="btn btn-sm" onClick={handleAdd}>确定</button>
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ categories, selectedId, onSelect, onAdd, onRename, onDelete, maxDepth }: Props) {
  const [addingRoot, setAddingRoot] = useState(false);
  const [newRootName, setNewRootName] = useState('');
  const rootCats = buildTree(categories, null).filter(c => c.id !== 'root');

  const handleAddRoot = async () => {
    if (newRootName.trim()) {
      await onAdd(newRootName.trim());
      setNewRootName('');
      setAddingRoot(false);
    }
  };

  return (
    <div style={{ padding: 8 }}>
      <div
        onClick={() => onSelect('root')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '6px 8px',
          cursor: 'pointer',
          borderRadius: 4,
          background: selectedId === 'root' ? 'var(--bg-active)' : 'transparent',
          color: selectedId === 'root' ? 'var(--accent)' : 'var(--text)',
          fontWeight: selectedId === 'root' ? 600 : 400,
          fontSize: 13,
          marginBottom: 4,
        }}
      >
        📂 全部
      </div>
      {rootCats.map(cat => (
        <TreeNode
          key={cat.id}
          cat={cat}
          allCats={categories}
          depth={1}
          selectedId={selectedId}
          onSelect={onSelect}
          onAdd={onAdd}
          onRename={onRename}
          onDelete={onDelete}
          maxDepth={maxDepth}
        />
      ))}
      <div style={{ padding: '8px 0' }}>
        {addingRoot ? (
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              value={newRootName}
              onChange={e => setNewRootName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddRoot(); if (e.key === 'Escape') setAddingRoot(false); }}
              placeholder="分类名"
              autoFocus
              style={{
                flex: 1,
                padding: '3px 6px',
                border: '1px solid var(--accent)',
                borderRadius: 4,
                fontSize: 12,
                background: 'var(--bg)',
                color: 'var(--text)',
                outline: 'none',
              }}
            />
            <button className="btn btn-sm" onClick={handleAddRoot}>确定</button>
          </div>
        ) : (
          <button
            className="btn btn-sm"
            onClick={() => setAddingRoot(true)}
            style={{ width: '100%' }}
          >+ 添加分类</button>
        )}
      </div>
    </div>
  );
}
