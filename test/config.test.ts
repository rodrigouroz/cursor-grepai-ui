import { describe, expect, test } from "vitest";
import { buildDiscoveredProjects, findProjectForRoot, getDefaultProjects, mergeScopes, type WorkspaceProject } from "../src/config";

describe("getDefaultProjects", () => {
  test("ships no built-in projects (users configure their own scopes)", () => {
    expect(getDefaultProjects()).toEqual([]);
  });
});

describe("findProjectForRoot", () => {
  const projects: WorkspaceProject[] = [
    { label: "Acme: api", workspace: "acme", project: "api", rootPath: "/Users/example/Projects/api" },
    { label: "Acme: web", workspace: "acme", project: "web", rootPath: "/Users/example/Projects/web" },
  ];

  test("matches a workspace folder to a configured project root", () => {
    expect(findProjectForRoot("/Users/example/Projects/api", projects)).toEqual({
      label: "Acme: api",
      workspace: "acme",
      project: "api",
      rootPath: "/Users/example/Projects/api",
    });
  });

  test("normalizes trailing slashes before matching", () => {
    expect(findProjectForRoot("/Users/example/Projects/web/", projects)?.project).toBe("web");
  });
});

describe("buildDiscoveredProjects", () => {
  test("flattens indexed projects only into labeled scopes", () => {
    expect(
      buildDiscoveredProjects(["acme"], {
        acme: [
          { project: "api", rootPath: "/p/api", indexed: true },
          { project: "web", rootPath: "/p/web", indexed: false },
        ],
      }),
    ).toEqual([{ label: "acme: api", workspace: "acme", project: "api", rootPath: "/p/api" }]);
  });
});

describe("mergeScopes", () => {
  test("dedupes by workspace/project; manual wins over discovered with a different rootPath", () => {
    const manual = [{ label: "Mine", workspace: "acme", project: "api", rootPath: "/custom/api" }];
    const discovered = [
      { label: "acme: api", workspace: "acme", project: "api", rootPath: "/p/api" },
      { label: "acme: web", workspace: "acme", project: "web", rootPath: "/p/web" },
    ];
    expect(mergeScopes(manual, discovered)).toEqual([
      { label: "Mine", workspace: "acme", project: "api", rootPath: "/custom/api" },
      { label: "acme: web", workspace: "acme", project: "web", rootPath: "/p/web" },
    ]);
  });
});
