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

#[derive(Serialize, Deserialize, Clone)]
struct Tag {
    id: String,
    name: String,
    color: String,
}

#[derive(Serialize)]
struct UrlPreview {
    title: Option<String>,
    description: Option<String>,
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
                            return collect_items(items);
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
            return collect_items(rows);
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
    collect_items(rows)
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
    }))
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
    let file = std::fs::File::create(&save_path).map_err(|e| e.to_string())?;
    let mut zip_writer = zip::ZipWriter::new(file);
    let options = zip::write::FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    // Add database
    let db_path = data_dir.join("keykeeper.db");
    if db_path.exists() {
        zip_writer.start_file("keykeeper.db", options.clone())
            .map_err(|e| e.to_string())?;
        let mut db_file = std::fs::File::open(&db_path).map_err(|e| e.to_string())?;
        std::io::copy(&mut db_file, &mut zip_writer).map_err(|e| e.to_string())?;
    }

    // Add WAL and SHM if they exist
    for ext in ["db-wal", "db-shm"] {
        let path = data_dir.join(format!("keykeeper.{}", ext));
        if path.exists() {
            zip_writer.start_file(format!("keykeeper.{}", ext), options.clone())
                .map_err(|e| e.to_string())?;
            let mut f = std::fs::File::open(&path).map_err(|e| e.to_string())?;
            std::io::copy(&mut f, &mut zip_writer).map_err(|e| e.to_string())?;
        }
    }

    // Add images directory
    let images_dir = data_dir.join("images");
    if images_dir.exists() {
        add_dir_to_zip(&mut zip_writer, &images_dir, "images", &options)
            .map_err(|e| e.to_string())?;
    }

    zip_writer.finish().map_err(|e| e.to_string())?;
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

    // Read the zip file
    let file = std::fs::File::open(&file_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    // Extract all files
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let out_path = data_dir.join(entry.name());
        if let Some(parent) = out_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        if !entry.is_dir() {
            let mut out_file = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut out_file).map_err(|e| e.to_string())?;
        }
    }

    // Reopen database to pick up changes
    let db_path = resolve_db_path(&data_dir);
    let new_conn = db::open_db(&db_path).map_err(|e| e.to_string())?;
    db::init_db(&new_conn).map_err(|e| e.to_string())?;

    // Replace the connection in state
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
            create_tag,
            delete_tag,
            add_item_tag,
            remove_item_tag,
            get_item_tags,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
