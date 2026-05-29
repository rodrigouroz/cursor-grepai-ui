import { describe, expect, test } from "vitest";
import { nextFocusIndex } from "../media/lib/nav.js";

describe("nextFocusIndex", () => {
  test("ArrowDown moves forward and clamps at the end", () => {
    expect(nextFocusIndex(0, 3, "ArrowDown")).toBe(1);
    expect(nextFocusIndex(2, 3, "ArrowDown")).toBe(2);
  });

  test("ArrowUp moves backward and clamps at the start", () => {
    expect(nextFocusIndex(2, 3, "ArrowUp")).toBe(1);
    expect(nextFocusIndex(0, 3, "ArrowUp")).toBe(0);
  });

  test("ArrowDown from no selection focuses the first item", () => {
    expect(nextFocusIndex(-1, 3, "ArrowDown")).toBe(0);
  });

  test("returns null for unrelated keys or empty lists", () => {
    expect(nextFocusIndex(0, 3, "Enter")).toBeNull();
    expect(nextFocusIndex(0, 0, "ArrowDown")).toBeNull();
  });
});
