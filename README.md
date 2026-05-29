# Cursor GrepAI UI

A Cursor-compatible VS Code extension that puts a clickable sidebar UI on top of
the `grepai` semantic code search CLI. Search by meaning, jump to results, and
explore the call graph — without leaving the editor.

## Features

- **Semantic search** in a sidebar, scoped to the current folder or any configured workspace project.
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
`grepaiSearch.executablePath`). Index a project with `grepai init`, and
`grepai watch --background` to keep it fresh.

## Configuration

- `grepaiSearch.executablePath`: path to `grepai` (default `grepai`).
- `grepaiSearch.defaultLimit`: default result count (default `8`).
- `grepaiSearch.workspaceProjects`: workspace project scopes, each with `label`, `workspace`, `project`, and `rootPath`. Example:

  ```json
  "grepaiSearch.workspaceProjects": [
    { "label": "Acme: api", "workspace": "acme", "project": "api", "rootPath": "/Users/me/Projects/api" }
  ]
  ```

- `grepaiSearch.liveSearch`: search as you type, debounced (default `false`).
- `grepaiSearch.liveSearchDelayMs`: live-search debounce in ms (default `350`).
- `grepaiSearch.groupByFile`: group results by file when a file has multiple hits (default `true`).
- `grepaiSearch.traceMode`: symbol extraction mode for call-graph tracing, `fast` or `precise` (default `precise`).

## Usage

Open the **GrepAI** activity-bar item, type a semantic query, pick a scope, and
click a result to open the file at the matching line. Expand **Call graph** to
trace a symbol's callers/callees.
