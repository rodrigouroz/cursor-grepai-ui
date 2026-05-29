import { describe, expect, test } from "vitest";
import { getWebviewHtml } from "../src/webviewHtml";

const input = {
  nonce: "abc123",
  cspSource: "vscode-resource:",
  scriptUri: "vscode-resource://media/main.js",
  styleUri: "vscode-resource://media/main.css",
};

describe("getWebviewHtml", () => {
  test("renders the search shell and wires media assets", () => {
    const html = getWebviewHtml(input);

    expect(html).toContain('id="query"');
    expect(html).toContain('id="folder"');
    expect(html).toContain('id="limit"');
    expect(html).toContain('id="search"');
    expect(html).toContain('nonce="abc123"');
    expect(html).toContain('type="module"');
    expect(html).toContain('src="vscode-resource://media/main.js"');
    expect(html).toContain('href="vscode-resource://media/main.css"');
  });

  test("CSP allows module sub-imports (cspSource in script-src, not just nonce)", () => {
    const html = getWebviewHtml(input);

    expect(html).toContain("script-src 'nonce-abc123' vscode-resource:");
    expect(html).toContain("style-src vscode-resource:");
  });

  test("no longer inlines the client script", () => {
    const html = getWebviewHtml(input);

    expect(html).not.toContain("acquireVsCodeApi");
    expect(html).not.toContain("let defaultLimit");
  });
});
