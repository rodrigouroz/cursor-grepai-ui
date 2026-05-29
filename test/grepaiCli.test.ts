import { describe, expect, test } from "vitest";
import fixture from "./fixtures/search-api.json";
import {
  buildSearchArgs,
  normalizePreview,
  normalizeResults,
  parseSearchResults,
  resolveResultPath,
} from "../src/grepaiCli";
import type { WorkspaceProject } from "../src/config";

const projects: WorkspaceProject[] = [
  {
    label: "Acme: api",
    workspace: "acme",
    project: "api",
    rootPath: "/Users/example/Projects/api",
  },
  {
    label: "Acme: web",
    workspace: "acme",
    project: "web",
    rootPath: "/Users/example/Projects/web",
  },
];

describe("buildSearchArgs", () => {
  test("builds argv for current-folder search without shell interpolation", () => {
    expect(
      buildSearchArgs({
        query: "user input; rm -rf /",
        limit: 8,
        scope: { kind: "current" },
      }),
    ).toEqual(["search", "user input; rm -rf /", "--json", "--limit", "8"]);
  });

  test("builds argv for configured workspace project search", () => {
    expect(
      buildSearchArgs({
        query: "district announcement wizard",
        limit: 3,
        scope: {
          kind: "workspaceProject",
          workspace: "acme",
          project: "web",
        },
      }),
    ).toEqual([
      "search",
      "district announcement wizard",
      "--workspace",
      "acme",
      "--project",
      "web",
      "--json",
      "--limit",
      "3",
    ]);
  });
});

describe("parseSearchResults", () => {
  test("parses GrepAI JSON output into raw results", () => {
    const parsed = parseSearchResults(JSON.stringify(fixture));

    expect(parsed).toEqual(fixture);
  });

  test("rejects non-array JSON output", () => {
    expect(() => parseSearchResults("{}")).toThrow("Expected GrepAI JSON output to be an array");
  });
});

describe("resolveResultPath", () => {
  test("resolves workspace-prefixed file paths through configured project roots", () => {
    expect(
      resolveResultPath(
        "acme/web/teach/src/foo.ts",
        "/tmp/current",
        projects,
      ),
    ).toBe("/Users/example/Projects/web/teach/src/foo.ts");
  });

  test("resolves relative file paths against the search cwd", () => {
    expect(resolveResultPath("src/foo.ts", "/Users/example/Projects/api", projects)).toBe(
      "/Users/example/Projects/api/src/foo.ts",
    );
  });

  test("keeps absolute file paths unchanged", () => {
    expect(resolveResultPath("/Users/example/Projects/api/src/foo.ts", "/tmp/current", projects)).toBe(
      "/Users/example/Projects/api/src/foo.ts",
    );
  });
});

describe("normalizeResults", () => {
  test("normalizes raw GrepAI results for UI rendering and file opening", () => {
    const rawResults = parseSearchResults(JSON.stringify(fixture));
    const normalized = normalizeResults(rawResults, "/tmp/current", projects);

    expect(normalized).toEqual([
      {
        id: "0",
        filePath: "/Users/example/Projects/api/src/jobs/sync/runSync.ts",
        displayPath: "acme/api/src/jobs/sync/runSync.ts",
        startLine: 12,
        endLine: 29,
        score: 0.73,
        preview: "export async function runSync() {}",
      },
    ]);
  });
});

describe("normalizePreview", () => {
  test("removes GrepAI file headers from previews", () => {
    expect(
      normalizePreview("File: src/jobs/sync/runSync.ts\n\nexport async function runSync() {}"),
    ).toBe("export async function runSync() {}");
  });

  test("keeps previews without file headers intact", () => {
    expect(normalizePreview("  export const value = true;\n")).toBe("export const value = true;");
  });
});

import {
  buildWorkspaceStatusArgs,
  buildWatchStatusArgs,
  buildWatchBackgroundArgs,
  parseLocalStatus,
  parseWorkspaceStatus,
} from "../src/grepaiCli";

describe("status/watch arg builders", () => {
  test("workspace status takes the workspace name positionally", () => {
    expect(buildWorkspaceStatusArgs("acme")).toEqual(["workspace", "status", "acme"]);
  });

  test("watch status adds --workspace when given", () => {
    expect(buildWatchStatusArgs()).toEqual(["watch", "--status"]);
    expect(buildWatchStatusArgs("acme")).toEqual(["watch", "--status", "--workspace", "acme"]);
  });

  test("watch background adds --workspace when given", () => {
    expect(buildWatchBackgroundArgs()).toEqual(["watch", "--background"]);
    expect(buildWatchBackgroundArgs("acme")).toEqual([
      "watch",
      "--background",
      "--workspace",
      "acme",
    ]);
  });
});

describe("parseLocalStatus", () => {
  test("extracts indexed count, last updated, watcher state", () => {
    const text = [
      "grepai index status",
      "Files indexed: 142",
      "Total chunks: 980",
      "Last updated: 2 hours ago",
      "Watcher: running",
    ].join("\n");

    expect(parseLocalStatus(text)).toEqual({
      indexed: true,
      filesIndexed: 142,
      lastUpdated: "2 hours ago",
      watcherRunning: true,
    });
  });

  test("treats zero files / Never / not running as not indexed", () => {
    const text = ["Files indexed: 0", "Last updated: Never", "Watcher: not running"].join("\n");

    expect(parseLocalStatus(text)).toEqual({
      indexed: false,
      filesIndexed: 0,
      lastUpdated: "Never",
      watcherRunning: false,
    });
  });
});

describe("parseWorkspaceStatus", () => {
  const text = [
    "Workspace: acme",
    "  Backend: qdrant",
    "  Projects: 2",
    "    - api: /Users/x/Projects/api ✓",
    "    - web: /Users/x/Projects/web ✓",
  ].join("\n");

  test("reports a project as indexed when its line carries a check mark", () => {
    expect(parseWorkspaceStatus(text, "api")).toEqual({ indexed: true });
  });

  test("reports not indexed when the project is absent", () => {
    expect(parseWorkspaceStatus(text, "missing")).toEqual({ indexed: false });
  });

  test("reports not indexed when the project is listed without a check mark", () => {
    const partial = "    - api: /Users/x/Projects/api\n";
    expect(parseWorkspaceStatus(partial, "api")).toEqual({ indexed: false });
  });
});

import {
  buildWorkspaceListArgs,
  parseWorkspaceList,
  parseWorkspaceProjects,
} from "../src/grepaiCli";

describe("buildWorkspaceListArgs", () => {
  test("lists workspaces", () => {
    expect(buildWorkspaceListArgs()).toEqual(["workspace", "list"]);
  });
});

describe("parseWorkspaceList", () => {
  test("extracts 2-space-indented workspace names, ignoring header and detail lines", () => {
    const text = ["Workspaces (2):", "", "  acme", "    Backend: qdrant", "    Projects: 2", "  other-ws", "    Backend: gob"].join("\n");
    expect(parseWorkspaceList(text)).toEqual(["acme", "other-ws"]);
  });

  test("handles zero workspaces", () => {
    expect(parseWorkspaceList("Workspaces (0):\n")).toEqual([]);
  });
});

describe("parseWorkspaceProjects", () => {
  test("parses project, rootPath, and indexed flag", () => {
    const text = [
      "Workspace: acme",
      "  Projects: 2",
      "    - api: /Users/x/Projects/api ✓",
      "    - web: /Users/x/Projects/web",
    ].join("\n");
    expect(parseWorkspaceProjects(text)).toEqual([
      { project: "api", rootPath: "/Users/x/Projects/api", indexed: true },
      { project: "web", rootPath: "/Users/x/Projects/web", indexed: false },
    ]);
  });

  test("handles CRLF line endings and rootPaths containing spaces", () => {
    const text = "  Projects: 1\r\n    - api: /Users/x/My Projects/api ✓\r\n";
    expect(parseWorkspaceProjects(text)).toEqual([
      { project: "api", rootPath: "/Users/x/My Projects/api", indexed: true },
    ]);
  });
});

import { buildTraceArgs } from "../src/grepaiCli";

describe("buildTraceArgs", () => {
  test("callers for a workspace project with precise mode", () => {
    expect(
      buildTraceArgs({
        direction: "callers",
        symbol: "Login",
        mode: "precise",
        scope: { kind: "workspaceProject", workspace: "acme", project: "api" },
      }),
    ).toEqual([
      "trace", "callers", "Login",
      "--workspace", "acme", "--project", "api",
      "--json", "--mode", "precise",
    ]);
  });

  test("callees for the current scope omits workspace flags", () => {
    expect(
      buildTraceArgs({ direction: "callees", symbol: "handle", mode: "fast", scope: { kind: "current" } }),
    ).toEqual(["trace", "callees", "handle", "--json", "--mode", "fast"]);
  });

  test("graph adds --depth", () => {
    expect(
      buildTraceArgs({ direction: "graph", symbol: "X", mode: "precise", scope: { kind: "current" }, depth: 3 }),
    ).toEqual(["trace", "graph", "X", "--json", "--mode", "precise", "--depth", "3"]);
  });
});
