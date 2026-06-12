const fs = require("fs");
const os = require("os");
const path = require("path");
const vscode = require("vscode");

function createWorkspace(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const graphifyOut = path.join(root, "graphify-out");
  fs.mkdirSync(graphifyOut);
  fs.writeFileSync(
    path.join(graphifyOut, "graph.json"),
    JSON.stringify({
      nodes: [
        { id: "a", label: "A", source_file: "src/a.js", community: 1 },
        { id: "b", label: "B", source_file: "src/b.js", community: 1 },
      ],
      links: [{ source: "a", target: "b", confidence: "EXTRACTED" }],
    }),
  );
  return root;
}

function createContext() {
  return {
    subscriptions: [],
    globalState: {
      get: (_key, fallback) => fallback,
      update: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe("extension lifecycle regressions", () => {
  let mod;
  let workspaceRoot;

  beforeEach(() => {
    mod = require("../extension.js");
    mod._initForTesting();
    workspaceRoot = createWorkspace("graphify-lifecycle-");
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: workspaceRoot } }];
  });

  afterEach(() => {
    mod.deactivate();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vscode.workspace.workspaceFolders = null;
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("removes the green activity color when the configured duration expires", async () => {
    vi.useFakeTimers();
    mod._setTestState({ configured: true });

    await mod.updateStatusBar();
    mod.triggerActivity();
    await mod.updateStatusBar();

    expect(mod._getStatusBar().color).toBe("#22cc44");

    await vi.advanceTimersByTimeAsync(30000);

    expect(mod._getTestState().activityActive).toBe(false);
    expect(mod._getStatusBar().color).toBeUndefined();
  });

  it("prefers the VS Code watcher, ignores unrelated files, and debounces graph.json bursts", async () => {
    vi.useFakeTimers();

    const watchers = [];
    vi.spyOn(vscode.workspace, "createFileSystemWatcher").mockImplementation(() => {
      const watcher = { dispose: vi.fn(), handlers: {} };
      watcher.onDidCreate = (handler) => {
        watcher.handlers.create = handler;
        return { dispose: () => {} };
      };
      watcher.onDidChange = (handler) => {
        watcher.handlers.change = handler;
        return { dispose: () => {} };
      };
      watcher.onDidDelete = (handler) => {
        watcher.handlers.delete = handler;
        return { dispose: () => {} };
      };
      watchers.push(watcher);
      return watcher;
    });
    const fsWatchSpy = vi.spyOn(fs, "watch");
    const readSpy = vi.spyOn(fs.promises, "readFile");

    mod.activate(createContext());
    await vi.waitFor(() => expect(mod._getTestState().graphStats).not.toBeNull());
    readSpy.mockClear();

    expect(watchers.length).toBe(1);
    expect(fsWatchSpy).not.toHaveBeenCalled();

    const fire = (name) =>
      watchers[0].handlers.change({ fsPath: path.join(workspaceRoot, "graphify-out", name) });

    fire("graph.html");
    fire("GRAPH_REPORT.md");
    await vi.advanceTimersByTimeAsync(300);
    expect(readSpy).not.toHaveBeenCalled();

    for (let i = 0; i < 25; i++) {
      fire("graph.json");
    }

    await vi.advanceTimersByTimeAsync(249);
    expect(readSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(readSpy).toHaveBeenCalledTimes(1));
  });

  it("falls back to fs.watch when the VS Code watcher is unavailable", async () => {
    vi.useFakeTimers();
    vi.spyOn(vscode.workspace, "createFileSystemWatcher").mockImplementation(() => {
      throw new Error("unsupported");
    });

    let watchOptions;
    const watcher = { close: vi.fn(), on: vi.fn() };
    vi.spyOn(fs, "watch").mockImplementation((_dir, options) => {
      watchOptions = options;
      return watcher;
    });

    mod.activate(createContext());
    await vi.advanceTimersByTimeAsync(0);

    expect(watchOptions).toEqual({ recursive: false });
  });

  it("keeps aging the status bar timestamp when the graph is unchanged", async () => {
    vi.useFakeTimers();

    mod.activate(createContext());
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(mod._getStatusBar().text).toContain("now"));

    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    await mod.pollStats();

    expect(mod._getStatusBar().text).toContain("10m");
    expect(mod._getStatusBar().text).not.toContain("now");
  });

  it("coalesces overlapping poll requests while a graph read is in flight", async () => {
    expect(typeof mod.pollStats).toBe("function");
    mod._setTestState({ configured: true });

    const originalReadFile = fs.promises.readFile.bind(fs.promises);
    let releaseRead;
    const readGate = new Promise((resolve) => {
      releaseRead = resolve;
    });
    let firstRead = true;

    vi.spyOn(fs.promises, "readFile").mockImplementation(async (...args) => {
      if (firstRead) {
        firstRead = false;
        await readGate;
      }
      return originalReadFile(...args);
    });
    const statSpy = vi.spyOn(fs.promises, "stat");

    const polls = Array.from({ length: 25 }, () => mod.pollStats());
    await vi.waitFor(() => expect(statSpy).toHaveBeenCalled());

    releaseRead();
    await Promise.all(polls);

    expect(statSpy.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
