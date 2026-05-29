import { describe, expect, test } from "vitest";
import { groupByFile } from "../media/lib/group.js";

describe("groupByFile", () => {
  test("groups hits by displayPath, ordering files by best rank", () => {
    const groups = groupByFile([
      { id: "0", displayPath: "a.ts", score: 0.9 },
      { id: "1", displayPath: "b.ts", score: 0.8 },
      { id: "2", displayPath: "a.ts", score: 0.5 },
    ]);

    expect(groups.map((g) => g.displayPath)).toEqual(["a.ts", "b.ts"]);
    expect(groups[0].hits.map((h) => h.id)).toEqual(["0", "2"]);
    expect(groups[1].hits.map((h) => h.id)).toEqual(["1"]);
  });

  test("preserves single-hit files", () => {
    const groups = groupByFile([{ id: "0", displayPath: "x.ts", score: 0.4 }]);
    expect(groups).toHaveLength(1);
    expect(groups[0].hits).toHaveLength(1);
  });
});
