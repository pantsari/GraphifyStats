const fs = require("fs");
const os = require("os");
const path = require("path");
const vscode = require("vscode");

function makeFolder(prefix, withGraph) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  if (withGraph) {
    const graphifyOut = path.join(root, "graphify-out");
    fs.mkdirSync(graphifyOut);
    fs.writeFileSync(
      path.join(graphifyOut, "graph.json"),
      JSON.stringify({
        nodes: [{ id: "a", label: "A", source_file: "src/a.js", community: 1 }],
        links: [],
      }),
    );
  }
  return root;
}

describe("multi-root workspace selection", () => {
  let mod;
  let roots;

  beforeEach(() => {
    mod = require("../extension.js");
    roots = [];
  });

  afterEach(() => {
    mod.deactivate();
    vi.restoreAllMocks();
    vscode.workspace.workspaceFolders = null;
    vscode.window.activeTextEditor = undefined;
    for (const root of roots) {
      fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });

  function setFolders(...paths) {
    vscode.workspace.workspaceFolders = paths.map((p) => ({ uri: { fsPath: p } }));
    mod._initForTesting();
  }

  it("selects the workspace folder that contains a graph, not just the first folder", () => {
    const plain = makeFolder("graphify-multi-plain-", false);
    const withGraph = makeFolder("graphify-multi-graph-", true);
    roots.push(plain, withGraph);

    setFolders(plain, withGraph);

    expect(mod.getGraphifyOutPath()).toBe(path.join(withGraph, "graphify-out"));
    expect(mod.getGraphPath()).toBe(path.join(withGraph, "graphify-out", "graph.json"));
  });

  it("prefers the active editor's folder when it also has a graph", () => {
    const first = makeFolder("graphify-multi-first-", true);
    const second = makeFolder("graphify-multi-second-", true);
    roots.push(first, second);

    setFolders(first, second);
    vscode.window.activeTextEditor = {
      document: { uri: { fsPath: path.join(second, "src", "index.js") } },
    };
    vi.spyOn(vscode.workspace, "getWorkspaceFolder").mockReturnValue(
      vscode.workspace.workspaceFolders[1],
    );

    expect(mod.getGraphifyOutPath()).toBe(path.join(second, "graphify-out"));
  });

  it("falls back to the editor's folder, then the first folder, when no graph exists", () => {
    const first = makeFolder("graphify-multi-nofirst-", false);
    const second = makeFolder("graphify-multi-nosecond-", false);
    roots.push(first, second);

    setFolders(first, second);
    expect(mod.getGraphifyOutPath()).toBe(path.join(first, "graphify-out"));

    setFolders(first, second);
    vscode.window.activeTextEditor = {
      document: { uri: { fsPath: path.join(second, "src", "index.js") } },
    };
    vi.spyOn(vscode.workspace, "getWorkspaceFolder").mockReturnValue(
      vscode.workspace.workspaceFolders[1],
    );
    expect(mod.getGraphifyOutPath()).toBe(path.join(second, "graphify-out"));
  });
});
