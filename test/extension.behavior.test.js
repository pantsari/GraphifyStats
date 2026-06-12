const fs = require("fs");
const os = require("os");
const path = require("path");
const vscode = require("vscode");
const { MAX_GRAPH_SIZE_BYTES } = require("../lib/stats.js");

function makeGraph(nodeCount, edgeCount = Math.max(0, nodeCount - 1)) {
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `n${index}`,
    label: `Node ${index}`,
    source_file: `src/file-${index}.js`,
    community: index % 3,
  }));
  const links = Array.from({ length: edgeCount }, (_, index) => ({
    source: `n${index % Math.max(1, nodeCount)}`,
    target: `n${(index + 1) % Math.max(1, nodeCount)}`,
    confidence: index % 2 === 0 ? "EXTRACTED" : "INFERRED",
  }));
  return { nodes, links };
}

function makeStats(overrides = {}) {
  return {
    nodeCount: 10,
    edgeCount: 8,
    density: 0.8,
    communityCount: 2,
    fileCount: 4,
    godNodes: [],
    confidenceCounts: { EXTRACTED: 6, INFERRED: 1, AMBIGUOUS: 1, OTHER: 0 },
    ambiguousRatio: 0.125,
    lastRefreshed: new Date(),
    ...overrides,
  };
}

function createQuickPickHarness() {
  let hideHandler = () => {};
  const quickPick = {
    items: [],
    selectedItems: [],
    show: vi.fn(() => hideHandler()),
    hide: vi.fn(),
    dispose: vi.fn(),
    onDidAccept: vi.fn(() => ({ dispose: vi.fn() })),
    onDidTriggerButton: vi.fn(() => ({ dispose: vi.fn() })),
    onDidHide: vi.fn((handler) => {
      hideHandler = handler;
      return { dispose: vi.fn() };
    }),
  };
  return quickPick;
}

describe("extension behavior", () => {
  let mod;
  let workspaceRoot;
  let graphifyOut;
  let graphPath;

  beforeEach(() => {
    mod = require("../extension.js");
    mod._initForTesting();
    mod._setTestConfiguredPath(null);

    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "graphify-behavior-"));
    graphifyOut = path.join(workspaceRoot, "graphify-out");
    graphPath = path.join(graphifyOut, "graph.json");
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: workspaceRoot } }];
  });

  afterEach(() => {
    mod.deactivate();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vscode.workspace.workspaceFolders = null;
    fs.rmSync(workspaceRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it("tracks activity marker creation, changes, and removal", () => {
    fs.mkdirSync(graphifyOut);
    const activityPath = path.join(graphifyOut, ".graphify-activity");
    fs.writeFileSync(activityPath, "");
    mod._setTestState({ configured: true });

    mod.pollActivity();
    const firstMtime = mod._getTestState().lastActivityMtime;
    expect(firstMtime).toBeGreaterThan(0);
    expect(mod._getTestState().activityActive).toBe(false);

    fs.utimesSync(activityPath, new Date(), new Date(Date.now() + 2000));
    mod.pollActivity();
    expect(mod._getTestState().activityActive).toBe(true);
    expect(mod._getTestState().lastTriggerSource).toBe("file-touch");

    fs.unlinkSync(activityPath);
    mod.pollActivity();
    expect(mod._getTestState().lastActivityMtime).toBe(0);
    expect(mod._getTestState().lastTriggerTime).toBeNull();
  });

  it("suspends polling after two missing graph polls and clears stale stats", async () => {
    mod._setTestState({
      graphStats: makeStats(),
      previousNodeCount: 9,
      previousEdgeCount: 7,
      parseErrorCount: 2,
    });

    await mod.pollStats();
    expect(mod._getTestState().graphStats).toBeNull();
    expect(mod._getTestState().pollingSuspended).toBe(false);

    await mod.pollStats();
    expect(mod._getTestState().pollingSuspended).toBe(true);
    expect(mod._getTestState().nullPollCount).toBe(0);
  });

  it("warns once after three consecutive malformed graph reads", async () => {
    fs.mkdirSync(graphifyOut);
    fs.writeFileSync(graphPath, "{");
    mod._setTestState({ configured: true });
    const warningSpy = vi.spyOn(vscode.window, "showWarningMessage");

    await mod.pollStats();
    await mod.pollStats();
    await mod.pollStats();

    expect(warningSpy).toHaveBeenCalledTimes(1);
    expect(warningSpy.mock.calls[0][0]).toContain("Failed to parse graph.json 3 times");
    expect(mod._getTestState().parseErrorCount).toBe(0);
  });

  it("expires graph-change deltas and green color after 30 seconds", async () => {
    vi.useFakeTimers();
    fs.mkdirSync(graphifyOut);
    fs.writeFileSync(graphPath, JSON.stringify(makeGraph(10, 8)));
    mod._setTestState({ configured: true });

    await mod.pollStats();
    fs.writeFileSync(graphPath, JSON.stringify(makeGraph(20, 16)));
    fs.utimesSync(graphPath, new Date(), new Date(Date.now() + 2000));
    await mod.pollStats();

    expect(mod._getTestState().graphChangedAt).not.toBeNull();
    expect(mod._getStatusBar().color).toBe("#22cc44");
    expect(mod._getStatusBar().text).toContain("(+10)");

    await vi.advanceTimersByTimeAsync(30000);

    expect(mod._getTestState().graphChangedAt).toBeNull();
    expect(mod._getStatusBar().color).toBeUndefined();
    expect(mod._getStatusBar().text).not.toContain("(+10)");
  });

  it("renders setup, missing graph, empty graph, and parse-error states", async () => {
    await mod.updateStatusBar();
    expect(mod._getStatusBar().text).toContain("Not set up");

    fs.mkdirSync(graphifyOut);
    await mod.updateStatusBar();
    expect(mod._getStatusBar().text).toContain("Run graphify update");

    fs.writeFileSync(graphPath, JSON.stringify(makeGraph(0, 0)));
    await mod.updateStatusBar();
    expect(mod._getStatusBar().text).toContain("Empty graph");

    mod._setTestState({ graphStats: null });
    fs.writeFileSync(graphPath, "{invalid");
    await mod.updateStatusBar();
    expect(mod._getStatusBar().text).toContain("Parse error");
  });

  it("renders oversized graphs without reading their contents", async () => {
    fs.mkdirSync(graphifyOut);
    fs.writeFileSync(graphPath, "");
    fs.truncateSync(graphPath, MAX_GRAPH_SIZE_BYTES + 1);
    const readSpy = vi.spyOn(fs.promises, "readFile");

    await mod.updateStatusBar();

    expect(readSpy).not.toHaveBeenCalled();
    expect(mod._getStatusBar().text).toContain("Large graph (50.0 MB)");
  });

  it("recomputes warning and error colors on every render", async () => {
    fs.mkdirSync(graphifyOut);
    fs.writeFileSync(graphPath, JSON.stringify(makeGraph(1, 1)));

    mod._setTestState({
      graphStats: makeStats({ ambiguousRatio: 0.5, edgeCount: 8 }),
    });
    await mod.updateStatusBar();
    expect(mod._getStatusBar().color.id).toBe("statusBarItem.warningForeground");

    mod._setTestState({
      graphStats: makeStats({
        ambiguousRatio: 0,
        lastRefreshed: new Date(Date.now() - 7 * 60 * 60 * 1000),
      }),
    });
    await mod.updateStatusBar();
    expect(mod._getStatusBar().color.id).toBe("statusBarItem.errorForeground");

    mod._setTestState({
      graphStats: makeStats({
        ambiguousRatio: 0,
        lastRefreshed: new Date(Date.now() - 2 * 60 * 60 * 1000),
      }),
    });
    await mod.updateStatusBar();
    expect(mod._getStatusBar().color.id).toBe("statusBarItem.warningForeground");
  });

  it("builds remediation, god-node, inactivity, and active-state tooltip details", async () => {
    fs.mkdirSync(graphifyOut);
    fs.writeFileSync(graphPath, JSON.stringify(makeGraph(1, 1)));
    mod._setTestState({
      configured: true,
      setupWaiting: true,
      activityActive: true,
      lastTriggerTime: Date.now() - 2 * 24 * 60 * 60 * 1000,
      lastTriggerSource: "command:graphify query",
      graphStats: makeStats({
        ambiguousRatio: 0.5,
        confidenceCounts: { EXTRACTED: 2, INFERRED: 1, AMBIGUOUS: 4, OTHER: 1 },
        godNodes: [
          { id: "a", label: "Main`Node", sourceFile: "src\\main.js", degree: 4.5 },
          { id: "b", label: "Fallback", sourceFile: null, degree: 2 },
        ],
      }),
    });

    await mod.updateStatusBar();
    const tooltip = mod._getStatusBar().tooltip.value;

    expect(tooltip).toContain("Run `graphify update .`");
    expect(tooltip).toContain("Top god nodes");
    expect(tooltip).toContain("No activity in 2d");
    expect(tooltip).toContain("Waiting for LLM to complete setup");
    expect(tooltip).toContain("What did you just do with Graphify?");
  });

  it("shows the setup-oriented QuickPick when no graph stats are loaded", async () => {
    const quickPick = createQuickPickHarness();
    vi.spyOn(vscode.window, "createQuickPick").mockReturnValue(quickPick);

    await mod.showQuickPick();

    expect(quickPick.items.map((item) => item.action).filter(Boolean)).toEqual([
      "setup-activity",
      "agent-instructions",
      "learn-more",
      "refresh",
    ]);
  });

  it("shows graph actions and last activity in the populated QuickPick", async () => {
    const quickPick = createQuickPickHarness();
    vi.spyOn(vscode.window, "createQuickPick").mockReturnValue(quickPick);
    mod._setTestState({
      configured: true,
      lastTriggerTime: Date.now(),
      lastTriggerSource: "file-touch",
      graphStats: makeStats(),
    });

    await mod.showQuickPick();

    expect(quickPick.items.some((item) => item.label.includes("Last activity"))).toBe(true);
    expect(quickPick.items.map((item) => item.action).filter(Boolean)).toEqual([
      "refresh",
      "rebuild",
      "open-graph",
      "open-report",
      "open-json",
      "toggle-green",
      "agent-instructions",
      "setup-activity",
    ]);
  });

  it("opens existing report and graph JSON files", async () => {
    fs.mkdirSync(graphifyOut);
    fs.writeFileSync(graphPath, JSON.stringify(makeGraph(1, 0)));
    fs.writeFileSync(path.join(graphifyOut, "GRAPH_REPORT.md"), "# Report");
    const openSpy = vi.spyOn(vscode.workspace, "openTextDocument");
    const showSpy = vi.spyOn(vscode.window, "showTextDocument");

    await mod.handleAction("open-report");
    await mod.handleAction("open-json");

    expect(openSpy).toHaveBeenCalledTimes(2);
    expect(showSpy).toHaveBeenCalledTimes(2);
  });

  it("toggles green indicators through workspace configuration", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const infoSpy = vi.spyOn(vscode.window, "showInformationMessage");
    vi.spyOn(vscode.workspace, "getConfiguration").mockReturnValue({
      get: vi.fn((_key, fallback) => fallback),
      update,
    });

    await mod.handleAction("toggle-green");

    expect(update).toHaveBeenCalledWith("activityIndicator.enabled", false, true);
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining("Green indicators muted"));
  });

  it("shows an error when copying the setup prompt fails", async () => {
    vscode.env.clipboard.writeText = vi.fn().mockRejectedValue(new Error("clipboard unavailable"));
    const errorSpy = vi.spyOn(vscode.window, "showErrorMessage");

    mod.copySetupCommand();
    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled());

    expect(errorSpy.mock.calls[0][0]).toContain("Failed to copy");
  });

  it("hides the status bar when there is no active workspace", async () => {
    vscode.workspace.workspaceFolders = null;
    const hideSpy = vi.fn();
    mod._getStatusBar().hide = hideSpy;

    await mod.updateStatusBar();

    expect(hideSpy).toHaveBeenCalledTimes(1);
  });
});
