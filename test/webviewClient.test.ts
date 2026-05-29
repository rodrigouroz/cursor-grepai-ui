// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";
import { init } from "../media/main.js";

function mountShell() {
  document.body.innerHTML = `
    <form id="form">
      <input id="query" type="search">
      <select id="scope"></select>
      <button id="refresh-scopes">Refresh scopes</button>
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
        data: { type: "state", defaultLimit: 10, scopes: [] },
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

describe("open modes", () => {
  test("plain click opens in preview; alt-click opens beside", () => {
    const vscode = fakeVscode();
    init(vscode, document);
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "results",
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
  test("renders detail and a Start watcher button when allowed", () => {
    const vscode = fakeVscode();
    init(vscode, document);

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "status",
          statusToken: "tok1",
          indexed: true,
          detail: "indexed · updated 2h ago",
          canStartWatcher: true,
        },
      }),
    );

    const badge = document.getElementById("badge")!;
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toContain("indexed · updated 2h ago");
    const button = badge.querySelector("button")!;
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(vscode.posted).toContainEqual({ type: "startWatcher", statusToken: "tok1" });
  });

  test("neutral and unavailable statuses show hints without a watcher button", () => {
    const vscode = fakeVscode();
    init(vscode, document);
    const badge = document.getElementById("badge")!;

    window.dispatchEvent(new MessageEvent("message", { data: { type: "status", neutral: true } }));
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toBe("select a scope or search");
    expect(badge.querySelector("button")).toBeNull();

    window.dispatchEvent(new MessageEvent("message", { data: { type: "status", unavailable: true } }));
    expect(badge.textContent).toBe("status unavailable");
    expect(badge.querySelector("button")).toBeNull();
  });

  test("a status with canStartWatcher false shows detail but no button", () => {
    const vscode = fakeVscode();
    init(vscode, document);

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "status", statusToken: "t", indexed: true, detail: "indexed ✓ · watching", canStartWatcher: false },
      }),
    );

    const badge = document.getElementById("badge")!;
    expect(badge.textContent).toBe("indexed ✓ · watching");
    expect(badge.querySelector("button")).toBeNull();
  });

  test("changing the scope requests a status refresh for the new scope", () => {
    const vscode = fakeVscode();
    init(vscode, document);

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "state",
          defaultLimit: 8,
          scopes: [
            { id: "current", label: "Current", concrete: false },
            { id: "acme/api", label: "api", concrete: true },
          ],
        },
      }),
    );

    const scope = document.getElementById("scope") as HTMLSelectElement;
    scope.value = "acme/api";
    scope.dispatchEvent(new Event("change"));

    expect(vscode.posted).toContainEqual({ type: "refreshStatus", scopeId: "acme/api" });
  });
});

describe("live search", () => {
  test("debounced input searches only when the scope is concrete", () => {
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
          scopes: [
            { id: "current", label: "Current folder", concrete: false },
            { id: "acme/api", label: "api", concrete: true },
          ],
        },
      }),
    );

    const query = document.getElementById("query") as HTMLInputElement;

    // Non-concrete scope selected → no live search
    (document.getElementById("scope") as HTMLSelectElement).value = "current";
    query.value = "auth";
    query.dispatchEvent(new Event("input"));
    vi.advanceTimersByTime(300);
    expect(vscode.posted.filter((m) => m.type === "search")).toHaveLength(0);

    // Concrete scope → live search fires after debounce
    (document.getElementById("scope") as HTMLSelectElement).value = "acme/api";
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
          scopes: [{ id: "acme/api", label: "api", concrete: true }],
        },
      }),
    );

    const query = document.getElementById("query") as HTMLInputElement;
    (document.getElementById("scope") as HTMLSelectElement).value = "acme/api";
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

    window.dispatchEvent(new MessageEvent("message", { data: { type: "traceError", traceRequestId: id, message: "nope" } }));

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
    (document.getElementById("trace-symbol") as HTMLInputElement).value = "search";
    (document.getElementById("trace-direction") as HTMLSelectElement).value = "graph";
    document.getElementById("trace-run")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const id = vscode.posted.find((m) => m.type === "trace").traceRequestId;

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "traceResults",
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

describe("scope discovery UX", () => {
  test("preserves the selected scope across a state repost that still contains it", () => {
    const vscode = fakeVscode();
    init(vscode, document);

    const stateMsg = (extra: any[]) => ({
      type: "state",
      defaultLimit: 8,
      scopes: [{ id: "current", label: "Current folder", concrete: false }, ...extra],
    });

    // initial state: only Current folder
    window.dispatchEvent(new MessageEvent("message", { data: stateMsg([]) }));
    // user picks a discovered scope that arrives in a later repost
    window.dispatchEvent(
      new MessageEvent("message", { data: stateMsg([{ id: "acme/api", label: "acme: api", concrete: true }]) }),
    );
    (document.getElementById("scope") as HTMLSelectElement).value = "acme/api";

    // async repost still containing acme/api must NOT reset the selection
    window.dispatchEvent(
      new MessageEvent("message", { data: stateMsg([{ id: "acme/api", label: "acme: api", concrete: true }]) }),
    );
    expect((document.getElementById("scope") as HTMLSelectElement).value).toBe("acme/api");
  });

  test("falls back to the first option when the selected scope is gone from a repost", () => {
    const vscode = fakeVscode();
    init(vscode, document);

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "state",
          defaultLimit: 8,
          scopes: [
            { id: "current", label: "Current folder", concrete: false },
            { id: "acme/api", label: "acme: api", concrete: true },
          ],
        },
      }),
    );
    (document.getElementById("scope") as HTMLSelectElement).value = "acme/api";

    // repost no longer contains acme/api → selection falls back to the first option
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "state", defaultLimit: 8, scopes: [{ id: "current", label: "Current folder", concrete: false }] },
      }),
    );
    expect((document.getElementById("scope") as HTMLSelectElement).value).toBe("current");
  });

  test("the refresh control posts refreshScopes", () => {
    const vscode = fakeVscode();
    init(vscode, document);
    document.getElementById("refresh-scopes")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(vscode.posted).toContainEqual({ type: "refreshScopes" });
  });
});
