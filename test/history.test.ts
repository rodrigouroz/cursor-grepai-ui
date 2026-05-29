import { describe, expect, test } from "vitest";
import { pushHistory } from "../media/lib/history.js";

describe("pushHistory", () => {
  test("prepends newest and dedupes case-sensitively", () => {
    expect(pushHistory(["b", "a"], "a")).toEqual(["a", "b"]);
  });

  test("ignores empty/whitespace queries", () => {
    expect(pushHistory(["a"], "   ")).toEqual(["a"]);
    expect(pushHistory(["a"], "")).toEqual(["a"]);
  });

  test("caps the list length", () => {
    expect(pushHistory(["1", "2", "3"], "4", 3)).toEqual(["4", "1", "2"]);
  });
});
