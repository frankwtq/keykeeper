import { useCallback, useEffect, useRef, useState } from 'react';
import { open } from '@tauri-apps/plugin-shell';
import { readImage, getImageData, getItemTags, getTags, addItemTag, removeItemTag, createTag, translateText, addTranslationHistory } from '../api';
import type { Item, Tag } from '../types';
import { marked } from 'marked';

const TYPE_LABELS: Record<string, string> = {
  url: '🔗 网址',
  text: '📝 文字',
  image: '🖼 图片',
  table: '📊 表格',
};

const CELL_STYLE: React.CSSProperties = {
  border: '1px solid var(--table-border)',
  padding: '6px 10px',
  fontSize: 12,
  lineHeight: 1.4,
  whiteSpace: 'nowrap',
};

const HEADER_STYLE: React.CSSProperties = {
  ...CELL_STYLE,
  position: 'sticky',
  top: 0,
  zIndex: 1,
  background: 'var(--accent-light)',
  fontWeight: 600,
  textAlign: 'left',
  color: 'var(--text)',
};

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function renderTable(content: string, fullscreen = false) {
  try {
    const rawRows = content.split('\n').filter(r => r.trim());
    const parsed = rawRows.map(r => parseCSVLine(r));
    const maxCols = Math.max(...parsed.map(r => r.length));

    const thead = (
      <thead>
        <tr>
          {parsed[0].map((cell, j) => (
            <th key={j} style={HEADER_STYLE}>{cell}</th>
          ))}
          {Array.from({ length: maxCols - parsed[0].length }).map((_, j) => (
            <th key={`e-${j}`} style={HEADER_STYLE} />
          ))}
        </tr>
      </thead>
    );

    const tbody = (
      <tbody>
        {parsed.slice(1).map((cells, i) => (
          <tr key={i}
            style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg)' }}
            onMouseEnter={e => { if (!fullscreen) e.currentTarget.style.background = 'var(--bg-active)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'var(--bg)'; }}
          >
            {cells.map((cell, j) => (
              <td key={j} style={CELL_STYLE}>{cell}</td>
            ))}
            {Array.from({ length: maxCols - cells.length }).map((_, j) => (
              <td key={`e-${j}`} style={CELL_STYLE} />
            ))}
          </tr>
        ))}
      </tbody>
    );

    return (
      <table style={{
        borderCollapse: 'collapse',
        minWidth: fullscreen ? 'auto' : '100%',
      }}>
        {thead}
        {tbody}
      </table>
    );
  } catch {
    return (
      <div style={{ padding: 12, color: 'var(--text-secondary)', fontSize: 13 }}>
        无法解析表格数据
      </div>
    );
  }
}

interface Props {
  item: Item;
  highlight?: string;
  onClose: () => void;
  onEdit: (item: Item) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onOpenHistory: () => void;
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

export default function ItemDetail({ item, highlight, onClose, onEdit, onDelete, onToggleFavorite, onOpenHistory }: Props) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [showTableFullscreen, setShowTableFullscreen] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [showMarkdown, setShowMarkdown] = useState(false);
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 });
  const tagBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (item.type === 'image') {
      if (item.has_image_data) {
        getImageData(item.id).then(setImageSrc).catch(() => setImageSrc(null));
      } else if (item.content) {
        readImage(item.content).then(setImageSrc).catch(() => setImageSrc(null));
      }
    }
  }, [item.id, item.type, item.content, item.has_image_data]);

  useEffect(() => {
    getItemTags(item.id).then(setTags).catch(() => {});
    getTags().then(setAllTags).catch(() => {});
  }, [item.id]);

  const handleAddTag = async (tagId: string) => {
    await addItemTag(item.id, tagId);
    const updated = await getItemTags(item.id);
    setTags(updated);
    setShowTagPicker(false);
  };

  const handleRemoveTag = async (tagId: string) => {
    await removeItemTag(item.id, tagId);
    setTags(prev => prev.filter(t => t.id !== tagId));
  };

  const handleCreateTag = async () => {
    const name = newTagName.trim();
    if (!name) return;
    const existing = allTags.find(t => t.name === name);
    if (existing) {
      await handleAddTag(existing.id);
    } else {
      const tag = await createTag(name, '#4361ee');
      setAllTags(prev => [...prev, tag]);
      await handleAddTag(tag.id);
    }
    setNewTagName('');
  };

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // fallback
    }
  }, []);

  const [translation, setTranslation] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);

  const handleTranslate = async () => {
    if (showTranslation) {
      setShowTranslation(false);
      return;
    }
    if (translation) {
      setShowTranslation(true);
      return;
    }
    setTranslating(true);
    try {
      const result = await translateText(item.content);
      setTranslation(result.translatedText);
      setShowTranslation(true);
      const dir = result.detectedLang.startsWith('zh') ? 'en' : 'zh-CN';
      addTranslationHistory(item.content, result.translatedText, result.detectedLang, dir).catch(() => {});
    } catch {
      setTranslation('翻译失败');
      setShowTranslation(true);
    } finally {
      setTranslating(false);
    }
  };

  const renderContent = () => {
    switch (item.type) {
      case 'url':
        return (
          <div>
            {item.preview && (
              <div style={{
                padding: 12,
                background: 'var(--bg)',
                borderRadius: 'var(--radius)',
                fontSize: 13,
                color: 'var(--text-secondary)',
                marginBottom: 8,
              }}>
                {highlightText(item.preview, highlight || '')}
              </div>
            )}
            <div style={{
              padding: 12,
              background: 'var(--bg)',
              borderRadius: 'var(--radius)',
              fontSize: 13,
              wordBreak: 'break-all',
            }}>
              {highlightText(item.content, highlight || '')}
            </div>
            <button
              className="btn btn-primary"
              style={{ marginTop: 8, width: '100%', justifyContent: 'center' }}
              onClick={() => open(item.content)}
            >🌐 打开链接</button>
          </div>
        );
      case 'text':
        return (
          <div>
            <div style={{
              padding: 12,
              background: 'var(--bg)',
              borderRadius: 'var(--radius)',
              fontSize: 13,
              whiteSpace: showMarkdown ? 'normal' : 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 400,
              overflow: 'auto',
            }}>
              {showMarkdown ? (
                <div
                  className="markdown-body"
                  dangerouslySetInnerHTML={{ __html: (() => { try { return marked.parse(item.content); } catch { return item.content; } })() }}
                />
              ) : highlightText(item.content, highlight || '')}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button
                className="btn"
                style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}
                onClick={() => setShowMarkdown(!showMarkdown)}
              >{showMarkdown ? '📄 显示原文' : '📝 显示 Markdown'}</button>
              <button
                className="btn"
                style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}
                onClick={() => copyToClipboard(item.content)}
              >📋 一键复制</button>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button
                className="btn"
                style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}
                onClick={handleTranslate}
              >{translating ? '翻译中...' : showTranslation ? '收起翻译' : '🌐 翻译'}</button>
              <button
                className="btn"
                style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}
                onClick={onOpenHistory}
              >📜 翻译历史</button>
            </div>
            {showTranslation && translation && (
              <div style={{
                marginTop: 8,
                padding: 12,
                background: 'var(--bg)',
                borderRadius: 'var(--radius)',
                fontSize: 13,
                color: 'var(--text-secondary)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 300,
                overflow: 'auto',
              }}>
                {translation}
              </div>
            )}
          </div>
        );
      case 'image':
        return (
          <div>
            {imageSrc ? (
              <>
                <img
                  src={imageSrc}
                  alt={item.title}
                  style={{
                    width: '100%',
                    borderRadius: 'var(--radius)',
                    cursor: 'zoom-in',
                  }}
                  onClick={() => setShowImagePreview(true)}
                />
                {!item.has_image_data && (
                  <button
                    className="btn"
                    style={{ marginTop: 8, width: '100%', justifyContent: 'center' }}
                    onClick={() => open(item.content)}
                  >📂 在系统预览中打开</button>
                )}
              </>
            ) : (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>
                {item.content ? '加载中...' : '无图片数据'}
              </div>
            )}
            {showImagePreview && imageSrc && (
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  background: 'rgba(0,0,0,0.85)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 200,
                  cursor: 'zoom-out',
                }}
                onClick={() => setShowImagePreview(false)}
              >
                <img
                  src={imageSrc}
                  alt={item.title}
                  style={{
                    maxWidth: '90vw',
                    maxHeight: '90vh',
                    objectFit: 'contain',
                    borderRadius: 4,
                  }}
                />
              </div>
            )}
          </div>
        );
      case 'table':
        return (
          <div>
            <div style={{
              overflow: 'auto',
              maxHeight: 400,
            }}>
              <div style={{ minWidth: 'fit-content' }}>
                {renderTable(item.content)}
              </div>
            </div>
            <button
              className="btn"
              style={{ marginTop: 8, width: '100%', justifyContent: 'center' }}
              onClick={() => setShowTableFullscreen(true)}
            >⛶ 全屏查看</button>
            {showTableFullscreen && (
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  background: 'rgba(0,0,0,0.6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 200,
                }}
                onClick={() => setShowTableFullscreen(false)}
              >
                <div
                  onClick={e => e.stopPropagation()}
                  style={{
                    background: 'var(--bg-card)',
                    borderRadius: 12,
                    padding: 20,
                    width: '85vw',
                    height: '85vh',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 12,
                  }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{item.title || '表格'}</span>
                    <button className="btn-icon" onClick={() => setShowTableFullscreen(false)}>✕</button>
                  </div>
                  <div style={{
                    flex: 1,
                    overflow: 'auto',
                  }}>
                    <div style={{ minWidth: 'fit-content' }}>
                      {renderTable(item.content, true)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      default:
        return <div style={{ color: 'var(--text-secondary)' }}>未知类型</div>;
    }
  };

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>
          {TYPE_LABELS[item.type] || '📄'}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn-icon" onClick={() => onToggleFavorite(item.id)} title="收藏">
            {item.is_favorite ? '⭐' : '☆'}
          </button>
          <button className="btn-icon" onClick={() => onEdit(item)} title="编辑">✎</button>
          <button className="btn-icon" onClick={() => onDelete(item.id)} title="删除">🗑</button>
          <button className="btn-icon" onClick={onClose} title="关闭">✕</button>
        </div>
      </div>
      <h2 style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>{highlightText(item.title, highlight || '')}</h2>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', gap: 8 }}>
        <span>创建: {item.created_at}</span>
        <span>使用: {item.usage_count} 次</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        {tags.map(tag => (
          <span
            key={tag.id}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              padding: '2px 8px',
              borderRadius: 10,
              fontSize: 11,
              background: tag.color + '20',
              color: tag.color,
              border: `1px solid ${tag.color}40`,
            }}
          >
            {tag.name}
            <span
              style={{ cursor: 'pointer', opacity: 0.6, fontSize: 10 }}
              onClick={() => handleRemoveTag(tag.id)}
            >✕</span>
          </span>
        ))}
        <div>
          <button
            ref={tagBtnRef}
            className="btn"
            style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10 }}
            onClick={() => {
              if (!showTagPicker && tagBtnRef.current) {
                const buttonRect = tagBtnRef.current.getBoundingClientRect();
                const detail = document.querySelector('.app-detail');
                const left = detail ? detail.getBoundingClientRect().left + 12 : buttonRect.left;
                setPickerPos({ top: buttonRect.bottom + 4, left });
              }
              setShowTagPicker(!showTagPicker);
            }}
          >+ 标签</button>
          {showTagPicker && (
            <>
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 49 }}
                onClick={() => setShowTagPicker(false)}
              />
              <div
                style={{
                  position: 'fixed',
                  top: pickerPos.top,
                  left: pickerPos.left,
                  marginTop: 0,
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: 8,
                  width: 200,
                  maxHeight: 260,
                  overflowY: 'auto',
                  zIndex: 50,
                  boxShadow: 'var(--shadow)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  value={newTagName}
                  onChange={e => setNewTagName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateTag(); }}
                  placeholder="新建或搜索..."
                  style={{
                    flex: 1,
                    padding: '4px 6px',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    outline: 'none',
                    fontSize: 12,
                  }}
                />
                <button className="btn" style={{ fontSize: 11, padding: '2px 6px' }} onClick={handleCreateTag}>添加</button>
              </div>
              <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {allTags.filter(t => !tags.some(tt => tt.id === t.id)).map(tag => (
                  <div
                    key={tag.id}
                    style={{
                      padding: '4px 6px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 12,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                    onClick={() => handleAddTag(tag.id)}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: tag.color, display: 'inline-block' }} />
                    {tag.name}
                  </div>
                ))}
                {allTags.filter(t => !tags.some(tt => tt.id === t.id)).length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '4px 6px' }}>无可用标签</div>
                )}
              </div>
            </div>
            </>
          )}
        </div>
      </div>
      {renderContent()}
    </div>
  );
}
