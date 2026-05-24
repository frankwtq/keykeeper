use std::path::PathBuf;
use rusqlite::{Connection, Result};

pub fn open_db(db_path: &PathBuf) -> Result<Connection> {
    let conn = Connection::open(db_path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
    Ok(conn)
}

pub fn init_db(conn: &Connection) -> Result<()> {
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS categories (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            parent_id   TEXT,
            sort_order  INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS items (
            id          TEXT PRIMARY KEY,
            title       TEXT NOT NULL DEFAULT '',
            type        TEXT NOT NULL CHECK(type IN ('url','text','image','table')),
            content     TEXT NOT NULL DEFAULT '',
            preview     TEXT NOT NULL DEFAULT '',
            category_id TEXT,
            is_favorite INTEGER NOT NULL DEFAULT 0,
            usage_count INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL,
            image_data  BLOB,
            image_mime  TEXT,
            FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_items_category ON items(category_id);
        CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
        CREATE INDEX IF NOT EXISTS idx_items_favorite ON items(is_favorite);
        CREATE INDEX IF NOT EXISTS idx_items_usage ON items(usage_count DESC);

        CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);

        INSERT OR IGNORE INTO categories (id, name, parent_id, sort_order, created_at)
        VALUES ('root', '全部', NULL, 0, datetime('now'));

        CREATE TABLE IF NOT EXISTS tags (
            id      TEXT PRIMARY KEY,
            name    TEXT NOT NULL UNIQUE,
            color   TEXT NOT NULL DEFAULT '#4361ee'
        );

        CREATE TABLE IF NOT EXISTS item_tags (
            item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
            tag_id  TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            PRIMARY KEY (item_id, tag_id)
        );
    ")?;

    // Migration: add image columns for existing databases
    let has_image_data: bool = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('items') WHERE name='image_data'",
        [],
        |row| row.get(0),
    )?;
    if !has_image_data {
        conn.execute_batch("
            ALTER TABLE items ADD COLUMN image_data BLOB;
            ALTER TABLE items ADD COLUMN image_mime TEXT;
        ")?;
    }

    // FTS5 full-text search
    let has_fts: bool = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='items_fts'",
        [],
        |row| row.get(0),
    )?;
    if !has_fts {
        conn.execute_batch("
            CREATE VIRTUAL TABLE items_fts USING fts5(
                title, content, preview,
                content='items',
                content_rowid='rowid',
                tokenize='unicode61'
            );
        ")?;
    }

    // Migration: add sort_order column
    let has_sort_order: bool = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('items') WHERE name='sort_order'",
        [],
        |row| row.get(0),
    )?;
    if !has_sort_order {
        conn.execute_batch("
            ALTER TABLE items ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
            UPDATE items SET sort_order = COALESCE(CAST(strftime('%s', created_at) AS INTEGER), CAST(strftime('%s', 'now') AS INTEGER));
        ")?;
    }
    Ok(())
}

pub fn ensure_db_dir(db_path: &PathBuf) -> std::io::Result<()> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    Ok(())
}
