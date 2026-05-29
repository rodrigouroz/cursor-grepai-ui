import { describe, expect, test } from "vitest";
import { findProjectForRoot, getDefaultProjects, type WorkspaceProject } from "../src/config";

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
