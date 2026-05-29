import { spawn } from "node:child_process";
import path from "node:path";
import type { WorkspaceProject } from "./config";
import type {
  NormalizedGrepaiResult,
  RawGrepaiResult,
  SearchArgsInput,
} from "./resultModel";

export interface RunGrepaiInput extends SearchArgsInput {
  executablePath: string;
  cwd: string;
  projects: WorkspaceProject[];
  signal?: AbortSignal;
}

export interface RunStatusInput {
  executablePath: string;
  cwd: string;
  signal?: AbortSignal;
}

export interface ProcessOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export function buildSearchArgs(input: SearchArgsInput): string[] {
  const args = ["search", input.query];

  if (input.scope.kind === "workspaceProject") {
    args.push("--workspace", input.scope.workspace, "--project", input.scope.project);
  }

  args.push("--json", "--limit", String(input.limit));
  return args;
}

export function buildStatusArgs(): string[] {
  return ["status", "--no-ui"];
}

export function buildWorkspaceStatusArgs(workspace: string): string[] {
  return ["workspace", "status", workspace];
}

export function buildWatchStatusArgs(workspace?: string): string[] {
  const args = ["watch", "--status"];
  if (workspace) args.push("--workspace", workspace);
  return args;
}

export function buildWatchBackgroundArgs(workspace?: string): string[] {
  const args = ["watch", "--background"];
  if (workspace) args.push("--workspace", workspace);
  return args;
}

export interface TraceArgsInput {
  direction: "callers" | "callees" | "graph";
  symbol: string;
  mode: string;
  scope: import("./resultModel").SearchScope;
  depth?: number;
}

export function buildTraceArgs(input: TraceArgsInput): string[] {
  const args = ["trace", input.direction, input.symbol];
  if (input.scope.kind === "workspaceProject") {
    args.push("--workspace", input.scope.workspace, "--project", input.scope.project);
  }
  args.push("--json", "--mode", input.mode);
  if (input.direction === "graph" && input.depth) {
    args.push("--depth", String(input.depth));
  }
  return args;
}

export interface LocalStatus {
  indexed: boolean;
  filesIndexed: number;
  lastUpdated: string;
  watcherRunning: boolean;
}

export function parseLocalStatus(text: string): LocalStatus {
  const files = /Files indexed:\s*(\d+)/i.exec(text);
  const updated = /Last updated:\s*(.+)/i.exec(text);
  const watcher = /Watcher:\s*(.+)/i.exec(text);
  const filesIndexed = files ? Number(files[1]) : 0;
  return {
    indexed: filesIndexed > 0,
    filesIndexed,
    lastUpdated: updated ? updated[1].trim() : "Never",
    watcherRunning: watcher ? /running/i.test(watcher[1]) && !/not running/i.test(watcher[1]) : false,
  };
}

export function parseWorkspaceStatus(text: string, project: string): { indexed: boolean } {
  const line = text
    .split(/\r?\n/)
    .find((raw) => new RegExp(`^\\s*-\\s*${escapeRegExp(project)}:`).test(raw));
  return { indexed: Boolean(line && line.includes("✓")) };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseSearchResults(stdout: string): RawGrepaiResult[] {
  const parsed: unknown = JSON.parse(stdout);

  if (!Array.isArray(parsed)) {
    throw new Error("Expected GrepAI JSON output to be an array");
  }

  return parsed.map((item, index) => parseRawResult(item, index));
}

function parseRawResult(item: unknown, index: number): RawGrepaiResult {
  if (!item || typeof item !== "object") {
    throw new Error(`Expected GrepAI result ${index} to be an object`);
  }

  const candidate = item as Record<string, unknown>;
  const result = {
    file_path: candidate.file_path,
    start_line: candidate.start_line,
    end_line: candidate.end_line,
    score: candidate.score,
    content: candidate.content,
  };

  if (typeof result.file_path !== "string") {
    throw new Error(`Expected GrepAI result ${index}.file_path to be a string`);
  }
  if (typeof result.start_line !== "number") {
    throw new Error(`Expected GrepAI result ${index}.start_line to be a number`);
  }
  if (typeof result.end_line !== "number") {
    throw new Error(`Expected GrepAI result ${index}.end_line to be a number`);
  }
  if (typeof result.score !== "number") {
    throw new Error(`Expected GrepAI result ${index}.score to be a number`);
  }
  if (typeof result.content !== "string") {
    throw new Error(`Expected GrepAI result ${index}.content to be a string`);
  }

  return result as RawGrepaiResult;
}

export function resolveResultPath(
  filePath: string,
  cwd: string,
  projects: WorkspaceProject[],
): string {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }

  const segments = filePath.split(/[\\/]+/);
  const matchingProject = projects.find(
    (project) => project.workspace === segments[0] && project.project === segments[1],
  );

  if (matchingProject) {
    return path.join(matchingProject.rootPath, ...segments.slice(2));
  }

  return path.resolve(cwd, filePath);
}

export function normalizeResults(
  rawResults: RawGrepaiResult[],
  cwd: string,
  projects: WorkspaceProject[],
): NormalizedGrepaiResult[] {
  return rawResults.map((result, index) => ({
    id: String(index),
    filePath: resolveResultPath(result.file_path, cwd, projects),
    displayPath: result.file_path,
    startLine: result.start_line,
    endLine: result.end_line,
    score: result.score,
    preview: normalizePreview(result.content),
  }));
}

export function normalizePreview(content: string): string {
  return stripAnsi(content)
    .trim()
    .replace(/^File:[^\r\n]*(?:\r?\n){1,2}/, "")
    .trim();
}

export async function runGrepaiSearch(input: RunGrepaiInput): Promise<NormalizedGrepaiResult[]> {
  const output = await runProcess(input.executablePath, buildSearchArgs(input), input.cwd, input.signal);

  if (output.exitCode !== 0) {
    throw new Error(formatProcessError("GrepAI search failed", output));
  }

  return normalizeResults(parseSearchResults(output.stdout), input.cwd, input.projects);
}

export async function runGrepaiStatus(input: RunStatusInput): Promise<ProcessOutput> {
  return runProcess(input.executablePath, buildStatusArgs(), input.cwd, input.signal);
}

export function runProcess(
  command: string,
  args: string[],
  cwd: string,
  signal?: AbortSignal,
): Promise<ProcessOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const abort = () => {
      if (settled) {
        return;
      }
      child.kill("SIGTERM");
      settled = true;
      reject(new Error("GrepAI request cancelled"));
    };

    if (signal?.aborted) {
      abort();
      return;
    }

    signal?.addEventListener("abort", abort, { once: true });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (!settled) {
        settled = true;
        signal?.removeEventListener("abort", abort);
        reject(error);
      }
    });
    child.on("close", (exitCode) => {
      if (!settled) {
        settled = true;
        signal?.removeEventListener("abort", abort);
        resolve({
          stdout: stripAnsi(stdout),
          stderr: stripAnsi(stderr),
          exitCode,
        });
      }
    });
  });
}

function formatProcessError(prefix: string, output: ProcessOutput): string {
  const details = [output.stderr.trim(), output.stdout.trim()].filter(Boolean).join("\n");
  return details ? `${prefix}:\n${details}` : `${prefix} with exit code ${output.exitCode}`;
}

export function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}
