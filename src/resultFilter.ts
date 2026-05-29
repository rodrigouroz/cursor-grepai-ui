import type { NormalizedGrepaiResult } from "./resultModel";

export async function filterExistingResults(
  results: NormalizedGrepaiResult[],
  fileExists: (filePath: string) => Promise<boolean>,
): Promise<NormalizedGrepaiResult[]> {
  const checks = await Promise.all(
    results.map(async (result) => ({
      result,
      exists: await fileExists(result.filePath),
    })),
  );

  return checks.filter((check) => check.exists).map((check) => check.result);
}
