import { describe, expect, test } from "vitest";
import { formatRelativeTime } from "../src/relativeTime";

// Constructed from explicit local components (not a parsed string) so the
// suite is deterministic on any host timezone — mirroring how the formatter
// parses grepai's space-separated, zoneless timestamps as local.
const NOW = new Date(2026, 4, 29, 13, 49, 4); // 2026-05-29 13:49:04 local

describe("formatRelativeTime", () => {
  test("seconds ago", () => {
    expect(formatRelativeTime("2026-05-29 13:49:00", NOW)).toBe("just now");
    expect(formatRelativeTime("2026-05-29 13:48:39", NOW)).toBe("25 seconds ago");
  });

  test("minutes ago, singular and plural", () => {
    expect(formatRelativeTime("2026-05-29 13:48:04", NOW)).toBe("1 minute ago");
    expect(formatRelativeTime("2026-05-29 13:44:04", NOW)).toBe("5 minutes ago");
  });

  test("hours ago", () => {
    expect(formatRelativeTime("2026-05-29 12:49:04", NOW)).toBe("1 hour ago");
    expect(formatRelativeTime("2026-05-29 08:49:04", NOW)).toBe("5 hours ago");
  });

  test("days and weeks ago", () => {
    expect(formatRelativeTime("2026-05-28 13:49:04", NOW)).toBe("1 day ago");
    expect(formatRelativeTime("2026-05-22 13:49:04", NOW)).toBe("1 week ago");
  });

  test("months and years ago", () => {
    expect(formatRelativeTime("2026-03-29 13:49:04", NOW)).toBe("2 months ago");
    expect(formatRelativeTime("2024-01-29 13:49:04", NOW)).toBe("2 years ago");
  });

  test("\"Never\" and empty pass through as never", () => {
    expect(formatRelativeTime("Never", NOW)).toBe("never");
    expect(formatRelativeTime("", NOW)).toBe("never");
  });

  test("an already-relative or unparseable string is returned unchanged", () => {
    expect(formatRelativeTime("2 hours ago", NOW)).toBe("2 hours ago");
  });

  test("future timestamps (clock skew) clamp to just now", () => {
    expect(formatRelativeTime("2026-05-29 13:50:04", NOW)).toBe("just now");
  });

  // Regression: a zoneless grepai timestamp must be read as LOCAL time, not UTC.
  // Date.parse handles the space and "T" forms inconsistently across engines
  // (the Cursor extension host read the space form as UTC, shifting the result
  // by the local offset). Both forms must agree and match the wall-clock diff.
  test("zoneless timestamps are parsed as local regardless of separator", () => {
    expect(formatRelativeTime("2026-05-29 12:49:04", NOW)).toBe("1 hour ago");
    expect(formatRelativeTime("2026-05-29T12:49:04", NOW)).toBe("1 hour ago");
  });
});
