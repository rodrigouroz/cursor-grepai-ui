import { describe, expect, test } from "vitest";
import { discoverWorkspaceScopes } from "../src/scopeDiscovery";

function fakeRunner(outputs: Record<string, { stdout?: string; exitCode: number }>) {
  return async (_cmd: string, args: string[], _cwd: string) => {
    const key = args.join(" ");
    const o = outputs[key] ?? { stdout: "", exitCode: 0 };
    return { stdout: o.stdout ?? "", stderr: "", exitCode: o.exitCode };
  };
}

describe("discoverWorkspaceScopes", () => {
  test("builds indexed scopes from workspace list + status", async () => {
    const run = fakeRunner({
      "workspace list": { stdout: "Workspaces (1):\n\n  acme\n    Backend: qdrant\n", exitCode: 0 },
      "workspace status acme": {
        stdout: "  Projects: 2\n    - api: /p/api ✓\n    - web: /p/web\n",
        exitCode: 0,
      },
    });
    const scopes = await discoverWorkspaceScopes("grepai", "/cwd", run);
    expect(scopes).toEqual([{ label: "acme: api", workspace: "acme", project: "api", rootPath: "/p/api" }]);
  });

  test("returns [] when workspace list fails (fallback)", async () => {
    const run = fakeRunner({ "workspace list": { exitCode: 1 } });
    expect(await discoverWorkspaceScopes("grepai", "/cwd", run)).toEqual([]);
  });

  test("returns [] when the runner rejects (e.g. timeout/abort)", async () => {
    const run = async () => {
      throw new Error("GrepAI request cancelled");
    };
    expect(await discoverWorkspaceScopes("grepai", "/cwd", run)).toEqual([]);
  });

  test("one workspace's failing status does not discard the others", async () => {
    const run = async (_cmd: string, args: string[]) => {
      const key = args.join(" ");
      if (key === "workspace list") {
        return { stdout: "Workspaces (2):\n\n  acme\n  beta\n", stderr: "", exitCode: 0 };
      }
      if (key === "workspace status acme") {
        return { stdout: "  Projects: 1\n    - api: /p/api ✓\n", stderr: "", exitCode: 0 };
      }
      throw new Error("GrepAI request cancelled"); // beta's status hangs/aborts
    };
    expect(await discoverWorkspaceScopes("grepai", "/cwd", run)).toEqual([
      { label: "acme: api", workspace: "acme", project: "api", rootPath: "/p/api" },
    ]);
  });
});
