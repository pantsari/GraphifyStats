const {
  computeGraphStats,
  confidenceWeight,
  formatCount,
  formatDelta,
  sanitizeText,
  safeReadGraph,
  healthLabel,
  densityLabel,
  getTimeAgo,
  getTimeAgoShort,
  getFileCreationTime,
} = require("../lib/stats.js");

describe("formatCount", () => {
  it("formats zero", () => {
    expect(formatCount(0)).toBe("0");
  });

  it("formats small numbers directly", () => {
    expect(formatCount(42)).toBe("42");
    expect(formatCount(999)).toBe("999");
  });

  it("formats thousands with K suffix", () => {
    expect(formatCount(1000)).toBe("1.0K");
    expect(formatCount(1500)).toBe("1.5K");
  });

  it("formats 999999 as 1.0M not 1000.0K", () => {
    expect(formatCount(999999)).toBe("1.0M");
  });

  it("formats millions with M suffix", () => {
    expect(formatCount(1000000)).toBe("1.0M");
    expect(formatCount(2500000)).toBe("2.5M");
  });

  it("formats billions with B suffix", () => {
    expect(formatCount(1500000000)).toBe("1.5B");
    expect(formatCount(999500000)).toBe("1.0B");
  });

  it("handles negative numbers gracefully", () => {
    expect(formatCount(-1)).toBe("0");
    expect(formatCount(-500)).toBe("0");
  });

  it("rounds fractional counts", () => {
    expect(formatCount(1499.6)).toBe("1.5K");
  });
});

describe("formatDelta", () => {
  it("returns empty string when previous is null", () => {
    expect(formatDelta(100, null)).toBe("");
  });

  it("returns empty string when previous is undefined", () => {
    expect(formatDelta(100, undefined)).toBe("");
  });

  it("returns empty for changes below min threshold", () => {
    expect(formatDelta(100, 97)).toBe("");
    expect(formatDelta(100, 103)).toBe("");
  });

  it("returns positive delta for increases >= 5", () => {
    expect(formatDelta(105, 100)).toBe(" (+5)");
  });

  it("returns negative delta for decreases >= 5", () => {
    expect(formatDelta(95, 100)).toBe(" (-5)");
  });

  it("returns empty string for no change", () => {
    expect(formatDelta(100, 100)).toBe("");
  });

  it("uses proportional threshold for small graphs", () => {
    expect(formatDelta(12, 10)).toBe(" (+2)");
    expect(formatDelta(10, 10)).toBe("");
  });
});

describe("sanitizeText", () => {
  it("passes through normal text", () => {
    expect(sanitizeText("hello")).toBe("hello");
  });

  it("strips control characters", () => {
    expect(sanitizeText("he\x00llo")).toBe("hello");
  });

  it("escapes backslashes", () => {
    expect(sanitizeText("path\\to")).toBe("path\\\\to");
  });

  it("escapes backticks", () => {
    expect(sanitizeText("`code`")).toBe("\\`code\\`");
  });

  it("truncates to 200 characters", () => {
    const long = "a".repeat(300);
    expect(sanitizeText(long).length).toBe(200);
  });

  it("converts non-strings", () => {
    expect(sanitizeText(123)).toBe("123");
    expect(sanitizeText(null)).toBe("null");
  });

  it("strips javascript: URIs", () => {
    const result = sanitizeText("javascript:alert(1)");
    expect(result).not.toContain("javascript:");
    expect(result).toContain("[blocked]");
  });

  it("strips data: URIs", () => {
    const result = sanitizeText("data:text/html,<script>");
    expect(result).not.toContain("data:");
    expect(result).toContain("[blocked]");
  });
});

describe("healthLabel", () => {
  it('returns "N/A" for zero edges', () => {
    expect(healthLabel(0, 0)).toBe("N/A");
  });

  it('returns "Excellent" for <10% ambiguous', () => {
    expect(healthLabel(0, 10)).toBe("Excellent");
    expect(healthLabel(0.05, 10)).toBe("Excellent");
  });

  it('returns "Good" for <20% ambiguous', () => {
    expect(healthLabel(0.1, 10)).toBe("Good");
    expect(healthLabel(0.15, 10)).toBe("Good");
  });

  it('returns "Fair" for <30% ambiguous', () => {
    expect(healthLabel(0.2, 10)).toBe("Fair");
    expect(healthLabel(0.25, 10)).toBe("Fair");
  });

  it('returns "Poor" for >=30% ambiguous', () => {
    expect(healthLabel(0.3, 10)).toBe("Poor");
    expect(healthLabel(0.5, 10)).toBe("Poor");
  });
});

describe("densityLabel", () => {
  it('returns "N/A" for zero density', () => {
    expect(densityLabel(0)).toBe("N/A");
  });

  it('returns "Sparse" for <0.5', () => {
    expect(densityLabel(0.3)).toBe("Sparse");
  });

  it('returns "Typical" for 0.5-5.0', () => {
    expect(densityLabel(1.0)).toBe("Typical");
    expect(densityLabel(5.0)).toBe("Typical");
  });

  it('returns "Dense" for >5.0', () => {
    expect(densityLabel(5.1)).toBe("Dense");
  });
});

describe("confidenceWeight", () => {
  it("weights EXTRACTED as 1.0", () => {
    expect(confidenceWeight("EXTRACTED")).toBe(1.0);
  });

  it("weights INFERRED as 0.5", () => {
    expect(confidenceWeight("INFERRED")).toBe(0.5);
  });

  it("weights AMBIGUOUS as 0.25", () => {
    expect(confidenceWeight("AMBIGUOUS")).toBe(0.25);
  });

  it("weights unknown as 0.25", () => {
    expect(confidenceWeight("UNKNOWN")).toBe(0.25);
  });
});

describe("getTimeAgo", () => {
  it('returns "just now" for recent timestamps', () => {
    const d = new Date(Date.now() - 30 * 1000);
    expect(getTimeAgo(d)).toBe("just now");
  });

  it("returns minutes with full word", () => {
    const d = new Date(Date.now() - 5 * 60 * 1000);
    expect(getTimeAgo(d)).toBe("5 min ago");
  });

  it("returns hours with full word", () => {
    const d = new Date(Date.now() - 3 * 3600 * 1000);
    expect(getTimeAgo(d)).toBe("3 hr ago");
  });

  it("returns days with full word", () => {
    const d = new Date(Date.now() - 2 * 86400 * 1000);
    expect(getTimeAgo(d)).toBe("2 day ago");
  });
});

describe("getTimeAgoShort", () => {
  it('returns "now" for recent timestamps', () => {
    const d = new Date(Date.now() - 30 * 1000);
    expect(getTimeAgoShort(d)).toBe("now");
  });

  it("returns minutes as Xm", () => {
    const d = new Date(Date.now() - 5 * 60 * 1000);
    expect(getTimeAgoShort(d)).toBe("5m");
  });

  it("returns hours as Xh", () => {
    const d = new Date(Date.now() - 3 * 3600 * 1000);
    expect(getTimeAgoShort(d)).toBe("3h");
  });

  it("returns days as Xd", () => {
    const d = new Date(Date.now() - 2 * 86400 * 1000);
    expect(getTimeAgoShort(d)).toBe("2d");
  });
});

describe("computeGraphStats", () => {
  it("parses node and edge counts from valid graph", () => {
    const graph = {
      nodes: [
        { id: "a", label: "Auth", source_file: "src/auth.py", community: 1 },
        { id: "b", label: "Database", source_file: "src/db.py", community: 1 },
        { id: "c", label: "Router", source_file: "src/router.py", community: 2 },
      ],
      edges: [
        { source: "a", target: "b", relation: "calls", confidence: "EXTRACTED" },
        { source: "c", target: "a", relation: "calls", confidence: "INFERRED" },
        { source: "c", target: "b", relation: "references", confidence: "AMBIGUOUS" },
      ],
    };

    const stats = computeGraphStats(graph);

    expect(stats.nodeCount).toBe(3);
    expect(stats.edgeCount).toBe(3);
    expect(stats.density).toBeCloseTo(1.0, 1);
    expect(stats.communityCount).toBe(2);
    expect(stats.fileCount).toBe(3);
    expect(stats.confidenceCounts.EXTRACTED).toBe(1);
    expect(stats.confidenceCounts.INFERRED).toBe(1);
    expect(stats.confidenceCounts.AMBIGUOUS).toBe(1);
  });

  it("reads edges from links key (actual graphify format)", () => {
    const graph = {
      nodes: [
        { id: "a", label: "Auth", source_file: "src/auth.py", community: 1 },
        { id: "b", label: "Database", source_file: "src/db.py", community: 1 },
      ],
      links: [
        { source: "a", target: "b", relation: "calls", confidence: "EXTRACTED" },
        { source: "b", target: "a", relation: "imports", confidence: "INFERRED" },
      ],
    };

    const stats = computeGraphStats(graph);

    expect(stats.nodeCount).toBe(2);
    expect(stats.edgeCount).toBe(2);
  });

  it("handles empty graph", () => {
    const stats = computeGraphStats({ nodes: [], edges: [] });

    expect(stats.nodeCount).toBe(0);
    expect(stats.edgeCount).toBe(0);
    expect(stats.density).toBe(0);
    expect(stats.communityCount).toBe(0);
    expect(stats.fileCount).toBe(0);
    expect(stats.godNodes).toEqual([]);
  });

  it("weights god nodes by edge confidence", () => {
    const graph = {
      nodes: [
        { id: "a", label: "Hub", source_file: "hub.py", community: 1 },
        { id: "b", label: "Leaf1", source_file: "leaf1.py", community: 1 },
        { id: "c", label: "Leaf2", source_file: "leaf2.py", community: 2 },
      ],
      edges: [
        { source: "a", target: "b", relation: "calls", confidence: "EXTRACTED" },
        { source: "a", target: "c", relation: "calls", confidence: "AMBIGUOUS" },
      ],
    };

    const stats = computeGraphStats(graph);

    expect(stats.godNodes).toHaveLength(3);
    expect(stats.godNodes[0].id).toBe("a");
    expect(stats.godNodes[0].degree).toBe(1.3);
  });

  it("handles missing fields gracefully", () => {
    const stats = computeGraphStats({});

    expect(stats.nodeCount).toBe(0);
    expect(stats.edgeCount).toBe(0);
    expect(stats.density).toBe(0);
  });

  it("deduplicates communities and files", () => {
    const graph = {
      nodes: [
        { id: "a", label: "A", source_file: "src/a.py", community: 1 },
        { id: "b", label: "B", source_file: "src/a.py", community: 1 },
        { id: "c", label: "C", source_file: "src/c.py", community: 2 },
      ],
      edges: [],
    };

    const stats = computeGraphStats(graph);

    expect(stats.communityCount).toBe(2);
    expect(stats.fileCount).toBe(2);
  });

  it("skips nodes without community field", () => {
    const graph = {
      nodes: [
        { id: "a", label: "A", source_file: "a.py", community: 1 },
        { id: "b", label: "B", source_file: "b.py" },
      ],
      edges: [],
    };

    const stats = computeGraphStats(graph);

    expect(stats.communityCount).toBe(1);
  });

  it("counts unknown confidence as OTHER", () => {
    const graph = {
      nodes: [],
      edges: [{ source: "a", target: "b", relation: "uses", confidence: "UNKNOWN_KIND" }],
    };

    const stats = computeGraphStats(graph);

    expect(stats.confidenceCounts.EXTRACTED).toBe(0);
    expect(stats.confidenceCounts.INFERRED).toBe(0);
    expect(stats.confidenceCounts.AMBIGUOUS).toBe(0);
    expect(stats.confidenceCounts.OTHER).toBe(1);
  });

  it("computes ambiguous ratio", () => {
    const graph = {
      nodes: [],
      edges: [
        { source: "a", target: "b", relation: "uses", confidence: "AMBIGUOUS" },
        { source: "b", target: "c", relation: "uses", confidence: "AMBIGUOUS" },
        { source: "c", target: "d", relation: "uses", confidence: "EXTRACTED" },
      ],
    };

    const stats = computeGraphStats(graph);

    expect(stats.ambiguousRatio).toBeCloseTo(2 / 3, 2);
  });
});

describe("safeReadGraph", () => {
  it("returns null for missing file", async () => {
    const result = await safeReadGraph("/nonexistent/path/graph.json");
    expect(result).toBeNull();
  });
});

describe("getFileCreationTime", () => {
  it("is a function", () => {
    expect(typeof getFileCreationTime).toBe("function");
  });
});

describe("Extension — module exports", () => {
  it("exports all public functions", () => {
    const mod = require("../extension.js");
    expect(typeof mod.activate).toBe("function");
    expect(typeof mod.deactivate).toBe("function");
    expect(typeof mod.getGraphPath).toBe("function");
    expect(typeof mod.getGraphifyOutPath).toBe("function");
    expect(typeof mod.triggerActivity).toBe("function");
    expect(typeof mod.pollActivity).toBe("function");
    expect(typeof mod.pollConfigured).toBe("function");
    expect(typeof mod.updateStatusBar).toBe("function");
    expect(typeof mod.showQuickPick).toBe("function");
    expect(typeof mod.copySetupCommand).toBe("function");
    expect(typeof mod.LLM_PROMPT_TEMPLATE).toBe("string");
  });
});

describe("getGraphifyOutPath", () => {
  it("returns null when no workspace folder", () => {
    const { getGraphifyOutPath } = require("../extension.js");
    expect(getGraphifyOutPath()).toBeNull();
  });
});

describe("pollActivity", () => {
  it("does not throw when called", () => {
    const { pollActivity } = require("../extension.js");
    expect(() => pollActivity()).not.toThrow();
  });
});

describe("LLM prompt template", () => {
  it("contains key instructions", () => {
    const { LLM_PROMPT_TEMPLATE } = require("../extension.js");
    expect(LLM_PROMPT_TEMPLATE).toContain("graphify");
    expect(LLM_PROMPT_TEMPLATE).toContain("touch graphify-out/.graphify-activity");
    expect(LLM_PROMPT_TEMPLATE).toContain("GraphifyStats");
  });

  it("is a non-empty string", () => {
    const { LLM_PROMPT_TEMPLATE } = require("../extension.js");
    expect(LLM_PROMPT_TEMPLATE.length).toBeGreaterThan(100);
  });
});

describe("readGraphStats — unchanged detection", () => {
  const fs = require("fs");
  const path = require("path");
  const os = require("os");
  const { readGraphStats } = require("../lib/stats.js");

  it("returns unchanged:true when mtime matches cache", async () => {
    const tmpFile = path.join(os.tmpdir(), `graphify-test-${Date.now()}.json`);
    const graph = {
      nodes: [{ id: "a", label: "A", source_file: "a.py", community: 1 }],
      links: [],
    };
    fs.writeFileSync(tmpFile, JSON.stringify(graph));

    const first = await readGraphStats(tmpFile, { data: null, summary: false, mtime: undefined });
    expect(first.unchanged).toBe(false);
    expect(first.data.nodeCount).toBe(1);

    const second = await readGraphStats(tmpFile, {
      data: first.data,
      summary: false,
      mtime: first.mtime,
    });
    expect(second.unchanged).toBe(true);
    expect(second.data.nodeCount).toBe(1);

    fs.unlinkSync(tmpFile);
  });
});

describe("triggerActivity timeout", () => {
  let mod;

  beforeEach(() => {
    vi.useFakeTimers();
    mod = require("../extension.js");
    mod._initForTesting();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets activityActive to true immediately", () => {
    mod.triggerActivity();
    expect(mod._getTestState().activityActive).toBe(true);
  });

  it("resets activityActive to false after timeout", () => {
    mod.triggerActivity();
    expect(mod._getTestState().activityActive).toBe(true);
    vi.advanceTimersByTime(30000);
    expect(mod._getTestState().activityActive).toBe(false);
  });

  it("updates lastTriggerTime on each call", () => {
    const before = Date.now();
    mod.triggerActivity();
    expect(mod._getTestState().lastTriggerTime).toBeGreaterThanOrEqual(before);
  });

  it("clears previous timeout on re-trigger", () => {
    mod.triggerActivity();
    vi.advanceTimersByTime(15000);
    mod.triggerActivity();
    expect(mod._getTestState().activityActive).toBe(true);
    vi.advanceTimersByTime(15000);
    expect(mod._getTestState().activityActive).toBe(true);
    vi.advanceTimersByTime(15000);
    expect(mod._getTestState().activityActive).toBe(false);
  });
});

describe("pollConfigured detection", () => {
  const fs = require("fs");
  const path = require("path");
  const os = require("os");

  let mod;
  let tmpDir;
  let configuredFile;

  beforeEach(() => {
    mod = require("../extension.js");
    mod._initForTesting();
    tmpDir = path.join(
      os.tmpdir(),
      `graphify-cfg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    fs.mkdirSync(tmpDir, { recursive: true });
    configuredFile = path.join(tmpDir, "configured");
    mod._setTestConfiguredPath(configuredFile);
  });

  afterEach(() => {
    try {
      fs.unlinkSync(configuredFile);
    } catch {
      /* ok */
    }
    try {
      fs.rmdirSync(tmpDir);
    } catch {
      /* ok */
    }
  });

  it("detects configured when marker file exists", () => {
    fs.writeFileSync(configuredFile, "");
    mod.pollConfigured();
    expect(mod._getTestState().configured).toBe(true);
  });

  it("detects unconfigured when marker file does not exist", () => {
    mod._setTestState({ configured: false });
    mod.pollConfigured();
    expect(mod._getTestState().configured).toBe(false);
  });

  it("transitions from configured to unconfigured when marker is removed", () => {
    fs.writeFileSync(configuredFile, "");
    mod._setTestState({ configured: true });
    mod.pollConfigured();
    expect(mod._getTestState().configured).toBe(true);

    fs.unlinkSync(configuredFile);
    mod.pollConfigured();
    expect(mod._getTestState().configured).toBe(false);
  });

  it("transitions from unconfigured to configured when marker appears", () => {
    mod._setTestState({ configured: false });
    mod.pollConfigured();
    expect(mod._getTestState().configured).toBe(false);

    fs.writeFileSync(configuredFile, "");
    mod.pollConfigured();
    expect(mod._getTestState().configured).toBe(true);
  });

  it("is safe to call when state is uninitialized", () => {
    mod.pollConfigured();
    // should not throw
  });
});

describe("copySetupCommand platform", () => {
  let mod;
  const vscode = require("vscode");

  beforeEach(() => {
    mod = require("../extension.js");
    mod._initForTesting();
  });

  it("writes the LLM prompt to clipboard", async () => {
    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    vscode.env.clipboard.writeText = writeTextSpy;

    mod.copySetupCommand();

    expect(writeTextSpy).toHaveBeenCalledTimes(1);
    const content = writeTextSpy.mock.calls[0][0];
    expect(content).toContain("graphify");
    expect(content).toContain("GraphifyStats");
    expect(content).toContain("graphify-out");
  });

  it("includes activity signal instructions in clipboard content", async () => {
    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    vscode.env.clipboard.writeText = writeTextSpy;

    mod.copySetupCommand();

    const content = writeTextSpy.mock.calls[0][0];
    expect(content).toContain("touch graphify-out/.graphify-activity");
    expect(content).toContain("graphify query");
    expect(content).toContain("The One Rule");
  });

  it("shows information message on success", async () => {
    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    const infoSpy = vi.spyOn(vscode.window, "showInformationMessage");
    vscode.env.clipboard.writeText = writeTextSpy;

    mod.copySetupCommand();

    // Wait for the promise chain to resolve
    await vi.waitFor(() => {
      expect(infoSpy).toHaveBeenCalled();
    });

    const msg = infoSpy.mock.calls[0][0];
    expect(msg).toContain("copied");
  });
});

describe("tooltip caching", () => {
  const fs = require("fs");
  const path = require("path");
  const os = require("os");
  const vscode = require("vscode");

  let mod;
  let tmpDir;

  beforeEach(() => {
    mod = require("../extension.js");
    mod._initForTesting();

    tmpDir = path.join(
      os.tmpdir(),
      `graphify-tooltip-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    const graphifyOut = path.join(tmpDir, "graphify-out");
    fs.mkdirSync(graphifyOut, { recursive: true });

    const graph = {
      nodes: [
        { id: "a", label: "Auth", source_file: "src/auth.py", community: 1 },
        { id: "b", label: "Database", source_file: "src/db.py", community: 1 },
        { id: "c", label: "Router", source_file: "src/router.py", community: 2 },
      ],
      edges: [
        { source: "a", target: "b", relation: "calls", confidence: "EXTRACTED" },
        { source: "c", target: "a", relation: "calls", confidence: "INFERRED" },
        { source: "c", target: "b", relation: "references", confidence: "AMBIGUOUS" },
      ],
    };
    fs.writeFileSync(path.join(graphifyOut, "graph.json"), JSON.stringify(graph));

    vscode.workspace.workspaceFolders = [{ uri: { fsPath: tmpDir } }];
  });

  afterEach(() => {
    vscode.workspace.workspaceFolders = null;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ok */
    }
  });

  it("caches tooltip on first render with non-zero hash", async () => {
    await mod.updateStatusBar();

    const state = mod._getTestState();
    expect(state.cachedTooltip).not.toBeNull();
    expect(state.cachedTooltipHash).not.toBe(0);
  });

  it("reuses cached tooltip when hash matches", async () => {
    await mod.updateStatusBar();

    const firstTooltip = mod._getTestState().cachedTooltip;
    const firstHash = mod._getTestState().cachedTooltipHash;

    // reset the statusBar tooltip so we can detect reuse
    const sb = mod._getStatusBar();
    sb.tooltip = null;

    await mod.updateStatusBar();

    const state = mod._getTestState();
    // cachedTooltip should be the same instance since hash didn't change
    expect(state.cachedTooltip).toBe(firstTooltip);
    expect(state.cachedTooltipHash).toBe(firstHash);
    // statusBar.tooltip should be the cached one
    expect(sb.tooltip).toBe(firstTooltip);
  });

  it("invalidates cache when state changes that affect hash", async () => {
    await mod.updateStatusBar();

    const firstTooltip = mod._getTestState().cachedTooltip;
    const firstHash = mod._getTestState().cachedTooltipHash;

    // Change a field that affects the hash
    mod._setTestState({ activityActive: true });

    await mod.updateStatusBar();

    const state = mod._getTestState();
    expect(state.cachedTooltip).not.toBe(firstTooltip);
    expect(state.cachedTooltipHash).not.toBe(firstHash);
  });

  it("invalidates cache when configured state changes", async () => {
    await mod.updateStatusBar();

    const firstTooltip = mod._getTestState().cachedTooltip;

    mod._setTestState({ configured: true });

    await mod.updateStatusBar();

    const state = mod._getTestState();
    expect(state.cachedTooltip).not.toBe(firstTooltip);
    expect(state.cachedTooltipHash).not.toBe(0);
  });
});

describe("graphChangedAt delta logic", () => {
  const fs = require("fs");
  const path = require("path");
  const os = require("os");
  const vscode = require("vscode");

  let mod;
  let tmpDir;
  let graphJsonPath;

  beforeEach(() => {
    mod = require("../extension.js");
    mod._initForTesting();

    tmpDir = path.join(
      os.tmpdir(),
      `graphify-delta-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    const graphifyOut = path.join(tmpDir, "graphify-out");
    fs.mkdirSync(graphifyOut, { recursive: true });

    graphJsonPath = path.join(graphifyOut, "graph.json");

    vscode.workspace.workspaceFolders = [{ uri: { fsPath: tmpDir } }];
  });

  afterEach(() => {
    vscode.workspace.workspaceFolders = null;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ok */
    }
  });

  function makeNodes(count) {
    const nodes = [];
    for (let i = 0; i < count; i++) {
      nodes.push({ id: `n${i}`, label: `Node${i}`, source_file: `src/f${i}.py`, community: 1 });
    }
    return nodes;
  }

  function makeEdges(count) {
    const edges = [];
    for (let i = 0; i < count; i++) {
      edges.push({
        source: `n${i}`,
        target: `n${(i + 1) % count}`,
        relation: "calls",
        confidence: "EXTRACTED",
      });
    }
    return edges;
  }

  it("shows deltas in status bar when graphChangedAt is recent", async () => {
    const nodes15 = makeNodes(15);
    const edges12 = makeEdges(12);
    fs.writeFileSync(graphJsonPath, JSON.stringify({ nodes: nodes15, edges: edges12 }));

    await mod.updateStatusBar();

    mod._setTestState({
      graphChangedAt: Date.now(),
      previousNodeCount: 10,
      previousEdgeCount: 7,
    });

    await mod.updateStatusBar();

    const sb = mod._getStatusBar();
    expect(sb.text).toContain("(+5)");
  });

  it("hides deltas when graphChangedAt is older than 30s", async () => {
    const nodes15 = makeNodes(15);
    const edges12 = makeEdges(12);
    fs.writeFileSync(graphJsonPath, JSON.stringify({ nodes: nodes15, edges: edges12 }));

    await mod.updateStatusBar();

    mod._setTestState({
      graphChangedAt: Date.now() - 31000,
      previousNodeCount: 10,
      previousEdgeCount: 7,
    });

    const sb = mod._getStatusBar();
    sb.text = "";

    await mod.updateStatusBar();

    expect(sb.text).not.toContain("(+5)");
  });

  it("shows negative deltas when node count decreases", async () => {
    const nodes5 = makeNodes(5);
    const edges5 = makeEdges(5);
    fs.writeFileSync(graphJsonPath, JSON.stringify({ nodes: nodes5, edges: edges5 }));

    await mod.updateStatusBar();

    mod._setTestState({
      graphChangedAt: Date.now(),
      previousNodeCount: 10,
      previousEdgeCount: 10,
    });

    await mod.updateStatusBar();

    const sb = mod._getStatusBar();
    expect(sb.text).toContain("(-5)");
  });

  it("sets status bar color to green for recent graph changes", async () => {
    const nodes10 = makeNodes(10);
    fs.writeFileSync(graphJsonPath, JSON.stringify({ nodes: nodes10, edges: [] }));

    await mod.updateStatusBar();

    mod._setTestState({
      graphChangedAt: Date.now(),
      previousNodeCount: 5,
    });

    await mod.updateStatusBar();

    const sb = mod._getStatusBar();
    expect(sb.color).toBe("#22cc44");
  });
});

describe("handleAction", () => {
  const fs = require("fs");
  const path = require("path");
  const os = require("os");
  const vscode = require("vscode");

  let mod;

  beforeEach(() => {
    mod = require("../extension.js");
    mod._initForTesting();
  });

  describe("refresh", () => {
    it("resets graph state and shows info message", async () => {
      const infoSpy = vi.spyOn(vscode.window, "showInformationMessage");

      mod._setTestState({
        graphStats: { nodeCount: 5, edgeCount: 3 },
        parseErrorCount: 2,
        previousNodeCount: 5,
        previousEdgeCount: 3,
        lastTriggerSource: "file-touch",
        cachedTooltip: {},
      });

      await mod.handleAction("refresh");

      const state = mod._getTestState();
      expect(state.graphStats).toBeNull();
      expect(state.parseErrorCount).toBe(0);
      expect(state.previousNodeCount).toBeNull();
      expect(state.previousEdgeCount).toBeNull();
      expect(state.lastTriggerSource).toBe("manual-refresh");
      expect(state.cachedTooltip).toBeNull();
      expect(state.cachedTooltipHash).toBe(0);
      expect(infoSpy).toHaveBeenCalledWith("GraphifyStats refreshed.");
    });
  });

  describe("setup-activity", () => {
    it("sets setupWaiting, updates status bar, and copies command", () => {
      const writeTextSpy = vi.fn().mockResolvedValue(undefined);
      vscode.env.clipboard.writeText = writeTextSpy;

      mod.handleAction("setup-activity");

      const state = mod._getTestState();
      expect(state.setupWaiting).toBe(true);
      expect(writeTextSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("rebuild", () => {
    it("copies rebuild command to clipboard and sets rebuildRequestedAt", async () => {
      const writeTextSpy = vi.fn().mockResolvedValue(undefined);
      vscode.env.clipboard.writeText = writeTextSpy;
      const infoSpy = vi.spyOn(vscode.window, "showInformationMessage");

      await mod.handleAction("rebuild");

      expect(writeTextSpy).toHaveBeenCalledWith("graphify update .");
      expect(mod._getTestState().rebuildRequestedAt).not.toBeNull();
      expect(mod._getTestState().rebuildRequestedAt).toBeGreaterThan(0);
      expect(infoSpy).toHaveBeenCalled();
    });
  });

  describe("open-graph", () => {
    it("shows warning when graph.html not found (no workspace)", async () => {
      const warnSpy = vi.spyOn(vscode.window, "showWarningMessage");
      await mod.handleAction("open-graph");
      expect(warnSpy).toHaveBeenCalledWith("graphify-out/graph.html not found.");
    });

    it("opens webview panel when graph.html exists", async () => {
      const tmpDir = path.join(
        os.tmpdir(),
        `graphify-html-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      const graphifyOut = path.join(tmpDir, "graphify-out");
      fs.mkdirSync(graphifyOut, { recursive: true });
      fs.writeFileSync(path.join(graphifyOut, "graph.html"), "<html>graph</html>");

      vscode.workspace.workspaceFolders = [{ uri: { fsPath: tmpDir } }];

      const webviewSpy = vi.spyOn(vscode.window, "createWebviewPanel");
      await mod.handleAction("open-graph");

      expect(webviewSpy).toHaveBeenCalled();

      vscode.workspace.workspaceFolders = null;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  describe("open-report", () => {
    it("shows warning when report not found (no workspace)", async () => {
      const warnSpy = vi.spyOn(vscode.window, "showWarningMessage");
      await mod.handleAction("open-report");
      expect(warnSpy).toHaveBeenCalledWith("graphify-out/GRAPH_REPORT.md not found.");
    });
  });

  describe("open-json", () => {
    it("shows warning when json not found (no workspace)", async () => {
      const warnSpy = vi.spyOn(vscode.window, "showWarningMessage");
      await mod.handleAction("open-json");
      expect(warnSpy).toHaveBeenCalledWith(
        "graphify-out/graph.json not found. Run graphify update .",
      );
    });
  });

  describe("copy-setup", () => {
    it("copies install command to clipboard and shows info", async () => {
      const writeTextSpy = vi.fn().mockResolvedValue(undefined);
      vscode.env.clipboard.writeText = writeTextSpy;
      const infoSpy = vi.spyOn(vscode.window, "showInformationMessage");

      await mod.handleAction("copy-setup");

      expect(writeTextSpy).toHaveBeenCalledWith(
        "uv tool install graphifyy && graphify install && graphify .",
      );
      expect(infoSpy).toHaveBeenCalled();
    });
  });

  describe("learn-more", () => {
    it("opens graphifylabs.ai URL", async () => {
      const openExternalSpy = vi.fn().mockResolvedValue(true);
      vscode.env.openExternal = openExternalSpy;

      await mod.handleAction("learn-more");

      expect(openExternalSpy).toHaveBeenCalledTimes(1);
      const uri = openExternalSpy.mock.calls[0][0];
      expect(uri.toString()).toContain("graphifylabs.ai");
    });
  });
});
