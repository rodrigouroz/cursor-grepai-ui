import { describe, expect, test } from "vitest";
import { resolveOpenOptions } from "../src/openMode";

describe("resolveOpenOptions", () => {
  test("preview mode opens a transient tab in the active column", () => {
    expect(resolveOpenOptions("preview")).toEqual({ preview: true, beside: false });
  });

  test("active mode pins in the active column", () => {
    expect(resolveOpenOptions("active")).toEqual({ preview: false, beside: false });
  });

  test("beside mode pins in a split column", () => {
    expect(resolveOpenOptions("beside")).toEqual({ preview: false, beside: true });
  });

  test("unknown/missing mode falls back to preview", () => {
    expect(resolveOpenOptions(undefined)).toEqual({ preview: true, beside: false });
    expect(resolveOpenOptions("bogus")).toEqual({ preview: true, beside: false });
  });
});
