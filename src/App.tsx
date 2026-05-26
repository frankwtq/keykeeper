import { useEffect, useState, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getConfig, getCategories, getItems, addCategory, deleteCategory, addItem, updateItem, deleteItem, incrementUsage, toggleFavorite, renameCategory, exportData, importData, setShortcut, reorderItems, moveItemCategory, getTagsWithCount } from './api';
import type { AppConfig, Category, Item } from './types';
import Sidebar from './components/Sidebar';
import ItemList from './components/ItemList';
import ItemDetail from './components/ItemDetail';
import SearchBar from './components/SearchBar';
import AddItemDialog from './components/AddItemDialog';
import SettingsDialog from './components/SettingsDialog';
import ConfirmDialog from './components/ConfirmDialog';
import TranslateDialog from './components/TranslateDialog';
import TagManagerDialog from './components/TagManagerDialog';
import './App.css';

const APP_VERSION = '0.4.0';

type SortField = 'usage_count' | 'created_at' | 'updated_at' | 'sort_order';

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'sort_order', label: '自定义' },
  { value: 'usage_count', label: '使用次数' },
  { value: 'created_at', label: '创建时间' },
  { value: 'updated_at', label: '最近更新' },
];

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('root');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ message: string; onConfirm: () => Promise<void> } | null>(null);
  const [sortField, setSortField] = useState<SortField>('usage_count');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showTranslate, setShowTranslate] = useState(false);
  const [allTags, setAllTags] = useState<{ id: string; name: string; color: string; item_count: number }[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [showTagManager, setShowTagManager] = useState(false);
  // In-app keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (showAddDialog) return;
      if (e.key === 'Escape') {
        if (selectedItem) {
          setSelectedItem(null);
          return;
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        setEditingItem(null);
        setShowAddDialog(true);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>('input[type="text"]');
        input?.focus();
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showAddDialog, selectedItem]);

  const loadCategories = async () => {
    const cats = await getCategories();
    setCategories(cats);
  };

  const loadItems = useCallback(async (catId: string, search: string, tagIds?: Set<string>) => {
    const result = await getItems({
      categoryId: catId === 'root' || catId === '_favorites' ? undefined : catId,
      search: search || undefined,
      favoriteOnly: catId === '_favorites' || undefined,
      tagIds: tagIds && tagIds.size > 0 ? Array.from(tagIds) : undefined,
    });
    setItems(result);
  }, []);

  const loadTags = useCallback(async () => {
    const tags = await getTagsWithCount();
    setAllTags(tags);
  }, []);

  useEffect(() => {
    getConfig().then(setConfig);
    loadCategories();
    loadTags();
    loadItems('root', '', new Set());
  }, [loadItems, loadTags]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    loadItems(selectedCategory, query, selectedTagIds);
  };

  const handleCategorySelect = (id: string) => {
    setSelectedCategory(id);
    setSearchQuery('');
    setSelectedTagIds(new Set());
    loadItems(id, '', new Set());
  };

  useEffect(() => {
    getConfig().then(setConfig);
    loadCategories();
  }, []);

  const handleAddCategory = async (name: string, parentId?: string) => {
    await addCategory(name, parentId);
    await loadCategories();
  };

  const handleRenameCategory = async (id: string, name: string) => {
    await renameCategory(id, name);
    await loadCategories();
  };

  const handleDeleteCategory = async (id: string) => {
    setConfirmDelete({
      message: '确定删除这个分类吗？分类下的内容不会被删除。',
      onConfirm: async () => {
        await deleteCategory(id);
        await loadCategories();
        setConfirmDelete(null);
      },
    });
  };

  const handleSaveItem = async (item: { title: string; type: string; content: string; preview: string; categoryId?: string; imageData?: string | null; imageMime?: string | null }) => {
    if (editingItem) {
      await updateItem(editingItem.id, item);
      setEditingItem(null);
    } else {
      await addItem(item);
    }
    setShowAddDialog(false);
    await loadItems(selectedCategory, searchQuery, selectedTagIds);
  };

  const handleDeleteItem = async (id: string) => {
    setConfirmDelete({
      message: '确定删除这条内容吗？删除后不可恢复。',
      onConfirm: async () => {
        await deleteItem(id);
        setSelectedItem(null);
        await loadItems(selectedCategory, searchQuery, selectedTagIds);
        setConfirmDelete(null);
      },
    });
  };

  const handleItemClick = async (item: Item) => {
    await incrementUsage(item.id);
    setSelectedItem({ ...item, usage_count: item.usage_count + 1 });
  };

  const handleToggleFavorite = async (id: string) => {
    const isFav = await toggleFavorite(id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, is_favorite: isFav } : i));
    if (selectedItem?.id === id) {
      setSelectedItem({ ...selectedItem, is_favorite: isFav });
    }
  };

  const handleEdit = (item: Item) => {
    setEditingItem(item);
    setShowAddDialog(true);
  };

  const handleSaveSettings = async (shortcut: string, translationHistoryMax: number, aiProvider: string, aiApiUrl: string, aiApiKey: string, aiModel: string) => {
    await setShortcut(shortcut);
    const newConfig = { ...config!, global_shortcut: shortcut, translation_history_max: translationHistoryMax, ai_provider: aiProvider, ai_api_url: aiApiUrl, ai_api_key: aiApiKey, ai_model: aiModel };
    await invoke('set_config', { config: newConfig });
    const freshConfig = await getConfig();
    setConfig(freshConfig);
  };

  const handleExport = useCallback(async () => {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const path = await save({
        defaultPath: `keykeeper-backup-${new Date().toISOString().slice(0, 10)}.zip`,
        filters: [{ name: 'Zip 备份', extensions: ['zip'] }],
      });
      if (path) {
        await exportData(path as string);
      }
    } catch (e) {
      console.error('导出失败:', e);
    }
  }, []);

  const handleImport = useCallback(async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const path = await open({
        multiple: false,
        filters: [{ name: 'Zip 备份', extensions: ['zip'] }],
      });
      if (path) {
        await importData(path as string);
        await loadCategories();
        await loadItems(selectedCategory, searchQuery, selectedTagIds);
        setSelectedItem(null);
      }
    } catch (e) {
      console.error('导入失败:', e);
    }
  }, []);

  const sortedItems = useMemo(() => {
    if (sortField === 'sort_order') return items;
    const dir = sortOrder === 'desc' ? -1 : 1;
    return [...items].sort((a, b) => {
      if (sortField === 'usage_count') {
        return ((b.usage_count || 0) - (a.usage_count || 0)) * dir;
      }
      return (new Date(b[sortField]).getTime() - new Date(a[sortField]).getTime()) * dir;
    });
  }, [items, sortField, sortOrder]);

  const handleSortFieldChange = (field: SortField) => {
    if (field === sortField) {
      setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const handleReorder = async (reordered: { id: string; sort_order: number }[]) => {
    setSortField('sort_order');
    await reorderItems(reordered);
    await loadItems(selectedCategory, searchQuery, selectedTagIds);
  };

  const handleMoveToCategory = async (itemId: string, categoryId: string) => {
    await moveItemCategory(itemId, categoryId === 'root' ? null : categoryId);
    await loadItems(selectedCategory, searchQuery, selectedTagIds);
  };

  const handleToggleMultiSelect = () => {
    setMultiSelect(!multiSelect);
    setSelectedIds(new Set());
  };

  const handleBatchDelete = async () => {
    setConfirmDelete({
      message: `确定删除选中的 ${selectedIds.size} 条内容吗？`,
      onConfirm: async () => {
        for (const id of selectedIds) {
          await deleteItem(id);
        }
        setSelectedItem(null);
        setSelectedIds(new Set());
        setMultiSelect(false);
        await loadItems(selectedCategory, searchQuery, selectedTagIds);
        setConfirmDelete(null);
      },
    });
  };

  const handleBatchMove = async (categoryId: string) => {
    for (const id of selectedIds) {
      await moveItemCategory(id, categoryId === 'root' ? null : categoryId);
    }
    setSelectedIds(new Set());
    setMultiSelect(false);
    await loadItems(selectedCategory, searchQuery, selectedTagIds);
  };

  const handleTagSelect = (tagId: string) => {
    setSelectedTagIds(prev => {
      const next = new Set(prev);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      loadItems(selectedCategory, searchQuery, next);
      return next;
    });
  };

  const handleClearTags = () => {
    setSelectedTagIds(new Set());
    loadItems(selectedCategory, searchQuery, new Set());
  };

  if (!config) return null;

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="header-left">
          <h1 className="app-title">KeyKeeper <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>v{APP_VERSION}</span></h1>
        </div>
        <div className="header-center" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <SearchBar value={searchQuery} onChange={handleSearch} />
          <div style={{ position: 'relative' }}>
            <select
              value={sortField}
              onChange={e => handleSortFieldChange(e.target.value as SortField)}
              style={{
                fontSize: 12,
                padding: '4px 6px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                background: 'var(--bg-card)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button
              onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
              title={sortOrder === 'desc' ? '降序' : '升序'}
              style={{
                fontSize: 12,
                padding: '4px 6px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                background: 'var(--bg-card)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                lineHeight: 1,
              }}
            >{sortOrder === 'desc' ? '↓' : '↑'}</button>
          </div>
        </div>
        <div className="header-right" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            className={`btn btn-sm ${multiSelect ? 'btn-primary' : ''}`}
            onClick={handleToggleMultiSelect}
            title="多选"
          >☑</button>
          <button className="btn btn-sm" onClick={handleExport} title="📦 导出">📦</button>
          <button className="btn btn-sm" onClick={handleImport} title="📂 导入">📂</button>
          <button className="btn btn-sm" onClick={() => setShowSettings(true)} title="⚙ 设置">⚙</button>
          <button className="btn btn-sm" onClick={() => setShowTranslate(true)} title="🌐 翻译">🌐</button>
          <button className="btn btn-primary" onClick={() => { setEditingItem(null); setShowAddDialog(true); }} title="⌘N 新增">+ 新增</button>
        </div>
      </header>
      {multiSelect && selectedIds.size > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 16px',
          background: 'var(--accent-light)',
          borderBottom: '1px solid var(--border)',
          fontSize: 13,
        }}>
          <span>已选 {selectedIds.size} 项</span>
          <button className="btn btn-sm btn-danger" onClick={handleBatchDelete}>删除</button>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>拖拽到侧栏分类可批量移动</span>
        </div>
      )}
      <div className="app-body">
        <aside className="app-sidebar">
          <Sidebar
            categories={categories}
            selectedId={selectedCategory}
            onSelect={handleCategorySelect}
            onAdd={handleAddCategory}
            onRename={handleRenameCategory}
            onDelete={handleDeleteCategory}
            maxDepth={config.max_category_depth}
            onMoveItem={multiSelect ? (_itemId, categoryId) => handleBatchMove(categoryId) : handleMoveToCategory}
            tags={allTags}
            selectedTagIds={selectedTagIds}
            onTagSelect={handleTagSelect}
            onOpenTagManager={() => setShowTagManager(true)}
          />
        </aside>
        <main className="app-main">
          <ItemList
            items={sortedItems}
            selectedId={selectedItem?.id || null}
            highlight={searchQuery}
            multiSelect={multiSelect}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            onItemClick={handleItemClick}
            onToggleFavorite={handleToggleFavorite}
            onDelete={handleDeleteItem}
            onEdit={handleEdit}
            onReorder={handleReorder}
            onMoveItem={multiSelect ? (_itemId, categoryId) => handleBatchMove(categoryId) : handleMoveToCategory}
            allTags={allTags}
            selectedTagIds={selectedTagIds}
            onTagSelect={handleTagSelect}
            onClearTags={handleClearTags}
          />
        </main>
        {selectedItem && (
          <aside className="app-detail">
            <ItemDetail
              item={selectedItem}
              highlight={searchQuery}
              onClose={() => setSelectedItem(null)}
              onEdit={handleEdit}
              onDelete={handleDeleteItem}
              onToggleFavorite={handleToggleFavorite}
            />
          </aside>
        )}
      </div>
      {showAddDialog && (
        <AddItemDialog
          categories={categories}
          editItem={editingItem}
          onSave={handleSaveItem}
          onClose={() => { setShowAddDialog(false); setEditingItem(null); }}
        />
      )}
      {showSettings && config && (
        <SettingsDialog
          config={config}
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          message={confirmDelete.message}
          onConfirm={confirmDelete.onConfirm}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
      {showTranslate && (
        <TranslateDialog onClose={() => setShowTranslate(false)} />
      )}
      {showTagManager && (
        <TagManagerDialog onClose={() => { setShowTagManager(false); loadTags(); }} />
      )}
    </div>
  );
}
