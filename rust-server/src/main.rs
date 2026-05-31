use serde::Serialize;
use std::env;
use std::io::{self, BufRead, BufReader, Write};

const SYSTEM_PROMPT: &str =
    "You are ff, a focused terminal harness using DeepSeek V4 Flash with a 1M context window. Reply with compact streamed updates.";
const DEFAULT_API_URL: &str = "https://api.deepseek.com/chat/completions";
const DEFAULT_MODEL: &str = "deepseek-chat";

#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "lowercase")]
enum Event<'a> {
    Meta { system_prompt: &'a str },
    Chunk { content: &'a str },
    Done,
}

#[derive(Serialize)]
struct ChatRequest<'a> {
    model: &'a str,
    stream: bool,
    messages: Vec<ChatMessage<'a>>,
}

#[derive(Serialize)]
struct ChatMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(serde::Deserialize)]
struct StreamEnvelope {
    choices: Vec<StreamChoice>,
}

#[derive(serde::Deserialize)]
struct StreamChoice {
    delta: StreamDelta,
    finish_reason: Option<String>,
}

#[derive(serde::Deserialize)]
struct StreamDelta {
    content: Option<String>,
}

fn resolve_api_key() -> Result<String, String> {
    env::var("DEEPSEEK_API_KEY")
        .or_else(|_| env::var("OPENAI_API_KEY"))
        .map_err(|_| {
            "Missing API credentials. Set DEEPSEEK_API_KEY or OPENAI_API_KEY in ~/.env or your shell.".to_string()
        })
}

fn resolve_api_url() -> String {
    match env::var("OPENAI_BASE_URL") {
        Ok(value) if !value.trim().is_empty() => normalize_api_url(&value),
        _ => DEFAULT_API_URL.to_string(),
    }
}

fn normalize_api_url(value: &str) -> String {
    let trimmed = value.trim_end_matches('/');
    if trimmed.ends_with("/chat/completions") {
        trimmed.to_string()
    } else {
        format!("{trimmed}/chat/completions")
    }
}

fn resolve_model() -> String {
    env::var("OPENAI_MODEL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_MODEL.to_string())
}

fn build_request<'a>(prompt: &'a str, model: &'a str) -> ChatRequest<'a> {
    ChatRequest {
        model,
        stream: true,
        messages: vec![
            ChatMessage {
                role: "system",
                content: SYSTEM_PROMPT,
            },
            ChatMessage {
                role: "user",
                content: prompt,
            },
        ],
    }
}

fn emit_event(event: &Event<'_>) -> io::Result<()> {
    let mut stdout = io::stdout().lock();
    serde_json::to_writer(&mut stdout, event)?;
    writeln!(stdout)?;
    stdout.flush()
}

fn stream_completion(prompt: &str) -> Result<(), String> {
    if prompt.trim().is_empty() {
        return Err("Please enter a prompt so the harness has something to stream.".to_string());
    }

    let api_key = resolve_api_key()?;
    let api_url = resolve_api_url();
    let model = resolve_model();
    let body = build_request(prompt, &model);

    let client = reqwest::blocking::Client::new();
    let response = client
        .post(api_url)
        .bearer_auth(api_key)
        .header("content-type", "application/json")
        .header("accept", "text/event-stream")
        .json(&body)
        .send()
        .map_err(|error| format!("Failed to contact model API: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let message = response
            .text()
            .unwrap_or_else(|_| "Unable to read error body".to_string());
        return Err(format!("Model API request failed with {status}: {message}"));
    }

    consume_sse(response).map_err(|error| format!("Failed while streaming agent output: {error}"))
}

fn consume_sse(response: reqwest::blocking::Response) -> io::Result<()> {
    let reader = BufReader::new(response);

    for line in reader.lines() {
        let line = line?;
        let trimmed = line.trim();
        if trimmed.is_empty() || !trimmed.starts_with("data:") {
            continue;
        }

        let payload = trimmed.trim_start_matches("data:").trim();
        if payload == "[DONE]" {
            break;
        }

        let envelope: StreamEnvelope = serde_json::from_str(payload).map_err(|error| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                format!("Invalid streaming payload: {error}"),
            )
        })?;

        for choice in envelope.choices {
            if let Some(content) = choice.delta.content {
                emit_event(&Event::Chunk { content: &content })?;
            }

            if choice.finish_reason.is_some() {
                return Ok(());
            }
        }
    }

    Ok(())
}

fn main() -> io::Result<()> {
    let prompt = env::args().nth(1).unwrap_or_default();
    emit_event(&Event::Meta {
        system_prompt: SYSTEM_PROMPT,
    })?;

    if let Err(error) = stream_completion(&prompt) {
        emit_event(&Event::Chunk { content: &error })?;
    }

    emit_event(&Event::Done)
}

#[cfg(test)]
mod tests {
    use super::{
        build_request, normalize_api_url, resolve_api_key, DEFAULT_MODEL, SYSTEM_PROMPT,
    };
    use std::env;

    fn env_lock() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: std::sync::OnceLock<std::sync::Mutex<()>> = std::sync::OnceLock::new();
        LOCK.get_or_init(|| std::sync::Mutex::new(())).lock().unwrap()
    }

    #[test]
    fn normalize_api_url_accepts_base_or_full_path() {
        assert_eq!(
            normalize_api_url("https://example.test/v1"),
            "https://example.test/v1/chat/completions"
        );
        assert_eq!(
            normalize_api_url("https://example.test/v1/chat/completions"),
            "https://example.test/v1/chat/completions"
        );
    }

    #[test]
    fn build_request_uses_system_and_user_messages() {
        let request = build_request("hello", DEFAULT_MODEL);
        assert!(request.stream);
        assert_eq!(request.messages.len(), 2);
        assert_eq!(request.messages[0].role, "system");
        assert_eq!(request.messages[0].content, SYSTEM_PROMPT);
        assert_eq!(request.messages[1].role, "user");
        assert_eq!(request.messages[1].content, "hello");
    }

    #[test]
    fn resolve_api_key_prefers_deepseek_and_errors_when_missing() {
        let _guard = env_lock();
        unsafe {
            env::remove_var("DEEPSEEK_API_KEY");
            env::remove_var("OPENAI_API_KEY");
        }
        assert!(resolve_api_key().is_err());

        unsafe {
            env::set_var("OPENAI_API_KEY", "openai-key");
        }
        assert_eq!(resolve_api_key().unwrap(), "openai-key");

        unsafe {
            env::set_var("DEEPSEEK_API_KEY", "deepseek-key");
        }
        assert_eq!(resolve_api_key().unwrap(), "deepseek-key");

        unsafe {
            env::remove_var("DEEPSEEK_API_KEY");
            env::remove_var("OPENAI_API_KEY");
        }
    }

    #[test]
    fn system_prompt_mentions_default_model() {
        assert!(SYSTEM_PROMPT.contains("DeepSeek V4 Flash"));
        assert!(SYSTEM_PROMPT.contains("1M context window"));
    }
}