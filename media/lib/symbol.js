const SKIP = new Set([
  "function", "def", "class", "const", "let", "var", "func", "type", "interface",
  "return", "if", "else", "for", "while", "import", "export", "from", "async",
  "await", "public", "private", "static", "self", "new",
]);

export function deriveSymbol(preview) {
  const firstLine = String(preview).split(/\r?\n/)[0] || "";
  const decl = /(?:function|def|class|const|let|var|func|type|interface)\s+([A-Za-z_$][A-Za-z0-9_$]*)/.exec(
    firstLine,
  );
  if (decl) return decl[1];
  const idents = firstLine.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) || [];
  const candidates = idents.filter((id) => !SKIP.has(id));
  if (candidates.length === 0) return "";
  return candidates.reduce((a, b) => (b.length > a.length ? b : a));
}
