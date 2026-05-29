import { describe, expect, test } from "vitest";
import { deriveSymbol } from "../media/lib/symbol.js";

describe("deriveSymbol", () => {
  test("pulls the declared name after a declaration keyword", () => {
    expect(deriveSymbol("export async function runSync() {}")).toBe("runSync");
    expect(deriveSymbol("def handle_request(self):")).toBe("handle_request");
  });

  test("falls back to the longest non-keyword identifier", () => {
    expect(deriveSymbol("  x = computeTotals(a)")).toBe("computeTotals");
  });

  test("returns empty string when nothing usable is found", () => {
    expect(deriveSymbol("")).toBe("");
    expect(deriveSymbol("   ;;;  ")).toBe("");
  });
});
