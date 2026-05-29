import { normalizeScores } from "./lib/score.js";
import { pushHistory } from "./lib/history.js";
import { nextFocusIndex } from "./lib/nav.js";
import { highlight, languageFromPath } from "./lib/highlight.js";
import { groupByFile } from "./lib/group.js";
import { deriveSymbol } from "./lib/symbol.js";

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function cssEscape(value) {
  return String(value).replace(/["\\]/g, "\\$&");
}

export function init(vscode, doc = document) {
  const view = doc.defaultView ?? window;
  const form = doc.getElementById("form");
  const query = doc.getElementById("query");
  const folder = doc.getElementById("folder");
  const folderRow = doc.getElementById("folder-row");
  const status = doc.getElementById("status");
  const results = doc.getElementById("results");
  const limit = doc.getElementById("limit");
  const badge = doc.getElementById("badge");
  const searchBtn = doc.getElementById("search");
  let defaultLimit = 8;
  let lastSearchExplicit = false;
  let liveSearch = false;
  let liveDelay = 350;
  let folderIndexed = false;
  let debounceTimer = null;

  function selectedFolderId() {
    return folder ? folder.value : "";
  }

  const traceSymbol = doc.getElementById("trace-symbol");
  const traceDirection = doc.getElementById("trace-direction");
  const traceDepth = doc.getElementById("trace-depth");
  const traceRun = doc.getElementById("trace-run");
  const traceFromFocused = doc.getElementById("trace-from-focused");
  const tracePanel = doc.getElementById("trace-panel");
  const traceStatus = doc.getElementById("trace-status");
  const traceResultsEl = doc.getElementById("trace-results");
  let traceReqId = 0;
  let currentTraceReqId = 0;
  let traceMode = "precise";

  const groupToggle = doc.getElementById("group-toggle");
  let groupByFileEnabled = false; // matches the unchecked checkbox until `state` (or persisted prefs) sets it
  let lastResults = [];

  const historyList = doc.getElementById("history");
  let searchHistory = (vscode.getState && vscode.getState()?.history) || [];

  function renderHistory() {
    if (!historyList) return;
    historyList.innerHTML = searchHistory
      .map((item) => '<option value="' + escapeHtml(item) + '"></option>')
      .join("");
  }
  renderHistory();

  function pathHtml(displayPath) {
    const path = String(displayPath);
    const slash = path.lastIndexOf("/");
    const file = slash >= 0 ? path.slice(slash + 1) : path;
    const dir = slash >= 0 ? path.slice(0, slash) : "";
    // filename first (never truncated); directory muted and ellipsized from the
    // left via .path-dir so the deepest, most relevant folders stay visible.
    return (
      '<div class="path" title="' + escapeHtml(path) + '">' +
      '<span class="path-file">' + escapeHtml(file) + "</span>" +
      (dir ? '<span class="path-dir" dir="rtl">' + escapeHtml(dir) + "</span>" : "") +
      "</div>"
    );
  }

  function cardHtml(item) {
    return (
      '<button class="result" type="button" data-id="' + escapeHtml(item.id) +
      '" data-symbol="' + escapeHtml(deriveSymbol(item.preview)) + '">' +
      pathHtml(item.displayPath) +
      '<div class="meta" title="score ' + escapeHtml(Number(item.score).toFixed(3)) + '">' +
      "L" + escapeHtml(item.startLine) + "-" + escapeHtml(item.endLine) +
      ' · <span class="strength">' + escapeHtml(item.label) + "</span></div>" +
      '<div class="score-bar"><span style="width:' + escapeHtml(item.barWidth) + '%"></span></div>' +
      '<div class="preview">' + highlight(item.preview, languageFromPath(item.displayPath)) + "</div>" +
      "</button>"
    );
  }

  // A clamped preview only gets the bottom fade when its content actually
  // overflows, so short snippets aren't visually faded for no reason.
  function markClippedPreviews() {
    results.querySelectorAll(".preview").forEach((el) => {
      el.classList.toggle("preview--clipped", el.scrollHeight > el.clientHeight + 1);
    });
  }

  function renderResults(items) {
    lastResults = items;
    const scored = normalizeScores(items);
    const grouped = groupByFileEnabled && new Set(scored.map((i) => i.displayPath)).size < scored.length;
    if (!grouped) {
      results.innerHTML = scored.map(cardHtml).join("");
      markClippedPreviews();
      return;
    }
    results.innerHTML = groupByFile(scored)
      .map((group) => {
        if (group.hits.length === 1) return cardHtml(group.hits[0]);
        return (
          '<details class="file-group" open>' +
          "<summary>" + escapeHtml(group.displayPath) + " (" + group.hits.length + ")</summary>" +
          group.hits.map(cardHtml).join("") +
          "</details>"
        );
      })
      .join("");
    markClippedPreviews();
  }

  function runSearch(explicit) {
    lastSearchExplicit = explicit;
    vscode.postMessage({
      type: "search",
      query: query.value,
      folderId: selectedFolderId(),
      limit: limit ? Number(limit.value) || defaultLimit : defaultLimit,
    });
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = query.value;
    searchHistory = pushHistory(searchHistory, value);
    if (vscode.setState) vscode.setState({ ...(vscode.getState?.() || {}), history: searchHistory });
    renderHistory();
    runSearch(true);
  });

  folder.addEventListener("change", () => {
    results.innerHTML = "";
    traceResultsEl.innerHTML = "";
    traceStatus.textContent = "";
    status.textContent = "";
    vscode.postMessage({ type: "refreshStatus", folderId: selectedFolderId() });
  });

  query.addEventListener("input", () => {
    if (!liveSearch) return;
    if (!folderIndexed) return;
    if (!query.value.trim()) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => runSearch(false), liveDelay);
  });

  function sendTrace(expandNodeId, symbolOverride) {
    const symbol = symbolOverride ?? traceSymbol.value;
    if (!symbol.trim()) return;
    if (expandNodeId === undefined) {
      traceReqId += 1;
      currentTraceReqId = traceReqId;
      traceResultsEl.innerHTML = "";
      traceStatus.textContent = "Tracing...";
    }
    vscode.postMessage({
      type: "trace",
      traceRequestId: currentTraceReqId,
      folderId: selectedFolderId(),
      symbol,
      direction: traceDirection.value,
      mode: traceMode,
      depth: traceDirection.value === "graph" ? Number(traceDepth.value) : undefined,
      expandNodeId,
    });
  }

  if (traceRun) traceRun.addEventListener("click", () => sendTrace());

  function updateDepthVisibility() {
    if (traceDepth) traceDepth.style.display = traceDirection.value === "graph" ? "" : "none";
  }
  if (traceDirection) {
    traceDirection.addEventListener("change", updateDepthVisibility);
    updateDepthVisibility();
  }

  // Track the last-focused result so "From focused result" works: a click moves
  // focus to the button itself, so reading document.activeElement at click time would miss it.
  let lastFocusedResult = null;
  results.addEventListener("focusin", (event) => {
    if (event.target.classList && event.target.classList.contains("result")) {
      lastFocusedResult = event.target;
    }
  });

  if (traceFromFocused) {
    traceFromFocused.addEventListener("click", () => {
      const seed = lastFocusedResult?.dataset.symbol ?? "";
      if (seed) traceSymbol.value = seed;
      if (tracePanel) tracePanel.open = true;
      traceSymbol.focus();
    });
  }

  function traceNodeHtml(node) {
    const expand = node.expandable
      ? '<button class="trace-expand" type="button" data-node-id="' + escapeHtml(node.nodeId) +
        '" data-symbol="' + escapeHtml(node.symbolName || node.name) + '">▶</button>'
      : "";
    return (
      '<div class="trace-node" data-node-id="' + escapeHtml(node.nodeId) + '">' +
      '<div class="trace-row">' +
      expand +
      '<button class="trace-open" type="button" data-loc="' + escapeHtml(node.locationId) + '">' +
      escapeHtml(node.name) + ' <span class="trace-loc">' + escapeHtml(node.location) + "</span>" +
      "</button></div>" +
      '<div class="trace-children"></div>' +
      "</div>"
    );
  }

  function renderTraceTree(message) {
    if (message.parentId === null) {
      traceStatus.textContent = message.nodes.length ? message.nodes.length + " result(s)" : "No callers/callees";
      traceResultsEl.innerHTML = message.nodes.map(traceNodeHtml).join("");
      return;
    }
    const parent = traceResultsEl.querySelector('[data-node-id="' + cssEscape(message.parentId) + '"]');
    if (!parent) return;
    const children = parent.querySelector(".trace-children");
    children.innerHTML = message.nodes.map(traceNodeHtml).join("");
  }

  function renderTraceGraph(message) {
    traceStatus.textContent =
      message.nodes.length + " node(s), " + message.edges.length + " edge(s)";
    const nodesHtml = message.nodes
      .map(
        (node) =>
          '<div class="graph-node">' +
          '<button class="trace-open" type="button" data-loc="' + escapeHtml(node.locationId) + '">' +
          escapeHtml(node.name) +
          (node.placeholder ? ' <span class="graph-placeholder">(ref)</span>' : "") +
          ' <span class="trace-loc">' + escapeHtml(node.location ?? "") + "</span></button></div>",
      )
      .join("");
    const edgesHtml = message.edges
      .map(
        (edge) =>
          '<div class="graph-edge">' +
          '<button class="trace-open" type="button" data-loc="' + escapeHtml(edge.locationId) + '">' +
          escapeHtml(edge.from) + " → " + escapeHtml(edge.to) +
          ' <span class="trace-loc">' + escapeHtml(edge.label ?? "") + "</span></button></div>",
      )
      .join("");
    traceResultsEl.innerHTML =
      '<div class="graph-nodes">' + nodesHtml + "</div>" +
      '<div class="graph-edges">' + edgesHtml + "</div>";
  }

  if (traceResultsEl) {
    traceResultsEl.addEventListener("click", (event) => {
      if (!folderIndexed) return; // defense-in-depth: no trace actions on an unindexed folder
      const expand = event.target.closest(".trace-expand");
      if (expand) {
        sendTrace(expand.dataset.nodeId, expand.dataset.symbol);
        return;
      }
      const open = event.target.closest(".trace-open");
      if (open) {
        const mode = event.altKey ? "beside" : event.metaKey || event.ctrlKey ? "active" : "preview";
        vscode.postMessage({ type: "openLocation", id: open.dataset.loc, mode });
      }
    });
  }

  if (groupToggle) {
    groupToggle.addEventListener("change", () => {
      groupByFileEnabled = groupToggle.checked;
      if (vscode.setState) vscode.setState({ ...(vscode.getState?.() || {}), groupByFile: groupByFileEnabled });
      renderResults(lastResults);
    });
  }

  results.addEventListener("click", (event) => {
    const target = event.target.closest(".result");
    if (!target) return;
    const mode = event.altKey ? "beside" : event.metaKey || event.ctrlKey ? "active" : "preview";
    vscode.postMessage({ type: "openResult", id: target.dataset.id, mode });
  });

  results.addEventListener("keydown", (event) => {
    const cards = Array.from(results.querySelectorAll(".result"));
    if (cards.length === 0) return;
    if (event.key === "Escape") {
      query.focus();
      return;
    }
    if (event.key === "Enter") {
      const focused = doc.activeElement;
      if (focused && focused.classList.contains("result")) {
        event.preventDefault();
        vscode.postMessage({ type: "openResult", id: focused.dataset.id, mode: "active" });
      }
      return;
    }
    const current = cards.indexOf(doc.activeElement);
    const next = nextFocusIndex(current, cards.length, event.key);
    if (next === null) return;
    event.preventDefault();
    cards[next].focus();
  });

  view.addEventListener("message", (event) => {
    const message = event.data;
    if (message.type === "state") {
      const previousFolder = folder.value;
      folder.innerHTML = message.folders
        .map(
          (item) =>
            '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.label) + "</option>",
        )
        .join("");
      if (previousFolder && Array.from(folder.options).some((o) => o.value === previousFolder)) {
        folder.value = previousFolder;
      }
      if (folderRow) folderRow.hidden = message.folders.length <= 1;
      defaultLimit = Number(message.defaultLimit || 8);
      if (limit) {
        const hasOption = Array.from(limit.options).some((o) => Number(o.value) === defaultLimit);
        if (!hasOption) {
          const option = doc.createElement("option");
          option.value = String(defaultLimit);
          option.textContent = String(defaultLimit);
          limit.insertBefore(option, limit.firstChild);
        }
        limit.value = String(defaultLimit);
      }
      liveSearch = Boolean(message.liveSearch);
      liveDelay = Number(message.liveSearchDelayMs || 350);
      traceMode = message.traceMode || "precise";
      groupByFileEnabled = (vscode.getState?.()?.groupByFile) ?? Boolean(message.groupByFile);
      if (groupToggle) groupToggle.checked = groupByFileEnabled;
      status.textContent = "Ready";
      vscode.postMessage({ type: "refreshStatus", folderId: selectedFolderId() });
    }
    if (message.type === "searching") status.textContent = "Searching...";
    if (message.type === "results") {
      if (message.folderId !== selectedFolderId()) return;
      status.textContent = message.results.length ? message.results.length + " result(s)" : "No results";
      renderResults(message.results);
      const first = results.querySelector(".result");
      if (first && lastSearchExplicit) first.focus();
      lastSearchExplicit = false; // consume-once: later (e.g. live-search) renders must not grab focus
    }
    if (message.type === "error") {
      if (message.folderId !== undefined && message.folderId !== selectedFolderId()) return;
      status.textContent = message.message;
      results.innerHTML = "";
    }
    if (message.type === "traceResults") {
      if (message.traceRequestId !== currentTraceReqId) return;
      if (message.folderId !== selectedFolderId()) return;
      if (message.view === "graph") renderTraceGraph(message);
      else renderTraceTree(message);
    }
    if (message.type === "traceError") {
      if (message.traceRequestId !== currentTraceReqId) return;
      if (message.folderId !== selectedFolderId()) return;
      traceStatus.textContent = message.message;
    }
    if (message.type === "status") {
      if (message.folderId !== selectedFolderId()) return;
      folderIndexed = Boolean(message.indexed);
      if (badge) {
        badge.hidden = false;
        // Read-only freshness indicator. The extension reports the index state
        // but does not manage the GrepAI watcher — running `grepai watch` is
        // the user's responsibility.
        badge.textContent = message.detail;
      }
      query.disabled = !folderIndexed;
      if (searchBtn) searchBtn.disabled = !folderIndexed;
      if (traceRun) traceRun.disabled = !folderIndexed;
      if (traceSymbol) traceSymbol.disabled = !folderIndexed;
      if (traceFromFocused) traceFromFocused.disabled = !folderIndexed;
      if (!folderIndexed) {
        results.innerHTML = "";
        traceResultsEl.innerHTML = "";
        traceStatus.textContent = "";
      }
    }
  });

  vscode.postMessage({ type: "ready" });
}

if (typeof acquireVsCodeApi === "function") {
  init(acquireVsCodeApi());
}
