import { invoke } from '@tauri-apps/api/core';
import type { AppConfig, Category, Item } from './types';

export async function getConfig(): Promise<AppConfig> {
  return invoke('get_config');
}

export async function setConfig(config: AppConfig): Promise<void> {
  return invoke('set_config', { config });
}

export async function getCategories(): Promise<Category[]> {
  return invoke('get_categories');
}

export async function addCategory(name: string, parentId?: string): Promise<Category> {
  return invoke('add_category', { name, parentId: parentId || null });
}

export async function renameCategory(id: string, name: string): Promise<void> {
  return invoke('rename_category', { id, name });
}

export async function deleteCategory(id: string): Promise<void> {
  return invoke('delete_category', { id });
}

export interface GetItemsParams {
  categoryId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function getItems(params?: GetItemsParams): Promise<Item[]> {
  return invoke('get_items', {
    categoryId: params?.categoryId || null,
    search: params?.search || null,
    limit: params?.limit || 50,
    offset: params?.offset || 0,
  });
}

export interface ItemInput {
  title: string;
  type: string;
  content: string;
  preview: string;
  categoryId?: string;
  imageData?: string | null;
  imageMime?: string | null;
}

export async function addItem(item: ItemInput): Promise<Item> {
  return invoke('add_item', {
    title: item.title,
    type: item.type,
    content: item.content,
    preview: item.preview,
    categoryId: item.categoryId || null,
    imageData: item.imageData || null,
    imageMime: item.imageMime || null,
  });
}

export async function updateItem(id: string, item: ItemInput): Promise<void> {
  return invoke('update_item', {
    id,
    title: item.title,
    type: item.type,
    content: item.content,
    preview: item.preview,
    categoryId: item.categoryId || null,
    imageData: item.imageData || null,
    imageMime: item.imageMime || null,
  });
}

export async function saveImageFile(filePath: string): Promise<string> {
  return invoke('save_image_file', { filePath });
}

export async function deleteItem(id: string): Promise<void> {
  return invoke('delete_item', { id });
}

export async function incrementUsage(id: string): Promise<void> {
  return invoke('increment_usage', { id });
}

export async function toggleFavorite(id: string): Promise<boolean> {
  return invoke('toggle_favorite', { id });
}

export async function exportData(savePath: string): Promise<void> {
  return invoke('export_data', { savePath });
}

export async function importData(filePath: string): Promise<void> {
  return invoke('import_data', { filePath });
}

export async function readImage(path: string): Promise<string> {
  return invoke('read_image', { path });
}

export async function getImageData(id: string): Promise<string> {
  return invoke('get_image_data', { id });
}

export async function setShortcut(shortcut: string): Promise<void> {
  return invoke('set_shortcut', { shortcut });
}
