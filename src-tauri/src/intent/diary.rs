use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiaryEntry {
    pub id: String,
    pub date: String,
    pub content: String,
    #[serde(rename = "isAiGenerated")]
    pub is_ai_generated: bool,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
    #[serde(rename = "updatedAt")]
    pub updated_at: i64,
}

// ─── sync helpers ─────────────────────────────────────────────────────────────

fn db_get_entries(conn: &rusqlite::Connection, date: Option<&str>) -> Result<Vec<DiaryEntry>, String> {
    if let Some(d) = date {
        let mut stmt = conn.prepare(
            "SELECT id, date, content, is_ai_generated, created_at, updated_at
             FROM diary_entries WHERE date = ?1 ORDER BY created_at DESC",
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(rusqlite::params![d], |row| Ok(DiaryEntry {
            id:              row.get(0)?,
            date:            row.get(1)?,
            content:         row.get(2)?,
            is_ai_generated: row.get::<_, i64>(3)? != 0,
            created_at:      row.get(4)?,
            updated_at:      row.get(5)?,
        })).map_err(|e| e.to_string())?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, date, content, is_ai_generated, created_at, updated_at
             FROM diary_entries ORDER BY date DESC, created_at DESC",
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| Ok(DiaryEntry {
            id:              row.get(0)?,
            date:            row.get(1)?,
            content:         row.get(2)?,
            is_ai_generated: row.get::<_, i64>(3)? != 0,
            created_at:      row.get(4)?,
            updated_at:      row.get(5)?,
        })).map_err(|e| e.to_string())?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }
}

fn db_gather_generate_context(
    conn: &rusqlite::Connection,
    date: &str,
) -> Result<(Vec<String>, Option<String>), String> {
    use chrono::NaiveDate;
    let d = NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .map_err(|_| "Invalid date format (expected YYYY-MM-DD)".to_string())?;
    let start_ts = d.and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp();
    let end_ts   = start_ts + 86400;

    let mut stmt = conn.prepare(
        "SELECT app_name, SUM(duration_seconds)
         FROM activities WHERE start_time >= ?1 AND start_time < ?2
         GROUP BY app_name ORDER BY 2 DESC LIMIT 15",
    ).map_err(|e| e.to_string())?;

    let apps: Vec<String> = stmt.query_map(rusqlite::params![start_ts, end_ts], |row| {
        let app: String = row.get(0)?;
        let secs: i64   = row.get(1)?;
        Ok(format!("{} ({} min)", app, secs / 60))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    let nvidia_api_key = conn.query_row(
        "SELECT value FROM app_settings WHERE key = 'nvidia_api_key'",
        [], |row| row.get::<_, String>(0),
    ).ok().filter(|s| !s.is_empty())
    .or_else(|| std::env::var("NVIDIA_API_KEY").ok().filter(|s| !s.is_empty()));

    Ok((apps, nvidia_api_key))
}

// ─── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn diary_get_entries(app_handle: AppHandle, date: Option<String>) -> Result<Vec<DiaryEntry>, String> {
    let conn = crate::intent::db::open(&app_handle)?;
    db_get_entries(&conn, date.as_deref())
}

#[tauri::command]
pub async fn diary_save_entry(app_handle: AppHandle, entry: DiaryEntry) -> Result<DiaryEntry, String> {
    let conn = crate::intent::db::open(&app_handle)?;
    let now  = Utc::now().timestamp();

    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM diary_entries WHERE id = ?1)",
        [&entry.id], |row| row.get(0),
    ).unwrap_or(false);

    if exists {
        conn.execute(
            "UPDATE diary_entries SET date=?1,content=?2,is_ai_generated=?3,updated_at=?4 WHERE id=?5",
            rusqlite::params![entry.date, entry.content, entry.is_ai_generated as i64, now, entry.id],
        ).map_err(|e| e.to_string())?;
        Ok(DiaryEntry { updated_at: now, ..entry })
    } else {
        let id = if entry.id.is_empty() { Uuid::new_v4().to_string() } else { entry.id.clone() };
        conn.execute(
            "INSERT INTO diary_entries (id,date,content,is_ai_generated,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?5)",
            rusqlite::params![id, entry.date, entry.content, entry.is_ai_generated as i64, now],
        ).map_err(|e| e.to_string())?;
        Ok(DiaryEntry { id, created_at: now, updated_at: now, ..entry })
    }
}

#[tauri::command]
pub async fn diary_delete_entry(app_handle: AppHandle, id: String) -> Result<bool, String> {
    let conn = crate::intent::db::open(&app_handle)?;
    conn.execute("DELETE FROM diary_entries WHERE id = ?1", [&id]).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub async fn diary_generate_entry(
    app_handle: AppHandle,
    date: String,
    model: Option<String>,
) -> Result<String, String> {
    // Phase 1: sync DB — collect all data into owned Strings, then conn is dropped
    let (apps, nvidia_api_key) = tokio::task::spawn_blocking({
        let app2 = app_handle.clone();
        let date2 = date.clone();
        move || -> Result<(Vec<String>, Option<String>), String> {
            let conn = crate::intent::db::open(&app2)?;
            db_gather_generate_context(&conn, &date2)
        }
    }).await.map_err(|e| e.to_string())??;

    let activity_context = if apps.is_empty() {
        "No activity data recorded for this day yet.".to_string()
    } else {
        format!("Apps used: {}", apps.join(", "))
    };

    // Phase 2: async API call (no Connection held)
    let model_id = model.as_deref().unwrap_or("meta/llama-3.3-70b-instruct");

    let Some(api_key) = nvidia_api_key.clone() else {
        return Ok(format!(
            "*AI diary generation for model `{}` requires your NVIDIA NIM API key.*\n\n**Activity summary for {}:**\n{}",
            model_id, date, activity_context
        ));
    };

    let prompt = format!(
        "Write a reflective, personal diary entry for {}.\n\nActivity data:\n{}\n\n\
         Write 150-250 words in first-person past tense. Be natural and mention specific tools.",
        date, activity_context
    );

    #[derive(Serialize)]   struct Msg  { role: &'static str, content: String }
    #[derive(Serialize)]   struct Req  { model: String, messages: Vec<Msg>, max_tokens: u32, temperature: f32 }
    #[derive(Deserialize)] struct Resp { choices: Vec<Ch> }
    #[derive(Deserialize)] struct Ch   { message: Mc }
    #[derive(Deserialize)] struct Mc   { content: String }

    let try_provider = |ep: String, key: String, model_id: String, prompt: String| async move {
        let resp = reqwest::Client::new()
            .post(ep)
            .header("Authorization", format!("Bearer {}", key))
            .json(&Req {
                model: model_id,
                messages: vec![Msg { role: "user", content: prompt }],
                max_tokens: 512,
                temperature: 0.85,
            })
            .send().await.map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("AI {} — {}", status, &text[..text.len().min(300)]));
        }

        let parsed: Resp = resp.json().await.map_err(|e| e.to_string())?;
        parsed.choices.into_iter().next()
            .map(|c| c.message.content)
            .ok_or_else(|| "Empty diary generation response".to_string())
    };

    let first = try_provider(
        "https://integrate.api.nvidia.com/v1/chat/completions".to_string(),
        api_key,
        model_id.to_string(),
        prompt.clone(),
    ).await;
    match first {
        Ok(text) => Ok(text),
        Err(first_err) => Err(first_err),
    }
}
