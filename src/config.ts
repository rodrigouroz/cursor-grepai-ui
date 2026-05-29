import path from "node:path";
import type { DiscoveredProject } from "./grepaiCli";

export interface WorkspaceProject {
  label: string;
  workspace: string;
  project: string;
  rootPath: string;
}

export interface ExtensionSettings {
  executablePath: string;
  defaultLimit: number;
  workspaceProjects: WorkspaceProject[];
}

export function getDefaultProjects(): WorkspaceProject[] {
  // No built-in projects: users add their own workspace scopes via the
  // `grepaiSearch.workspaceProjects` setting.
  return [];
}

// Dedupes by the full workspace/project/rootPath triple (settings merge).
// To merge manual + auto-discovered scopes — where the same workspace/project may
// have a different rootPath and must collapse to one dropdown entry — use mergeScopes.
export function mergeProjects(
  defaults: WorkspaceProject[],
  configured: WorkspaceProject[],
): WorkspaceProject[] {
  const seen = new Set<string>();
  const merged: WorkspaceProject[] = [];

  for (const project of [...defaults, ...configured]) {
    const key = `${project.workspace}/${project.project}/${project.rootPath}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(project);
    }
  }

  return merged;
}

export function buildDiscoveredProjects(
  workspaceNames: string[],
  projectsByWorkspace: Record<string, DiscoveredProject[]>,
): WorkspaceProject[] {
  const out: WorkspaceProject[] = [];
  for (const workspace of workspaceNames) {
    for (const p of projectsByWorkspace[workspace] ?? []) {
      if (!p.indexed) continue; // only indexed projects are searchable scopes
      out.push({ label: `${workspace}: ${p.project}`, workspace, project: p.project, rootPath: p.rootPath });
    }
  }
  return out;
}

// Dedupe by workspace/project (NOT rootPath); manual entries win over discovered.
export function mergeScopes(
  manual: WorkspaceProject[],
  discovered: WorkspaceProject[],
): WorkspaceProject[] {
  const seen = new Set<string>();
  const merged: WorkspaceProject[] = [];
  for (const project of [...manual, ...discovered]) {
    const key = `${project.workspace}/${project.project}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(project);
    }
  }
  return merged;
}

export function findProjectForRoot(
  rootPath: string,
  projects: WorkspaceProject[],
): WorkspaceProject | undefined {
  const normalizedRoot = normalizePath(rootPath);
  return projects.find((project) => normalizePath(project.rootPath) === normalizedRoot);
}

function normalizePath(value: string): string {
  return path.resolve(value);
}
