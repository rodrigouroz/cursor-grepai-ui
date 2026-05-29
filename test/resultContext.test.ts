import { describe, expect, test } from "vitest";
import { formatResultContext, languageForPath } from "../src/resultContext";
import type { NormalizedGrepaiResult } from "../src/resultModel";

function result(overrides: Partial<NormalizedGrepaiResult> = {}): NormalizedGrepaiResult {
  return {
    id: "0",
    filePath: "/abs/src/auth/login.ts",
    displayPath: "src/auth/login.ts",
    startLine: 10,
    endLine: 14,
    score: 0.9,
    preview: "function login() {\n  return true;\n}",
    ...overrides,
  };
}

describe("languageForPath", () => {
  test("maps known extensions to fence languages", () => {
    expect(languageForPath("src/auth/login.ts")).toBe("ts");
    expect(languageForPath("a/b/main.py")).toBe("python");
    expect(languageForPath("x.GO")).toBe("go");
  });

  test("returns empty string for unknown or missing extensions", () => {
    expect(languageForPath("Makefile")).toBe("");
    expect(languageForPath("data.zzz")).toBe("");
  });
});

describe("formatResultContext", () => {
  test("emits a path:line header and a fenced block with inferred language", () => {
    expect(formatResultContext(result())).toBe(
      "`src/auth/login.ts:10-14`\n" +
        "```ts\n" +
        "function login() {\n  return true;\n}\n" +
        "```\n",
    );
  });

  test("uses a plain fence when the language is unknown", () => {
    const block = formatResultContext(result({ displayPath: "Makefile", preview: "all:\n\tgo build" }));
    expect(block).toBe("`Makefile:10-14`\n```\nall:\n\tgo build\n```\n");
  });
});
