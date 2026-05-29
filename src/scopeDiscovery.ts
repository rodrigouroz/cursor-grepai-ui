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

// Discover indexed grepai workspace/project scopes by querying the CLI.
// Non-fatal: any CLI failure resolves to [] so callers fall back to manual scopes.
export async function discoverWorkspaceScopes(
  executablePath: string,
  cwd: string,
  run: Runner = runProcess,
): Promise<WorkspaceProject[]> {
  try {
    const list = await run(executablePath, buildWorkspaceListArgs(), cwd);
    if (list.exitCode !== 0) return [];
    const names = parseWorkspaceList(list.stdout);
    const byWorkspace: Record<string, DiscoveredProject[]> = {};
    for (const name of names) {
      const status = await run(executablePath, buildWorkspaceStatusArgs(name), cwd);
      byWorkspace[name] = status.exitCode === 0 ? parseWorkspaceProjects(status.stdout) : [];
    }
    return buildDiscoveredProjects(names, byWorkspace);
  } catch {
    return [];
  }
}
