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
        Ok(rows.filter_map(|r| r.map_err(|e| eprintln!("[db] diary row error: {e}")).ok()).collect())
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, date, content, is_ai_generated, created_at, updated_at
             FROM diary_entries ORDER BY date DESC, created_at DESC
             LIMIT 200",
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| Ok(DiaryEntry {
            id:              row.get(0)?,
            date:            row.get(1)?,
            content:         row.get(2)?,
            is_ai_generated: row.get::<_, i64>(3)? != 0,
            created_at:      row.get(4)?,
            updated_at:      row.get(5)?,
        })).map_err(|e| e.to_string())?;
        Ok(rows.filter_map(|r| r.map_err(|e| eprintln!("[db] diary row error: {e}")).ok()).collect())
    }
}

fn db_gather_generate_context(
    conn: &rusqlite::Connection,
    date: &str,
) -> Result<(Vec<String>, Option<String>, String, String), String> {
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

    // Read the user's configured AI provider and model
    let ai_provider = conn.query_row(
        "SELECT value FROM app_settings WHERE key = 'ai_provider'",
        [], |row| row.get::<_, String>(0),
    ).unwrap_or_else(|_| "nvidia".to_string());

    let ai_model = conn.query_row(
        "SELECT value FROM app_settings WHERE key = 'default_model'",
        [], |row| row.get::<_, String>(0),
    ).unwrap_or_default();

    // Determine the correct API key based on provider
    let env_key_name = match ai_provider.to_lowercase().as_str() {
        "openai" => "openai_api_key",
        "anthropic" => "anthropic_api_key",
        "groq" => "groq_api_key",
        _ => "nvidia_api_key",
    };
    let env_var_name = match ai_provider.to_lowercase().as_str() {
        "openai" => "OPENAI_API_KEY",
        "anthropic" => "ANTHROPIC_API_KEY",
        "groq" => "GROQ_API_KEY",
        _ => "NVIDIA_API_KEY",
    };

    let api_key = conn.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        rusqlite::params![env_key_name], |row| row.get::<_, String>(0),
    ).ok().filter(|s| !s.is_empty())
    .or_else(|| std::env::var(env_var_name).ok().filter(|s| !s.is_empty()));

    Ok((apps, api_key, ai_model, ai_provider))
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
    let (apps, api_key, db_model, ai_provider) = tokio::task::spawn_blocking({
        let app2 = app_handle.clone();
        let date2 = date.clone();
        move || -> Result<(Vec<String>, Option<String>, String, String), String> {
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
    let provider = ai_provider.to_lowercase();

    // Use explicit model > db model > provider-specific fallback
    let model_id = model.as_deref()
        .filter(|s| !s.is_empty())
        .or_else(|| if db_model.is_empty() { None } else { Some(db_model.as_str()) })
        .unwrap_or(match provider.as_str() {
            "openai" => "gpt-4o-mini",
            "groq" => "llama-3.1-8b-instant",
            "anthropic" => "claude-3-5-sonnet-latest",
            _ => "meta/llama-3.3-70b-instruct",
        });

    let Some(key) = api_key else {
        return Ok(format!(
            "*AI diary generation requires an API key. Set one in Settings.*\n\n**Activity summary for {}:**\n{}",
            date, activity_context
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

    let try_openai_compatible = |ep: String, key: String, model_id: String, prompt: String| async move {
        let resp = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build().map_err(|e| e.to_string())?
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

    #[derive(Serialize)]
    struct AnthropicReq {
        model: String,
        max_tokens: u32,
        temperature: f32,
        messages: Vec<AnthropicMsg>,
    }

    #[derive(Serialize)]
    struct AnthropicMsg {
        role: &'static str,
        content: String,
    }

    #[derive(Deserialize)]
    struct AnthropicResp {
        content: Vec<AnthropicContent>,
    }

    #[derive(Deserialize)]
    struct AnthropicContent {
        #[serde(rename = "type")]
        kind: String,
        text: Option<String>,
    }

    let try_anthropic = |key: String, model_id: String, prompt: String| async move {
        let resp = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build().map_err(|e| e.to_string())?
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", key)
            .header("anthropic-version", "2023-06-01")
            .json(&AnthropicReq {
                model: model_id,
                max_tokens: 512,
                temperature: 0.85,
                messages: vec![AnthropicMsg { role: "user", content: prompt }],
            })
            .send().await.map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("AI {} — {}", status, &text[..text.len().min(300)]));
        }

        let parsed: AnthropicResp = resp.json().await.map_err(|e| e.to_string())?;
        parsed
            .content
            .into_iter()
            .find(|c| c.kind == "text")
            .and_then(|c| c.text)
            .ok_or_else(|| "Empty diary generation response".to_string())
    };

    let first = match provider.as_str() {
        "openai" => {
            try_openai_compatible(
                "https://api.openai.com/v1/chat/completions".to_string(),
                key,
                model_id.to_string(),
                prompt.clone(),
            ).await
        }
        "groq" => {
            try_openai_compatible(
                "https://api.groq.com/openai/v1/chat/completions".to_string(),
                key,
                model_id.to_string(),
                prompt.clone(),
            ).await
        }
        "anthropic" => try_anthropic(key, model_id.to_string(), prompt.clone()).await,
        _ => {
            try_openai_compatible(
                "https://integrate.api.nvidia.com/v1/chat/completions".to_string(),
                key,
                model_id.to_string(),
                prompt.clone(),
            ).await
        }
    };

    match first {
        Ok(text) => Ok(text),
        Err(first_err) => Err(format!("Diary generation failed via {} provider: {}", provider, first_err)),
    }
}
