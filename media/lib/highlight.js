const EXT = {
  ts: "ts", tsx: "ts", js: "ts", jsx: "ts", mjs: "ts", cjs: "ts",
  py: "py", go: "go", rb: "rb", java: "ts", rs: "ts", c: "ts", h: "ts",
  cpp: "ts", cs: "ts", php: "ts", swift: "ts", kt: "ts",
};

const KEYWORDS = {
  ts: ["const", "let", "var", "function", "return", "if", "else", "for", "while", "class", "export", "import", "from", "async", "await", "new", "type", "interface", "extends", "implements", "of", "in", "this"],
  py: ["def", "return", "if", "elif", "else", "for", "while", "class", "import", "from", "as", "with", "lambda", "yield", "async", "await", "self", "not", "and", "or", "in", "is", "None", "True", "False"],
  go: ["func", "return", "if", "else", "for", "range", "type", "struct", "interface", "package", "import", "var", "const", "go", "defer", "chan", "map", "nil"],
  rb: ["def", "end", "return", "if", "elsif", "else", "unless", "while", "class", "module", "do", "require", "yield", "self", "nil", "true", "false"],
};

export function languageFromPath(path) {
  const match = /\.([a-z0-9]+)$/i.exec(path);
  if (!match) return "plain";
  return EXT[match[1].toLowerCase()] || "plain";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function highlight(code, lang) {
  const keywords = KEYWORDS[lang];
  if (!keywords) return escapeHtml(code);

  const commentStart = lang === "py" || lang === "rb" ? "#" : "//";
  const tokenizer = new RegExp(
    `(${escapeRegExp(commentStart)}[^\\n]*)` +
      `|("(?:[^"\\\\\\n]|\\\\.)*"|'(?:[^'\\\\\\n]|\\\\.)*')` +
      `|(\\b\\d+(?:\\.\\d+)?\\b)` +
      `|([A-Za-z_$][A-Za-z0-9_$]*)`,
    "g",
  );
  const kw = new Set(keywords);

  let out = "";
  let last = 0;
  let m;
  while ((m = tokenizer.exec(code)) !== null) {
    out += escapeHtml(code.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[1]) out += '<span class="tok-com">' + escapeHtml(m[1]) + "</span>";
    else if (m[2]) out += '<span class="tok-str">' + escapeHtml(m[2]) + "</span>";
    else if (m[3]) out += '<span class="tok-num">' + escapeHtml(m[3]) + "</span>";
    else if (m[4] && kw.has(m[4])) out += '<span class="tok-kw">' + escapeHtml(m[4]) + "</span>";
    else out += escapeHtml(m[4]);
  }
  out += escapeHtml(code.slice(last));
  return out;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
