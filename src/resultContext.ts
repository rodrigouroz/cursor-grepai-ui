import type { NormalizedGrepaiResult } from "./resultModel";

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: "ts", tsx: "tsx", js: "js", jsx: "jsx", mjs: "js", cjs: "js",
  py: "python", go: "go", rs: "rust", java: "java", rb: "ruby",
  c: "c", h: "c", cpp: "cpp", cc: "cpp", hpp: "cpp",
  cs: "csharp", php: "php", swift: "swift", kt: "kotlin",
  json: "json", yaml: "yaml", yml: "yaml", md: "markdown",
  sh: "bash", bash: "bash", css: "css", scss: "scss", html: "html", sql: "sql",
};

export function languageForPath(displayPath: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(displayPath);
  if (!match) {
    return "";
  }
  return LANGUAGE_BY_EXTENSION[match[1].toLowerCase()] ?? "";
}

export function formatResultContext(result: NormalizedGrepaiResult): string {
  const header = "`" + result.displayPath + ":" + result.startLine + "-" + result.endLine + "`";
  const fence = "```" + languageForPath(result.displayPath);
  return header + "\n" + fence + "\n" + result.preview + "\n```\n";
}
