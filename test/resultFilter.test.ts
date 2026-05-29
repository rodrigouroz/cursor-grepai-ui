import { describe, expect, test } from "vitest";
import { filterExistingResults } from "../src/resultFilter";
import type { NormalizedGrepaiResult } from "../src/resultModel";

describe("filterExistingResults", () => {
  test("keeps only results whose files exist", async () => {
    const results: NormalizedGrepaiResult[] = [
      makeResult("0", "/tmp/current.ts"),
      makeResult("1", "/tmp/deleted-worktree.ts"),
      makeResult("2", "/tmp/other.ts"),
    ];

    await expect(
      filterExistingResults(results, async (filePath) => filePath !== "/tmp/deleted-worktree.ts"),
    ).resolves.toEqual([results[0], results[2]]);
  });
});

function makeResult(id: string, filePath: string): NormalizedGrepaiResult {
  return {
    id,
    filePath,
    displayPath: filePath,
    startLine: 1,
    endLine: 1,
    score: 1,
    preview: "",
  };
}
