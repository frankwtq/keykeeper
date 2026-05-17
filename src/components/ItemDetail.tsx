import { useCallback, useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-shell';
import { readImage, getImageData } from '../api';
import type { Item } from '../types';

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
  onClose: () => void;
  onEdit: (item: Item) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}

export default function ItemDetail({ item, onClose, onEdit, onDelete, onToggleFavorite }: Props) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [showTableFullscreen, setShowTableFullscreen] = useState(false);

  useEffect(() => {
    if (item.type === 'image') {
      if (item.has_image_data) {
        getImageData(item.id).then(setImageSrc).catch(() => setImageSrc(null));
      } else if (item.content) {
        readImage(item.content).then(setImageSrc).catch(() => setImageSrc(null));
      }
    }
  }, [item.id, item.type, item.content, item.has_image_data]);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // fallback
    }
  }, []);

  const renderContent = () => {
    switch (item.type) {
      case 'url':
        return (
          <div>
            <div style={{
              padding: 12,
              background: 'var(--bg)',
              borderRadius: 'var(--radius)',
              fontSize: 13,
              wordBreak: 'break-all',
            }}>
              {item.content}
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
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 400,
              overflow: 'auto',
            }}>
              {item.content}
            </div>
            <button
              className="btn"
              style={{ marginTop: 8, width: '100%', justifyContent: 'center' }}
              onClick={() => copyToClipboard(item.content)}
            >📋 一键复制</button>
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
      <h2 style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>{item.title}</h2>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', gap: 8 }}>
        <span>创建: {item.created_at}</span>
        <span>使用: {item.usage_count} 次</span>
      </div>
      {renderContent()}
    </div>
  );
}
