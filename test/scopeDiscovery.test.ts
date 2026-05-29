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
});
