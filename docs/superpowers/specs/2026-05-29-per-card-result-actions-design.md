# Per-Card Result Actions — Design

**Date:** 2026-05-29
**Status:** Approved (pending implementation plan)

## Background

The GrepAI sidebar renders semantic-search results as cards. Today a card is
effectively read-only: you click it to open the file (with Cmd/Ctrl-click to pin
and Alt-click to open beside). The main friction is **acting on a result** —
once you find it, doing anything beyond "open it" is clunky.

### Why this is a UI feature, not a ranking feature

We considered making search *smarter* first (PageRank-style weighting over
callers, git recency, dedup/MMR). We rejected that for this iteration: the
extension sits downstream of the `grepai` CLI, which returns a fixed top-N with a
single opaque `score` and exposes **no per-result vectors, no lexical index, and
no file→symbol map**. The UI can only reshuffle candidates grepai already chose,
using shallow signals — it cannot meaningfully improve *relevance*. Real
retrieval-quality gains belong in grepai's core, not here. The UI's genuine
leverage is over **experience**, which is what this feature targets.

## Goal

Turn each search-result card into something you can act on, via
hover/focus-revealed buttons. All actions are **per-card**. No multi-select, no
"copy all".

## Scope

In scope — four per-card actions on **search-result cards only**:

1. **Open to side** — explicit button for the existing `beside` open mode
   (today only reachable via Alt-click).
2. **Reveal in Explorer** — new.
3. **Copy as context** — copy this result as a ready-to-paste markdown block.
4. **Send to chat** — best-effort Cursor integration; silently falls back to the
   same "copy as context" behavior when no usable command exists.

Out of scope:

- Trace-result nodes and the call-graph panel (search cards only).
- Multi-select / batch actions / "copy all results".
- Any change to search, indexing, ranking, or result quality.

## Architecture & Data Flow

The extension already holds full result data in `this.results`
(`grepaiViewProvider.ts`) and already opens files with modes via `openAt` /
`resolveOpenOptions`. This feature is purely additive: three new webview message
types and their handlers, plus webview rendering. No change to the search/index
path.

```
webview card button click
  → postMessage({ type, id })          // stopPropagation so card-open doesn't also fire
  → provider.handleMessage
      "open to side"      → openResult(id, "beside")              // reuse existing path
      revealResult(id)    → executeCommand("revealInExplorer", Uri.file(path))
      copyResult(id)      → formatResultContext(result) → env.clipboard.writeText
      sendResultToChat(id)→ chatBridge.trySendToChat(block)
                              ?? (clipboard.writeText(block) + info toast)
```

## Components

### New: `src/resultContext.ts` (pure, testable)

`formatResultContext(result: NormalizedGrepaiResult): string` produces a
ready-to-paste markdown block:

- A header line: `` `displayPath:startLine-endLine` ``.
- A fenced code block whose info-string language is inferred from the file
  extension; wraps `result.preview` verbatim.
- Unknown extensions produce a plain fence (no language tag).

This module owns the extension→language mapping and is unit-tested in isolation.

### New: `src/chatBridge.ts` (the spike, isolated)

`trySendToChat(text: string): Promise<boolean>`:

- Discovers candidate Cursor chat commands via `vscode.commands.getCommands(true)`
  matching `composer` / `aichat` / `chat`.
- Attempts to invoke a usable command with the text payload.
- Returns `true` on success, `false` on any failure (no match, throw, etc.).

Isolating the integration here contains the feasibility risk: if Cursor exposes
no usable command, only this module's return value changes and every caller
falls back to clipboard. Easy to adjust or remove.

### Changed: `src/grepaiViewProvider.ts`

- Extend the `WebviewMessage` union with `revealResult`, `copyResult`,
  `sendResultToChat` (each carries the result `id`).
- Add three handlers in `handleMessage`.
- "Open to side" reuses the existing `openResult` path with `mode: "beside"` —
  no new handler needed beyond the webview wiring.

### Changed: `media/main.js`

- Render an action-button row per result card: icon buttons with `aria-label`
  and `title` (open-to-side, reveal, copy-as-context, send-to-chat).
- Click handlers `postMessage` the appropriate type and call
  `stopPropagation()` so the card's open-on-click does not also fire.

### Changed: `media/main.css`

- Action buttons hidden by default; revealed on card `:hover` and
  `:focus-within`. Preserves the decluttered card look (commit b3ff0ff) while
  keeping actions keyboard-reachable.

## UX & Accessibility

- Icons sit at the top-right of each card, hidden until hover or keyboard focus.
- Each action is a real focusable `<button>` with a tooltip and `aria-label`;
  reachable through the existing keyboard-navigation flow.
- Tooltips are the only label — no inline text, keeping cards clean.

## Error Handling

- **Reveal / open**: already guarded by `fileExists`; reuses the existing
  "file no longer exists" error path.
- **Copy**: uses the in-memory `preview`, so it works even if the file moved; a
  stale `path:line` header is harmless.
- **Send to chat**: failure is non-fatal — fall back to clipboard and show an
  info toast: "Copied to clipboard — Cursor chat integration unavailable."

## Testing

- Unit-test `formatResultContext`: header format, language inference by
  extension, snippet passthrough, unknown-extension (plain fence) edge case.
- Unit-test `chatBridge.trySendToChat` with a mocked command list: command
  present → attempts send and returns true; absent → returns false.
- Provider-level test: a `copyResult` message writes the expected block to a
  stubbed clipboard.
