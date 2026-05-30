# fff — Fast Flash Agent

A minimal, fast coding agent harness powered by DeepSeek, built with Go and Bubble Tea.

## Install

Requires `go` (1.21+) and `git` with SSH access to GitHub.

```bash
curl -fsSL https://raw.githubusercontent.com/niguluu/fff/main/install.sh | bash
```

Or manually:

```bash
git clone git@github.com:niguluu/fff.git
cd fff
go build -o fff .
cp fff ~/bin/
```

## Usage

```bash
fff
```

- **Enter** — send message
- **Alt+Enter** — insert newline
- **Ctrl+C** — quit

## Tools

- `read_file` — read file contents
- `list_files` — list directory contents
- `edit_file` — find/replace or create files
