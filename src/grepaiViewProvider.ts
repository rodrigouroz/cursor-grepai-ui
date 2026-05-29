import * as vscode from "vscode";
import {
  findProjectForRoot,
  getDefaultProjects,
  mergeProjects,
  mergeScopes,
  type WorkspaceProject,
} from "./config";
import { discoverWorkspaceScopes } from "./scopeDiscovery";
import { isCurrentScopeConcrete } from "./statusContext";
import {
  runGrepaiSearch,
  runGrepaiStatus,
  runProcess,
  resolveResultPath,
  buildStatusArgs,
  buildWorkspaceStatusArgs,
  buildWatchStatusArgs,
  buildWatchBackgroundArgs,
  buildTraceArgs,
  parseLocalStatus,
  parseWorkspaceStatus,
} from "./grepaiCli";
import { normalizeCallerCallee, normalizeGraph } from "./traceModel";
import { filterExistingResults } from "./resultFilter";
import type { NormalizedGrepaiResult, SearchScope } from "./resultModel";
import { getWebviewHtml } from "./webviewHtml";
import { resolveOpenOptions, type OpenMode } from "./openMode";

interface SearchScopeOption {
  id: string;
  label: string;
  scope: SearchScope;
  project?: WorkspaceProject;
}

type WebviewMessage =
  | { type: "ready" }
  | { type: "search"; query: string; scopeId: string; limit: number }
  | { type: "openResult"; id: string; mode?: OpenMode }
  | { type: "refreshStatus"; scopeId: string }
  | { type: "startWatcher"; statusToken: string }
  | {
      type: "trace";
      traceRequestId: number;
      scopeId: string;
      symbol: string;
      direction: "callers" | "callees" | "graph";
      mode: string;
      depth?: number;
      expandNodeId?: string;
    }
  | { type: "openLocation"; id: string; mode?: OpenMode }
  | { type: "refreshScopes" };

export class GrepaiViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "grepaiSearch.view";

  private view?: vscode.WebviewView;
  private results = new Map<string, NormalizedGrepaiResult>();
  private activeAbort?: AbortController;
  private requestId = 0;
  private statusContext?: {
    statusToken: string;
    cwd: string;
    workspace?: string;
    project?: string;
  };
  private traceRequestId = 0;
  private activeTraceAbort?: AbortController;
  private traceLocations = new Map<string, { filePath: string; line: number }>();
  private locationSeq = 0;
  private discoveredScopes: WorkspaceProject[] = [];
  private scopesDiscovered = false;

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
      if (!this.scopesDiscovered) {
        this.scopesDiscovered = true;
        void this.refreshScopes();
      }
      return;
    }

    if (message.type === "refreshScopes") {
      await this.refreshScopes();
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
      await this.refreshStatus(message.scopeId);
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
      scopes: this.getScopeOptions(this.allProjects()).map((scope) => ({
        id: scope.id,
        label: scope.label,
        concrete:
          scope.scope.kind === "workspaceProject"
            ? true
            : isCurrentScopeConcrete((vscode.workspace.workspaceFolders ?? []).length),
      })),
    });
  }

  private async search(message: Extract<WebviewMessage, { type: "search" }>): Promise<void> {
    const query = message.query.trim();
    if (!query) {
      this.postError("Enter a search query.");
      return;
    }

    const settings = this.getSettings();
    const projects = this.allProjects();
    const scopeOption = this.getScopeOptions(projects).find(
      (scope) => scope.id === message.scopeId,
    );
    if (!scopeOption) {
      this.postError("Choose a valid search scope.");
      return;
    }

    const cwd = await this.getSearchCwd(scopeOption);
    if (!cwd) {
      this.postError("Choose a workspace folder before searching.");
      return;
    }

    this.activeAbort?.abort();
    const abortController = new AbortController();
    this.activeAbort = abortController;
    const currentRequestId = ++this.requestId;
    this.view?.webview.postMessage({ type: "searching" });

    try {
      const searchScope = this.resolveSearchScope(scopeOption, cwd, projects);

      if (scopeOption.scope.kind === "current" && searchScope.kind === "current") {
        const status = await runGrepaiStatus({
          executablePath: settings.executablePath,
          cwd,
          signal: abortController.signal,
        });
        if (status.exitCode !== 0) {
          throw new Error(
            "Current folder is not indexed. Run `grepai init` here or choose a configured project scope.",
          );
        }
      }

      const results = await runGrepaiSearch({
        executablePath: settings.executablePath,
        cwd,
        projects,
        query,
        limit: clampLimit(message.limit, settings.defaultLimit),
        scope: searchScope,
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
        );
        return;
      }

      this.results = new Map(existingResults.map((result) => [result.id, result]));
      this.view?.webview.postMessage({ type: "results", results: existingResults });
    } catch (error) {
      if (currentRequestId !== this.requestId) {
        return;
      }
      this.results.clear();
      this.postError(error instanceof Error ? error.message : String(error));
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

  private addTraceLocation(file: string, line: number, cwd: string, projects: WorkspaceProject[]): string {
    const id = `t${this.traceRequestId}-${this.locationSeq++}`;
    const filePath = resolveResultPath(file, cwd, projects);
    this.traceLocations.set(id, { filePath, line });
    return id;
  }

  private postTraceError(traceRequestId: number, message: string): void {
    this.view?.webview.postMessage({ type: "traceError", traceRequestId, message });
  }

  private async trace(message: Extract<WebviewMessage, { type: "trace" }>): Promise<void> {
    const symbol = message.symbol.trim();
    if (!symbol) {
      this.postTraceError(message.traceRequestId, "Enter a symbol to trace.");
      return;
    }

    const settings = this.getSettings();
    const projects = this.allProjects();
    const scopeOption = this.getScopeOptions(projects).find((s) => s.id === message.scopeId);
    if (!scopeOption) {
      this.postTraceError(message.traceRequestId, "Choose a valid scope to trace.");
      return;
    }

    const cwd = await this.getSearchCwd(scopeOption);
    if (!cwd) {
      this.postTraceError(message.traceRequestId, "Choose a workspace folder before tracing.");
      return;
    }
    const scope = this.resolveSearchScope(scopeOption, cwd, projects);

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
      const out = await runProcess(
        settings.executablePath,
        buildTraceArgs({
          direction: message.direction,
          symbol,
          mode: message.mode,
          scope,
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
        );
        return;
      }

      const json = JSON.parse(out.stdout);

      if (message.direction === "graph") {
        const g = normalizeGraph(json);
        const nodes = g.nodes.map((n) => {
          const id = this.addTraceLocation(n.file, n.line, cwd, projects);
          return {
            nodeId: id,
            name: n.name,
            location: `${n.file}:${n.line}`,
            locationId: id,
            placeholder: Boolean(n.placeholder),
          };
        });
        const edges = g.edges.map((e) => {
          const id = this.addTraceLocation(e.file, e.line, cwd, projects);
          return { from: e.caller, to: e.callee, locationId: id, label: `${e.file}:${e.line}` };
        });
        this.view?.webview.postMessage({
          type: "traceResults",
          traceRequestId: message.traceRequestId,
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
        const id = this.addTraceLocation(loc.file, loc.line, cwd, projects);
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
        view: "tree",
        parentId: message.expandNodeId ?? null,
        nodes,
      });
    } catch (error) {
      if (message.traceRequestId === this.traceRequestId) {
        this.postTraceError(
          message.traceRequestId,
          error instanceof Error ? error.message : String(error),
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

  private async refreshStatus(scopeId: string): Promise<void> {
    const settings = this.getSettings();
    const projects = this.allProjects();
    const scopeOption = this.getScopeOptions(projects).find((s) => s.id === scopeId);
    if (!scopeOption) return;

    try {
      if (scopeOption.scope.kind === "workspaceProject") {
        const root = scopeOption.project?.rootPath ?? process.cwd();
        const out = await runProcess(
          settings.executablePath,
          buildWorkspaceStatusArgs(scopeOption.scope.workspace),
          root,
        );
        const { indexed } = parseWorkspaceStatus(out.stdout, scopeOption.scope.project);
        const watch = await runProcess(
          settings.executablePath,
          buildWatchStatusArgs(scopeOption.scope.workspace),
          root,
        );
        this.publishStatus({
          indexed,
          detail: indexed ? "indexed ✓" : "not indexed",
          watcherRunning:
            watch.exitCode === 0 && /running/i.test(watch.stdout) && !/not running/i.test(watch.stdout),
          cwd: root,
          workspace: scopeOption.scope.workspace,
          project: scopeOption.scope.project,
        });
        return;
      }

      const folders = vscode.workspace.workspaceFolders ?? [];
      if (!isCurrentScopeConcrete(folders.length)) {
        this.statusContext = undefined;
        this.view?.webview.postMessage({ type: "status", neutral: true });
        return;
      }
      const cwd = folders[0]!.uri.fsPath;
      const out = await runProcess(settings.executablePath, buildStatusArgs(), cwd);
      const parsed = parseLocalStatus(out.stdout);
      this.publishStatus({
        indexed: parsed.indexed,
        detail: parsed.indexed ? `indexed · updated ${parsed.lastUpdated}` : "not indexed",
        watcherRunning: parsed.watcherRunning,
        cwd,
      });
    } catch {
      this.statusContext = undefined;
      this.view?.webview.postMessage({ type: "status", unavailable: true });
    }
  }

  private publishStatus(input: {
    indexed: boolean;
    detail: string;
    watcherRunning: boolean;
    cwd: string;
    workspace?: string;
    project?: string;
  }): void {
    const statusToken = createNonce();
    this.statusContext = {
      statusToken,
      cwd: input.cwd,
      workspace: input.workspace,
      project: input.project,
    };
    this.view?.webview.postMessage({
      type: "status",
      statusToken,
      indexed: input.indexed,
      detail: input.detail + (input.watcherRunning ? " · watching" : ""),
      canStartWatcher: input.indexed && !input.watcherRunning,
    });
  }

  private async startWatcher(statusToken: string): Promise<void> {
    const ctx = this.statusContext;
    if (!ctx || ctx.statusToken !== statusToken) {
      this.postError("Status changed — refresh and try Start watcher again.");
      return;
    }
    const settings = this.getSettings();
    try {
      const out = await runProcess(settings.executablePath, buildWatchBackgroundArgs(ctx.workspace), ctx.cwd);
      if (out.exitCode !== 0) {
        this.postError(`Could not start watcher:\n${out.stderr.trim() || out.stdout.trim()}`);
        return;
      }
      setTimeout(() => {
        const scopeId = ctx.workspace && ctx.project ? `${ctx.workspace}/${ctx.project}` : "current";
        void this.refreshStatus(scopeId);
      }, 2000);
    } catch (error) {
      this.postError(error instanceof Error ? error.message : String(error));
    }
  }

  private resolveSearchScope(
    scopeOption: SearchScopeOption,
    cwd: string,
    projects: WorkspaceProject[],
  ): SearchScope {
    if (scopeOption.scope.kind !== "current") {
      return scopeOption.scope;
    }

    const matchingProject = findProjectForRoot(cwd, projects);
    if (!matchingProject) {
      return scopeOption.scope;
    }

    return {
      kind: "workspaceProject",
      workspace: matchingProject.workspace,
      project: matchingProject.project,
    };
  }

  private async getSearchCwd(scopeOption: SearchScopeOption): Promise<string | undefined> {
    if (scopeOption.scope.kind === "workspaceProject") {
      return scopeOption.project?.rootPath;
    }

    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folders.length === 0) {
      return undefined;
    }

    const activeUri = vscode.window.activeTextEditor?.document.uri;
    if (activeUri && activeUri.scheme === "file") {
      const activeFolder = vscode.workspace.getWorkspaceFolder(activeUri);
      if (activeFolder) {
        return activeFolder.uri.fsPath;
      }
    }

    if (folders.length === 1) {
      return folders[0]?.uri.fsPath;
    }

    const picked = await vscode.window.showQuickPick(
      folders.map((folder) => ({
        label: folder.name,
        description: folder.uri.fsPath,
        folder,
      })),
      { title: "Choose a workspace folder for GrepAI search" },
    );

    return picked?.folder.uri.fsPath;
  }

  private getScopeOptions(projects: WorkspaceProject[]): SearchScopeOption[] {
    return [
      {
        id: "current",
        label: "Current folder",
        scope: { kind: "current" },
      },
      ...projects.map((project) => ({
        id: `${project.workspace}/${project.project}`,
        label: project.label,
        scope: {
          kind: "workspaceProject" as const,
          workspace: project.workspace,
          project: project.project,
        },
        project,
      })),
    ];
  }

  private allProjects(): WorkspaceProject[] {
    return mergeScopes(this.getSettings().projects, this.discoveredScopes);
  }

  async refreshScopes(): Promise<void> {
    const settings = this.getSettings();
    const folders = vscode.workspace.workspaceFolders ?? [];
    const cwd = folders[0]?.uri.fsPath ?? process.cwd();
    this.discoveredScopes = await discoverWorkspaceScopes(settings.executablePath, cwd);
    this.postState();
  }

  private getSettings(): {
    executablePath: string;
    defaultLimit: number;
    projects: WorkspaceProject[];
  } {
    const config = vscode.workspace.getConfiguration("grepaiSearch");
    const configuredProjects = config.get<WorkspaceProject[]>("workspaceProjects", []);
    return {
      executablePath: config.get<string>("executablePath", "grepai"),
      defaultLimit: clampLimit(config.get<number>("defaultLimit", 8), 8),
      projects: mergeProjects(getDefaultProjects(), configuredProjects.map(expandHomePath)),
    };
  }

  private postError(message: string): void {
    this.view?.webview.postMessage({ type: "error", message });
  }
}

function expandHomePath(project: WorkspaceProject): WorkspaceProject {
  if (project.rootPath === "~" || project.rootPath.startsWith("~/")) {
    return {
      ...project,
      rootPath: project.rootPath.replace(/^~/, require("node:os").homedir()),
    };
  }
  return project;
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
