const vscode = require("vscode");
const cp = require("node:child_process");
const path = require("node:path");

function runAgent(args, cwd, output) {
  const executable = path.join(cwd, "dist", "cli", "index.js");
  const child = cp.spawn(process.execPath, [executable, ...args], { cwd });
  child.stdout.on("data", (chunk) => output.append(chunk.toString()));
  child.stderr.on("data", (chunk) => output.append(chunk.toString()));
}

function activate(context) {
  const output = vscode.window.createOutputChannel("Code Mind");
  context.subscriptions.push(
    vscode.commands.registerCommand("code-mind.explainCurrentFile", async () => {
      const editor = vscode.window.activeTextEditor;
      const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!editor || !cwd) {
        return;
      }
      output.show(true);
      runAgent(["解释当前文件", "--cwd", cwd], cwd, output);
    }),
    vscode.commands.registerCommand("code-mind.reviewCurrentDiff", async () => {
      const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!cwd) {
        return;
      }
      output.show(true);
      runAgent(["review", "--cwd", cwd], cwd, output);
    }),
    vscode.commands.registerCommand("code-mind.fixSelectedCode", async () => {
      const editor = vscode.window.activeTextEditor;
      const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!editor || !cwd) {
        return;
      }
      const selection = editor.document.getText(editor.selection);
      output.show(true);
      runAgent([`修复这段代码:\n${selection}`, "--cwd", cwd], cwd, output);
    }),
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
