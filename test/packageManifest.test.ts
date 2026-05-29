import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import manifest from "../package.json";

describe("package manifest", () => {
  test("labels the contributed sidebar view clearly as GrepAI", () => {
    expect(manifest.contributes.viewsContainers.activitybar[0].title).toBe("GrepAI");
    expect(manifest.contributes.views.grepaiSearch[0].name).toBe("GrepAI Search");
  });

  test("contributes a command and default shortcut for opening GrepAI", () => {
    expect(manifest.activationEvents).toContain("onCommand:grepaiSearch.open");
    expect(manifest.contributes.commands).toContainEqual({
      command: "grepaiSearch.open",
      title: "GrepAI: Open Search",
      category: "GrepAI",
    });
    expect(manifest.contributes.keybindings).toContainEqual({
      command: "grepaiSearch.open",
      key: "cmd+alt+g",
      mac: "cmd+alt+g",
      when: "workspaceFolderCount > 0",
    });
  });
});

describe("packaging", () => {
  test("does not ignore the media client assets", () => {
    const ignorePath = fileURLToPath(new URL("../.vscodeignore", import.meta.url));
    const ignore = readFileSync(ignorePath, "utf8");

    expect(ignore).not.toMatch(/^media/m);
  });
});

describe("settings", () => {
  const props = manifest.contributes.configuration.properties as Record<string, any>;

  test("registers live-search, grouping, and trace settings with defaults", () => {
    expect(props["grepaiSearch.liveSearch"].default).toBe(false);
    expect(props["grepaiSearch.liveSearchDelayMs"].default).toBe(350);
    expect(props["grepaiSearch.groupByFile"].default).toBe(true);
    expect(props["grepaiSearch.traceMode"].default).toBe("precise");
  });
});
