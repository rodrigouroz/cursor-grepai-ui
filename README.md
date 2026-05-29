# Cursor GrepAI UI

A Cursor-compatible VS Code extension that puts a clickable sidebar UI on top of
the `grepai` semantic code search CLI. Search by meaning, jump to results, and
explore the call graph — without leaving the editor.

## Features

- **Semantic search** of the folder open in Cursor — searches that folder's own grepai index.
- **Index-gated**: if the open folder has no grepai index, the panel shows a disabled "no index" message instead of failing on search.
- **Multi-root aware**: when several folders are open, a small folder selector lets you pick which one to search.
- **Relative score bars** with a one-glance Strong/Good/Weak label per result.
- **Search history** autocomplete, **keyboard navigation** (arrows / Enter / Esc), and **open modes** (single-click preview, Cmd/Ctrl-click pin, Alt-click split).
- **Index-health badge** with a one-click "Start watcher" action.
- **Opt-in live search** (debounced, type-to-search).
- **Syntax-highlighted previews** and collapsible **group-by-file** results.
- **Call graph panel**: trace callers/callees as an expandable tree, or render a graph view.

## Install

Download the `.vsix` from the [latest release](../../releases/latest), then:

```bash
cursor --install-extension cursor-grepai-ui-<version>.vsix --force
```

Reload the window (`Cmd+Shift+P` → "Developer: Reload Window").

### Build from source

```bash
npm install
npm run package   # produces cursor-grepai-ui-<version>.vsix
```

## Requirements

The `grepai` CLI must be installed and on your `PATH` (configurable via
`grepaiSearch.executablePath`). Each folder you want to search needs its own
index — run `grepai init` in the folder, and `grepai watch --background` to keep
it fresh. A folder without an index shows the disabled "no index" state.

## Configuration

- `grepaiSearch.executablePath`: path to `grepai` (default `grepai`).
- `grepaiSearch.defaultLimit`: default result count (default `8`).
- `grepaiSearch.liveSearch`: search as you type, debounced (default `false`).
- `grepaiSearch.liveSearchDelayMs`: live-search debounce in ms (default `350`).
- `grepaiSearch.groupByFile`: group results by file when a file has multiple hits (default `true`).
- `grepaiSearch.traceMode`: symbol extraction mode for call-graph tracing, `fast` or `precise` (default `precise`).

## Usage

Open the **GrepAI** activity-bar item and type a semantic query; results from the
open folder's index appear as clickable cards (click to open at the matching line;
Cmd/Ctrl-click to pin, Alt-click to open beside). If the folder isn't indexed,
the panel says so — run `grepai init` there. With multiple folders open, pick the
target from the folder selector. Expand **Call graph** to trace a symbol's
callers/callees.
