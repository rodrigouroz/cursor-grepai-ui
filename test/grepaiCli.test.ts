import { describe, expect, test } from "vitest";
import fixture from "./fixtures/search-api.json";
import {
  buildSearchArgs,
  normalizePreview,
  normalizeResults,
  parseSearchResults,
  resolveResultPath,
} from "../src/grepaiCli";

describe("buildSearchArgs", () => {
  test("builds argv for search without shell interpolation", () => {
    expect(
      buildSearchArgs({
        query: "user input; rm -rf /",
        limit: 8,
      }),
    ).toEqual(["search", "user input; rm -rf /", "--json", "--limit", "8"]);
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
  test("resolves relative file paths against the search cwd", () => {
    expect(resolveResultPath("src/foo.ts", "/Users/example/Projects/api")).toBe(
      "/Users/example/Projects/api/src/foo.ts",
    );
  });

  test("keeps absolute file paths unchanged", () => {
    expect(resolveResultPath("/Users/example/Projects/api/src/foo.ts", "/tmp/current")).toBe(
      "/Users/example/Projects/api/src/foo.ts",
    );
  });
});

describe("normalizeResults", () => {
  test("normalizes raw GrepAI results for UI rendering and file opening", () => {
    const rawResults = parseSearchResults(JSON.stringify(fixture));
    const normalized = normalizeResults(rawResults, "/tmp/current");

    expect(normalized).toEqual([
      {
        id: "0",
        filePath: "/tmp/current/acme/api/src/jobs/sync/runSync.ts",
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
  buildWatchStatusArgs,
  isFolderIndexed,
  parseLocalStatus,
} from "../src/grepaiCli";

describe("status/watch arg builders", () => {
  test("watch status takes no arguments", () => {
    expect(buildWatchStatusArgs()).toEqual(["watch", "--status"]);
  });
});

describe("isFolderIndexed", () => {
  test("true when exit 0 and files indexed > 0", () => {
    expect(
      isFolderIndexed({ stdout: "Files indexed: 142", stderr: "", exitCode: 0 }),
    ).toBe(true);
  });

  test("false when exit code is non-zero", () => {
    expect(
      isFolderIndexed({ stdout: "Files indexed: 142", stderr: "", exitCode: 1 }),
    ).toBe(false);
  });

  test("false when exit 0 but zero files indexed", () => {
    expect(
      isFolderIndexed({ stdout: "Files indexed: 0", stderr: "", exitCode: 0 }),
    ).toBe(false);
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

import { buildTraceArgs } from "../src/grepaiCli";

describe("buildTraceArgs", () => {
  test("callers with precise mode", () => {
    expect(
      buildTraceArgs({
        direction: "callers",
        symbol: "Login",
        mode: "precise",
      }),
    ).toEqual(["trace", "callers", "Login", "--json", "--mode", "precise"]);
  });

  test("callees with fast mode", () => {
    expect(
      buildTraceArgs({ direction: "callees", symbol: "handle", mode: "fast" }),
    ).toEqual(["trace", "callees", "handle", "--json", "--mode", "fast"]);
  });

  test("graph adds --depth", () => {
    expect(
      buildTraceArgs({ direction: "graph", symbol: "X", mode: "precise", depth: 3 }),
    ).toEqual(["trace", "graph", "X", "--json", "--mode", "precise", "--depth", "3"]);
  });
});
