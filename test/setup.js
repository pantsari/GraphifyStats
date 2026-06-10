// Mock vscode module before any test requires extension.js
const Module = require("module");
const originalRequire = Module.prototype.require;

class MockMarkdownString {
  constructor(value, isTrusted) {
    this.value = value || "";
    this.isTrusted = isTrusted || false;
  }
  appendMarkdown(md) {
    this.value = this.value + md;
    return this;
  }
  appendText(text) {
    this.value = this.value + text;
    return this;
  }
  appendCodeblock(code, language) {
    this.value = this.value + "\n```" + (language || "") + "\n" + code + "\n```\n";
    return this;
  }
}

// Singleton vscode mock so that app code and test code share the same object
let _vscodeMock = null;

function createVscodeMock() {
  return {
    window: {
      createStatusBarItem: () => ({
        show: () => {},
        hide: () => {},
        dispose: () => {},
        text: "",
        tooltip: null,
        command: "",
        color: undefined,
        accessibilityInformation: undefined,
      }),
      createQuickPick: () => ({
        show: () => {},
        hide: () => {},
        dispose: () => {},
        onDidAccept: () => ({ dispose: () => {} }),
        onDidTriggerButton: () => ({ dispose: () => {} }),
        onDidHide: () => ({ dispose: () => {} }),
        items: [],
      }),
      createWebviewPanel: () => ({
        dispose: () => {},
        webview: { options: {}, html: "" },
      }),
      createOutputChannel: () => ({
        appendLine: () => {},
        show: () => {},
        dispose: () => {},
        append: () => {},
      }),
      showQuickPick: () => Promise.resolve(undefined),
      showInputBox: () => Promise.resolve(undefined),
      showInformationMessage: () => Promise.resolve(undefined),
      showWarningMessage: () => Promise.resolve(undefined),
      showErrorMessage: () => Promise.resolve(undefined),
      showTextDocument: () => Promise.resolve(),
    },
    StatusBarAlignment: { Right: 1, Left: 2 },
    QuickPickItemKind: { Separator: -1 },
    ThemeIcon: class {},
    ThemeColor: class {},
    MarkdownString: MockMarkdownString,
    ViewColumn: { One: 1 },
    commands: { registerCommand: () => ({ dispose: () => {} }) },
    env: {
      openExternal: () => Promise.resolve(true),
      clipboard: { writeText: () => Promise.resolve() },
    },
    Uri: {
      file: (p) => ({ fsPath: p, scheme: "file" }),
      parse: (s) => ({ toString: () => s, scheme: "https" }),
    },
    workspace: {
      getConfiguration: () => ({
        get: (_key, defaultVal) => (defaultVal !== undefined ? defaultVal : 5),
      }),
      openTextDocument: () => Promise.resolve({}),
      getWorkspaceFolder: () => null,
      onDidChangeWorkspaceFolders: () => ({ dispose: () => {} }),
      onDidSaveTextDocument: () => ({ dispose: () => {} }),
      workspaceFolders: null,
    },
  };
}

Module.prototype.require = function (id) {
  if (id === "vscode") {
    if (!_vscodeMock) _vscodeMock = createVscodeMock();
    return _vscodeMock;
  }
  return originalRequire.apply(this, arguments);
};
