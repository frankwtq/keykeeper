import { invoke } from '@tauri-apps/api/core';
import type { AppConfig, Category, Item, Tag } from './types';

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
  favoriteOnly?: boolean;
  limit?: number;
  offset?: number;
}

export async function getItems(params?: GetItemsParams): Promise<Item[]> {
  return invoke('get_items', {
    categoryId: params?.categoryId || null,
    search: params?.search || null,
    favoriteOnly: params?.favoriteOnly || null,
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

export interface UrlPreview {
  title: string | null;
  description: string | null;
}

export async function fetchUrlPreview(url: string): Promise<UrlPreview> {
  return invoke('fetch_url_preview', { url });
}

export async function getTags(): Promise<Tag[]> {
  return invoke('get_tags');
}

export async function createTag(name: string, color: string): Promise<Tag> {
  return invoke('create_tag', { name, color });
}

export async function deleteTag(id: string): Promise<void> {
  return invoke('delete_tag', { id });
}

export async function addItemTag(itemId: string, tagId: string): Promise<void> {
  return invoke('add_item_tag', { itemId, tagId });
}

export async function removeItemTag(itemId: string, tagId: string): Promise<void> {
  return invoke('remove_item_tag', { itemId, tagId });
}

export async function getItemTags(itemId: string): Promise<Tag[]> {
  return invoke('get_item_tags', { itemId });
}

export async function reorderItems(items: { id: string; sort_order: number }[]): Promise<void> {
  return invoke('reorder_items', { items });
}

export async function moveItemCategory(id: string, categoryId: string | null): Promise<void> {
  return invoke('move_item_category', { id, categoryId });
}
