use serde::Serialize;
use serde_json::{json, Value};
use std::fs;
use tauri::AppHandle;

#[derive(Debug, Serialize)]
pub struct StorageStats {
    #[serde(rename = "dbPath")]
    pub db_path: String,
    #[serde(rename = "totalSizeBytes")]
    pub total_size_bytes: i64,
    #[serde(rename = "activitiesCount")]
    pub activities_count: i64,
    #[serde(rename = "chatMessagesCount")]
    pub chat_messages_count: i64,
    #[serde(rename = "diaryEntriesCount")]
    pub diary_entries_count: i64,
    #[serde(rename = "codeEventsCount")]
    pub code_events_count: i64,
    #[serde(rename = "snapshotsCount")]
    pub snapshots_count: i64,
}

fn db_size_bytes(app: &AppHandle) -> Result<i64, String> {
    let path = crate::intent::db::db_path(app)?;
    Ok(path.metadata().map(|m| m.len() as i64).unwrap_or(0))
}

fn count(conn: &rusqlite::Connection, table: &str) -> i64 {
    let sql = format!("SELECT COUNT(*) FROM {}", table);
    conn.query_row(&sql, [], |row| row.get::<_, i64>(0)).unwrap_or(0)
}

#[tauri::command]
pub async fn storage_get_stats(app_handle: AppHandle) -> Result<StorageStats, String> {
    let conn = crate::intent::db::open(&app_handle)?;
    let db_path = crate::intent::db::db_path(&app_handle)?;

    Ok(StorageStats {
        db_path: db_path.to_string_lossy().to_string(),
        total_size_bytes: db_size_bytes(&app_handle)?,
        activities_count: count(&conn, "activities"),
        chat_messages_count: count(&conn, "chat_messages"),
        diary_entries_count: count(&conn, "diary_entries"),
        code_events_count: count(&conn, "code_file_events"),
        snapshots_count: count(&conn, "dashboard_snapshots"),
    })
}

#[tauri::command]
pub async fn storage_clear_all(app_handle: AppHandle) -> Result<bool, String> {
    let conn = crate::intent::db::open(&app_handle)?;

    conn.execute_batch(
        "
        DELETE FROM activities;
        DELETE FROM code_file_events;
        DELETE FROM chat_messages;
        DELETE FROM chat_sessions;
        DELETE FROM diary_entries;
        DELETE FROM dashboard_snapshots;
        PRAGMA wal_checkpoint(TRUNCATE);
        VACUUM;
        ",
    )
    .map_err(|e| e.to_string())?;

    Ok(true)
}

#[tauri::command]
pub async fn storage_export_data(app_handle: AppHandle, file_path: String) -> Result<bool, String> {
    let conn = crate::intent::db::open(&app_handle)?;
    let export = json!({
        "version": 1,
        "exportedAt": chrono::Utc::now().timestamp(),
        "activities": dump_table(&conn, "activities")?,
        "chatSessions": dump_table(&conn, "chat_sessions")?,
        "chatMessages": dump_table(&conn, "chat_messages")?,
        "diaryEntries": dump_table(&conn, "diary_entries")?,
        "codeEvents": dump_table(&conn, "code_file_events")?,
        "dashboardSnapshots": dump_table(&conn, "dashboard_snapshots")?,
        "appSettings": dump_table(&conn, "app_settings")?,
    });

    let payload = serde_json::to_string_pretty(&export).map_err(|e| e.to_string())?;
    fs::write(file_path, payload).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub async fn storage_import_data(
    app_handle: AppHandle,
    file_path: String,
    replace_existing: Option<bool>,
) -> Result<bool, String> {
    let content = fs::read_to_string(file_path).map_err(|e| e.to_string())?;
    let parsed: Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let replace = replace_existing.unwrap_or(true);
    let conn = crate::intent::db::open(&app_handle)?;

    if replace {
        conn.execute_batch(
            "
            DELETE FROM activities;
            DELETE FROM code_file_events;
            DELETE FROM chat_messages;
            DELETE FROM chat_sessions;
            DELETE FROM diary_entries;
            DELETE FROM dashboard_snapshots;
            ",
        )
        .map_err(|e| e.to_string())?;
    }

    import_activities(&conn, parsed.get("activities").and_then(Value::as_array))?;
    import_chat_sessions(&conn, parsed.get("chatSessions").and_then(Value::as_array))?;
    import_chat_messages(&conn, parsed.get("chatMessages").and_then(Value::as_array))?;
    import_diary_entries(&conn, parsed.get("diaryEntries").and_then(Value::as_array))?;
    import_code_events(&conn, parsed.get("codeEvents").and_then(Value::as_array))?;
    import_dashboard_snapshots(&conn, parsed.get("dashboardSnapshots").and_then(Value::as_array))?;
    import_settings(&conn, parsed.get("appSettings").and_then(Value::as_array))?;

    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
        .map_err(|e| e.to_string())?;
    Ok(true)
}

pub fn enforce_max_storage_mb(app_handle: &AppHandle, max_storage_mb: i64) -> Result<bool, String> {
    if max_storage_mb <= 0 {
        return Ok(false);
    }

    let target_bytes = max_storage_mb * 1024 * 1024;
    let conn = crate::intent::db::open(app_handle)?;
    let mut current_size = db_size_bytes(app_handle)?;

    if current_size <= target_bytes {
        return Ok(false);
    }

    for _ in 0..20 {
        conn.execute(
            "DELETE FROM activities WHERE id IN (SELECT id FROM activities ORDER BY start_time ASC LIMIT 5000)",
            [],
        )
        .map_err(|e| e.to_string())?;

        conn.execute(
            "DELETE FROM code_file_events WHERE id IN (SELECT id FROM code_file_events ORDER BY detected_at ASC LIMIT 5000)",
            [],
        )
        .map_err(|e| e.to_string())?;

        conn.execute(
            "DELETE FROM chat_messages WHERE id IN (SELECT id FROM chat_messages ORDER BY created_at ASC LIMIT 3000)",
            [],
        )
        .map_err(|e| e.to_string())?;

        conn.execute(
            "DELETE FROM diary_entries WHERE id IN (SELECT id FROM diary_entries ORDER BY created_at ASC LIMIT 1000)",
            [],
        )
        .map_err(|e| e.to_string())?;

        conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;")
            .map_err(|e| e.to_string())?;

        current_size = db_size_bytes(app_handle)?;
        if current_size <= target_bytes {
            return Ok(true);
        }

        if count(&conn, "activities") == 0 && count(&conn, "code_file_events") == 0 && count(&conn, "chat_messages") == 0 {
            break;
        }
    }

    Ok(current_size < db_size_bytes(app_handle)?)
}

fn dump_table(conn: &rusqlite::Connection, table: &str) -> Result<Vec<Value>, String> {
    let sql = format!("SELECT * FROM {}", table);
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let col_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let rows = stmt
        .query_map([], |row| {
            let mut obj = serde_json::Map::new();
            for (idx, name) in col_names.iter().enumerate() {
                let val = match row.get_ref(idx)? {
                    rusqlite::types::ValueRef::Null => Value::Null,
                    rusqlite::types::ValueRef::Integer(i) => json!(i),
                    rusqlite::types::ValueRef::Real(f) => json!(f),
                    rusqlite::types::ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).to_string()),
                    rusqlite::types::ValueRef::Blob(b) => Value::Array(b.iter().map(|v| json!(v)).collect()),
                };
                obj.insert(name.clone(), val);
            }
            Ok(Value::Object(obj))
        })
        .map_err(|e| e.to_string())?;

    Ok(rows.filter_map(|r| r.ok()).collect())
}

fn as_i64(v: Option<&Value>) -> i64 {
    v.and_then(Value::as_i64).unwrap_or(0)
}

fn as_string(v: Option<&Value>) -> String {
    v.and_then(Value::as_str).unwrap_or_default().to_string()
}

fn import_activities(conn: &rusqlite::Connection, items: Option<&Vec<Value>>) -> Result<(), String> {
    let Some(items) = items else { return Ok(()); };
    for item in items {
        conn.execute(
            "INSERT OR REPLACE INTO activities (id, app_name, app_hash, window_title, window_title_hash, category_id, start_time, end_time, duration_seconds, metadata)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            rusqlite::params![
                as_i64(item.get("id")),
                as_string(item.get("app_name")),
                as_i64(item.get("app_hash")),
                as_string(item.get("window_title")),
                as_i64(item.get("window_title_hash")),
                as_i64(item.get("category_id")),
                as_i64(item.get("start_time")),
                as_i64(item.get("end_time")),
                as_i64(item.get("duration_seconds")),
                item.get("metadata").and_then(|v| serde_json::to_vec(v).ok()),
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn import_chat_sessions(conn: &rusqlite::Connection, items: Option<&Vec<Value>>) -> Result<(), String> {
    let Some(items) = items else { return Ok(()); };
    for item in items {
        conn.execute(
            "INSERT OR REPLACE INTO chat_sessions (id, title, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![
                as_string(item.get("id")),
                as_string(item.get("title")),
                as_i64(item.get("created_at")),
                as_i64(item.get("updated_at")),
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn import_chat_messages(conn: &rusqlite::Connection, items: Option<&Vec<Value>>) -> Result<(), String> {
    let Some(items) = items else { return Ok(()); };
    for item in items {
        conn.execute(
            "INSERT OR REPLACE INTO chat_messages (id, session_id, role, content, created_at, agent_steps, activities, metadata)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                as_i64(item.get("id")),
                as_string(item.get("session_id")),
                as_string(item.get("role")),
                as_string(item.get("content")),
                as_i64(item.get("created_at")),
                item.get("agent_steps").and_then(Value::as_str).map(|s| s.to_string()),
                item.get("activities").and_then(Value::as_str).map(|s| s.to_string()),
                item.get("metadata").and_then(Value::as_str).map(|s| s.to_string()),
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn import_diary_entries(conn: &rusqlite::Connection, items: Option<&Vec<Value>>) -> Result<(), String> {
    let Some(items) = items else { return Ok(()); };
    for item in items {
        conn.execute(
            "INSERT OR REPLACE INTO diary_entries (id, date, content, is_ai_generated, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                as_string(item.get("id")),
                as_string(item.get("date")),
                as_string(item.get("content")),
                as_i64(item.get("is_ai_generated")),
                as_i64(item.get("created_at")),
                as_i64(item.get("updated_at")),
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn import_code_events(conn: &rusqlite::Connection, items: Option<&Vec<Value>>) -> Result<(), String> {
    let Some(items) = items else { return Ok(()); };
    for item in items {
        conn.execute(
            "INSERT OR REPLACE INTO code_file_events (id, path, project_root, entity_type, change_type, content_preview, detected_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                as_i64(item.get("id")),
                as_string(item.get("path")),
                as_string(item.get("project_root")),
                as_string(item.get("entity_type")),
                as_string(item.get("change_type")),
                item.get("content_preview").and_then(Value::as_str).map(|s| s.to_string()),
                as_i64(item.get("detected_at")),
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn import_dashboard_snapshots(conn: &rusqlite::Connection, items: Option<&Vec<Value>>) -> Result<(), String> {
    let Some(items) = items else { return Ok(()); };
    for item in items {
        conn.execute(
            "INSERT OR REPLACE INTO dashboard_snapshots (date_key, summary_json, updated_at) VALUES (?1, ?2, ?3)",
            rusqlite::params![
                as_string(item.get("date_key")),
                as_string(item.get("summary_json")),
                as_i64(item.get("updated_at")),
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn import_settings(conn: &rusqlite::Connection, items: Option<&Vec<Value>>) -> Result<(), String> {
    let Some(items) = items else { return Ok(()); };
    for item in items {
        conn.execute(
            "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?1, ?2, ?3)",
            rusqlite::params![
                as_string(item.get("key")),
                as_string(item.get("value")),
                as_i64(item.get("updated_at")),
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}
