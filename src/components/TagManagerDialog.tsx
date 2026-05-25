import { useEffect, useState } from 'react';
import { getTagsWithCount, updateTag, deleteTag, createTag } from '../api';

interface TagRow {
  id: string;
  name: string;
  color: string;
  item_count: number;
}

interface Props {
  onClose: () => void;
}

const COLORS = ['#4361ee', '#e63946', '#2a9d8f', '#e76f51', '#264653', '#f4a261', '#8338ec', '#ff006e', '#3a86ff', '#06d6a0'];

export default function TagManagerDialog({ onClose }: Props) {
  const [tags, setTags] = useState<TagRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(COLORS[0]);

  const load = async () => {
    const data = await getTagsWithCount();
    setTags(data);
  };

  useEffect(() => { load(); }, []);

  const handleStartEdit = (tag: TagRow) => {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    await updateTag(editingId, editName.trim(), editColor);
    setEditingId(null);
    await load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这个标签？标签将从所有内容中移除。')) return;
    await deleteTag(id);
    await load();
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createTag(newName.trim(), newColor);
    setNewName('');
    setNewColor(COLORS[0]);
    setShowCreate(false);
    await load();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h3>🏷 标签管理</h3>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
          {tags.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 24, fontSize: 13 }}>
              暂无标签
            </div>
          )}
          {tags.map(tag => (
            <div key={tag.id} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
              borderBottom: '1px solid var(--border)',
            }}>
              {editingId === tag.id ? (
                <>
                  <div style={{
                    width: 20, height: 20, borderRadius: 4, background: editColor, flexShrink: 0,
                    position: 'relative',
                  }}>
                    <input
                      type="color"
                      value={editColor}
                      onChange={e => setEditColor(e.target.value)}
                      style={{
                        position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%',
                      }}
                    />
                  </div>
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                    style={{
                      flex: 1, padding: '2px 6px', border: '1px solid var(--accent)', borderRadius: 4, fontSize: 13,
                      background: 'var(--bg)', color: 'var(--text)', outline: 'none',
                    }}
                    autoFocus
                  />
                  <button className="btn btn-sm" onClick={handleSaveEdit}>确定</button>
                  <button className="btn btn-sm" onClick={() => setEditingId(null)}>取消</button>
                </>
              ) : (
                <>
                  <div style={{
                    width: 20, height: 20, borderRadius: 4, background: tag.color, flexShrink: 0,
                  }} />
                  <span style={{ flex: 1, fontSize: 13 }}>{tag.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{tag.item_count} 项</span>
                  <button className="btn-icon" onClick={() => handleStartEdit(tag)} title="编辑" style={{ fontSize: 12 }}>✎</button>
                  <button className="btn-icon" onClick={() => handleDelete(tag.id)} title="删除" style={{ fontSize: 12, color: 'var(--danger)' }}>🗑</button>
                </>
              )}
            </div>
          ))}
          {showCreate ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '8px 0',
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: 4, background: newColor, flexShrink: 0, position: 'relative',
              }}>
                <input
                  type="color"
                  value={newColor}
                  onChange={e => setNewColor(e.target.value)}
                  style={{
                    position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%',
                  }}
                />
              </div>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowCreate(false); }}
                placeholder="标签名"
                autoFocus
                style={{
                  flex: 1, padding: '2px 6px', border: '1px solid var(--accent)', borderRadius: 4, fontSize: 13,
                  background: 'var(--bg)', color: 'var(--text)', outline: 'none',
                }}
              />
              <button className="btn btn-sm btn-primary" onClick={handleCreate}>创建</button>
              <button className="btn btn-sm" onClick={() => setShowCreate(false)}>取消</button>
            </div>
          ) : (
            <button
              className="btn btn-sm"
              onClick={() => setShowCreate(true)}
              style={{ marginTop: 8, width: '100%' }}
            >+ 新建标签</button>
          )}
        </div>
      </div>
    </div>
  );
}
