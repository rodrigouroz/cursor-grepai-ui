import { describe, expect, test, vi } from "vitest";
import { pickChatCommand, trySendToChat, KNOWN_CHAT_COMMANDS } from "../src/chatBridge";

describe("pickChatCommand", () => {
  test("returns the first known command that is available", () => {
    const available = ["foo.bar", KNOWN_CHAT_COMMANDS[1], KNOWN_CHAT_COMMANDS[0]];
    expect(pickChatCommand(available)).toBe(KNOWN_CHAT_COMMANDS[0]);
  });

  test("returns undefined when no known command is available", () => {
    expect(pickChatCommand(["foo.bar", "baz.qux"])).toBeUndefined();
  });
});

describe("trySendToChat", () => {
  test("executes the discovered command with the text and returns true", async () => {
    const executeCommand = vi.fn().mockResolvedValue(undefined);
    const ok = await trySendToChat("hello", {
      getCommands: async () => [KNOWN_CHAT_COMMANDS[0]],
      executeCommand,
    });
    expect(ok).toBe(true);
    expect(executeCommand).toHaveBeenCalledWith(KNOWN_CHAT_COMMANDS[0], "hello");
  });

  test("returns false when no chat command exists", async () => {
    const executeCommand = vi.fn();
    const ok = await trySendToChat("hello", {
      getCommands: async () => ["unrelated.command"],
      executeCommand,
    });
    expect(ok).toBe(false);
    expect(executeCommand).not.toHaveBeenCalled();
  });

  test("returns false when the command throws", async () => {
    const ok = await trySendToChat("hello", {
      getCommands: async () => [KNOWN_CHAT_COMMANDS[0]],
      executeCommand: async () => {
        throw new Error("boom");
      },
    });
    expect(ok).toBe(false);
  });
});
