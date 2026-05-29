const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = Math.round(30.44 * DAY); // average month
const YEAR = Math.round(365.25 * DAY);

function ago(value: number, unit: string): string {
  const n = Math.floor(value);
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}

// grepai emits "YYYY-MM-DD HH:mm:ss" with no timezone. That space-separated
// form is NOT a standard date string, so `Date.parse` is engine-dependent:
// some V8 builds read it as local, others (e.g. the Cursor extension host) as
// UTC — which shifts "time ago" by the local UTC offset. Parse the components
// by hand and construct a LOCAL Date so the result is deterministic. Anything
// that doesn't match falls back to Date.parse (handles ISO-with-zone etc.).
function parseTimestampMs(value: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (m) {
    const [, y, mo, d, h, min, s] = m;
    return new Date(+y, +mo - 1, +d, +h, +min, s ? +s : 0).getTime();
  }
  return Date.parse(value);
}

/**
 * Render a timestamp as a human "time ago" string relative to `now`.
 *
 * grepai emits local timestamps like "2026-05-29 12:49:04" (space-separated,
 * no zone), which V8 parses as local time — we deliberately parse the raw
 * string so it stays local. Inputs that are already humanized (e.g. "2 hours
 * ago") or otherwise unparseable are returned unchanged; "Never"/empty become
 * "never".
 */
export function formatRelativeTime(timestamp: string, now: Date = new Date()): string {
  const trimmed = (timestamp ?? "").trim();
  if (!trimmed || /^never$/i.test(trimmed)) return "never";

  const ms = parseTimestampMs(trimmed);
  if (Number.isNaN(ms)) return trimmed;

  const secs = Math.max(0, Math.round((now.getTime() - ms) / 1000));
  if (secs < 10) return "just now";
  if (secs < MINUTE) return ago(secs, "second");
  if (secs < HOUR) return ago(secs / MINUTE, "minute");
  if (secs < DAY) return ago(secs / HOUR, "hour");
  if (secs < WEEK) return ago(secs / DAY, "day");
  if (secs < MONTH) return ago(secs / WEEK, "week");
  if (secs < YEAR) return ago(secs / MONTH, "month");
  return ago(secs / YEAR, "year");
}
