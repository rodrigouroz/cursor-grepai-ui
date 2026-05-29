import {
  runProcess,
  buildWorkspaceListArgs,
  buildWorkspaceStatusArgs,
  parseWorkspaceList,
  parseWorkspaceProjects,
  type DiscoveredProject,
  type ProcessOutput,
} from "./grepaiCli";
import { buildDiscoveredProjects, type WorkspaceProject } from "./config";

type Runner = (command: string, args: string[], cwd: string, signal?: AbortSignal) => Promise<ProcessOutput>;

const DISCOVERY_TIMEOUT_MS = 5000;

// Discover indexed grepai workspace/project scopes by querying the CLI.
// Non-fatal: any CLI failure OR hang (per-call timeout) resolves to [] so callers
// fall back to manual scopes rather than wedging on a stuck `grepai` process.
export async function discoverWorkspaceScopes(
  executablePath: string,
  cwd: string,
  run: Runner = runProcess,
  timeoutMs = DISCOVERY_TIMEOUT_MS,
): Promise<WorkspaceProject[]> {
  try {
    const list = await run(executablePath, buildWorkspaceListArgs(), cwd, AbortSignal.timeout(timeoutMs));
    if (list.exitCode !== 0) return [];
    const names = parseWorkspaceList(list.stdout);
    const byWorkspace: Record<string, DiscoveredProject[]> = {};
    for (const name of names) {
      const status = await run(
        executablePath,
        buildWorkspaceStatusArgs(name),
        cwd,
        AbortSignal.timeout(timeoutMs),
      );
      byWorkspace[name] = status.exitCode === 0 ? parseWorkspaceProjects(status.stdout) : [];
    }
    return buildDiscoveredProjects(names, byWorkspace);
  } catch {
    return [];
  }
}
