use serde::Serialize;
use std::env;
use std::io::{self, Write};
use std::thread;
use std::time::Duration;

const SYSTEM_PROMPT: &str =
    "You are ff, a focused terminal harness using DeepSeek V4 Flash with a 1M context window. Reply with compact streamed updates.";

#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "lowercase")]
enum Event<'a> {
    Meta { system_prompt: &'a str },
    Chunk { content: &'a str },
    Done,
}

fn build_response(prompt: &str) -> String {
    if prompt.trim().is_empty() {
        return "Please enter a prompt so the harness has something to stream.".to_string();
    }

    format!(
        "System prompt loaded. Working on: {prompt}. Next steps: collect context, stream progress, and keep the loop tight."
    )
}

fn chunk_text(text: &str, chunk_size: usize) -> Vec<String> {
    if chunk_size == 0 {
        return vec![text.to_string()];
    }

    let mut chunks = Vec::new();
    let mut current = String::new();

    for word in text.split_whitespace() {
        if current.is_empty() {
            current.push_str(word);
            continue;
        }

        if current.len() + 1 + word.len() > chunk_size {
            chunks.push(current);
            current = word.to_string();
        } else {
            current.push(' ');
            current.push_str(word);
        }
    }

    if !current.is_empty() {
        chunks.push(current);
    }

    if chunks.is_empty() {
        chunks.push(String::new());
    }

    chunks
}

fn emit_event(event: &Event<'_>) -> io::Result<()> {
    let mut stdout = io::stdout().lock();
    serde_json::to_writer(&mut stdout, event)?;
    writeln!(stdout)?;
    stdout.flush()
}

fn main() -> io::Result<()> {
    let prompt = env::args().nth(1).unwrap_or_default();
    emit_event(&Event::Meta {
        system_prompt: SYSTEM_PROMPT,
    })?;

    for chunk in chunk_text(&build_response(&prompt), 18) {
        emit_event(&Event::Chunk { content: &chunk })?;
        thread::sleep(Duration::from_millis(40));
    }

    emit_event(&Event::Done)
}

#[cfg(test)]
mod tests {
    use super::{build_response, chunk_text, SYSTEM_PROMPT};

    #[test]
    fn chunk_text_splits_long_content() {
        let chunks = chunk_text("alpha beta gamma delta", 10);
        assert!(chunks.len() >= 2);
        assert_eq!(chunks[0], "alpha beta");
    }

    #[test]
    fn chunk_text_handles_zero_size() {
        let chunks = chunk_text("hello world", 0);
        assert_eq!(chunks, vec!["hello world".to_string()]);
    }

    #[test]
    fn build_response_handles_blank_prompt() {
        let response = build_response("   ");
        assert!(response.contains("Please enter a prompt"));
    }

    #[test]
    fn system_prompt_mentions_default_model() {
        assert!(SYSTEM_PROMPT.contains("DeepSeek V4 Flash"));
        assert!(SYSTEM_PROMPT.contains("1M context window"));
    }
}