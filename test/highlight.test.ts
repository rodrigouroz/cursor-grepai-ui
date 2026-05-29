import { describe, expect, test } from "vitest";
import { highlight, languageFromPath } from "../media/lib/highlight.js";

describe("languageFromPath", () => {
  test("maps known extensions", () => {
    expect(languageFromPath("a/b/c.ts")).toBe("ts");
    expect(languageFromPath("x.py")).toBe("py");
    expect(languageFromPath("Makefile")).toBe("plain");
  });
});

describe("highlight", () => {
  test("escapes HTML and wraps strings, comments, keywords, numbers", () => {
    const out = highlight('const x = 42; "a<b" // note', "ts");

    expect(out).toContain('<span class="tok-kw">const</span>');
    expect(out).toContain('<span class="tok-str">&quot;a&lt;b&quot;</span>');
    expect(out).toContain('<span class="tok-com">// note</span>');
    expect(out).toContain('<span class="tok-num">42</span>');
    expect(out).not.toContain("<b"); // raw HTML must be escaped
  });

  test("unknown language only escapes, no token spans", () => {
    const out = highlight('a < b "c"', "plain");

    expect(out).toBe('a &lt; b &quot;c&quot;');
  });

  test("a string token does not bleed across newlines", () => {
    const out = highlight('const a = "open\nconst b = 1', "ts");
    // The unterminated string is confined to its own line; the second line still highlights.
    expect(out).toContain('<span class="tok-kw">const</span>');
    expect(out.match(/<span class="tok-kw">const<\/span>/g)).toHaveLength(2);
    expect(out).toContain('<span class="tok-num">1</span>');
  });
});
