export interface TraceSymbol {
  name: string;
  file: string;
  line: number;
}

export interface TraceEntry {
  symbol: TraceSymbol;
  callSite?: { file: string; line: number; context?: string };
}

export interface NormalizedTrace {
  rootSymbol: string;
  entries: TraceEntry[];
}

export interface GraphNode extends TraceSymbol {
  placeholder?: boolean;
}

export interface NormalizedGraph {
  root: string;
  nodes: GraphNode[];
  edges: { caller: string; callee: string; file: string; line: number }[];
}

export function normalizeCallerCallee(json: any, direction: "callers" | "callees"): NormalizedTrace {
  const list: any[] = Array.isArray(json?.[direction]) ? json[direction] : [];
  return {
    rootSymbol: json?.symbol?.name ?? "",
    entries: list.map((item) => {
      const entry: TraceEntry = {
        symbol: {
          name: item?.symbol?.name ?? "",
          file: item?.symbol?.file ?? "",
          line: Number(item?.symbol?.line ?? 0),
        },
      };
      if (item?.call_site) {
        entry.callSite = {
          file: item.call_site.file ?? "",
          line: Number(item.call_site.line ?? 0),
          context: item.call_site.context,
        };
      }
      return entry;
    }),
  };
}

export function normalizeGraph(json: any): NormalizedGraph {
  const graph = json?.graph ?? {};
  const nodeMap: Record<string, any> = graph.nodes ?? {};
  const edges = (Array.isArray(graph.edges) ? graph.edges : []).map((e: any) => ({
    caller: e.caller,
    callee: e.callee,
    file: e.file,
    line: Number(e.line ?? 0),
  }));

  const nodes: GraphNode[] = Object.values(nodeMap).map((n: any) => ({
    name: n.name ?? "",
    file: n.file ?? "",
    line: Number(n.line ?? 0),
  }));
  const present = new Set(nodes.map((n) => n.name));

  for (const edge of edges) {
    for (const endpoint of [edge.caller, edge.callee]) {
      if (!present.has(endpoint)) {
        present.add(endpoint);
        nodes.push({ name: endpoint, file: edge.file, line: edge.line, placeholder: true });
      }
    }
  }

  return { root: graph.root ?? "", nodes, edges };
}
