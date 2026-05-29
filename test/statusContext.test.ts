import { describe, expect, test } from "vitest";
import { isCurrentScopeConcrete } from "../src/statusContext";

describe("isCurrentScopeConcrete", () => {
  test("a single workspace folder resolves without a prompt", () => {
    expect(isCurrentScopeConcrete(1)).toBe(true);
  });

  test("zero or multiple folders are not concrete for the current scope", () => {
    expect(isCurrentScopeConcrete(0)).toBe(false);
    expect(isCurrentScopeConcrete(3)).toBe(false);
  });
});
