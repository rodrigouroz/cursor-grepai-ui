import { describe, expect, test } from "vitest";
import { normalizeScores } from "../media/lib/score.js";

describe("normalizeScores", () => {
  test("scales bar width relative to the set's max score", () => {
    const out = normalizeScores([{ score: 0.8 }, { score: 0.4 }, { score: 0.2 }]);

    expect(out[0].barWidth).toBe(100);
    expect(out[1].barWidth).toBe(50);
    expect(out[2].barWidth).toBe(25);
  });

  test("labels by relative position to the top hit", () => {
    const out = normalizeScores([{ score: 0.9 }, { score: 0.6 }, { score: 0.3 }]);

    expect(out[0].label).toBe("Strong");
    expect(out[1].label).toBe("Good");
    expect(out[2].label).toBe("Weak");
  });

  test("handles an all-zero or single-item set without dividing by zero", () => {
    expect(normalizeScores([{ score: 0 }])[0].barWidth).toBe(100);
    expect(normalizeScores([])).toEqual([]);
  });
});
