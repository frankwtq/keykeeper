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
  tags: { id: string; name: string; color: string }[];
}

export interface AppConfig {
  max_category_depth: number;
  global_shortcut: string;
  auto_start: boolean;
  window: {
    width: number;
    height: number;
  };
  translation_history_max: number;
  ai_provider: string;
  ai_api_url: string;
  ai_api_key: string;
  ai_model: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface TranslationHistory {
  id: string;
  source_text: string;
  translated_text: string;
  source_lang: string;
  target_lang: string;
  created_at: string;
}
