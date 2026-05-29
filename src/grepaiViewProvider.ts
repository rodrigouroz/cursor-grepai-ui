import * as vscode from "vscode";
import {
  runGrepaiSearch,
  runProcess,
  resolveResultPath,
  buildStatusArgs,
  buildWatchStatusArgs,
  buildWatchBackgroundArgs,
  buildTraceArgs,
  parseLocalStatus,
  isFolderIndexed,
} from "./grepaiCli";
import { normalizeCallerCallee, normalizeGraph } from "./traceModel";
import { filterExistingResults } from "./resultFilter";
import type { NormalizedGrepaiResult } from "./resultModel";
import { getWebviewHtml } from "./webviewHtml";
import { resolveOpenOptions, type OpenMode } from "./openMode";

interface FolderOption {
  id: string;
  label: string;
}

type WebviewMessage =
  | { type: "ready" }
  | { type: "search"; query: string; folderId: string; limit: number }
  | { type: "openResult"; id: string; mode?: OpenMode }
  | { type: "refreshStatus"; folderId: string }
  | { type: "startWatcher"; statusToken: string }
  | {
      type: "trace";
      traceRequestId: number;
      folderId: string;
      symbol: string;
      direction: "callers" | "callees" | "graph";
      mode: string;
      depth?: number;
      expandNodeId?: string;
    }
  | { type: "openLocation"; id: string; mode?: OpenMode };

export class GrepaiViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "grepaiSearch.view";

  private view?: vscode.WebviewView;
  private results = new Map<string, NormalizedGrepaiResult>();
  private activeAbort?: AbortController;
  private requestId = 0;
  private statusContexts = new Map<string, { cwd: string; folderId: string }>();
  private traceRequestId = 0;
  private activeTraceAbort?: AbortController;
  private traceLocations = new Map<string, { filePath: string; line: number }>();
  private locationSeq = 0;

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    const scriptUri = webviewView.webview
      .asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "main.js"))
      .toString();
    const styleUri = webviewView.webview
      .asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "main.css"))
      .toString();
    webviewView.webview.html = getWebviewHtml({
      nonce: createNonce(),
      cspSource: webviewView.webview.cspSource,
      scriptUri,
      styleUri,
    });

    webviewView.webview.onDidReceiveMessage((message: WebviewMessage) => {
      void this.handleMessage(message);
    });
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    if (message.type === "ready") {
      this.postState();
      void this.refreshStatus("");
      return;
    }

    if (message.type === "search") {
      await this.search(message);
      return;
    }

    if (message.type === "openResult") {
      await this.openResult(message.id, message.mode);
      return;
    }

    if (message.type === "refreshStatus") {
      await this.refreshStatus(message.folderId);
      return;
    }

    if (message.type === "startWatcher") {
      await this.startWatcher(message.statusToken);
      return;
    }

    if (message.type === "trace") {
      await this.trace(message);
      return;
    }

    if (message.type === "openLocation") {
      await this.openLocation(message.id, message.mode);
    }
  }

  private postState(): void {
    const settings = this.getSettings();
    const config = vscode.workspace.getConfiguration("grepaiSearch");
    this.view?.webview.postMessage({
      type: "state",
      defaultLimit: settings.defaultLimit,
      liveSearch: config.get<boolean>("liveSearch", false),
      liveSearchDelayMs: config.get<number>("liveSearchDelayMs", 350),
      groupByFile: config.get<boolean>("groupByFile", true),
      traceMode: config.get<string>("traceMode", "precise"),
      folders: this.getFolders(),
    });
  }

  private getFolders(): FolderOption[] {
    return (vscode.workspace.workspaceFolders ?? []).map((folder) => ({
      id: folder.uri.fsPath,
      label: folder.name,
    }));
  }

  private cwdForFolder(folderId: string): string | undefined {
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folderId) {
      return folders.find((folder) => folder.uri.fsPath === folderId)?.uri.fsPath;
    }
    if (folders.length === 1) {
      return folders[0]?.uri.fsPath;
    }
    return undefined;
  }

  private async search(message: Extract<WebviewMessage, { type: "search" }>): Promise<void> {
    const query = message.query.trim();
    if (!query) {
      this.postError("Enter a search query.");
      return;
    }

    const settings = this.getSettings();
    const cwd = this.cwdForFolder(message.folderId);
    if (!cwd) {
      this.postError("Open a folder to search.", message.folderId);
      return;
    }

    this.activeAbort?.abort();
    const abortController = new AbortController();
    this.activeAbort = abortController;
    const currentRequestId = ++this.requestId;
    this.view?.webview.postMessage({ type: "searching" });

    try {
      const statusOut = await runProcess(
        settings.executablePath,
        buildStatusArgs(),
        cwd,
        abortController.signal,
      );
      if (!isFolderIndexed(statusOut)) {
        if (currentRequestId !== this.requestId) {
          return;
        }
        this.postError("No GrepAI index in this folder — run `grepai init`.", message.folderId);
        return;
      }

      const results = await runGrepaiSearch({
        executablePath: settings.executablePath,
        cwd,
        query,
        limit: clampLimit(message.limit, settings.defaultLimit),
        signal: abortController.signal,
      });
      const existingResults = await filterExistingResults(results, fileExists);

      if (currentRequestId !== this.requestId) {
        return;
      }

      if (results.length > 0 && existingResults.length === 0) {
        this.results.clear();
        this.postError(
          "GrepAI returned only files that are missing from this checkout. Refresh the GrepAI index or choose a different scope.",
          message.folderId,
        );
        return;
      }

      this.results = new Map(existingResults.map((result) => [result.id, result]));
      this.view?.webview.postMessage({
        type: "results",
        folderId: message.folderId,
        results: existingResults,
      });
    } catch (error) {
      if (currentRequestId !== this.requestId) {
        return;
      }
      this.results.clear();
      this.postError(error instanceof Error ? error.message : String(error), message.folderId);
    }
  }

  private async openResult(id: string, mode?: OpenMode): Promise<void> {
    const result = this.results.get(id);
    if (!result) {
      this.postError("Result is no longer available.");
      return;
    }
    await this.openAt(result.filePath, result.startLine, mode);
  }

  private async openAt(filePath: string, startLine: number, mode?: OpenMode): Promise<void> {
    if (!(await fileExists(filePath))) {
      this.postError("That file no longer exists in this checkout.");
      return;
    }
    const { preview, beside } = resolveOpenOptions(mode);
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    const line = Math.max(0, startLine - 1);
    const editor = await vscode.window.showTextDocument(document, {
      preview,
      viewColumn: beside ? vscode.ViewColumn.Beside : undefined,
    });
    const position = new vscode.Position(line, 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
  }

  private addTraceLocation(file: string, line: number, cwd: string): string {
    const id = `t${this.traceRequestId}-${this.locationSeq++}`;
    const filePath = resolveResultPath(file, cwd);
    this.traceLocations.set(id, { filePath, line });
    return id;
  }

  private postTraceError(traceRequestId: number, message: string, folderId?: string): void {
    this.view?.webview.postMessage({
      type: "traceError",
      traceRequestId,
      message,
      ...(folderId !== undefined ? { folderId } : {}),
    });
  }

  private async trace(message: Extract<WebviewMessage, { type: "trace" }>): Promise<void> {
    const symbol = message.symbol.trim();
    if (!symbol) {
      this.postTraceError(message.traceRequestId, "Enter a symbol to trace.");
      return;
    }

    const settings = this.getSettings();
    const cwd = this.cwdForFolder(message.folderId);
    if (!cwd) {
      this.postTraceError(message.traceRequestId, "Open a folder to trace.", message.folderId);
      return;
    }

    const isRoot = !message.expandNodeId;
    if (isRoot) {
      if (message.traceRequestId <= this.traceRequestId) return; // stale root
      this.activeTraceAbort?.abort();
      this.activeTraceAbort = new AbortController();
      this.traceRequestId = message.traceRequestId;
      this.traceLocations.clear();
      this.locationSeq = 0;
    } else if (message.traceRequestId !== this.traceRequestId) {
      return; // stale expansion
    }

    try {
      const statusOut = await runProcess(
        settings.executablePath,
        buildStatusArgs(),
        cwd,
        this.activeTraceAbort?.signal,
      );
      if (message.traceRequestId !== this.traceRequestId) return; // superseded mid-flight
      if (!isFolderIndexed(statusOut)) {
        this.postTraceError(
          message.traceRequestId,
          "No GrepAI index in this folder — run `grepai init`.",
          message.folderId,
        );
        return;
      }

      const out = await runProcess(
        settings.executablePath,
        buildTraceArgs({
          direction: message.direction,
          symbol,
          mode: message.mode,
          depth: message.depth,
        }),
        cwd,
        this.activeTraceAbort?.signal,
      );

      if (message.traceRequestId !== this.traceRequestId) return; // superseded mid-flight

      if (out.exitCode !== 0) {
        this.postTraceError(
          message.traceRequestId,
          `Trace unavailable for "${symbol}" — semantic search still works.`,
          message.folderId,
        );
        return;
      }

      const json = JSON.parse(out.stdout);

      if (message.direction === "graph") {
        const g = normalizeGraph(json);
        const nodes = g.nodes.map((n) => {
          const id = this.addTraceLocation(n.file, n.line, cwd);
          return {
            nodeId: id,
            name: n.name,
            location: `${n.file}:${n.line}`,
            locationId: id,
            placeholder: Boolean(n.placeholder),
          };
        });
        const edges = g.edges.map((e) => {
          const id = this.addTraceLocation(e.file, e.line, cwd);
          return { from: e.caller, to: e.callee, locationId: id, label: `${e.file}:${e.line}` };
        });
        this.view?.webview.postMessage({
          type: "traceResults",
          traceRequestId: message.traceRequestId,
          folderId: message.folderId,
          view: "graph",
          parentId: null,
          nodes,
          edges,
        });
        return;
      }

      const trace = normalizeCallerCallee(json, message.direction);
      const nodes = trace.entries.map((entry) => {
        const loc = entry.callSite ?? { file: entry.symbol.file, line: entry.symbol.line };
        const id = this.addTraceLocation(loc.file, loc.line, cwd);
        return {
          nodeId: id,
          name: entry.symbol.name,
          location: `${loc.file}:${loc.line}`,
          locationId: id,
          symbolName: entry.symbol.name,
          expandable: true,
        };
      });
      this.view?.webview.postMessage({
        type: "traceResults",
        traceRequestId: message.traceRequestId,
        folderId: message.folderId,
        view: "tree",
        parentId: message.expandNodeId ?? null,
        nodes,
      });
    } catch (error) {
      if (message.traceRequestId === this.traceRequestId) {
        this.postTraceError(
          message.traceRequestId,
          error instanceof Error ? error.message : String(error),
          message.folderId,
        );
      }
    }
  }

  private async openLocation(id: string, mode?: OpenMode): Promise<void> {
    const location = this.traceLocations.get(id);
    if (!location) {
      this.postError("That location is no longer available — re-run the trace.");
      return;
    }
    await this.openAt(location.filePath, location.line, mode);
  }

  private async refreshStatus(folderId: string): Promise<void> {
    const settings = this.getSettings();
    const cwd = this.cwdForFolder(folderId);
    if (!cwd) {
      this.view?.webview.postMessage({
        type: "status",
        folderId,
        indexed: false,
        detail: "Open a folder to search.",
        canStartWatcher: false,
      });
      return;
    }

    try {
      const statusOut = await runProcess(settings.executablePath, buildStatusArgs(), cwd);
      const indexed = isFolderIndexed(statusOut);

      let detail: string;
      let watcherRunning = false;
      if (indexed) {
        const parsed = parseLocalStatus(statusOut.stdout);
        const watch = await runProcess(settings.executablePath, buildWatchStatusArgs(), cwd);
        watcherRunning =
          watch.exitCode === 0 &&
          /running/i.test(watch.stdout) &&
          !/not running/i.test(watch.stdout);
        detail = `indexed · updated ${parsed.lastUpdated}` + (watcherRunning ? " · watching" : "");
      } else {
        detail = "No GrepAI index in this folder — run `grepai init`";
      }

      const statusToken = createNonce();
      this.statusContexts.set(statusToken, { cwd, folderId });
      this.view?.webview.postMessage({
        type: "status",
        statusToken,
        folderId,
        indexed,
        detail,
        canStartWatcher: indexed && !watcherRunning,
      });
    } catch {
      this.view?.webview.postMessage({
        type: "status",
        folderId,
        indexed: false,
        detail: "status unavailable",
        canStartWatcher: false,
      });
    }
  }

  private async startWatcher(statusToken: string): Promise<void> {
    const ctx = this.statusContexts.get(statusToken);
    if (!ctx) {
      this.postError("Status changed — refresh and try Start watcher again.");
      return;
    }
    const settings = this.getSettings();
    try {
      const out = await runProcess(settings.executablePath, buildWatchBackgroundArgs(), ctx.cwd);
      if (out.exitCode !== 0) {
        this.postError(`Could not start watcher:\n${out.stderr.trim() || out.stdout.trim()}`);
        return;
      }
      setTimeout(() => void this.refreshStatus(ctx.folderId), 2000);
    } catch (error) {
      this.postError(error instanceof Error ? error.message : String(error));
    }
  }

  private getSettings(): {
    executablePath: string;
    defaultLimit: number;
  } {
    const config = vscode.workspace.getConfiguration("grepaiSearch");
    return {
      executablePath: config.get<string>("executablePath", "grepai"),
      defaultLimit: clampLimit(config.get<number>("defaultLimit", 8), 8),
    };
  }

  private postError(message: string, folderId?: string): void {
    this.view?.webview.postMessage({
      type: "error",
      message,
      ...(folderId !== undefined ? { folderId } : {}),
    });
  }
}

function clampLimit(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(50, Math.max(1, Math.floor(value)));
}

function createNonce(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let index = 0; index < 32; index += 1) {
    nonce += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return nonce;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
    return Boolean(stat.type & vscode.FileType.File);
  } catch {
    return false;
  }
}
