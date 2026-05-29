import { describe, expect, test } from "vitest";
import { normalizeCallerCallee, normalizeGraph } from "../src/traceModel";

describe("normalizeCallerCallee", () => {
  const json = {
    symbol: { name: "search", file: "src/a.ts", line: 65 },
    callers: [
      {
        symbol: { name: "doThing", file: "src/b.ts", line: 10 },
        call_site: { file: "src/c.ts", line: 87, context: "search()" },
      },
    ],
  };

  test("extracts entries with symbol + call site for the chosen direction", () => {
    const out = normalizeCallerCallee(json, "callers");
    expect(out.rootSymbol).toBe("search");
    expect(out.entries).toEqual([
      {
        symbol: { name: "doThing", file: "src/b.ts", line: 10 },
        callSite: { file: "src/c.ts", line: 87, context: "search()" },
      },
    ]);
  });

  test("missing direction array yields no entries", () => {
    expect(normalizeCallerCallee(json, "callees").entries).toEqual([]);
  });
});

describe("normalizeGraph", () => {
  const json = {
    graph: {
      root: "search",
      nodes: { search: { name: "search", file: "src/a.ts", line: 65 } },
      edges: [{ caller: "search", callee: "getIndex", file: "src/a.ts", line: 78, call_type: "direct" }],
      depth: 2,
    },
  };

  test("synthesizes placeholder nodes for edge endpoints missing from nodes", () => {
    const out = normalizeGraph(json);
    const names = out.nodes.map((n) => n.name).sort();
    expect(names).toEqual(["getIndex", "search"]);
    const placeholder = out.nodes.find((n) => n.name === "getIndex")!;
    expect(placeholder).toEqual({ name: "getIndex", file: "src/a.ts", line: 78, placeholder: true });
  });

  test("passes edges through", () => {
    expect(normalizeGraph(json).edges).toEqual([
      { caller: "search", callee: "getIndex", file: "src/a.ts", line: 78 },
    ]);
  });

  test("synthesizes a placeholder for a missing CALLER endpoint too", () => {
    const out = normalizeGraph({
      graph: {
        root: "search",
        nodes: { search: { name: "search", file: "src/a.ts", line: 65 } },
        edges: [{ caller: "external", callee: "search", file: "src/x.ts", line: 3 }],
      },
    });
    const caller = out.nodes.find((n) => n.name === "external")!;
    expect(caller).toEqual({ name: "external", file: "src/x.ts", line: 3, placeholder: true });
    // the real node is not marked placeholder
    expect(out.nodes.find((n) => n.name === "search")!.placeholder).toBeUndefined();
  });
});

describe("malformed/missing input tolerance", () => {
  test("normalizeCallerCallee handles null input", () => {
    expect(normalizeCallerCallee(null, "callers")).toEqual({ rootSymbol: "", entries: [] });
  });

  test("normalizeGraph handles null input", () => {
    expect(normalizeGraph(null)).toEqual({ root: "", nodes: [], edges: [] });
  });
});
