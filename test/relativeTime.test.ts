import { describe, expect, test } from "vitest";
import { formatRelativeTime } from "../src/relativeTime";

// grepai emits local timestamps like "2026-05-29 12:49:04". We parse the same
// way for `now` so these assertions are timezone-independent.
const NOW = new Date("2026-05-29 13:49:04");

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
});
