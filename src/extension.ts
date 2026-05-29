import * as vscode from "vscode";
import { GrepaiViewProvider } from "./grepaiViewProvider";

export function activate(context: vscode.ExtensionContext): void {
  const provider = new GrepaiViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(GrepaiViewProvider.viewType, provider),
    vscode.commands.registerCommand("grepaiSearch.open", async () => {
      await vscode.commands.executeCommand("workbench.view.extension.grepaiSearch");
    }),
    vscode.commands.registerCommand("grepaiSearch.refreshScopes", () => provider.refreshScopes()),
  );
}

export function deactivate(): void {}
