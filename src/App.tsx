import { useEffect, useState, useCallback } from 'react';
import { getConfig, getCategories, getItems, addCategory, deleteCategory, addItem, updateItem, deleteItem, incrementUsage, toggleFavorite, renameCategory, exportData, importData } from './api';
import type { AppConfig, Category, Item } from './types';
import Sidebar from './components/Sidebar';
import ItemList from './components/ItemList';
import ItemDetail from './components/ItemDetail';
import SearchBar from './components/SearchBar';
import AddItemDialog from './components/AddItemDialog';
import './App.css';

const APP_VERSION = '0.2.3';

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('root');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
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

  const loadItems = async () => {
    const result = await getItems({
      categoryId: selectedCategory === 'root' ? undefined : selectedCategory,
      search: searchQuery || undefined,
    });
    setItems(result);
  };

  useEffect(() => {
    getConfig().then(setConfig);
    loadCategories();
  }, []);

  useEffect(() => {
    loadItems();
  }, [selectedCategory]);

  useEffect(() => {
    if (searchQuery) loadItems();
  }, [searchQuery]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (!query) loadItems();
  };

  const handleAddCategory = async (name: string, parentId?: string) => {
    await addCategory(name, parentId);
    await loadCategories();
  };

  const handleRenameCategory = async (id: string, name: string) => {
    await renameCategory(id, name);
    await loadCategories();
  };

  const handleDeleteCategory = async (id: string) => {
    await deleteCategory(id);
    await loadCategories();
  };

  const handleSaveItem = async (item: { title: string; type: string; content: string; preview: string; categoryId?: string; imageData?: string | null; imageMime?: string | null }) => {
    if (editingItem) {
      await updateItem(editingItem.id, item);
      setEditingItem(null);
    } else {
      await addItem(item);
    }
    setShowAddDialog(false);
    await loadItems();
  };

  const handleDeleteItem = async (id: string) => {
    await deleteItem(id);
    setSelectedItem(null);
    await loadItems();
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
        await loadItems();
        setSelectedItem(null);
      }
    } catch (e) {
      console.error('导入失败:', e);
    }
  }, []);

  if (!config) return null;

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="header-left">
          <h1 className="app-title">KeyKeeper <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>v{APP_VERSION}</span></h1>
        </div>
        <div className="header-center">
          <SearchBar value={searchQuery} onChange={handleSearch} />
        </div>
        <div className="header-right" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="btn btn-sm" onClick={handleExport}>📦 导出</button>
          <button className="btn btn-sm" onClick={handleImport}>📂 导入</button>
          <button className="btn btn-primary" onClick={() => { setEditingItem(null); setShowAddDialog(true); }}>+ 新增</button>
        </div>
      </header>
      <div className="app-body">
        <aside className="app-sidebar">
          <Sidebar
            categories={categories}
            selectedId={selectedCategory}
            onSelect={setSelectedCategory}
            onAdd={handleAddCategory}
            onRename={handleRenameCategory}
            onDelete={handleDeleteCategory}
            maxDepth={config.max_category_depth}
          />
        </aside>
        <main className="app-main">
          <ItemList
            items={items}
            selectedId={selectedItem?.id || null}
            onItemClick={handleItemClick}
            onToggleFavorite={handleToggleFavorite}
            onDelete={handleDeleteItem}
            onEdit={handleEdit}
          />
        </main>
        {selectedItem && (
          <aside className="app-detail">
            <ItemDetail
              item={selectedItem}
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
    </div>
  );
}
