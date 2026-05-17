export interface Category {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
}

export interface Item {
  id: string;
  title: string;
  type: 'url' | 'text' | 'image' | 'table';
  content: string;
  preview: string;
  category_id: string | null;
  is_favorite: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
  has_image_data: boolean;
  image_mime: string | null;
}

export interface AppConfig {
  max_category_depth: number;
  global_shortcut: string;
  auto_start: boolean;
  window: {
    width: number;
    height: number;
  };
}
