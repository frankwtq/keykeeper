import { useState, useEffect, useRef } from 'react';
import type { Category, Item } from '../types';
import { saveImageFile } from '../api';

const MAX_PASTE_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

interface Props {
  categories: Category[];
  editItem?: Item | null;
  onSave: (item: { title: string; type: string; content: string; preview: string; categoryId?: string; imageData?: string | null; imageMime?: string | null }) => Promise<void>;
  onClose: () => void;
}

export default function AddItemDialog({ categories, editItem, onSave, onClose }: Props) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('url');
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [imageData, setImageData] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState<string | null>(null);
  const [pasteWarning, setPasteWarning] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editItem) {
      setTitle(editItem.title);
      setType(editItem.type);
      setContent(editItem.content);
      setPreview(editItem.preview);
      setCategoryId(editItem.category_id || '');
      // Editing a pasted image item — no way to re-edit image data
      if (editItem.has_image_data) {
        setContent('已有粘贴图片');
      }
    }
    inputRef.current?.focus();
  }, [editItem]);

  const handlePasteImage = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            if (blob.size > MAX_PASTE_IMAGE_SIZE) {
              setPasteWarning(`图片较大 (${(blob.size / 1024 / 1024).toFixed(1)}MB)，建议使用文件路径引用。仍然继续？`);
              return;
            }
            setPasteWarning(null);
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              const b64 = result.split(',')[1];
              setImageData(b64);
              setImageMime(type);
              setTitle(title || `截图 ${new Date().toLocaleTimeString()}`);
              setContent('粘贴图片');
            };
            reader.readAsDataURL(blob);
            return;
          }
        }
      }
    } catch {
      // clipboard read not supported or denied
    }
  };

  const handleSelectImage = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: false,
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }],
      });
      if (selected) {
        setTitle(title || selected.split('/').pop()?.split('.')[0] || '图片');
        const savedPath = await saveImageFile(selected as string);
        setContent(savedPath);
        setImageData(null);
        setImageMime(null);
      }
    } catch {
      // running outside Tauri or dialog not available
    }
  };

  const handleSave = async () => {
    if (!content.trim() && !imageData) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim() || (type === 'image' ? '图片' : content.trim().slice(0, 50)),
        type,
        content: content.trim(),
        preview: preview.trim() || (type === 'image' ? '' : content.trim().slice(0, 100)),
        categoryId: categoryId || undefined,
        imageData: imageData,
        imageMime: imageMime,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSave();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const flattenCategories = (cats: Category[], parentId: string | null = null, depth = 0): { id: string; label: string }[] => {
    const result: { id: string; label: string }[] = [];
    for (const c of cats) {
      if (c.parent_id === parentId) {
        if (c.id !== 'root') {
          result.push({ id: c.id, label: '  '.repeat(depth) + c.name });
        }
        result.push(...flattenCategories(cats, c.id, depth + 1));
      }
    }
    return result;
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
      onKeyDown={handleKeyDown}
    >
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: 12,
        padding: 24,
        width: 500,
        maxHeight: '80vh',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>
          {editItem ? '编辑内容' : '新增内容'}
        </h2>

        <div>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>类型</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { value: 'url', label: '🔗 网址' },
              { value: 'text', label: '📝 文字' },
              { value: 'image', label: '🖼 图片' },
              { value: 'table', label: '📊 表格' },
            ].map(t => (
              <button
                key={t.value}
                className={`btn btn-sm ${type === t.value ? 'btn-primary' : ''}`}
                  onClick={() => {
                    setType(t.value);
                    if (t.value !== 'image') { setContent(''); setImageData(null); setImageMime(null); setPasteWarning(null); }
                  }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>标题</label>
          <input
            ref={inputRef}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="标题（可选）"
            style={{
              width: '100%',
              padding: '8px 10px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: 'var(--bg)',
              color: 'var(--text)',
              outline: 'none',
              fontSize: 13,
            }}
          />
        </div>

        <div>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
            {type === 'url' ? '链接地址' : type === 'image' ? '图片' : type === 'table' ? 'CSV数据（第一行为表头）' : '文字内容'}
          </label>
          {type === 'image' ? (
            <div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <input
                  value={content}
                  onChange={e => { setContent(e.target.value); setImageData(null); setImageMime(null); }}
                  placeholder="粘贴图片路径或选择文件..."
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    outline: 'none',
                    fontSize: 13,
                  }}
                />
                <button className="btn" onClick={handleSelectImage}>选择文件</button>
                <button className="btn" onClick={handlePasteImage}>📋 粘贴</button>
              </div>
              {pasteWarning && (
                <div style={{ fontSize: 12, color: '#e67e22', marginTop: 4 }}>
                  {pasteWarning}
                </div>
              )}
              {imageData && (
                <div style={{ marginTop: 4 }}>
                  <img
                    src={`data:${imageMime};base64,${imageData}`}
                    alt="粘贴预览"
                    style={{ maxHeight: 120, borderRadius: 'var(--radius)' }}
                  />
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {(imageData.length * 0.75 / 1024 / 1024).toFixed(1)}MB (将存储到数据库)
                  </div>
                </div>
              )}
            </div>
          ) : type === 'table' || type === 'text' ? (
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder={
                type === 'table'
                  ? '名称,价格,数量\n苹果,5.0,10\n香蕉,3.0,20'
                  : '输入文字内容...'
              }
              rows={6}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                background: 'var(--bg)',
                color: 'var(--text)',
                outline: 'none',
                fontSize: 13,
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
          ) : (
            <input
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="https://..."
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                background: 'var(--bg)',
                color: 'var(--text)',
                outline: 'none',
                fontSize: 13,
              }}
            />
          )}
        </div>

        {type !== 'image' && (
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>摘要预览（可选）</label>
            <input
              value={preview}
              onChange={e => setPreview(e.target.value)}
              placeholder="简短描述，显示在卡片上"
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                background: 'var(--bg)',
                color: 'var(--text)',
                outline: 'none',
                fontSize: 13,
              }}
            />
          </div>
        )}

        <div>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>分类</label>
          <select
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: 'var(--bg)',
              color: 'var(--text)',
              outline: 'none',
              fontSize: 13,
            }}
          >
            <option value="">未分类</option>
            {flattenCategories(categories).map(c => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button className="btn" onClick={onClose}>取消</button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || !(content.trim() || imageData)}
            style={{ opacity: saving || !(content.trim() || imageData) ? 0.6 : 1 }}
          >
            {saving ? '保存中...' : `保存 (⌘⏎)`}
          </button>
        </div>
      </div>
    </div>
  );
}
