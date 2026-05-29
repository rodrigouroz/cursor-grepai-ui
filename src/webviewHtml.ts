export interface WebviewHtmlInput {
  nonce: string;
  cspSource: string;
  scriptUri: string;
  styleUri: string;
}

export function getWebviewHtml(input: WebviewHtmlInput): string {
  // script-src must include cspSource (not just the nonce): the entry <script> is a
  // native ES module whose sub-imports (media/lib/*.js) load by URL without the nonce.
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${input.cspSource}; script-src 'nonce-${input.nonce}' ${input.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${input.styleUri}">
  <title>GrepAI Search</title>
</head>
<body>
  <form id="form">
    <label>
      Query
      <input id="query" type="search" placeholder="Search code semantically" autocomplete="off" list="history">
    </label>
    <datalist id="history"></datalist>
    <label>
      Scope
      <select id="scope"></select>
    </label>
    <label>
      Results
      <select id="limit">
        <option value="8">8</option>
        <option value="15">15</option>
        <option value="25">25</option>
        <option value="50">50</option>
      </select>
    </label>
    <label class="inline">
      <input id="group-toggle" type="checkbox"> Group by file
    </label>
    <button id="search" type="submit">Search</button>
  </form>
  <div id="badge" class="badge" hidden></div>
  <div id="status">Ready</div>
  <div id="results"></div>
  <details id="trace-panel" class="trace-panel">
    <summary>Call graph</summary>
    <div class="trace-controls">
      <input id="trace-symbol" type="text" placeholder="Symbol name" autocomplete="off">
      <select id="trace-direction">
        <option value="callers">Callers</option>
        <option value="callees">Callees</option>
        <option value="graph">Graph</option>
      </select>
      <select id="trace-depth">
        <option value="2">depth 2</option>
        <option value="3">depth 3</option>
        <option value="4">depth 4</option>
      </select>
      <button id="trace-run" type="button">Trace</button>
      <button id="trace-from-focused" type="button">From focused result</button>
    </div>
    <div id="trace-status"></div>
    <div id="trace-results"></div>
  </details>
  <script type="module" nonce="${input.nonce}" src="${input.scriptUri}"></script>
</body>
</html>`;
}
