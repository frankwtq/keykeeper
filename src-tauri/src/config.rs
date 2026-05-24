use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub max_category_depth: i32,
    pub global_shortcut: String,
    pub auto_start: bool,
    pub window: WindowConfig,
    pub translation_history_max: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WindowConfig {
    pub width: f64,
    pub height: f64,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            max_category_depth: 3,
            global_shortcut: "Alt+Space".to_string(),
            auto_start: false,
            window: WindowConfig {
                width: 900.0,
                height: 700.0,
            },
            translation_history_max: 50,
        }
    }
}

impl AppConfig {
    pub fn load(config_path: &PathBuf) -> Self {
        if config_path.exists() {
            match fs::read_to_string(config_path) {
                Ok(content) => {
                    serde_json::from_str(&content).unwrap_or_default()
                }
                Err(_) => Self::default(),
            }
        } else {
            let config = Self::default();
            config.save(config_path);
            config
        }
    }

    pub fn save(&self, config_path: &PathBuf) {
        if let Some(parent) = config_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(content) = serde_json::to_string_pretty(self) {
            let _ = fs::write(config_path, content);
        }
    }
}
