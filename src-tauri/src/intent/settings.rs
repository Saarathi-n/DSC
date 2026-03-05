use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

/// Flat settings struct mirroring the frontend's AppSettings
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppSettings {
    #[serde(rename = "nvidiaApiKey",      default)] pub nvidia_api_key:   String,
    #[serde(rename = "openaiApiKey",      default)] pub openai_api_key:   String,
    #[serde(rename = "anthropicApiKey",   default)] pub anthropic_api_key: String,
    #[serde(rename = "groqApiKey",        default)] pub groq_api_key: String,
    #[serde(rename = "googleClientId",    default)] pub google_client_id: String,
    #[serde(rename = "googleClientSecret",default)] pub google_client_secret: String,
    #[serde(rename = "defaultModel",      default)] pub default_model:    String,
    #[serde(rename = "aiProvider",        default = "default_ai_provider")] pub ai_provider: String,
    #[serde(rename = "trackApps",         default = "default_true")] pub track_apps:  bool,
    #[serde(rename = "trackScreenOcr",    default)] pub track_screen_ocr: bool,
    #[serde(rename = "trackMedia",        default = "default_true")] pub track_media: bool,
    #[serde(rename = "trackBrowser",      default)] pub track_browser:     bool,
    #[serde(rename = "dataRetentionDays", default = "default_30")]   pub data_retention_days: i64,
    #[serde(rename = "enableStartup",     default = "default_true")] pub enable_startup: bool,
    #[serde(rename = "startupBehavior",   default = "default_startup_behavior")] pub startup_behavior: String,
    #[serde(rename = "minimizeToTray",    default = "default_true")] pub minimize_to_tray: bool,
    #[serde(rename = "closeToTray",       default = "default_true")] pub close_to_tray: bool,
    #[serde(rename = "maxStorageMb",      default = "default_512")] pub max_storage_mb: i64,
    #[serde(rename = "autoCleanup",       default = "default_true")] pub auto_cleanup: bool,
    #[serde(rename = "enableNotifications", default = "default_true")] pub enable_notifications: bool,
    #[serde(rename = "enableReminders",   default)] pub enable_reminders: bool,
    #[serde(rename = "enableSummaryAlerts", default = "default_true")] pub enable_summary_alerts: bool,
    #[serde(rename = "compactMode",       default)] pub compact_mode: bool,
    #[serde(rename = "fontScale",         default = "default_font_scale")] pub font_scale: f32,
    #[serde(rename = "colorScheme",       default = "default_color_scheme")] pub color_scheme: String,
    #[serde(rename = "locale",            default = "default_locale")] pub locale: String,
    #[serde(rename = "dateFormat",        default = "default_date_format")] pub date_format: String,
}

fn default_true()  -> bool { true  }
fn default_30()    -> i64  { 30    }
fn default_512()   -> i64  { 512   }
fn default_startup_behavior() -> String { "minimized_to_tray".to_string() }
fn default_ai_provider() -> String { "nvidia".to_string() }
fn default_font_scale() -> f32 { 1.0 }
fn default_color_scheme() -> String { "dark".to_string() }
fn default_locale() -> String { "en-US".to_string() }
fn default_date_format() -> String { "YYYY-MM-DD".to_string() }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatTurn {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyValidationResult {
    pub valid: bool,
    pub provider: String,
    pub message: String,
}

fn load_settings_inner(conn: &rusqlite::Connection) -> AppSettings {
    let mut s = AppSettings::default();

    let pairs = [
        ("nvidia_api_key",        &mut s.nvidia_api_key         as *mut String),
        ("openai_api_key",        &mut s.openai_api_key         as *mut String),
        ("anthropic_api_key",     &mut s.anthropic_api_key      as *mut String),
        ("groq_api_key",          &mut s.groq_api_key           as *mut String),
        ("google_client_id",      &mut s.google_client_id       as *mut String),
        ("google_client_secret",  &mut s.google_client_secret   as *mut String),
        ("default_model",         &mut s.default_model          as *mut String),
        ("ai_provider",           &mut s.ai_provider            as *mut String),
        ("color_scheme",          &mut s.color_scheme           as *mut String),
        ("locale",                &mut s.locale                 as *mut String),
        ("date_format",           &mut s.date_format            as *mut String),
    ];

    for (key, ptr) in &pairs {
        if let Ok(val) = conn.query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            [*key],
            |row| row.get::<_, String>(0),
        ) {
            unsafe { **ptr = val; }
        }
    }

    // Bool + int settings
    let read_bool = |key: &str, default: bool| -> bool {
        conn.query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            [key], |row| row.get::<_, String>(0),
        ).map(|v| v == "true").unwrap_or(default)
    };
    let read_i64 = |key: &str, default: i64| -> i64 {
        conn.query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            [key], |row| row.get::<_, String>(0),
        ).ok().and_then(|v| v.parse().ok()).unwrap_or(default)
    };

    s.track_apps         = read_bool("track_apps",          true);
    s.track_screen_ocr   = read_bool("track_screen_ocr",    false);
    s.track_media        = read_bool("track_media",         true);
    s.track_browser      = read_bool("track_browser",       false);
    s.data_retention_days = read_i64("data_retention_days", 30);
    s.enable_startup     = read_bool("enable_startup",      true);
    s.minimize_to_tray   = read_bool("minimize_to_tray",    true);
    s.close_to_tray      = read_bool("close_to_tray",       true);
    s.max_storage_mb     = read_i64("max_storage_mb",       512);
    s.auto_cleanup       = read_bool("auto_cleanup",        true);
    s.enable_notifications = read_bool("enable_notifications", true);
    s.enable_reminders     = read_bool("enable_reminders", false);
    s.enable_summary_alerts = read_bool("enable_summary_alerts", true);
    s.compact_mode         = read_bool("compact_mode", false);
    s.font_scale           = read_i64("font_scale_percent", 100) as f32 / 100.0;
    s.startup_behavior = conn.query_row(
        "SELECT value FROM app_settings WHERE key = 'startup_behavior'",
        [],
        |row| row.get::<_, String>(0),
    ).unwrap_or_else(|_| "minimized_to_tray".to_string());
    s
}

// ─── Commands ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn settings_get(app_handle: AppHandle) -> Result<AppSettings, String> {
    let conn = crate::intent::db::open(&app_handle)?;
    Ok(load_settings_inner(&conn))
}

#[tauri::command]
pub async fn settings_save(
    app_handle: AppHandle,
    settings: AppSettings,
) -> Result<bool, String> {
    let conn = crate::intent::db::open(&app_handle)?;
    let now = Utc::now().timestamp();

    let pairs: &[(&str, String)] = &[
        ("nvidia_api_key",       settings.nvidia_api_key.clone()),
        ("openai_api_key",       settings.openai_api_key.clone()),
        ("anthropic_api_key",    settings.anthropic_api_key.clone()),
        ("groq_api_key",         settings.groq_api_key.clone()),
        ("google_client_id",     settings.google_client_id.clone()),
        ("google_client_secret", settings.google_client_secret.clone()),
        ("default_model",        settings.default_model.clone()),
        ("ai_provider",          settings.ai_provider.clone()),
        ("track_apps",           settings.track_apps.to_string()),
        ("track_screen_ocr",     settings.track_screen_ocr.to_string()),
        ("track_media",          settings.track_media.to_string()),
        ("track_browser",        settings.track_browser.to_string()),
        ("data_retention_days",  settings.data_retention_days.to_string()),
        ("enable_startup",       settings.enable_startup.to_string()),
        ("startup_behavior",     settings.startup_behavior.clone()),
        ("minimize_to_tray",     settings.minimize_to_tray.to_string()),
        ("close_to_tray",        settings.close_to_tray.to_string()),
        ("max_storage_mb",       settings.max_storage_mb.to_string()),
        ("auto_cleanup",         settings.auto_cleanup.to_string()),
        ("enable_notifications", settings.enable_notifications.to_string()),
        ("enable_reminders",     settings.enable_reminders.to_string()),
        ("enable_summary_alerts", settings.enable_summary_alerts.to_string()),
        ("compact_mode",         settings.compact_mode.to_string()),
        ("font_scale_percent",   ((settings.font_scale * 100.0).round() as i64).to_string()),
        ("color_scheme",         settings.color_scheme.clone()),
        ("locale",               settings.locale.clone()),
        ("date_format",          settings.date_format.clone()),
    ];

    for (key, val) in pairs {
        conn.execute(
            "INSERT INTO app_settings (key, value, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            rusqlite::params![key, val, now],
        ).map_err(|e| e.to_string())?;
    }

    if settings.auto_cleanup {
        let _ = crate::intent::storage::enforce_max_storage_mb(&app_handle, settings.max_storage_mb);
    }

    #[cfg(all(target_os = "windows", not(debug_assertions)))]
    {
        if settings.enable_startup {
            let _ = app_handle.autolaunch().enable();
        } else {
            let _ = app_handle.autolaunch().disable();
        }
    }

    Ok(true)
}

#[tauri::command]
pub async fn settings_validate_api_key(
    app_handle: AppHandle,
    provider: String,
    api_key: Option<String>,
) -> Result<KeyValidationResult, String> {
    let provider_norm = provider.trim().to_lowercase();
    let key = if let Some(k) = api_key.filter(|s| !s.trim().is_empty()) {
        k
    } else {
        let conn = crate::intent::db::open(&app_handle)?;
        let setting_key = match provider_norm.as_str() {
            "openai" => "openai_api_key",
            "anthropic" => "anthropic_api_key",
            "groq" => "groq_api_key",
            _ => "nvidia_api_key",
        };
        conn.query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            [setting_key],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .unwrap_or_default()
    };

    if key.trim().is_empty() {
        return Ok(KeyValidationResult {
            valid: false,
            provider: provider_norm,
            message: "API key is empty".to_string(),
        });
    }

    let (url, auth_header) = match provider_norm.as_str() {
        "openai" => ("https://api.openai.com/v1/models", format!("Bearer {}", key)),
        "anthropic" => ("https://api.anthropic.com/v1/models", key.clone()),
        "groq" => ("https://api.groq.com/openai/v1/models", format!("Bearer {}", key)),
        _ => ("https://integrate.api.nvidia.com/v1/models", format!("Bearer {}", key)),
    };

    let mut request = reqwest::Client::new().get(url);
    request = if provider_norm == "anthropic" {
        request
            .header("x-api-key", auth_header)
            .header("anthropic-version", "2023-06-01")
    } else {
        request.header("Authorization", auth_header)
    };

    let response = request.send().await.map_err(|e| e.to_string())?;
    let valid = response.status().is_success();
    let message = if valid {
        "API key is valid".to_string()
    } else {
        format!("Validation failed with status {}", response.status())
    };

    Ok(KeyValidationResult {
        valid,
        provider: provider_norm,
        message,
    })
}

#[tauri::command]
pub async fn settings_get_nvidia_models(
    app_handle: AppHandle,
    api_key: Option<String>,
) -> Result<Vec<ModelInfo>, String> {
    let key = if let Some(k) = api_key.filter(|s| !s.trim().is_empty()) {
        k
    } else {
        let conn = crate::intent::db::open(&app_handle)?;
        conn.query_row(
            "SELECT value FROM app_settings WHERE key = 'nvidia_api_key'",
            [], |row| row.get::<_, String>(0),
        ).ok().filter(|s| !s.is_empty())
        .or_else(|| std::env::var("NVIDIA_API_KEY").ok().filter(|s| !s.is_empty()))
        .ok_or_else(|| "Missing NVIDIA API key".to_string())?
    };

    let value: serde_json::Value = reqwest::Client::new()
        .get("https://integrate.api.nvidia.com/v1/models")
        .header("Authorization", format!("Bearer {}", key))
        .send().await.map_err(|e| e.to_string())?
        .json().await.map_err(|e| e.to_string())?;

    let mut models: Vec<ModelInfo> = (value.get("data")
        .and_then(serde_json::Value::as_array)
        .cloned()
        .unwrap_or_default())
        .into_iter()
        .filter_map(|item| item.get("id").and_then(serde_json::Value::as_str).map(|id| id.to_string()))
        .map(|id| ModelInfo { id })
        .collect();

    models.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(models)
}

#[tauri::command]
pub async fn settings_nvidia_chat_completion(
    app_handle: AppHandle,
    model: String,
    messages: Vec<ChatTurn>,
    max_tokens: Option<u32>,
    temperature: Option<f32>,
) -> Result<Value, String> {
    let key = {
        let conn = crate::intent::db::open(&app_handle)?;
        conn.query_row(
            "SELECT value FROM app_settings WHERE key = 'nvidia_api_key'",
            [], |row| row.get::<_, String>(0),
        ).ok().filter(|s| !s.is_empty())
        .or_else(|| std::env::var("NVIDIA_API_KEY").ok().filter(|s| !s.is_empty()))
        .ok_or_else(|| "Missing NVIDIA API key".to_string())?
    };

    let payload = serde_json::json!({
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens.unwrap_or(1024),
        "temperature": temperature.unwrap_or(0.7),
        "stream": false
    });

    let response = reqwest::Client::new()
        .post("https://integrate.api.nvidia.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", key))
        .json(&payload)
        .send().await.map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("NVIDIA API {} — {}", status, &text[..text.len().min(400)]));
    }

    response.json::<Value>().await.map_err(|e| e.to_string())
}
