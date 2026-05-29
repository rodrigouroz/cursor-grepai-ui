# Per-Card Result Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add hover/focus-revealed per-card action buttons (open-to-side, reveal in Explorer, copy-as-context, send-to-chat) to GrepAI search-result cards.

**Architecture:** Pure logic lives in two new testable modules (`resultContext.ts` for the markdown formatter, `chatBridge.ts` for best-effort Cursor chat discovery with dependency injection). The provider (`grepaiViewProvider.ts`) gains three thin message handlers that wire these modules to VS Code APIs; "open to side" reuses the existing `openResult`/`beside` path. The webview (`media/main.js`) renders an action bar per card and dispatches messages via the existing click-delegation listener. No change to search, indexing, or ranking.

**Tech Stack:** TypeScript, VS Code extension API, vanilla JS webview, Vitest (+ jsdom for webview-client tests).

---

## File Structure

- **Create `src/resultContext.ts`** — pure: `formatResultContext(result)` → ready-to-paste markdown block; `languageForPath(displayPath)` → fence language. Unit-tested.
- **Create `src/chatBridge.ts`** — pure-with-injected-deps: `pickChatCommand(available)` and `trySendToChat(text, deps)`. Unit-tested. Isolates the Cursor-chat feasibility risk.
- **Modify `src/grepaiViewProvider.ts`** — extend `WebviewMessage` union; add `revealResult`/`copyResult`/`sendResultToChat` handlers; import the two new modules.
- **Modify `media/main.js`** — convert the result card from `<button>` to `<div role="button">` (so it can legally contain child `<button>` actions), render the action bar, and extend the click-delegation listener.
- **Modify `media/main.css`** — `.result { position: relative }` + `.result-actions` reveal-on-hover/focus styling.
- **Create `test/resultContext.test.ts`**, **`test/chatBridge.test.ts`**; **modify `test/webviewClient.test.ts`**.

> **Why the card must stop being a `<button>`:** Today `cardHtml` emits `<button class="result">…</button>`. Nesting `<button>` inside `<button>` is invalid HTML and browsers auto-close the outer button, breaking layout. The card becomes `<div class="result" role="button" tabindex="0">`, which preserves the existing keyboard nav (the arrow/Enter handlers key off the `.result` class and `tabindex`, both retained) while allowing child action buttons.

---

## Task 1: `resultContext.ts` — markdown formatter

**Files:**
- Create: `src/resultContext.ts`
- Test: `test/resultContext.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/resultContext.test.ts
import { describe, expect, test } from "vitest";
import { formatResultContext, languageForPath } from "../src/resultContext";
import type { NormalizedGrepaiResult } from "../src/resultModel";

function result(overrides: Partial<NormalizedGrepaiResult> = {}): NormalizedGrepaiResult {
  return {
    id: "0",
    filePath: "/abs/src/auth/login.ts",
    displayPath: "src/auth/login.ts",
    startLine: 10,
    endLine: 14,
    score: 0.9,
    preview: "function login() {\n  return true;\n}",
    ...overrides,
  };
}

describe("languageForPath", () => {
  test("maps known extensions to fence languages", () => {
    expect(languageForPath("src/auth/login.ts")).toBe("ts");
    expect(languageForPath("a/b/main.py")).toBe("python");
    expect(languageForPath("x.GO")).toBe("go");
  });

  test("returns empty string for unknown or missing extensions", () => {
    expect(languageForPath("Makefile")).toBe("");
    expect(languageForPath("data.zzz")).toBe("");
  });
});

describe("formatResultContext", () => {
  test("emits a path:line header and a fenced block with inferred language", () => {
    expect(formatResultContext(result())).toBe(
      "`src/auth/login.ts:10-14`\n" +
        "```ts\n" +
        "function login() {\n  return true;\n}\n" +
        "```\n",
    );
  });

  test("uses a plain fence when the language is unknown", () => {
    const block = formatResultContext(result({ displayPath: "Makefile", preview: "all:\n\tgo build" }));
    expect(block).toBe("`Makefile:10-14`\n```\nall:\n\tgo build\n```\n");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/resultContext.test.ts`
Expected: FAIL — cannot resolve `../src/resultContext`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/resultContext.ts
import type { NormalizedGrepaiResult } from "./resultModel";

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: "ts", tsx: "tsx", js: "js", jsx: "jsx", mjs: "js", cjs: "js",
  py: "python", go: "go", rs: "rust", java: "java", rb: "ruby",
  c: "c", h: "c", cpp: "cpp", cc: "cpp", hpp: "cpp",
  cs: "csharp", php: "php", swift: "swift", kt: "kotlin",
  json: "json", yaml: "yaml", yml: "yaml", md: "markdown",
  sh: "bash", bash: "bash", css: "css", scss: "scss", html: "html", sql: "sql",
};

export function languageForPath(displayPath: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(displayPath);
  if (!match) {
    return "";
  }
  return LANGUAGE_BY_EXTENSION[match[1].toLowerCase()] ?? "";
}

export function formatResultContext(result: NormalizedGrepaiResult): string {
  const header = "`" + result.displayPath + ":" + result.startLine + "-" + result.endLine + "`";
  const fence = "```" + languageForPath(result.displayPath);
  return header + "\n" + fence + "\n" + result.preview + "\n```\n";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/resultContext.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/resultContext.ts test/resultContext.test.ts
git commit -m "feat: add result-to-markdown context formatter"
```

---

## Task 2: `chatBridge.ts` — best-effort Cursor chat send

**Files:**
- Create: `src/chatBridge.ts`
- Test: `test/chatBridge.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/chatBridge.test.ts
import { describe, expect, test, vi } from "vitest";
import { pickChatCommand, trySendToChat, KNOWN_CHAT_COMMANDS } from "../src/chatBridge";

describe("pickChatCommand", () => {
  test("returns the first known command that is available", () => {
    const available = ["foo.bar", KNOWN_CHAT_COMMANDS[1], KNOWN_CHAT_COMMANDS[0]];
    expect(pickChatCommand(available)).toBe(KNOWN_CHAT_COMMANDS[0]);
  });

  test("returns undefined when no known command is available", () => {
    expect(pickChatCommand(["foo.bar", "baz.qux"])).toBeUndefined();
  });
});

describe("trySendToChat", () => {
  test("executes the discovered command with the text and returns true", async () => {
    const executeCommand = vi.fn().mockResolvedValue(undefined);
    const ok = await trySendToChat("hello", {
      getCommands: async () => [KNOWN_CHAT_COMMANDS[0]],
      executeCommand,
    });
    expect(ok).toBe(true);
    expect(executeCommand).toHaveBeenCalledWith(KNOWN_CHAT_COMMANDS[0], "hello");
  });

  test("returns false when no chat command exists", async () => {
    const executeCommand = vi.fn();
    const ok = await trySendToChat("hello", {
      getCommands: async () => ["unrelated.command"],
      executeCommand,
    });
    expect(ok).toBe(false);
    expect(executeCommand).not.toHaveBeenCalled();
  });

  test("returns false when the command throws", async () => {
    const ok = await trySendToChat("hello", {
      getCommands: async () => [KNOWN_CHAT_COMMANDS[0]],
      executeCommand: async () => {
        throw new Error("boom");
      },
    });
    expect(ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/chatBridge.test.ts`
Expected: FAIL — cannot resolve `../src/chatBridge`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/chatBridge.ts

// Known Cursor commands that seed the chat/composer with a string payload.
// Discovered empirically; order = priority. If none are registered we return
// false and the caller falls back to copying to the clipboard. Refine this list
// during the manual spike in Task 6 if a better command is found.
export const KNOWN_CHAT_COMMANDS = [
  "composer.startComposerPrompt",
  "aichat.newchataction",
  "aichat.insertselectionintochat",
];

export interface ChatBridgeDeps {
  getCommands: () => Promise<string[]>;
  executeCommand: (command: string, ...args: unknown[]) => Promise<unknown>;
}

export function pickChatCommand(available: string[]): string | undefined {
  return KNOWN_CHAT_COMMANDS.find((command) => available.includes(command));
}

export async function trySendToChat(text: string, deps: ChatBridgeDeps): Promise<boolean> {
  try {
    const command = pickChatCommand(await deps.getCommands());
    if (!command) {
      return false;
    }
    await deps.executeCommand(command, text);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/chatBridge.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/chatBridge.ts test/chatBridge.test.ts
git commit -m "feat: add best-effort Cursor chat bridge with clipboard fallback"
```

---

## Task 3: Wire provider message handlers

**Files:**
- Modify: `src/grepaiViewProvider.ts`

- [ ] **Step 1: Add imports**

At the top of `src/grepaiViewProvider.ts`, after the existing `import { formatRelativeTime } from "./relativeTime";` line, add:

```ts
import { formatResultContext } from "./resultContext";
import { trySendToChat } from "./chatBridge";
```

- [ ] **Step 2: Extend the `WebviewMessage` union**

In the `type WebviewMessage =` union, add these three members (place them after the `openResult` member):

```ts
  | { type: "revealResult"; id: string }
  | { type: "copyResult"; id: string }
  | { type: "sendResultToChat"; id: string }
```

- [ ] **Step 3: Dispatch the new messages**

In `handleMessage`, after the existing `if (message.type === "openResult") { … return; }` block, add:

```ts
    if (message.type === "revealResult") {
      await this.revealResult(message.id);
      return;
    }

    if (message.type === "copyResult") {
      await this.copyResult(message.id);
      return;
    }

    if (message.type === "sendResultToChat") {
      await this.sendResultToChat(message.id);
      return;
    }
```

- [ ] **Step 4: Add the handler methods**

Immediately after the existing `openResult` method, add:

```ts
  private async revealResult(id: string): Promise<void> {
    const result = this.results.get(id);
    if (!result) {
      this.postError("Result is no longer available.");
      return;
    }
    if (!(await fileExists(result.filePath))) {
      this.postError("That file no longer exists in this checkout.");
      return;
    }
    await vscode.commands.executeCommand("revealInExplorer", vscode.Uri.file(result.filePath));
  }

  private async copyResult(id: string): Promise<void> {
    const result = this.results.get(id);
    if (!result) {
      this.postError("Result is no longer available.");
      return;
    }
    await vscode.env.clipboard.writeText(formatResultContext(result));
    vscode.window.setStatusBarMessage("GrepAI: result copied for prompt", 2000);
  }

  private async sendResultToChat(id: string): Promise<void> {
    const result = this.results.get(id);
    if (!result) {
      this.postError("Result is no longer available.");
      return;
    }
    const block = formatResultContext(result);
    const sent = await trySendToChat(block, {
      getCommands: () => vscode.commands.getCommands(true),
      executeCommand: (command, ...args) =>
        Promise.resolve(vscode.commands.executeCommand(command, ...args)),
    });
    if (!sent) {
      await vscode.env.clipboard.writeText(block);
      void vscode.window.showInformationMessage(
        "Copied to clipboard — Cursor chat integration unavailable.",
      );
    }
  }
```

- [ ] **Step 5: Verify it compiles**

Run: `npm run compile`
Expected: exits 0 with no errors (no new tests here — the testable logic lives in Tasks 1–2; this is thin wiring verified by the compiler and the manual run in Task 6).

- [ ] **Step 6: Commit**

```bash
git add src/grepaiViewProvider.ts
git commit -m "feat: handle reveal/copy/send-to-chat result messages in the provider"
```

---

## Task 4: Render action buttons in the webview

**Files:**
- Modify: `media/main.js`
- Test: `test/webviewClient.test.ts`

- [ ] **Step 1: Write the failing tests**

Append this `describe` block to the end of `test/webviewClient.test.ts`:

```ts
describe("result actions", () => {
  function renderOneResult(vscode: ReturnType<typeof fakeVscode>) {
    init(vscode, document);
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "results",
          folderId: "",
          results: [{ id: "0", displayPath: "a.ts", startLine: 1, endLine: 2, score: 0.9, preview: "x" }],
        },
      }),
    );
  }

  test("each card renders the four action buttons with accessible labels", () => {
    const vscode = fakeVscode();
    renderOneResult(vscode);
    const actions = Array.from(document.querySelectorAll(".result .result-action")).map(
      (b) => (b as HTMLButtonElement).dataset.action,
    );
    expect(actions).toEqual(["openSide", "revealResult", "copyResult", "sendResultToChat"]);
    const reveal = document.querySelector('.result-action[data-action="revealResult"]')!;
    expect(reveal.getAttribute("aria-label")).toBe("Reveal in Explorer");
  });

  test("clicking an action posts its message and does not also open the result", () => {
    const vscode = fakeVscode();
    renderOneResult(vscode);

    (document.querySelector('.result-action[data-action="copyResult"]') as HTMLElement).dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    expect(vscode.posted).toContainEqual({ type: "copyResult", id: "0" });
    expect(vscode.posted.some((m) => m.type === "openResult")).toBe(false);
  });

  test("the open-to-side action reuses the openResult/beside path", () => {
    const vscode = fakeVscode();
    renderOneResult(vscode);

    (document.querySelector('.result-action[data-action="openSide"]') as HTMLElement).dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    expect(vscode.posted).toContainEqual({ type: "openResult", id: "0", mode: "beside" });
  });

  test("clicking the card body still opens in preview", () => {
    const vscode = fakeVscode();
    renderOneResult(vscode);

    const card = document.querySelector(".result") as HTMLElement;
    card.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(vscode.posted).toContainEqual({ type: "openResult", id: "0", mode: "preview" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/webviewClient.test.ts`
Expected: FAIL — `.result-action` elements do not exist yet.

- [ ] **Step 3: Add the action-bar markup helpers**

In `media/main.js`, immediately **before** the `function cardHtml(item)` definition, add:

```js
  function actionButton(action, label, svg) {
    return (
      '<button class="result-action" type="button"' +
      ' data-action="' + action + '"' +
      ' title="' + escapeHtml(label) + '"' +
      ' aria-label="' + escapeHtml(label) + '">' +
      svg +
      "</button>"
    );
  }

  function actionsHtml() {
    return (
      '<div class="result-actions">' +
      actionButton(
        "openSide",
        "Open to the side",
        '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M2 2h5v12H2V2zm7 0h5v12H9V2z"/></svg>',
      ) +
      actionButton(
        "revealResult",
        "Reveal in Explorer",
        '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M1 3h5l1 1h8v9H1V3z"/></svg>',
      ) +
      actionButton(
        "copyResult",
        "Copy as context",
        '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M5 1h6l3 3v9H5V1zm-2 3H2v11h9v-1H3V4z"/></svg>',
      ) +
      actionButton(
        "sendResultToChat",
        "Send to chat",
        '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M1 2h14v9H6l-4 3v-3H1V2z"/></svg>',
      ) +
      "</div>"
    );
  }
```

- [ ] **Step 4: Convert the card to a div and append the action bar**

Replace the entire `cardHtml` function with:

```js
  function cardHtml(item) {
    return (
      '<div class="result" role="button" tabindex="0" data-id="' + escapeHtml(item.id) +
      '" data-symbol="' + escapeHtml(deriveSymbol(item.preview)) + '">' +
      actionsHtml() +
      pathHtml(item.displayPath) +
      '<div class="meta" title="score ' + escapeHtml(Number(item.score).toFixed(3)) + '">' +
      "L" + escapeHtml(item.startLine) + "-" + escapeHtml(item.endLine) +
      ' · <span class="strength">' + escapeHtml(item.label) + "</span></div>" +
      '<div class="score-bar"><span style="width:' + escapeHtml(item.barWidth) + '%"></span></div>' +
      '<div class="preview">' + highlight(item.preview, languageFromPath(item.displayPath)) + "</div>" +
      "</div>"
    );
  }
```

- [ ] **Step 5: Handle action clicks in the delegation listener**

Replace the existing results `click` listener (the block starting `results.addEventListener("click", (event) => {`) with:

```js
  results.addEventListener("click", (event) => {
    const action = event.target.closest(".result-action");
    if (action) {
      const card = action.closest(".result");
      if (!card) return;
      if (action.dataset.action === "openSide") {
        vscode.postMessage({ type: "openResult", id: card.dataset.id, mode: "beside" });
      } else {
        vscode.postMessage({ type: action.dataset.action, id: card.dataset.id });
      }
      return;
    }
    const target = event.target.closest(".result");
    if (!target) return;
    const mode = event.altKey ? "beside" : event.metaKey || event.ctrlKey ? "active" : "preview";
    vscode.postMessage({ type: "openResult", id: target.dataset.id, mode });
  });
```

> Because a single delegated listener decides between an action click and a card click, no `stopPropagation` is needed — the action branch `return`s before the open branch runs.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run test/webviewClient.test.ts`
Expected: PASS — including the pre-existing "open modes" test (card-body click still posts `preview`).

- [ ] **Step 7: Commit**

```bash
git add media/main.js test/webviewClient.test.ts
git commit -m "feat: render per-card action buttons and route their clicks"
```

---

## Task 5: Style the action bar

**Files:**
- Modify: `media/main.css`

- [ ] **Step 1: Make the card a positioning context**

In `media/main.css`, change the `.result` rule (currently starting at line ~68) to add `position: relative;` and an explicit `cursor: pointer;` (needed now that the card is a `<div>`, not a `<button>`):

```css
.result {
  position: relative;
  display: block;
  width: 100%;
  padding: 6px 7px;
  text-align: left;
  cursor: pointer;
  color: var(--vscode-foreground);
  background: var(--vscode-list-inactiveSelectionBackground, transparent);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 4px;
}
```

- [ ] **Step 2: Add the action-bar styles**

Append to `media/main.css`:

```css
.result-actions {
  position: absolute;
  top: 5px;
  right: 5px;
  display: flex;
  gap: 2px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 80ms ease;
}

.result:hover .result-actions,
.result:focus-within .result-actions {
  opacity: 1;
  pointer-events: auto;
}

.result-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  color: var(--vscode-foreground);
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 3px;
  cursor: pointer;
}

.result-action:hover {
  background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground));
}

.result-action:focus-visible {
  opacity: 1;
  outline: 1px solid var(--vscode-focusBorder);
}
```

- [ ] **Step 3: Verify the build still produces the package**

Run: `npm run compile`
Expected: exits 0 (CSS is not compiled, but this confirms nothing else broke).

- [ ] **Step 4: Commit**

```bash
git add media/main.css
git commit -m "style: reveal per-card action buttons on hover and focus"
```

---

## Task 6: Full verification, chat spike, and docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run the whole test suite**

Run: `npx vitest run`
Expected: all suites PASS (existing + `resultContext`, `chatBridge`, new `webviewClient` cases).

- [ ] **Step 2: Build the VSIX**

Run: `npm run package`
Expected: produces `cursor-grepai-ui-<version>.vsix`, exit 0.

- [ ] **Step 3: Manual verification in Cursor**

Install the VSIX (`cursor --install-extension cursor-grepai-ui-<version>.vsix --force`), reload, run a search, and confirm:
- Action buttons appear on card hover and when a card is focused via keyboard, and stay hidden otherwise.
- **Open to side** opens beside; **Reveal in Explorer** reveals the file; **Copy as context** puts the `path:line` + fenced snippet on the clipboard (paste to verify) and shows the status-bar confirmation.
- Clicking the card body (not a button) still opens in preview.

- [ ] **Step 4: Chat spike**

With the extension running, open the Command Palette and confirm whether any command in `KNOWN_CHAT_COMMANDS` exists in this Cursor build (or inspect `vscode.commands.getCommands(true)` via a scratch log). Click **Send to chat**:
- If a known command works, confirm the snippet seeds the chat.
- If not, confirm it falls back to clipboard + the info toast.
- If you discover a better real command, add it to `KNOWN_CHAT_COMMANDS` in `src/chatBridge.ts`, update `test/chatBridge.test.ts` accordingly, re-run `npx vitest run test/chatBridge.test.ts`, and commit.

- [ ] **Step 5: Update the README**

In `README.md`, under the **Features** list, add a bullet:

```markdown
- **Per-card actions**: hover or focus a result to open it beside, reveal it in the Explorer, copy it as a ready-to-paste `path:line` + code block, or send it to chat (falls back to copying when chat integration is unavailable).
```

- [ ] **Step 6: Commit**

```bash
git add README.md src/chatBridge.ts test/chatBridge.test.ts
git commit -m "docs: document per-card result actions"
```

---

## Self-Review

**Spec coverage:**
- Open to side → Task 4 (markup + `openSide`→`beside` routing). ✓
- Reveal in Explorer → Task 3 (`revealResult` handler) + Task 4. ✓
- Copy as context → Task 1 (formatter) + Task 3 (`copyResult`) + Task 4. ✓
- Send to chat w/ clipboard fallback → Task 2 (`chatBridge`) + Task 3 (`sendResultToChat`) + Task 6 spike. ✓
- Hover/focus reveal, accessibility (focusable buttons, aria-labels/tooltips) → Task 4 (labels) + Task 5 (`:hover`/`:focus-within`). ✓
- Error handling (missing file, stale result) → Task 3 handlers reuse `fileExists`/`postError`. ✓
- Testing (formatter, chatBridge fallback, webview message) → Tasks 1, 2, 4. ✓
- Out-of-scope (trace nodes, multi-select, copy-all, ranking) → not touched. ✓

> **Deviation from spec testing note:** the spec suggested a "provider-level clipboard test." The codebase has no precedent for unit-testing the provider (it requires mocking the `vscode` module), and the real logic now lives in the pure, injected modules (`resultContext`, `chatBridge`) which *are* unit-tested. The provider is left as thin wiring verified by `npm run compile` + the Task 6 manual run. This is the codebase-idiomatic equivalent and gives equal-or-better coverage of the actual logic.

**Placeholder scan:** No TBD/TODO; every code step shows complete code; no undefined references (all symbols — `formatResultContext`, `trySendToChat`, `pickChatCommand`, `KNOWN_CHAT_COMMANDS`, `actionsHtml`, `actionButton` — are defined in this plan).

**Type consistency:** `NormalizedGrepaiResult` fields (`displayPath`, `startLine`, `endLine`, `preview`, `filePath`) match `src/resultModel.ts`. Message types (`revealResult`, `copyResult`, `sendResultToChat`, and the reused `openResult`/`beside`) match between the webview (Task 4) and the provider union/handlers (Task 3). `data-action` values (`openSide`, `revealResult`, `copyResult`, `sendResultToChat`) match between `actionButton` calls and the click listener.
