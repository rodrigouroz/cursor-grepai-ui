// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";
import { init } from "../media/main.js";

function mountShell() {
  document.body.innerHTML = `
    <form id="form">
      <input id="query" type="search">
      <label id="folder-row"><select id="folder"></select></label>
      <select id="limit">
        <option value="8">8</option>
        <option value="25">25</option>
      </select>
      <label class="inline">
        <input id="group-toggle" type="checkbox"> Group by file
      </label>
      <button id="search" type="submit">Search</button>
    </form>
    <div id="badge" class="badge" hidden></div>
    <datalist id="history"></datalist>
    <div id="status"></div>
    <div id="results"></div>
    <details id="trace-panel"><summary>Call graph</summary>
      <input id="trace-symbol"><select id="trace-direction"><option value="callers">Callers</option><option value="graph">Graph</option></select>
      <select id="trace-depth"><option value="2">2</option></select>
      <button id="trace-run">Trace</button><button id="trace-from-focused">From focused</button>
      <div id="trace-status"></div><div id="trace-results"></div>
    </details>`;
}

function fakeVscode() {
  const posted: any[] = [];
  let state: any = undefined;
  return {
    posted,
    postMessage: (m: any) => posted.push(m),
    getState: () => state,
    setState: (s: any) => {
      state = s;
    },
  };
}

beforeEach(() => {
  mountShell();
});

describe("limit control", () => {
  test("submitting sends the selected limit", () => {
    const vscode = fakeVscode();
    init(vscode, document);

    (document.getElementById("query") as HTMLInputElement).value = "auth";
    (document.getElementById("limit") as HTMLSelectElement).value = "25";
    document.getElementById("form")!.dispatchEvent(new Event("submit"));

    const search = vscode.posted.find((m) => m.type === "search");
    expect(search).toMatchObject({ type: "search", query: "auth", limit: 25 });
  });

  test("a configured default outside the preset options is injected and selectable", () => {
    const vscode = fakeVscode();
    init(vscode, document);

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "state", defaultLimit: 10, folders: [] },
      }),
    );

    expect((document.getElementById("limit") as HTMLSelectElement).value).toBe("10");

    (document.getElementById("query") as HTMLInputElement).value = "auth";
    document.getElementById("form")!.dispatchEvent(new Event("submit"));
    const search = vscode.posted.find((m) => m.type === "search");
    expect(search).toMatchObject({ limit: 10 });
  });
});

describe("search history", () => {
  test("records the query in the datalist on submit", () => {
    const vscode = fakeVscode();
    init(vscode, document);

    (document.getElementById("query") as HTMLInputElement).value = "payments";
    document.getElementById("form")!.dispatchEvent(new Event("submit"));

    const options = Array.from(document.querySelectorAll("#history option")).map(
      (o) => (o as HTMLOptionElement).value,
    );
    expect(options).toContain("payments");
    expect(vscode.getState().history).toContain("payments");
  });
});

describe("result path rendering", () => {
  test("splits displayPath into a prominent filename and a muted directory", () => {
    const vscode = fakeVscode();
    init(vscode, document);

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "results",
          folderId: "",
          results: [
            {
              id: "0",
              displayPath: "src/models/Districts/Bulletins/Bulletin.ts",
              startLine: 1,
              endLine: 2,
              score: 0.9,
              preview: "x",
            },
          ],
        },
      }),
    );

    const path = document.querySelector(".result .path")!;
    expect(path.querySelector(".path-file")!.textContent).toBe("Bulletin.ts");
    expect(path.querySelector(".path-dir")!.textContent).toBe("src/models/Districts/Bulletins");
    // full path preserved for the hover tooltip
    expect(path.getAttribute("title")).toBe("src/models/Districts/Bulletins/Bulletin.ts");
  });

  test("a bare filename renders no directory span", () => {
    const vscode = fakeVscode();
    init(vscode, document);

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "results",
          folderId: "",
          results: [{ id: "0", displayPath: "main.js", startLine: 1, endLine: 2, score: 0.5, preview: "x" }],
        },
      }),
    );

    const path = document.querySelector(".result .path")!;
    expect(path.querySelector(".path-file")!.textContent).toBe("main.js");
    expect(path.querySelector(".path-dir")).toBeNull();
  });
});

describe("open modes", () => {
  test("plain click opens in preview; alt-click opens beside", () => {
    const vscode = fakeVscode();
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

    const card = document.querySelector(".result") as HTMLElement;
    card.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    card.dispatchEvent(new MouseEvent("click", { bubbles: true, altKey: true }));

    const opens = vscode.posted.filter((m) => m.type === "openResult");
    expect(opens[0]).toMatchObject({ id: "0", mode: "preview" });
    expect(opens[1]).toMatchObject({ id: "0", mode: "beside" });
  });
});

describe("index health badge", () => {
  test("renders the index-health detail as read-only text with no action button", () => {
    const vscode = fakeVscode();
    init(vscode, document);

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "status",
          folderId: "",
          indexed: true,
          detail: "Index ready · last indexed 2h ago",
        },
      }),
    );

    const badge = document.getElementById("badge")!;
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toBe("Index ready · last indexed 2h ago");
    // The extension observes the index but never offers to manage the watcher.
    expect(badge.querySelector("button")).toBeNull();
    expect(vscode.posted).not.toContainEqual(expect.objectContaining({ type: "startWatcher" }));
  });

  test("a status for a non-selected folder is ignored as stale", () => {
    const vscode = fakeVscode();
    init(vscode, document);

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "status", folderId: "other", statusToken: "t", indexed: true, detail: "stale", canStartWatcher: false },
      }),
    );

    const badge = document.getElementById("badge")!;
    expect(badge.hidden).toBe(true);
  });

  test("indexed:false disables query, search and trace controls; indexed:true enables them", () => {
    const vscode = fakeVscode();
    init(vscode, document);

    const query = document.getElementById("query") as HTMLInputElement;
    const search = document.getElementById("search") as HTMLButtonElement;
    const traceRun = document.getElementById("trace-run") as HTMLButtonElement;
    const traceSymbol = document.getElementById("trace-symbol") as HTMLInputElement;
    const traceFromFocused = document.getElementById("trace-from-focused") as HTMLButtonElement;

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "status", folderId: "", statusToken: "t", indexed: false, detail: "not indexed", canStartWatcher: true },
      }),
    );
    expect(document.getElementById("badge")!.textContent).toContain("not indexed");
    expect(query.disabled).toBe(true);
    expect(search.disabled).toBe(true);
    expect(traceRun.disabled).toBe(true);
    expect(traceSymbol.disabled).toBe(true);
    expect(traceFromFocused.disabled).toBe(true);

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "status", folderId: "", statusToken: "t", indexed: true, detail: "indexed", canStartWatcher: false },
      }),
    );
    expect(query.disabled).toBe(false);
    expect(search.disabled).toBe(false);
    expect(traceRun.disabled).toBe(false);
    expect(traceSymbol.disabled).toBe(false);
    expect(traceFromFocused.disabled).toBe(false);
  });

  test("switching to an unindexed folder clears stale results and trace panel", () => {
    const vscode = fakeVscode();
    init(vscode, document);

    document.getElementById("results")!.innerHTML = '<button class="result">old</button>';
    document.getElementById("trace-results")!.innerHTML = '<div class="trace-node">old</div>';

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "status", folderId: "", statusToken: "t", indexed: false, detail: "not indexed", canStartWatcher: true },
      }),
    );

    expect(document.querySelectorAll("#results .result")).toHaveLength(0);
    expect(document.getElementById("trace-results")!.innerHTML).toBe("");
  });

  test("changing the folder requests a status refresh for the new folder", () => {
    const vscode = fakeVscode();
    init(vscode, document);

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "state",
          defaultLimit: 8,
          folders: [
            { id: "a", label: "Folder A" },
            { id: "b", label: "Folder B" },
          ],
        },
      }),
    );

    const folder = document.getElementById("folder") as HTMLSelectElement;
    folder.value = "b";
    folder.dispatchEvent(new Event("change"));

    expect(vscode.posted).toContainEqual({ type: "refreshStatus", folderId: "b" });
  });
});

describe("live search", () => {
  test("debounced input searches only when the folder is indexed", () => {
    vi.useFakeTimers();
    const vscode = fakeVscode();
    init(vscode, document);

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "state",
          defaultLimit: 8,
          liveSearch: true,
          liveSearchDelayMs: 200,
          groupByFile: true,
          folders: [{ id: "a", label: "Folder A" }],
        },
      }),
    );

    const query = document.getElementById("query") as HTMLInputElement;

    // Folder not yet indexed → no live search
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "status", folderId: "a", statusToken: "t", indexed: false, detail: "not indexed", canStartWatcher: true },
      }),
    );
    query.value = "auth";
    query.dispatchEvent(new Event("input"));
    vi.advanceTimersByTime(300);
    expect(vscode.posted.filter((m) => m.type === "search")).toHaveLength(0);

    // Folder indexed → live search fires after debounce
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "status", folderId: "a", statusToken: "t", indexed: true, detail: "indexed", canStartWatcher: false },
      }),
    );
    query.value = "auth flow";
    query.dispatchEvent(new Event("input"));
    vi.advanceTimersByTime(300);
    expect(vscode.posted.filter((m) => m.type === "search")).toHaveLength(1);

    vi.useRealTimers();
  });

  test("does not search on input when liveSearch is disabled", () => {
    vi.useFakeTimers();
    const vscode = fakeVscode();
    init(vscode, document);

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "state",
          defaultLimit: 8,
          liveSearch: false,
          liveSearchDelayMs: 200,
          folders: [{ id: "a", label: "Folder A" }],
        },
      }),
    );
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "status", folderId: "a", statusToken: "t", indexed: true, detail: "indexed", canStartWatcher: false },
      }),
    );

    const query = document.getElementById("query") as HTMLInputElement;
    query.value = "auth";
    query.dispatchEvent(new Event("input"));
    vi.advanceTimersByTime(500);

    expect(vscode.posted.filter((m) => m.type === "search")).toHaveLength(0);
    vi.useRealTimers();
  });
});

describe("keyboard navigation", () => {
  test("ArrowDown moves focus between result cards", () => {
    const vscode = fakeVscode();
    init(vscode, document);

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "results",
          folderId: "",
          results: [
            { id: "0", displayPath: "a.ts", startLine: 1, endLine: 2, score: 0.9, preview: "x" },
            { id: "1", displayPath: "b.ts", startLine: 3, endLine: 4, score: 0.4, preview: "y" },
          ],
        },
      }),
    );

    const cards = document.querySelectorAll(".result");
    (cards[0] as HTMLElement).focus();
    cards[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));

    expect(document.activeElement).toBe(cards[1]);
  });

  test("autofocus fires after an explicit submit but not on a later non-submit render", () => {
    const vscode = fakeVscode();
    init(vscode, document);

    const resultsMsg = {
      type: "results",
      folderId: "",
      results: [{ id: "0", displayPath: "a.ts", startLine: 1, endLine: 2, score: 0.9, preview: "x" }],
    };

    // Explicit submit then results → first card is focused
    (document.getElementById("query") as HTMLInputElement).value = "q";
    document.getElementById("form")!.dispatchEvent(new Event("submit"));
    window.dispatchEvent(new MessageEvent("message", { data: resultsMsg }));
    expect(document.activeElement).toBe(document.querySelector(".result"));

    // Move focus away, then a results render NOT preceded by a submit must not steal focus
    (document.getElementById("query") as HTMLInputElement).focus();
    window.dispatchEvent(new MessageEvent("message", { data: resultsMsg }));
    expect(document.activeElement).toBe(document.getElementById("query"));
  });
});

function traceResultsMsg(over: any) {
  return {
    type: "traceResults",
    folderId: "",
    view: "tree",
    parentId: null,
    nodes: [{ nodeId: "n1", name: "doThing", location: "b.ts:10", locationId: "n1", expandable: true, symbolName: "doThing" }],
    ...over,
  };
}

describe("trace tree", () => {
  test("root trace replaces the tree; matching request id only", () => {
    const vscode = fakeVscode();
    init(vscode, document);

    (document.getElementById("trace-symbol") as HTMLInputElement).value = "search";
    document.getElementById("trace-run")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const sent = vscode.posted.find((m) => m.type === "trace");
    expect(sent).toMatchObject({ type: "trace", symbol: "search", direction: "callers" });

    window.dispatchEvent(new MessageEvent("message", { data: traceResultsMsg({ traceRequestId: sent.traceRequestId }) }));
    expect(document.querySelectorAll("#trace-results .trace-node")).toHaveLength(1);

    window.dispatchEvent(new MessageEvent("message", { data: traceResultsMsg({ traceRequestId: sent.traceRequestId - 1, nodes: [] }) }));
    expect(document.querySelectorAll("#trace-results .trace-node")).toHaveLength(1);
  });

  test("expansion appends children under the parent node", () => {
    const vscode = fakeVscode();
    init(vscode, document);
    (document.getElementById("trace-symbol") as HTMLInputElement).value = "search";
    document.getElementById("trace-run")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const id = vscode.posted.find((m) => m.type === "trace").traceRequestId;
    window.dispatchEvent(new MessageEvent("message", { data: traceResultsMsg({ traceRequestId: id }) }));

    window.dispatchEvent(
      new MessageEvent("message", {
        data: traceResultsMsg({
          traceRequestId: id,
          parentId: "n1",
          nodes: [{ nodeId: "n2", name: "caller2", location: "c.ts:3", locationId: "n2", expandable: true, symbolName: "caller2" }],
        }),
      }),
    );

    const child = document.querySelector('[data-node-id="n1"] .trace-node[data-node-id="n2"]');
    expect(child).not.toBeNull();
  });

  test("traceError shows inline and leaves search results intact", () => {
    const vscode = fakeVscode();
    init(vscode, document);
    document.getElementById("results")!.innerHTML = '<button class="result">kept</button>';
    (document.getElementById("trace-symbol") as HTMLInputElement).value = "x";
    document.getElementById("trace-run")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const id = vscode.posted.find((m) => m.type === "trace").traceRequestId;

    window.dispatchEvent(new MessageEvent("message", { data: { type: "traceError", folderId: "", traceRequestId: id, message: "nope" } }));

    expect(document.getElementById("trace-status")!.textContent).toContain("nope");
    expect(document.querySelectorAll("#results .result")).toHaveLength(1);
  });

  test("From focused result seeds the symbol input from the last-focused card", () => {
    const vscode = fakeVscode();
    init(vscode, document);
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "results",
          folderId: "",
          results: [{ id: "0", displayPath: "a.ts", startLine: 1, endLine: 2, score: 0.9, preview: "function doStuff() {}" }],
        },
      }),
    );

    (document.querySelector(".result") as HTMLElement).focus(); // records last-focused result via focusin
    document.getElementById("trace-from-focused")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect((document.getElementById("trace-symbol") as HTMLInputElement).value).toBe("doStuff");
  });
});

describe("trace graph", () => {
  test("renders nodes and edges, each opening a location", () => {
    const vscode = fakeVscode();
    init(vscode, document);
    // folder must be indexed for trace interactions to be enabled
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "status", folderId: "", statusToken: "t", indexed: true, detail: "indexed", canStartWatcher: false },
      }),
    );
    (document.getElementById("trace-symbol") as HTMLInputElement).value = "search";
    (document.getElementById("trace-direction") as HTMLSelectElement).value = "graph";
    document.getElementById("trace-run")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const id = vscode.posted.find((m) => m.type === "trace").traceRequestId;

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "traceResults",
          folderId: "",
          traceRequestId: id,
          view: "graph",
          parentId: null,
          nodes: [
            { nodeId: "g0", name: "search", location: "a.ts:1", locationId: "g0" },
            { nodeId: "g1", name: "getIndex", location: "a.ts:7", locationId: "g1", placeholder: true },
          ],
          edges: [{ from: "search", to: "getIndex", locationId: "e0", label: "a.ts:7" }],
        },
      }),
    );

    expect(document.querySelectorAll("#trace-results .graph-node")).toHaveLength(2);
    expect(document.querySelectorAll("#trace-results .graph-edge")).toHaveLength(1);

    // placeholder nodes are marked with a "(ref)" badge
    expect(document.querySelector(".graph-node .graph-placeholder")!.textContent).toContain("(ref)");

    (document.querySelector(".graph-edge .trace-open") as HTMLElement).dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    expect(vscode.posted).toContainEqual({ type: "openLocation", id: "e0", mode: "preview" });
  });

  test("escapes HTML in node names (no raw markup injected)", () => {
    const vscode = fakeVscode();
    init(vscode, document);
    (document.getElementById("trace-symbol") as HTMLInputElement).value = "x";
    (document.getElementById("trace-direction") as HTMLSelectElement).value = "graph";
    document.getElementById("trace-run")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const id = vscode.posted.find((m) => m.type === "trace").traceRequestId;

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "traceResults",
          folderId: "",
          traceRequestId: id,
          view: "graph",
          parentId: null,
          nodes: [{ nodeId: "g0", name: "<img src=x onerror=alert(1)>", location: "a.ts:1", locationId: "g0" }],
          edges: [],
        },
      }),
    );

    const results = document.getElementById("trace-results")!;
    expect(results.querySelector("img")).toBeNull();
    expect(results.innerHTML).toContain("&lt;img");
  });
});

describe("group by file", () => {
  test("toggling group-by-file groups multiple hits and persists the preference", () => {
    const vscode = fakeVscode();
    init(vscode, document);

    const toggle = document.getElementById("group-toggle") as HTMLInputElement;
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));
    expect(vscode.getState().groupByFile).toBe(true);

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "results",
          folderId: "",
          results: [
            { id: "0", displayPath: "a.ts", startLine: 1, endLine: 2, score: 0.9, preview: "x" },
            { id: "1", displayPath: "a.ts", startLine: 5, endLine: 6, score: 0.5, preview: "y" },
          ],
        },
      }),
    );

    const group = document.querySelector("details.file-group")!;
    expect(group.querySelector("summary")!.textContent).toContain("a.ts (2)");
    expect(group.querySelectorAll(".result")).toHaveLength(2);
  });

  test("with grouping off, multiple hits in one file render as flat cards", () => {
    const vscode = fakeVscode();
    init(vscode, document);

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "results",
          folderId: "",
          results: [
            { id: "0", displayPath: "a.ts", startLine: 1, endLine: 2, score: 0.9, preview: "x" },
            { id: "1", displayPath: "a.ts", startLine: 5, endLine: 6, score: 0.5, preview: "y" },
          ],
        },
      }),
    );

    expect(document.querySelector("details.file-group")).toBeNull();
    expect(document.querySelectorAll(".result")).toHaveLength(2);
  });
});

describe("folder selector UX", () => {
  test("preserves the selected folder across a state repost that still contains it", () => {
    const vscode = fakeVscode();
    init(vscode, document);

    const stateMsg = (folders: any[]) => ({
      type: "state",
      defaultLimit: 8,
      folders,
    });

    const twoFolders = [
      { id: "a", label: "Folder A" },
      { id: "b", label: "Folder B" },
    ];
    window.dispatchEvent(new MessageEvent("message", { data: stateMsg(twoFolders) }));
    (document.getElementById("folder") as HTMLSelectElement).value = "b";

    // async repost still containing b must NOT reset the selection
    window.dispatchEvent(new MessageEvent("message", { data: stateMsg(twoFolders) }));
    expect((document.getElementById("folder") as HTMLSelectElement).value).toBe("b");
  });

  test("falls back to the first option when the selected folder is gone from a repost", () => {
    const vscode = fakeVscode();
    init(vscode, document);

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "state",
          defaultLimit: 8,
          folders: [
            { id: "a", label: "Folder A" },
            { id: "b", label: "Folder B" },
          ],
        },
      }),
    );
    (document.getElementById("folder") as HTMLSelectElement).value = "b";

    // repost no longer contains b → selection falls back to the first option
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "state", defaultLimit: 8, folders: [{ id: "a", label: "Folder A" }] },
      }),
    );
    expect((document.getElementById("folder") as HTMLSelectElement).value).toBe("a");
  });

  test("the folder selector is hidden with one folder and shown with more than one", () => {
    const vscode = fakeVscode();
    init(vscode, document);

    const folderRow = document.getElementById("folder-row") as HTMLElement;

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "state", defaultLimit: 8, folders: [{ id: "a", label: "Folder A" }] },
      }),
    );
    expect(folderRow.hidden).toBe(true);

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "state",
          defaultLimit: 8,
          folders: [
            { id: "a", label: "Folder A" },
            { id: "b", label: "Folder B" },
          ],
        },
      }),
    );
    expect(folderRow.hidden).toBe(false);
  });
});

describe("stale cross-folder responses", () => {
  function selectFolderA(vscode: ReturnType<typeof fakeVscode>) {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "state",
          defaultLimit: 8,
          folders: [
            { id: "a", label: "Folder A" },
            { id: "b", label: "Folder B" },
          ],
        },
      }),
    );
    (document.getElementById("folder") as HTMLSelectElement).value = "a";
    // mark folder A indexed so search/trace controls are enabled
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "status", folderId: "a", statusToken: "t", indexed: true, detail: "indexed", canStartWatcher: false },
      }),
    );
  }

  test("a results message tagged for another folder is ignored", () => {
    const vscode = fakeVscode();
    init(vscode, document);
    selectFolderA(vscode);

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "results",
          folderId: "b",
          results: [{ id: "0", displayPath: "a.ts", startLine: 1, endLine: 2, score: 0.9, preview: "x" }],
        },
      }),
    );

    expect(document.querySelectorAll("#results .result")).toHaveLength(0);
  });

  test("a traceResults message tagged for another folder is ignored", () => {
    const vscode = fakeVscode();
    init(vscode, document);
    selectFolderA(vscode);

    (document.getElementById("trace-symbol") as HTMLInputElement).value = "search";
    document.getElementById("trace-run")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const id = vscode.posted.find((m) => m.type === "trace").traceRequestId;

    window.dispatchEvent(new MessageEvent("message", { data: traceResultsMsg({ folderId: "b", traceRequestId: id }) }));
    expect(document.querySelectorAll("#trace-results .trace-node")).toHaveLength(0);
  });

  test("a traceError message tagged for another folder is ignored", () => {
    const vscode = fakeVscode();
    init(vscode, document);
    selectFolderA(vscode);

    (document.getElementById("trace-symbol") as HTMLInputElement).value = "search";
    document.getElementById("trace-run")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const id = vscode.posted.find((m) => m.type === "trace").traceRequestId;

    window.dispatchEvent(
      new MessageEvent("message", { data: { type: "traceError", folderId: "b", traceRequestId: id, message: "nope" } }),
    );
    expect(document.getElementById("trace-status")!.textContent).not.toContain("nope");
  });

  test("an error message tagged for another folder is ignored", () => {
    const vscode = fakeVscode();
    init(vscode, document);
    selectFolderA(vscode);
    document.getElementById("results")!.innerHTML = '<button class="result">kept</button>';

    window.dispatchEvent(
      new MessageEvent("message", { data: { type: "error", folderId: "b", message: "boom" } }),
    );

    expect(document.querySelectorAll("#results .result")).toHaveLength(1);
    expect(document.getElementById("status")!.textContent).not.toBe("boom");
  });
});

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
