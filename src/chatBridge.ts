// Known Cursor commands that seed the chat/composer with a string payload.
// Discovered empirically; order = priority. If none are registered we return
// false and the caller falls back to copying to the clipboard. Refine this list
// during the manual spike in Task 6 if a better command is found.
export const KNOWN_CHAT_COMMANDS = [
  "composer.startComposerPrompt",
  "aichat.newchataction",
  "aichat.insertselectionintochat",
];

export interface ChatBridgeDeps {
  getCommands: () => Promise<string[]>;
  executeCommand: (command: string, ...args: unknown[]) => Promise<unknown>;
}

export function pickChatCommand(available: string[]): string | undefined {
  return KNOWN_CHAT_COMMANDS.find((command) => available.includes(command));
}

export async function trySendToChat(text: string, deps: ChatBridgeDeps): Promise<boolean> {
  try {
    const command = pickChatCommand(await deps.getCommands());
    if (!command) {
      return false;
    }
    await deps.executeCommand(command, text);
    return true;
  } catch {
    return false;
  }
}
