const fs = require("fs");
const os = require("os");
const path = require("path");
const vscode = require("vscode");
const {
  parseActivityEvent,
  recordActivityEntry,
  recordRefreshEntry,
  ACTIVITY_HISTORY_MAX,
  REFRESH_HISTORY_MAX,
} = require("../lib/activity.js");

describe("parseActivityEvent", () => {
  it("parses a valid start event", () => {
    const event = parseActivityEvent(
      JSON.stringify({
        v: 1,
        status: "start",
        command: "graphify update .",
        agent: "claude-code",
        startedAt: "2026-06-12T10:00:00Z",
      }),
    );
    expect(event.status).toBe("start");
    expect(event.command).toBe("graphify update .");
    expect(event.agent).toBe("claude-code");
    expect(event.startedAt).toBe(Date.parse("2026-06-12T10:00:00Z"));
    expect(event.completedAt).toBeNull();
  });

  it("parses a done event with completedAt and tolerates missing optional fields", () => {
    const event = parseActivityEvent(
      JSON.stringify({ v: 1, status: "done", completedAt: 1765532800000 }),
    );
    expect(event.status).toBe("done");
    expect(event.command).toBeNull();
    expect(event.agent).toBeNull();
    expect(event.completedAt).toBe(1765532800000);
  });

  it("rejects malformed, unversioned, future-version, and bogus payloads", () => {
    expect(parseActivityEvent("{not json")).toBeNull();
    expect(parseActivityEvent("")).toBeNull();
    expect(parseActivityEvent(null)).toBeNull();
    expect(parseActivityEvent(JSON.stringify({ status: "start" }))).toBeNull();
    expect(parseActivityEvent(JSON.stringify({ v: 2, status: "start" }))).toBeNull();
    expect(parseActivityEvent(JSON.stringify({ v: 1, status: "launch" }))).toBeNull();
    expect(parseActivityEvent(JSON.stringify([1, 2]))).toBeNull();
    expect(parseActivityEvent("null")).toBeNull();
  });

  it("truncates oversized command and agent strings and invalid timestamps", () => {
    const event = parseActivityEvent(
      JSON.stringify({
        v: 1,
        status: "start",
        command: "x".repeat(500),
        agent: "y".repeat(500),
        startedAt: "not a date",
      }),
    );
    expect(event.command.length).toBe(200);
    expect(event.agent.length).toBe(80);
    expect(event.startedAt).toBeNull();
  });
});

describe("recordActivityEntry", () => {
  const base = { source: "json", command: "graphify query x", agent: "claude" };

  it("collapses done into the matching start entry", () => {
    const history = [];
    recordActivityEntry(history, { ...base, ts: 1000, status: "start" });
    recordActivityEntry(history, { ...base, ts: 4000, status: "done" });
    expect(history.length).toBe(1);
    expect(history[0].status).toBe("done");
    expect(history[0].ts).toBe(4000);
  });

  it("keeps separate rows for distinct commands and trims to the max", () => {
    const history = [];
    for (let i = 0; i < ACTIVITY_HISTORY_MAX + 3; i++) {
      recordActivityEntry(history, {
        ts: 100000 * (i + 1),
        status: "done",
        source: "json",
        command: `cmd-${i}`,
        agent: null,
      });
    }
    expect(history.length).toBe(ACTIVITY_HISTORY_MAX);
    expect(history[0].command).toBe(`cmd-${ACTIVITY_HISTORY_MAX + 2}`);
  });

  it("drops a bare touch that duplicates a JSON event, and upgrades touch to JSON", () => {
    const history = [];
    recordActivityEntry(history, { ...base, ts: 1000, status: "start" });
    recordActivityEntry(history, {
      ts: 2000,
      status: "done",
      source: "file-touch",
      command: null,
      agent: null,
    });
    expect(history.length).toBe(1);
    expect(history[0].source).toBe("json");

    const history2 = [];
    recordActivityEntry(history2, {
      ts: 1000,
      status: "done",
      source: "file-touch",
      command: null,
      agent: null,
    });
    recordActivityEntry(history2, { ...base, ts: 2000, status: "start" });
    expect(history2.length).toBe(1);
    expect(history2[0].source).toBe("json");
  });
});

describe("recordRefreshEntry", () => {
  it("dedupes the latest mtime and trims to the max", () => {
    const history = [];
    recordRefreshEntry(history, 1000);
    recordRefreshEntry(history, 1000);
    expect(history).toEqual([1000]);

    for (let i = 2; i <= REFRESH_HISTORY_MAX + 2; i++) {
      recordRefreshEntry(history, i * 1000);
    }
    expect(history.length).toBe(REFRESH_HISTORY_MAX);
    expect(history[0]).toBe((REFRESH_HISTORY_MAX + 2) * 1000);
    recordRefreshEntry(history, NaN);
    recordRefreshEntry(history, "soon");
    expect(history.length).toBe(REFRESH_HISTORY_MAX);
  });
});

describe("activity JSON protocol integration", () => {
  let mod;
  let workspaceRoot;
  let graphifyOut;
  let jsonPath;

  beforeEach(() => {
    mod = require("../extension.js");
    mod._initForTesting();

    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "graphify-activity-"));
    graphifyOut = path.join(workspaceRoot, "graphify-out");
    fs.mkdirSync(graphifyOut);
    fs.writeFileSync(
      path.join(graphifyOut, "graph.json"),
      JSON.stringify({
        nodes: [{ id: "a", label: "A", source_file: "src/a.js", community: 1 }],
        links: [],
      }),
    );
    jsonPath = path.join(graphifyOut, ".graphify-activity.json");
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: workspaceRoot } }];
  });

  afterEach(async () => {
    mod.deactivate();
    vi.restoreAllMocks();
    vscode.workspace.workspaceFolders = null;
    await fs.promises.rm(workspaceRoot, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  });

  function writeEvent(event, mtimeOffsetSeconds) {
    fs.writeFileSync(jsonPath, JSON.stringify(event));
    const when = new Date(Date.now() + mtimeOffsetSeconds * 1000);
    fs.utimesSync(jsonPath, when, when);
  }

  it("shows the running state on a fresh start event and clears it on done", async () => {
    writeEvent({ v: 1, status: "start", command: "graphify update .", agent: "claude-code" }, 0);
    mod.pollActivity();

    let testState = mod._getTestState();
    expect(testState.runningActivity).not.toBeNull();
    expect(testState.runningActivity.command).toBe("graphify update .");

    await mod.updateStatusBar();
    expect(mod._getStatusBar().text).toContain("$(sync~spin)");

    writeEvent({ v: 1, status: "done", command: "graphify update .", agent: "claude-code" }, 2);
    mod.pollActivity();

    testState = mod._getTestState();
    expect(testState.runningActivity).toBeNull();
    expect(testState.activityHistory[0].status).toBe("done");
    expect(testState.activityHistory[0].command).toBe("graphify update .");
    expect(testState.activityHistory[0].agent).toBe("claude-code");
    expect(testState.lastTriggerSource).toBe("json:claude-code");

    await mod.updateStatusBar();
    expect(mod._getStatusBar().text).not.toContain("$(sync~spin)");
  });

  it("ignores malformed and future-version events without crashing", () => {
    writeEvent({ v: 1, status: "done", command: "seed" }, 0);
    mod.pollActivity();

    fs.writeFileSync(jsonPath, "{broken json");
    fs.utimesSync(jsonPath, new Date(Date.now() + 2000), new Date(Date.now() + 2000));
    mod.pollActivity();

    writeEvent({ v: 99, status: "start", command: "future" }, 4);
    mod.pollActivity();

    const testState = mod._getTestState();
    expect(testState.runningActivity).toBeNull();
    expect(testState.activityHistory.length).toBe(0);
  });

  it("renders recent refreshes and recent activity history in the tooltip", async () => {
    const now = Date.now();
    mod._setTestState({
      configured: true,
      graphStats: {
        nodeCount: 10,
        edgeCount: 8,
        density: 0.8,
        communityCount: 2,
        fileCount: 4,
        godNodes: [],
        confidenceCounts: { EXTRACTED: 6, INFERRED: 1, AMBIGUOUS: 1, OTHER: 0 },
        ambiguousRatio: 0.125,
        lastRefreshed: new Date(now - 60000),
      },
      lastTriggerTime: now - 120000,
      lastTriggerSource: "json:claude-code",
      activityHistory: [
        {
          ts: now - 120000,
          status: "done",
          source: "json",
          command: "graphify query auth flow",
          agent: "claude-code",
        },
        { ts: now - 3600000, status: "done", source: "file-touch", command: null, agent: null },
      ],
      refreshHistory: [now - 60000, now - 7200000, now - 86400000],
    });

    await mod.updateStatusBar();
    const tooltip = mod._getStatusBar().tooltip.value;

    expect(tooltip).toContain("Recent refreshes: 1m · 2h · 1d");
    expect(tooltip).toContain("Recent activity");
    expect(tooltip).toContain("2m — graphify query auth flow · claude-code");
    expect(tooltip).toContain("1h — activity signal");
  });
});
