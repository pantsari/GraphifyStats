// Mock vscode module before any test requires extension.js
const Module = require("module");
const originalRequire = Module.prototype.require;

Module.prototype.require = function (id) {
  if (id === "vscode") {
    return {
      window: {
        createStatusBarItem: () => ({ show: () => {}, dispose: () => {} }),
        createQuickPick: () => ({
          show: () => {},
          hide: () => {},
          dispose: () => {},
          onDidAccept: () => ({ dispose: () => {} }),
          onDidTriggerButton: () => ({ dispose: () => {} }),
          onDidHide: () => ({ dispose: () => {} }),
          items: [],
        }),
        showQuickPick: () => undefined,
        showInputBox: () => undefined,
        showInformationMessage: () => undefined,
        showWarningMessage: () => undefined,
        showErrorMessage: () => undefined,
        showTextDocument: () => undefined,
      },
      StatusBarAlignment: { Right: 1, Left: 2 },
      QuickPickItemKind: { Separator: -1 },
      ThemeIcon: class {},
      ThemeColor: class {},
      commands: { registerCommand: () => ({ dispose: () => {} }) },
      env: { openExternal: () => undefined },
      Uri: {
        file: (p) => p,
        parse: (s) => s,
      },
      workspace: {
        getConfiguration: () => ({
          get: () => 5,
        }),
        openTextDocument: () => undefined,
        workspaceFolders: null,
      },
    };
  }
  return originalRequire.apply(this, arguments);
};
