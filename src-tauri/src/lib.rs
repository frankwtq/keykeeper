mod config;
mod db;

use config::AppConfig;
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::{
    Manager,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Runtime,
};
use tauri_plugin_global_shortcut::GlobalShortcutExt;
use base64::Engine as _;
use serde::Serialize;
use serde::Deserialize;
use url::Url;

#[derive(Serialize, Deserialize, Clone)]
struct Tag {
    id: String,
    name: String,
    color: String,
}

#[derive(Serialize)]
struct TagWithCount {
    id: String,
    name: String,
    color: String,
    item_count: i32,
}

#[derive(Serialize)]
struct UrlPreview {
    title: Option<String>,
    description: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct TranslationHistory {
    id: String,
    source_text: String,
    translated_text: String,
    source_lang: String,
    target_lang: String,
    created_at: String,
}

#[derive(Serialize)]
struct TranslationResult {
    translated_text: String,
    detected_lang: String,
}

#[tauri::command]
fn get_tags(state: tauri::State<AppState>) -> Result<Vec<Tag>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, name, color FROM tags ORDER BY name").map_err(|e| e.to_string())?;
    let tags = stmt.query_map([], |row| {
        Ok(Tag {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();
    Ok(tags)
}

#[tauri::command]
fn get_tags_with_count(state: tauri::State<AppState>) -> Result<Vec<TagWithCount>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name, t.color, COUNT(it.item_id) as item_count
         FROM tags t LEFT JOIN item_tags it ON t.id = it.tag_id
         GROUP BY t.id ORDER BY t.name"
    ).map_err(|e| e.to_string())?;
    let tags = stmt.query_map([], |row| {
        Ok(TagWithCount {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
            item_count: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();
    Ok(tags)
}

#[tauri::command]
fn create_tag(state: tauri::State<AppState>, name: String, color: String) -> Result<Tag, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute("INSERT INTO tags (id, name, color) VALUES (?1, ?2, ?3)", rusqlite::params![id, name, color]).map_err(|e| e.to_string())?;
    Ok(Tag { id, name, color })
}

#[tauri::command]
fn delete_tag(state: tauri::State<AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM tags WHERE id = ?1", rusqlite::params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn update_tag(state: tauri::State<AppState>, id: String, name: String, color: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute("UPDATE tags SET name = ?1, color = ?2 WHERE id = ?3", rusqlite::params![name, color, id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn add_item_tag(state: tauri::State<AppState>, item_id: String, tag_id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute("INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?1, ?2)", rusqlite::params![item_id, tag_id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn remove_item_tag(state: tauri::State<AppState>, item_id: String, tag_id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM item_tags WHERE item_id = ?1 AND tag_id = ?2", rusqlite::params![item_id, tag_id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_item_tags(state: tauri::State<AppState>, item_id: String) -> Result<Vec<Tag>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name, t.color FROM tags t INNER JOIN item_tags it ON t.id = it.tag_id WHERE it.item_id = ?1 ORDER BY t.name"
    ).map_err(|e| e.to_string())?;
    let tags = stmt.query_map(rusqlite::params![item_id], |row| {
        Ok(Tag {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();
    Ok(tags)
}

#[tauri::command]
async fn fetch_url_preview(url: String) -> Result<UrlPreview, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent("Mozilla/5.0 (compatible; KeyKeeper/1.0)")
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let html = resp.text().await.map_err(|e| e.to_string())?;
    let lower = html.to_lowercase();

    let title = extract_tag(&lower, "title").map(|s| s.trim().to_string());
    let description = extract_meta_description(&lower);

    Ok(UrlPreview { title, description })
}

#[tauri::command]
async fn translate_text(text: String) -> Result<TranslationResult, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let params = [("client", "gtx"), ("sl", "auto"), ("tl", "en"), ("dt", "t"), ("q", &text)];
    let url = Url::parse_with_params("https://translate.googleapis.com/translate_a/single", &params)
        .map_err(|e| format!("URL 构建失败: {}", e))?;

    let resp = client.get(url).send().await.map_err(|e| format!("翻译请求失败: {}", e))?;
    let body = resp.text().await.map_err(|e| format!("翻译响应读取失败: {}", e))?;

    let parsed: serde_json::Value = serde_json::from_str(&body).map_err(|_| "翻译响应解析失败".to_string())?;
    let detected_lang = parsed[2].as_str().unwrap_or("en").to_string();
    let is_chinese = detected_lang == "zh" || detected_lang == "zh-CN" || detected_lang == "zh-TW";
    let target_lang = if is_chinese { "en" } else { "zh-CN" };

    let translated_text = if target_lang != "en" {
        let params2 = [("client", "gtx"), ("sl", "auto"), ("tl", "zh-CN"), ("dt", "t"), ("q", &text)];
        let url2 = Url::parse_with_params("https://translate.googleapis.com/translate_a/single", &params2)
            .map_err(|e| format!("URL 构建失败: {}", e))?;
        let resp2 = client.get(url2).send().await.map_err(|e| format!("翻译请求失败: {}", e))?;
        let body2 = resp2.text().await.map_err(|e| format!("翻译响应读取失败: {}", e))?;
        let parsed2: serde_json::Value = serde_json::from_str(&body2).map_err(|_| "翻译响应解析失败".to_string())?;
        parsed2[0][0][0].as_str().unwrap_or("").to_string()
    } else {
        parsed[0][0][0].as_str().unwrap_or("").to_string()
    };

    Ok(TranslationResult { translated_text, detected_lang })
}

#[tauri::command]
fn add_translation_history(
    state: tauri::State<AppState>,
    source_text: String,
    translated_text: String,
    source_lang: String,
    target_lang: String,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO translation_history (id, source_text, translated_text, source_lang, target_lang, created_at) VALUES (?1, ?2, ?3, ?4, ?5, datetime('now','localtime'))",
        rusqlite::params![id, source_text, translated_text, source_lang, target_lang],
    ).map_err(|e| e.to_string())?;

    let max = state.config.lock()
        .map(|c| c.translation_history_max)
        .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM translation_history WHERE id NOT IN (SELECT id FROM translation_history ORDER BY created_at DESC LIMIT ?1)",
        rusqlite::params![max],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn get_translation_history(
    state: tauri::State<AppState>,
    limit: Option<i32>,
) -> Result<Vec<TranslationHistory>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let limit = limit.unwrap_or(50);
    let mut stmt = conn.prepare(
        "SELECT id, source_text, translated_text, source_lang, target_lang, created_at FROM translation_history ORDER BY created_at DESC LIMIT ?1"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params![limit], |row| {
        Ok(TranslationHistory {
            id: row.get(0)?,
            source_text: row.get(1)?,
            translated_text: row.get(2)?,
            source_lang: row.get(3)?,
            target_lang: row.get(4)?,
            created_at: row.get(5)?,
        })
    }).map_err(|e| e.to_string())?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

#[tauri::command]
fn clear_translation_history(state: tauri::State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM translation_history", []).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize)]
struct CategorySuggestion {
    category_id: Option<String>,
    category_name: String,
}

#[tauri::command]
async fn suggest_category(
    state: tauri::State<'_, AppState>,
    title: String,
    content: String,
) -> Result<Option<CategorySuggestion>, String> {
    // Read config and categories under lock
    let (categories, config) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let cfg = state.config.lock().map_err(|e| e.to_string())?;

        let mut stmt = db
            .prepare("SELECT id, name FROM categories WHERE id != 'root' ORDER BY name")
            .map_err(|e| e.to_string())?;
        let cats: Vec<(String, String)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        (cats, cfg.clone())
    };

    if config.ai_provider == "off" || categories.is_empty() {
        return Ok(None);
    }

    let category_names: Vec<String> = categories.iter().map(|(_, name)| name.clone()).collect();
    let prompt = format!(
        "你是一个分类助手。根据标题和内容，从以下分类中选择最合适的一个。只返回分类名称，不要解释。若都不匹配，返回\"未分类\"。\n\n标题: {}\n内容: {}\n\n可选分类: {}",
        title,
        if content.len() > 1000 { &content[..1000] } else { &content },
        category_names.join(", ")
    );

    let body = serde_json::json!({
        "model": config.ai_model,
        "messages": [
            {"role": "system", "content": "你是一个分类助手。根据标题和内容选择最合适的分类。只返回分类名称，不要解释。"},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.1,
        "max_tokens": 50,
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let api_url = format!("{}/chat/completions", config.ai_api_url.trim_end_matches('/'));
    let mut req = client.post(&api_url).json(&body);
    if !config.ai_api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", config.ai_api_key));
    }

    let resp = req.send().await.map_err(|e| format!("AI 请求失败: {}", e))?;
    let result: serde_json::Value = resp.json().await.map_err(|e| format!("AI 响应解析失败: {}", e))?;

    let ai_answer = result["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("未分类")
        .trim()
        .to_string();

    // Fuzzy match: try exact match first, then case-insensitive
    let matched = categories.iter().find(|(_, name)| {
        name == &ai_answer || name.to_lowercase() == ai_answer.to_lowercase()
    });

    Ok(Some(CategorySuggestion {
        category_id: matched.map(|(id, _)| id.clone()),
        category_name: ai_answer,
    }))
}

fn extract_tag<'a>(lower: &'a str, tag: &str) -> Option<&'a str> {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    let start = lower.find(&open)?;
    let content_start = start + open.len();
    let end = lower[content_start..].find(&close)?;
    Some(&lower[content_start..content_start + end])
}

fn extract_meta_description(lower: &str) -> Option<String> {
    // Look for <meta name="description" content="...">
    let needle = r#"<meta name="description""#;
    let start = lower.find(needle)?;
    let rest = &lower[start + needle.len()..];
    let content_start = rest.find(r#"content=""#)?;
    let value_start = content_start + r#"content=""#.len();
    let end = rest[value_start..].find('"')?;
    Some(rest[value_start..value_start + end].to_string())
}

struct AppState {
    db: Mutex<Connection>,
    config: Mutex<AppConfig>,
    data_dir: std::path::PathBuf,
}

fn resolve_data_dir(app: &tauri::AppHandle) -> std::path::PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let data_dir = parent.join("data");
            std::fs::create_dir_all(&data_dir).ok();
            return data_dir;
        }
    }
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
}

fn resolve_config_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            return parent.join("config.json");
        }
    }
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("config.json")
}

fn resolve_db_path(data_dir: &std::path::PathBuf) -> std::path::PathBuf {
    data_dir.join("keykeeper.db")
}

fn toggle_window<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            window.hide().ok();
        } else {
            window.show().ok();
            window.set_focus().ok();
        }
    }
}

#[tauri::command]
fn get_config(state: tauri::State<AppState>) -> Result<AppConfig, String> {
    state.config.lock().map(|c| c.clone()).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_config(state: tauri::State<AppState>, config: AppConfig) -> Result<(), String> {
    let data_dir = state.data_dir.clone();
    let config_path = data_dir.parent().unwrap_or(&data_dir).join("config.json");
    config.save(&config_path);
    if let Ok(mut c) = state.config.lock() {
        *c = config;
    }
    Ok(())
}

#[tauri::command]
fn get_categories(state: tauri::State<AppState>) -> Result<Vec<serde_json::Value>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare("SELECT id, name, parent_id, sort_order FROM categories ORDER BY sort_order")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "name": row.get::<_, String>(1)?,
                "parent_id": row.get::<_, Option<String>>(2)?,
                "sort_order": row.get::<_, i32>(3)?,
            }))
        })
        .map_err(|e| e.to_string())?;
    let mut categories = Vec::new();
    for row in rows {
        categories.push(row.map_err(|e| e.to_string())?);
    }
    Ok(categories)
}

#[tauri::command]
fn add_category(
    state: tauri::State<AppState>,
    name: String,
    parent_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let created_at = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    db.execute(
        "INSERT INTO categories (id, name, parent_id, sort_order, created_at) VALUES (?1, ?2, ?3, 0, ?4)",
        rusqlite::params![id, name, parent_id, created_at],
    )
    .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "id": id,
        "name": name,
        "parent_id": parent_id,
        "sort_order": 0,
    }))
}

#[tauri::command]
fn delete_category(state: tauri::State<AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("DELETE FROM categories WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn rename_category(state: tauri::State<AppState>, id: String, name: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("UPDATE categories SET name=?1 WHERE id=?2", rusqlite::params![name, id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn reorder_items(state: tauri::State<AppState>, items: Vec<serde_json::Value>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    for item in &items {
        let id = item["id"].as_str().ok_or("missing id")?;
        let sort_order = item["sort_order"].as_i64().ok_or("missing sort_order")?;
        db.execute("UPDATE items SET sort_order=?1 WHERE id=?2", rusqlite::params![sort_order, id])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn move_item_category(state: tauri::State<AppState>, id: String, category_id: Option<String>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    db.execute(
        "UPDATE items SET category_id=?1, updated_at=?2 WHERE id=?3",
        rusqlite::params![category_id, now, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_items(
    state: tauri::State<AppState>,
    category_id: Option<String>,
    search: Option<String>,
    favorite_only: Option<bool>,
    tag_ids: Option<Vec<String>>,
    limit: Option<i32>,
    offset: Option<i32>,
) -> Result<Vec<serde_json::Value>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let limit = limit.unwrap_or(50);
    let offset = offset.unwrap_or(0);
    let fav_filter = favorite_only.unwrap_or(false);
    let fav_where = if fav_filter { " AND i.is_favorite = 1" } else { "" };

    if let Some(query) = search {
        if !query.is_empty() {
            // Clean query for FTS5: strip chars that confuse column-name parsing (like ://)
            let cleaned: String = query.chars()
                .map(|c| if c.is_alphanumeric() || c.is_whitespace() { c } else { ' ' })
                .collect();
            let words: Vec<&str> = cleaned.split_whitespace().filter(|w| !w.is_empty()).collect();

            // Try FTS5 with prefix matching, fall back to LIKE if FTS5 fails (e.g., stop words)
            if !words.is_empty() {
                let fts_query = words.iter()
                    .map(|w| format!("{}*", w))
                    .collect::<Vec<_>>()
                    .join(" AND ");

                if let Ok(mut stmt) = db.prepare(&format!("
                    SELECT i.id, i.title, i.type, i.content, i.preview, i.category_id,
                           i.is_favorite, i.usage_count, i.created_at, i.updated_at,
                           (i.image_data IS NOT NULL) as has_image_data, i.image_mime
                    FROM items i
                    JOIN items_fts fts ON i.rowid = fts.rowid
                    WHERE items_fts MATCH ?1 {}
                    ORDER BY i.sort_order ASC
                    LIMIT ?2 OFFSET ?3
                ", fav_where)) {
                    if let Ok(rows) = stmt.query_map(rusqlite::params![fts_query, limit, offset], map_item) {
                        let items: Vec<_> = rows.collect();
                        if items.iter().any(|r| r.is_ok()) {
                            let mut collected = collect_items(items)?;
                            add_tags_to_items(&mut collected, &*db)?;
                            return filter_items_by_tags(collected, &*db, &tag_ids);
                        }
                    }
                }
            }

            // Fallback: LIKE search across title, content, preview
            let like = format!("%{}%", query);
            let mut stmt = db.prepare(&format!("
                SELECT i.id, i.title, i.type, i.content, i.preview, i.category_id,
                       i.is_favorite, i.usage_count, i.created_at, i.updated_at,
                       (i.image_data IS NOT NULL) as has_image_data, i.image_mime
                FROM items i
                WHERE (i.title LIKE ?1 OR i.content LIKE ?1 OR i.preview LIKE ?1) {}
                ORDER BY i.sort_order ASC
                LIMIT ?2 OFFSET ?3
            ", fav_where)).map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(rusqlite::params![like, limit, offset], map_item)
                .map_err(|e| e.to_string())?
                .collect::<Vec<_>>();
            let mut collected = collect_items(rows)?;
            add_tags_to_items(&mut collected, &*db)?;
            return filter_items_by_tags(collected, &*db, &tag_ids);
        }
    }

    let (mut sql, params): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = if let Some(cid) = category_id {
        if cid == "root" {
            ("SELECT i.id, i.title, i.type, i.content, i.preview, i.category_id, i.is_favorite, i.usage_count, i.created_at, i.updated_at, (i.image_data IS NOT NULL) as has_image_data, i.image_mime FROM items i ORDER BY i.sort_order ASC LIMIT ?1 OFFSET ?2".into(), vec![Box::new(limit), Box::new(offset)])
        } else {
            ("
                WITH RECURSIVE subcats AS (
                    SELECT id FROM categories WHERE id = ?1
                    UNION ALL
                    SELECT c.id FROM categories c JOIN subcats s ON c.parent_id = s.id
                )
                SELECT i.id, i.title, i.type, i.content, i.preview, i.category_id, i.is_favorite, i.usage_count, i.created_at, i.updated_at, (i.image_data IS NOT NULL) as has_image_data, i.image_mime FROM items i
                WHERE i.category_id IN (SELECT id FROM subcats)
                ORDER BY i.sort_order ASC LIMIT ?2 OFFSET ?3
            ".into(), vec![Box::new(cid), Box::new(limit), Box::new(offset)])
        }
    } else {
        ("SELECT i.id, i.title, i.type, i.content, i.preview, i.category_id, i.is_favorite, i.usage_count, i.created_at, i.updated_at, (i.image_data IS NOT NULL) as has_image_data, i.image_mime FROM items i ORDER BY i.sort_order ASC LIMIT ?1 OFFSET ?2".into(), vec![Box::new(limit), Box::new(offset)])
    };

    if fav_filter {
        if sql.contains("WHERE") {
            sql = sql.replace("ORDER BY", "AND i.is_favorite = 1 ORDER BY");
        } else {
            sql = sql.replace("ORDER BY", "WHERE i.is_favorite = 1 ORDER BY");
        }
    }

    let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let rows = stmt
        .query_map(param_refs.as_slice(), map_item)
        .map_err(|e| e.to_string())?
        .collect::<Vec<_>>();
    let mut items = collect_items(rows)?;
    add_tags_to_items(&mut items, &*db)?;
    filter_items_by_tags(items, &*db, &tag_ids)
}

fn collect_items(
    rows: Vec<rusqlite::Result<serde_json::Value>>,
) -> Result<Vec<serde_json::Value>, String> {
    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(|e| e.to_string())?);
    }
    Ok(items)
}

fn filter_items_by_tags(
    items: Vec<serde_json::Value>,
    db: &Connection,
    tag_ids: &Option<Vec<String>>,
) -> Result<Vec<serde_json::Value>, String> {
    if let Some(ref ids) = tag_ids {
        if ids.is_empty() {
            return Ok(items);
        }
        let mut stmt = db.prepare(
            "SELECT 1 FROM item_tags WHERE item_id = ?1 AND tag_id = ?2"
        ).map_err(|e| e.to_string())?;
        Ok(items.into_iter().filter(|item| {
            let item_id = item["id"].as_str().unwrap_or("");
            ids.iter().all(|tid| {
                stmt.query_row(rusqlite::params![item_id, tid], |_| Ok(()))
                    .is_ok()
            })
        }).collect())
    } else {
        Ok(items)
    }
}

fn map_item(row: &rusqlite::Row) -> rusqlite::Result<serde_json::Value> {
    Ok(serde_json::json!({
        "id": row.get::<_, String>(0)?,
        "title": row.get::<_, String>(1)?,
        "type": row.get::<_, String>(2)?,
        "content": row.get::<_, String>(3)?,
        "preview": row.get::<_, String>(4)?,
        "category_id": row.get::<_, Option<String>>(5)?,
        "is_favorite": row.get::<_, i32>(6)? != 0,
        "usage_count": row.get::<_, i32>(7)?,
        "created_at": row.get::<_, String>(8)?,
        "updated_at": row.get::<_, String>(9)?,
        "has_image_data": row.get::<_, bool>(10)?,
        "image_mime": row.get::<_, Option<String>>(11)?,
        "tags": [],
    }))
}

fn add_tags_to_items(
    items: &mut Vec<serde_json::Value>,
    db: &Connection,
) -> Result<(), String> {
    if items.is_empty() {
        return Ok(());
    }
    let item_ids: Vec<String> = items.iter()
        .filter_map(|i| i["id"].as_str().map(String::from))
        .collect();

    let placeholders: Vec<String> = (0..item_ids.len())
        .map(|i| format!("?{}", i + 1))
        .collect();

    let sql = format!(
        "SELECT it.item_id, t.id, t.name, t.color FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE it.item_id IN ({})",
        placeholders.join(",")
    );

    let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;
    let params: Vec<&dyn rusqlite::types::ToSql> = item_ids.iter().map(|id| id as &dyn rusqlite::types::ToSql).collect();

    let mut item_tag_map: std::collections::HashMap<String, Vec<serde_json::Value>> = std::collections::HashMap::new();
    if let Ok(rows) = stmt.query_map(params.as_slice(), |row| {
        let item_id: String = row.get(0)?;
        let tag = serde_json::json!({
            "id": row.get::<_, String>(1)?,
            "name": row.get::<_, String>(2)?,
            "color": row.get::<_, String>(3)?,
        });
        Ok((item_id, tag))
    }) {
        for row in rows {
            if let Ok((item_id, tag)) = row {
                item_tag_map.entry(item_id).or_default().push(tag);
            }
        }
    }

    for item in items.iter_mut() {
        let id = item["id"].as_str().unwrap_or("");
        if let Some(tags) = item_tag_map.remove(id) {
            item["tags"] = serde_json::Value::Array(tags);
        }
    }

    Ok(())
}

#[tauri::command]
fn add_item(
    state: tauri::State<AppState>,
    title: String,
    r#type: String,
    content: String,
    preview: String,
    category_id: Option<String>,
    image_data: Option<String>,
    image_mime: Option<String>,
) -> Result<serde_json::Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let has_image = image_data.is_some();
    let image_blob = image_data.map(|b64| {
        base64::engine::general_purpose::STANDARD.decode(&b64).unwrap_or_default()
    });
    db.execute(
        "INSERT INTO items (id, title, type, content, preview, category_id, is_favorite, usage_count, created_at, updated_at, image_data, image_mime)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, 0, ?7, ?8, ?9, ?10)",
        rusqlite::params![id, title, r#type, content, preview, category_id, now, now, image_blob, image_mime],
    )
    .map_err(|e| e.to_string())?;

    db.execute("INSERT INTO items_fts (rowid, title, content, preview) VALUES (last_insert_rowid(), ?1, ?2, ?3)",
        rusqlite::params![title, content, preview])
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "id": id,
        "title": title,
        "type": r#type,
        "content": content,
        "preview": preview,
        "category_id": category_id,
        "is_favorite": false,
        "usage_count": 0,
        "created_at": now,
        "updated_at": now,
        "has_image_data": has_image,
        "image_mime": image_mime,
    }))
}

#[tauri::command]
fn update_item(
    state: tauri::State<AppState>,
    id: String,
    title: String,
    r#type: String,
    content: String,
    preview: String,
    category_id: Option<String>,
    image_data: Option<String>,
    image_mime: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let image_blob = image_data.map(|b64| {
        base64::engine::general_purpose::STANDARD.decode(&b64).unwrap_or_default()
    });
    db.execute(
        "UPDATE items SET title=?1, type=?2, content=?3, preview=?4, category_id=?5, updated_at=?6, image_data=?7, image_mime=?8 WHERE id=?9",
        rusqlite::params![title, r#type, content, preview, category_id, now, image_blob, image_mime, id],
    )
    .map_err(|e| e.to_string())?;

    db.execute(
        "UPDATE items_fts SET title=?1, content=?2, preview=?3 WHERE rowid=(SELECT rowid FROM items WHERE id=?4)",
        rusqlite::params![title, content, preview, id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn save_image_file(
    state: tauri::State<AppState>,
    file_path: String,
) -> Result<String, String> {
    let src = std::path::PathBuf::from(&file_path);
    if !src.exists() {
        return Err("文件不存在".into());
    }
    let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("png");
    let filename = format!("{}_{}.{}",
        chrono::Utc::now().format("%Y%m%d%H%M%S"),
        uuid::Uuid::new_v4().to_string().split('-').next().unwrap(),
        ext);
    let images_dir = state.data_dir.join("images");
    std::fs::create_dir_all(&images_dir).map_err(|e| e.to_string())?;
    let dest = images_dir.join(&filename);
    std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
fn delete_item(state: tauri::State<AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("DELETE FROM items WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    db.execute("DELETE FROM items_fts WHERE rowid NOT IN (SELECT rowid FROM items)", [])
        .ok();
    Ok(())
}

#[tauri::command]
fn increment_usage(state: tauri::State<AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE items SET usage_count = usage_count + 1, updated_at = datetime('now') WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn toggle_favorite(state: tauri::State<AppState>, id: String) -> Result<bool, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE items SET is_favorite = CASE WHEN is_favorite THEN 0 ELSE 1 END WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| e.to_string())?;
    let is_fav: bool = db
        .query_row(
            "SELECT is_favorite FROM items WHERE id = ?1",
            rusqlite::params![id],
            |row| row.get::<_, i32>(0),
        )
        .map(|v| v != 0)
        .map_err(|e| e.to_string())?;
    Ok(is_fav)
}

#[tauri::command]
fn export_data(
    state: tauri::State<AppState>,
    save_path: String,
) -> Result<(), String> {
    let data_dir = state.data_dir.clone();

    // Step 1: Checkpoint WAL + read DB data under lock
    let (db_data, items_for_xlsx, categories, tags_with_count) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")
            .map_err(|e| format!("WAL 检查点失败: {}", e))?;

        let db_path = resolve_db_path(&data_dir);
        let db_data = std::fs::read(&db_path).map_err(|e| format!("读取数据库失败: {}", e))?;

        // Query categories for xlsx
        let mut stmt = db.prepare("SELECT id, name, parent_id FROM categories ORDER BY name")
            .map_err(|e| e.to_string())?;
        let categories: Vec<(String, String, Option<String>)> = stmt.query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        }).map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

        // Query items with tags for xlsx
        let mut stmt = db.prepare(
            "SELECT i.id, i.title, i.type, i.content, i.preview, i.category_id, i.is_favorite, i.usage_count, i.created_at, i.updated_at, COALESCE((SELECT GROUP_CONCAT(t.name, ', ') FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE it.item_id = i.id), '') FROM items i ORDER BY i.created_at DESC"
        ).map_err(|e| e.to_string())?;
        let items_for_xlsx: Vec<(String, String, String, String, String, Option<String>, bool, i32, String, String, String)> = stmt.query_map([], |row| {
            let is_fav: i32 = row.get(6)?;
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, is_fav != 0, row.get(7)?, row.get(8)?, row.get(9)?, row.get(10)?))
        }).map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

        // Query tags with count for xlsx
        let mut stmt = db.prepare(
            "SELECT t.id, t.name, t.color, COUNT(it.item_id) FROM tags t LEFT JOIN item_tags it ON t.id = it.tag_id GROUP BY t.id ORDER BY t.name"
        ).map_err(|e| e.to_string())?;
        let tags_with_count: Vec<(String, String, String, i32)> = stmt.query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        }).map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

        (db_data, items_for_xlsx, categories, tags_with_count)
    };

    // Step 2: Create zip (no lock needed)
    let file = std::fs::File::create(&save_path).map_err(|e| e.to_string())?;
    let mut zip_writer = zip::ZipWriter::new(file);
    let options = zip::write::FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    zip_writer.start_file("keykeeper.db", options.clone())
        .map_err(|e| e.to_string())?;
    std::io::Write::write_all(&mut zip_writer, &db_data).map_err(|e| e.to_string())?;

    // Add images directory
    let images_dir = data_dir.join("images");
    if images_dir.exists() {
        add_dir_to_zip(&mut zip_writer, &images_dir, "images", &options)
            .map_err(|e| e.to_string())?;
    }

    zip_writer.finish().map_err(|e| e.to_string())?;

    // Step 3: Generate xlsx alongside zip
    let xlsx_path = std::path::PathBuf::from(&save_path)
        .with_extension("xlsx");
    let xlsx_data = generate_xlsx(&items_for_xlsx, &categories, &tags_with_count)?;
    std::fs::write(&xlsx_path, xlsx_data).map_err(|e| format!("保存 Excel 失败: {}", e))?;

    Ok(())
}

fn add_dir_to_zip(
    zip: &mut zip::ZipWriter<std::fs::File>,
    dir: &std::path::Path,
    prefix: &str,
    options: &zip::write::FileOptions<()>,
) -> std::io::Result<()> {
    if !dir.is_dir() {
        return Ok(());
    }
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        let zip_path = format!("{}/{}", prefix, name_str);
        if path.is_dir() {
            add_dir_to_zip(zip, &path, &zip_path, options)?;
        } else {
            zip.start_file(&zip_path, options.clone())?;
            let mut f = std::fs::File::open(&path)?;
            std::io::copy(&mut f, zip)?;
        }
    }
    Ok(())
}

fn generate_xlsx(
    items: &[(String, String, String, String, String, Option<String>, bool, i32, String, String, String)],
    categories: &[(String, String, Option<String>)],
    tags: &[(String, String, String, i32)],
) -> Result<Vec<u8>, String> {
    use rust_xlsxwriter::*;

    let mut workbook = Workbook::new();

    // --- Sheet 1: 条目列表 ---
    let sheet1 = workbook.add_worksheet();
    sheet1.set_name("条目列表").map_err(|e| e.to_string())?;

    let headers1 = ["标题", "类型", "内容", "预览", "分类", "收藏", "使用次数", "标签", "创建时间", "更新时间"];
    let header_format = Format::new().set_bold();
    for (col, h) in headers1.iter().enumerate() {
        sheet1.write_string_with_format(0, col as u16, *h, &header_format)
            .map_err(|e| e.to_string())?;
    }

    let cat_map: std::collections::HashMap<&str, &str> = categories.iter()
        .map(|(id, name, _)| (id.as_str(), name.as_str()))
        .collect();

    for (row, item) in items.iter().enumerate() {
        let r = (row + 1) as u32;
        let (_, title, typ, content, preview, cat_id, is_fav, usage, created, updated, tags_str) = item;

        let content_trunc = if content.len() > 32767 {
            format!("{}...（内容过长已截断）", &content[..32764])
        } else {
            content.clone()
        };

        let category_name = cat_id.as_ref()
            .and_then(|id| cat_map.get(id.as_str()))
            .unwrap_or(&"未分类")
            .to_string();

        sheet1.write_string(r, 0, truncate_str(title, 200)).map_err(|e| e.to_string())?;
        sheet1.write_string(r, 1, typ).map_err(|e| e.to_string())?;
        sheet1.write_string(r, 2, &content_trunc).map_err(|e| e.to_string())?;
        sheet1.write_string(r, 3, truncate_str(preview, 200)).map_err(|e| e.to_string())?;
        sheet1.write_string(r, 4, &category_name).map_err(|e| e.to_string())?;
        sheet1.write_string(r, 5, if *is_fav { "是" } else { "否" }).map_err(|e| e.to_string())?;
        sheet1.write_number(r, 6, *usage as f64).map_err(|e| e.to_string())?;
        sheet1.write_string(r, 7, tags_str).map_err(|e| e.to_string())?;
        sheet1.write_string(r, 8, created).map_err(|e| e.to_string())?;
        sheet1.write_string(r, 9, updated).map_err(|e| e.to_string())?;
    }

    // --- Sheet 2: 分类列表 ---
    let sheet2 = workbook.add_worksheet();
    sheet2.set_name("分类列表").map_err(|e| e.to_string())?;

    let headers2 = ["名称", "上级分类"];
    for (col, h) in headers2.iter().enumerate() {
        sheet2.write_string_with_format(0, col as u16, *h, &header_format)
            .map_err(|e| e.to_string())?;
    }

    let mut row_idx: u32 = 1;
    for (_, name, parent_id) in categories.iter() {
        if name == "全部" { continue; }
        let parent_name = parent_id.as_ref().and_then(|pid| cat_map.get(pid.as_str())).unwrap_or(&"-").to_string();
        sheet2.write_string(row_idx, 0, name).map_err(|e| e.to_string())?;
        sheet2.write_string(row_idx, 1, &parent_name).map_err(|e| e.to_string())?;
        row_idx += 1;
    }

    // --- Sheet 3: 标签列表 ---
    let sheet3 = workbook.add_worksheet();
    sheet3.set_name("标签列表").map_err(|e| e.to_string())?;

    let headers3 = ["名称", "颜色", "使用次数"];
    for (col, h) in headers3.iter().enumerate() {
        sheet3.write_string_with_format(0, col as u16, *h, &header_format)
            .map_err(|e| e.to_string())?;
    }

    for (row, (_, name, color, count)) in tags.iter().enumerate() {
        let r = (row + 1) as u32;
        sheet3.write_string(r, 0, name).map_err(|e| e.to_string())?;
        sheet3.write_string(r, 1, color).map_err(|e| e.to_string())?;
        sheet3.write_number(r, 2, *count as f64).map_err(|e| e.to_string())?;
    }

    workbook.save_to_buffer().map_err(|e| e.to_string())
}

fn truncate_str(s: &str, max: usize) -> String {
    if s.len() > max {
        format!("{}...", &s[..max])
    } else {
        s.to_string()
    }
}

#[tauri::command]
fn read_image(path: String) -> Result<String, String> {
    let path = std::path::PathBuf::from(&path);
    if !path.exists() {
        // Try data/images/ relative to app
        if let Ok(exe) = std::env::current_exe() {
            if let Some(parent) = exe.parent() {
                let fallback = parent.join("data").join("images").join(&path);
                if fallback.exists() {
                    let data = std::fs::read(&fallback).map_err(|e| e.to_string())?;
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
                    return Ok(format!("data:image/{};base64,{}",
                        fallback.extension().and_then(|e| e.to_str()).unwrap_or("png"),
                        b64));
                }
            }
        }
        return Err("文件不存在".into());
    }
    let data = std::fs::read(&path).map_err(|e| e.to_string())?;
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("png");
    let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
    Ok(format!("data:image/{};base64,{}", ext, b64))
}

#[tauri::command]
fn get_image_data(state: tauri::State<AppState>, id: String) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let (data, mime): (Vec<u8>, Option<String>) = db
        .query_row(
            "SELECT image_data, image_mime FROM items WHERE id = ?1 AND image_data IS NOT NULL",
            rusqlite::params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "图片数据不存在".to_string())?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
    let mime = mime.unwrap_or_else(|| "image/png".into());
    Ok(format!("data:{};base64,{}", mime, b64))
}

#[tauri::command]
fn import_data(
    state: tauri::State<AppState>,
    file_path: String,
) -> Result<(), String> {
    let data_dir = state.data_dir.clone();

    // Step 1: Swap old connection to a temp file to release locks on real DB
    let temp_db = data_dir.join("_import_temp_.db");
    {
        let mut db = state.db.lock().map_err(|e| e.to_string())?;
        // Checkpoint and close the old connection by replacing with a temp one
        db.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)").ok();
        let temp_conn = db::open_db(&temp_db).map_err(|e| e.to_string())?;
        *db = temp_conn;
    }
    // Old connection is now dropped, real DB files are free

    // Step 2: Extract zip
    let file = std::fs::File::open(&file_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let out_path = data_dir.join(entry.name());
        if let Some(parent) = out_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        if !entry.is_dir() {
            let mut out_file = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut out_file).map_err(|e| e.to_string())?;
        }
    }

    // Step 3: Clean up temp file
    std::fs::remove_file(&temp_db).ok();

    // Step 4: Open new connection to the real DB
    let db_path = resolve_db_path(&data_dir);
    // Remove stale WAL/SHM from old connection
    std::fs::remove_file(data_dir.join("keykeeper.db-wal")).ok();
    std::fs::remove_file(data_dir.join("keykeeper.db-shm")).ok();
    let new_conn = db::open_db(&db_path).map_err(|e| e.to_string())?;
    db::init_db(&new_conn).map_err(|e| e.to_string())?;

    // Step 5: Replace temp connection with real one
    if let Ok(mut db) = state.db.lock() {
        *db = new_conn;
    }

    Ok(())
}

#[tauri::command]
fn set_shortcut(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    shortcut: String,
) -> Result<(), String> {
    // Read old shortcut
    let old = state.config.lock()
        .map(|c| c.global_shortcut.clone())
        .map_err(|e| e.to_string())?;

    // Save new shortcut to config (memory + file) before trying to register
    {
        let data_dir = state.data_dir.clone();
        let config_path = data_dir.parent().unwrap_or(&data_dir).join("config.json");
        if let Ok(mut config) = state.config.lock() {
            config.global_shortcut = shortcut.clone();
            config.save(&config_path);
        }
    }

    // Unregister old shortcut
    if !old.is_empty() {
        app.global_shortcut().unregister(old.as_str()).ok();
    }
    // Register new shortcut
    if !shortcut.is_empty() {
        app.global_shortcut().register(shortcut.as_str()).ok();
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Initialize data dir and database
            let handle = app.handle();
            let data_dir = resolve_data_dir(handle);
            std::fs::create_dir_all(&data_dir).ok();
            let db_path = resolve_db_path(&data_dir);
            db::ensure_db_dir(&db_path).ok();
            let conn = db::open_db(&db_path).expect("Failed to open database");
            db::init_db(&conn).expect("Failed to initialize database");

            let config_path = resolve_config_path(handle);
            let config = AppConfig::load(&config_path);
            let shortcut_key = config.global_shortcut.clone();

            app.manage(AppState {
                db: Mutex::new(conn),
                config: Mutex::new(config),
                data_dir,
            });

            // Global shortcut - use config value
            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(move |app, _shortcut, event| {
                        if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                            toggle_window(app);
                        }
                    })
                    .build(),
            )?;
            if !shortcut_key.is_empty() {
                app.global_shortcut().register(shortcut_key.as_str()).ok();
            }

            // Intercept window close → hide to tray
            if let Some(window) = app.get_webview_window("main") {
                let win_id = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        win_id.hide().ok();
                    }
                });
            }

            // System tray
            let show = MenuItem::with_id(app, "show", "显示/隐藏", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "show" => toggle_window(app),
                        "quit" => app.exit(0),
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up, ..
                    } = event {
                        toggle_window(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            set_config,
            get_categories,
            add_category,
            delete_category,
            rename_category,
            reorder_items,
            move_item_category,
            get_items,
            add_item,
            update_item,
            save_image_file,
            delete_item,
            increment_usage,
            toggle_favorite,
            export_data,
            import_data,
            read_image,
            get_image_data,
            fetch_url_preview,
            set_shortcut,
            get_tags,
            get_tags_with_count,
            create_tag,
            update_tag,
            delete_tag,
            add_item_tag,
            remove_item_tag,
            get_item_tags,
            translate_text,
            add_translation_history,
            get_translation_history,
            clear_translation_history,
            suggest_category,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_db_path(dir: &std::path::Path) -> std::path::PathBuf {
        dir.join("keykeeper.db")
    }

    fn setup_test_db(dir: &std::path::Path) -> rusqlite::Connection {
        let db_path = test_db_path(dir);
        let conn = db::open_db(&db_path).expect("open test db");
        db::init_db(&conn).expect("init test db");

        // Insert test category
        conn.execute(
            "INSERT INTO categories (id, name, parent_id, sort_order, created_at) VALUES (?1, ?2, ?3, 0, datetime('now'))",
            rusqlite::params!["cat1", "技术", "root"],
        ).unwrap();
        conn.execute(
            "INSERT INTO categories (id, name, parent_id, sort_order, created_at) VALUES (?1, ?2, ?3, 0, datetime('now'))",
            rusqlite::params!["cat2", "生活", "root"],
        ).unwrap();

        // Insert test tags
        conn.execute(
            "INSERT INTO tags (id, name, color) VALUES (?1, ?2, ?3)",
            rusqlite::params!["tag1", "rust", "#4361ee"],
        ).unwrap();
        conn.execute(
            "INSERT INTO tags (id, name, color) VALUES (?1, ?2, ?3)",
            rusqlite::params!["tag2", "macos", "#e67e22"],
        ).unwrap();

        // Insert test items
        conn.execute(
            "INSERT INTO items (id, title, type, content, preview, category_id, is_favorite, usage_count, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, 5, datetime('now'), datetime('now'))",
            rusqlite::params!["item1", "测试条目", "url", "https://example.com", "示例预览", "cat1"],
        ).unwrap();
        conn.execute(
            "INSERT INTO items (id, title, type, content, preview, category_id, is_favorite, usage_count, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, 2, datetime('now'), datetime('now'))",
            rusqlite::params!["item2", "食谱", "text", "番茄炒蛋的做法", "简单好做", "cat2"],
        ).unwrap();

        // Link tags
        conn.execute(
            "INSERT INTO item_tags (item_id, tag_id) VALUES (?1, ?2)",
            rusqlite::params!["item1", "tag1"],
        ).unwrap();
        conn.execute(
            "INSERT INTO item_tags (item_id, tag_id) VALUES (?1, ?2)",
            rusqlite::params!["item1", "tag2"],
        ).unwrap();

        conn
    }

    #[test]
    fn test_export_import_roundtrip() {
        let tmp = std::env::temp_dir().join(format!("keykeeper_test_{}", std::process::id()));
        let src_dir = tmp.join("src");
        let dst_dir = tmp.join("dst");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::create_dir_all(&dst_dir).unwrap();

        // Setup source DB
        let conn = setup_test_db(&src_dir);

        // --- Export ---
        // Checkpoint WAL (same as export_data)
        conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)").unwrap();

        // Read DB into memory
        let db_path = test_db_path(&src_dir);
        let db_data = std::fs::read(&db_path).unwrap();

        // Write zip
        let zip_path = tmp.join("backup.zip");
        {
            let file = std::fs::File::create(&zip_path).unwrap();
            let mut zip = zip::ZipWriter::new(file);
            let options: zip::write::FileOptions<()> = zip::write::FileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated);
            zip.start_file("keykeeper.db", options).unwrap();
            std::io::Write::write_all(&mut zip, &db_data).unwrap();
            zip.finish().unwrap();
        }

        // Generate xlsx (test the function)
        let items: Vec<(String, String, String, String, String, Option<String>, bool, i32, String, String, String)> = Vec::new();
        let categories: Vec<(String, String, Option<String>)> = Vec::new();
        let tags: Vec<(String, String, String, i32)> = Vec::new();
        let xlsx_data = generate_xlsx(&items, &categories, &tags).unwrap();
        assert!(!xlsx_data.is_empty(), "xlsx should not be empty");

        // Drop connection before import
        drop(conn);

        // --- Import ---
        let zip_file = std::fs::File::open(&zip_path).unwrap();
        let mut archive = zip::ZipArchive::new(zip_file).unwrap();

        for i in 0..archive.len() {
            let mut entry = archive.by_index(i).unwrap();
            let out_path = dst_dir.join(entry.name());
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent).unwrap();
            }
            if !entry.is_dir() {
                let mut out_file = std::fs::File::create(&out_path).unwrap();
                std::io::copy(&mut entry, &mut out_file).unwrap();
            }
        }

        // Open imported DB
        let new_db_path = test_db_path(&dst_dir);
        let new_conn = rusqlite::Connection::open(&new_db_path).unwrap();

        // Verify data
        let count: i32 = new_conn.query_row("SELECT COUNT(*) FROM items", [], |row| row.get(0)).unwrap();
        assert_eq!(count, 2, "should have 2 items");

        let cat_count: i32 = new_conn.query_row(
            "SELECT COUNT(*) FROM categories WHERE id NOT IN ('root')",
            [], |row| row.get(0),
        ).unwrap();
        assert_eq!(cat_count, 2, "should have 2 non-root categories");

        let tag_count: i32 = new_conn.query_row("SELECT COUNT(*) FROM tags", [], |row| row.get(0)).unwrap();
        assert_eq!(tag_count, 2, "should have 2 tags");

        let tag_link_count: i32 = new_conn.query_row("SELECT COUNT(*) FROM item_tags", [], |row| row.get(0)).unwrap();
        assert_eq!(tag_link_count, 2, "should have 2 tag links");

        // Verify specific item data
        let (title, content): (String, String) = new_conn.query_row(
            "SELECT title, content FROM items WHERE id = 'item1'",
            [], |row| Ok((row.get(0)?, row.get(1)?)),
        ).unwrap();
        assert_eq!(title, "测试条目");
        assert_eq!(content, "https://example.com");

        // Clean up
        drop(new_conn);
        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn test_generate_xlsx_valid() {
        let items = vec![
            ("id1".into(), "测试文章".into(), "text".into(), "内容正文".into(), "摘要".into(), Some("cat1".into()), true, 10, "2025-01-01".into(), "2025-06-01".into(), "rust, macos".into()),
        ];
        let categories = vec![
            ("cat1".into(), "技术".into(), Some("root".into())),
            ("root".into(), "全部".into(), None),
        ];
        let tags = vec![
            ("t1".into(), "rust".into(), "#4361ee".into(), 5),
        ];

        let data = generate_xlsx(&items, &categories, &tags).unwrap();
        assert!(!data.is_empty(), "xlsx should not be empty");
        // xlsx files start with PK\x03\x04
        assert_eq!(&data[0..4], [0x50, 0x4B, 0x03, 0x04], "should have zip magic bytes");
    }
}
