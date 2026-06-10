const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  readGraphStats,
  healthLabel,
  densityLabel,
  sanitizeText,
  formatCount,
  formatDelta,
  getTimeAgo,
  getTimeAgoShort,
  getFileCreationTime,
} = require("./lib/stats");

const GRAPHIFY_OUT = "graphify-out";
const GRAPH_JSON = "graph.json";
const GRAPH_HTML = "graph.html";
const GRAPH_REPORT = "GRAPH_REPORT.md";
const GRAPHIFY_ACTIVITY = ".graphify-activity";
const DEFAULT_POLL_INTERVAL_S = 5;
const ACTIVITY_POLL_MS = 2000;
const MAX_PARSE_ERRORS = 3;
const AMBIGUOUS_WARN_THRESHOLD = 0.3;
const MAX_NULL_POLLS_BEFORE_SUSPEND = 2;
const WATCHDOG_TIMEOUT_MS = 30000;
const INACTIVITY_WARN_MS = 24 * 60 * 60 * 1000;

const HOME_CONFIG_DIR = path.join(os.homedir(), ".graphify-stats");
const CONFIGURED_FILE = "configured";

function loadLlmPrompt() {
  try {
    const promptPath = path.join(__dirname, "GraphifyLLMsetup.md");
    if (fs.existsSync(promptPath)) {
      return fs.readFileSync(promptPath, "utf-8").trim();
    }
  } catch {
    /* fall back to inline */
  }
  return [
    "Add this instruction to your LLM's rules / AGENTS.md / system prompt:",
    "",
    "From now on, after every graphify command you run (query, explain, path, update), also execute:",
    "  touch graphify-out/.graphify-activity",
    "",
    "This signals the GraphifyStats VS Code extension that you're actively using the knowledge graph.",
  ].join("\n");
}

const LLM_PROMPT_TEMPLATE = loadLlmPrompt();

/** @type {vscode.StatusBarItem} */
let statusBar;

/** @type {vscode.OutputChannel} */
let outputChannel;

/**
 * @typedef {object} ExtensionState
 * @property {boolean} configured
 * @property {boolean} setupWaiting
 * @property {boolean} activityActive
 * @property {number|null} activityTimeout
 * @property {number} lastActivityMtime
 * @property {import('./lib/stats').GraphStats|null} graphStats
 * @property {number|null} previousNodeCount
 * @property {number|null} previousEdgeCount
 * @property {number|null} lastTriggerTime
 * @property {boolean} setupNotificationShown
 * @property {number} parseErrorCount
 * @property {number} totalParseErrors
 * @property {object|null} graphSummary
 * @property {number} sessionStart
 * @property {number|null} lastGraphMtime
 * @property {vscode.ExtensionContext|null} context
 * @property {string|null} cachedWorkspacePath
 * @property {number} nullPollCount
 * @property {boolean} pollingSuspended
 * @property {string} lastTriggerSource
 * @property {number|null} rebuildRequestedAt
 * @property {number|null} graphChangedAt
 * @property {number} lastPollCompletion
 * @property {string|null} cachedTooltip
 * @property {number} cachedTooltipHash
 * @property {boolean} deactivated
 */

/** @type {ExtensionState} */
let state;

let timers;
let fsWatcher;

function initState() {
  return {
    configured: false,
    setupWaiting: false,
    activityActive: false,
    activityTimeout: null,
    lastActivityMtime: 0,
    graphStats: null,
    previousNodeCount: null,
    previousEdgeCount: null,
    lastTriggerTime: null,
    setupNotificationShown: false,
    parseErrorCount: 0,
    totalParseErrors: 0,
    graphSummary: null,
    sessionStart: Date.now(),
    lastGraphMtime: null,
    context: null,
    cachedWorkspacePath: null,
    nullPollCount: 0,
    pollingSuspended: false,
    lastTriggerSource: "none",
    rebuildRequestedAt: null,
    graphChangedAt: null,
    lastPollCompletion: Date.now(),
    cachedTooltip: null,
    cachedTooltipHash: 0,
    deactivated: false,
  };
}

function initTimers() {
  return { stats: null, activity: null, configured: null, watchdog: null };
}

function log(level, msg) {
  if (!outputChannel) return;
  const ts = new Date().toISOString().split("T")[1].slice(0, 8);
  outputChannel.appendLine(`[${ts}] [${level}] ${msg}`);
}

function startWatchdog() {
  if (timers.watchdog) clearTimeout(timers.watchdog);
  timers.watchdog = setTimeout(() => {
    const elapsed = Date.now() - state.lastPollCompletion;
    if (elapsed > WATCHDOG_TIMEOUT_MS) {
      log("WARN", `pollStats stalled — last completed ${Math.round(elapsed / 1000)}s ago`);
      statusBar.text = "$(warning) Graphify: Polling stalled";
    }
  }, WATCHDOG_TIMEOUT_MS);
}

function activate(context) {
  try {
    outputChannel = vscode.window.createOutputChannel("graphify-stats", { log: true });
    context.subscriptions.push(outputChannel);
    log("INFO", "activate start");

    state = initState();
    timers = initTimers();
    state.context = context;
    state.setupNotificationShown = context.globalState.get("setupNotificationShown", false);
    state.previousNodeCount = context.globalState.get("previousNodeCount", null);
    state.previousEdgeCount = context.globalState.get("previousEdgeCount", null);

    const workspaceRoot = getActiveWorkspacePath();

    statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    statusBar.command = "graphify-stats.click";
    statusBar.accessibilityInformation = {
      label: "GraphifyStats — knowledge graph monitor",
      role: "button",
    };

    if (workspaceRoot) {
      statusBar.show();
    }

    context.subscriptions.push(statusBar);

    context.subscriptions.push(
      vscode.commands.registerCommand("graphify-stats.click", async () => {
        await showQuickPick();
      }),
      vscode.commands.registerCommand("graphify-stats.indicateActivity", (args) => {
        if (triggerRateLimited()) return;
        state.lastTriggerSource = args && args.command ? `command:${args.command}` : "command";
        triggerActivity();
        updateStatusBar();
        log("INFO", `activity triggered via ${state.lastTriggerSource}`);
      }),
      vscode.commands.registerCommand("graphify-stats.getState", () => {
        return {
          configured: state.configured,
          activityActive: state.activityActive,
          nodeCount: state.graphStats ? state.graphStats.nodeCount : null,
          edgeCount: state.graphStats ? state.graphStats.edgeCount : null,
          lastTriggerTime: state.lastTriggerTime,
          lastTriggerSource: state.lastTriggerSource,
          pollingSuspended: state.pollingSuspended,
          lastPollCompletion: state.lastPollCompletion,
        };
      }),
    );

    context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        state.cachedWorkspacePath = null;
        state.nullPollCount = 0;
        state.pollingSuspended = false;
        const newRoot = getActiveWorkspacePath();
        if (newRoot) {
          statusBar.show();
          resumePollingIfNeeded();
        }
        updateStatusBar();
        log("INFO", "workspace folders changed");
      }),
    );

    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        const graphPath = getGraphPath();
        if (graphPath && doc.uri.fsPath === graphPath) {
          log("INFO", "graph.json saved in-editor, triggering poll");
          state.lastGraphMtime = null;
          pollStats();
        }
      }),
    );

    updateStatusBar();
    startPolling();

    context.subscriptions.push({
      dispose: () => {
        try {
          stopPolling();
          log("INFO", "deactivate complete");
        } catch {
          /* best-effort */
        }
      },
    });

    log("INFO", "activate complete");
  } catch (err) {
    console.error("GraphifyStats: activation failed", err);
  }
}

function deactivate() {
  try {
    stopPolling();
  } catch {
    /* best-effort */
  }
}

let lastTriggerTimestamp = 0;

function triggerRateLimited() {
  const now = Date.now();
  if (now - lastTriggerTimestamp < 1000) return true;
  lastTriggerTimestamp = now;
  return false;
}

function stopPolling() {
  state.deactivated = true;
  if (timers.stats) {
    clearTimeout(timers.stats);
    timers.stats = null;
  }
  if (timers.activity) {
    clearInterval(timers.activity);
    timers.activity = null;
  }
  if (timers.configured) {
    clearInterval(timers.configured);
    timers.configured = null;
  }
  if (timers.watchdog) {
    clearTimeout(timers.watchdog);
    timers.watchdog = null;
  }
  if (state && state.activityTimeout) {
    clearTimeout(state.activityTimeout);
    state.activityTimeout = null;
  }
  if (fsWatcher) {
    fsWatcher.close();
    fsWatcher = null;
  }
}

function resumePollingIfNeeded() {
  if (!state.pollingSuspended) return;
  const dir = getGraphifyOutPath();
  if (dir && fs.existsSync(dir)) {
    state.pollingSuspended = false;
    state.nullPollCount = 0;
    scheduleNextStatsPoll();
    log("INFO", "polling resumed");
  }
}

function startPolling() {
  const dir = getGraphifyOutPath();

  if (dir && fs.existsSync(dir)) {
    try {
      fsWatcher = fs.watch(dir, { recursive: true }, (eventType) => {
        if (eventType === "change" || eventType === "rename") {
          state.lastGraphMtime = null;
          pollStats();
        }
      });
      fsWatcher.on("error", () => {
        fsWatcher = null;
      });
      log("INFO", "fs.watch started on graphify-out/");
    } catch {
      log("WARN", "fs.watch unavailable, polling only");
    }
  }

  if (dir && fs.existsSync(dir)) {
    const activityPath = path.join(dir, GRAPHIFY_ACTIVITY);
    if (fs.existsSync(activityPath)) {
      try {
        const activityStat = fs.statSync(activityPath);
        state.lastActivityMtime = activityStat.mtimeMs;
        state.lastTriggerTime = activityStat.mtimeMs;
      } catch {
        /* skip */
      }
    }
  }

  pollConfigured();
  scheduleNextStatsPoll();

  timers.activity = setInterval(() => pollActivity(), ACTIVITY_POLL_MS);
  timers.configured = setInterval(() => pollConfigured(), getPollInterval() * 1000);

  log("INFO", "polling started");
}

function scheduleNextStatsPoll() {
  if (state.deactivated) return;

  if (state.pollingSuspended) {
    timers.stats = setTimeout(async () => {
      const graphPath = getGraphPath();
      if (graphPath && fs.existsSync(graphPath)) {
        state.pollingSuspended = false;
        state.nullPollCount = 0;
        log("INFO", "polling resumed — graphify-out/ detected after suspension");
        await pollStats();
        state.lastPollCompletion = Date.now();
        if (!state.pollingSuspended) {
          scheduleNextStatsPoll();
          startWatchdog();
        }
      } else {
        scheduleNextStatsPoll();
      }
    }, 10000);
    return;
  }

  const intervalS = getPollInterval();
  timers.stats = setTimeout(async () => {
    await pollStats();
    state.lastPollCompletion = Date.now();
    if (!state.pollingSuspended) {
      scheduleNextStatsPoll();
      startWatchdog();
    }
  }, intervalS * 1000);
}

function getPollInterval() {
  const config = vscode.workspace.getConfiguration("graphify-stats");
  return config.get("pollInterval", DEFAULT_POLL_INTERVAL_S);
}

function getActivityDurationMs() {
  const config = vscode.workspace.getConfiguration("graphify-stats");
  return config.get("activityIndicator.durationSeconds", 30) * 1000;
}

function isActivityEnabled() {
  const config = vscode.workspace.getConfiguration("graphify-stats");
  return config.get("activityIndicator.enabled", true);
}

function triggerActivity() {
  if (!isActivityEnabled()) return;

  state.activityActive = true;
  state.lastTriggerTime = Date.now();
  if (state.activityTimeout) clearTimeout(state.activityTimeout);
  state.activityTimeout = setTimeout(() => {
    state.activityActive = false;
    updateStatusBar();
  }, getActivityDurationMs());
}

function pollConfigured() {
  if (!state) return;

  try {
    const configuredPath = getConfiguredPath();
    const exists = fs.existsSync(configuredPath);
    if (exists && !state.configured) {
      state.configured = true;
      state.setupWaiting = false;
      updateStatusBar();
      log("INFO", "configured marker detected");

      let fresh = true;
      try {
        const st = fs.statSync(configuredPath);
        const created = getFileCreationTime(st, process.platform);
        fresh = created > state.sessionStart - 60000;
      } catch {
        /* accept anyway */
      }
      if (fresh) {
        vscode.window.showInformationMessage(
          "GraphifyStats: Activity monitoring configured. Status bar glows green when your LLM runs Graphify.",
        );
      }
    } else if (!exists && state.configured) {
      state.configured = false;
      updateStatusBar();
      log("INFO", "configured marker removed");
    }
  } catch {
    /* skip */
  }
}

function pollActivity() {
  if (!state || !state.configured) return;

  const outDir = getGraphifyOutPath();
  if (!outDir) return;

  const activityPath = path.join(outDir, GRAPHIFY_ACTIVITY);

  if (fs.existsSync(activityPath)) {
    try {
      const stat = fs.statSync(activityPath);

      if (process.platform === "win32" || stat.uid === process.getuid()) {
        if (state.lastActivityMtime !== 0 && stat.mtimeMs !== state.lastActivityMtime) {
          state.lastTriggerSource = "file-touch";
          triggerActivity();
          state.lastActivityMtime = stat.mtimeMs;
          log("INFO", `activity file touched, mtime ${stat.mtimeMs}`);
        } else if (state.lastActivityMtime === 0) {
          state.lastActivityMtime = stat.mtimeMs;
          state.lastTriggerTime = stat.mtimeMs;
        }
      }
    } catch {
      /* skip */
    }
  } else {
    state.lastActivityMtime = 0;
    state.lastTriggerTime = null;
  }
}

async function pollStats() {
  const graphPath = getGraphPath();
  if (!graphPath || !fs.existsSync(graphPath)) {
    state.nullPollCount++;
    if (state.nullPollCount >= MAX_NULL_POLLS_BEFORE_SUSPEND) {
      state.pollingSuspended = true;
      state.nullPollCount = 0;
      log("WARN", "polling suspended — no graphify-out/ found");
    }

    if (state.graphStats !== null) {
      state.graphStats = null;
      state.previousNodeCount = null;
      state.previousEdgeCount = null;
      state.lastGraphMtime = null;
      state.parseErrorCount = 0;
      try {
        updateStatusBar();
      } catch {
        /* ignore */
      }
    }
    return;
  }

  state.nullPollCount = 0;
  state.pollingSuspended = false;

  if (!state.configured) {
    pollConfigured();
  }

  try {
    const cached = state.lastGraphMtime
      ? { data: state.graphStats, summary: false, mtime: state.lastGraphMtime }
      : { data: null, summary: false, mtime: undefined };

    const result = await readGraphStats(graphPath, cached);

    if (result.unchanged) {
      return;
    }

    const previousMtime = state.lastGraphMtime;
    state.lastGraphMtime = result.mtime || null;

    if (result.summary) {
      state.graphSummary = result.data;
      state.parseErrorCount = 0;
    } else if (result.data) {
      const stats = result.data;

      if (state.graphStats && state.graphStats.nodeCount !== undefined) {
        const nodeDiff = stats.nodeCount - state.graphStats.nodeCount;
        const pctChange =
          state.graphStats.nodeCount > 0 ? Math.abs(nodeDiff) / state.graphStats.nodeCount : 0;

        state.previousNodeCount = state.graphStats.nodeCount;
        state.previousEdgeCount = state.graphStats.edgeCount;
        if (state.context) {
          state.context.globalState.update("previousNodeCount", state.graphStats.nodeCount);
          state.context.globalState.update("previousEdgeCount", state.graphStats.edgeCount);
        }

        if (pctChange > 0.1 && Math.abs(nodeDiff) >= 5) {
          state.graphChangedAt = Date.now();
        }
      }

      state.graphStats = stats;
      state.graphSummary = null;
      state.parseErrorCount = 0;

      if (state.rebuildRequestedAt && previousMtime !== state.lastGraphMtime) {
        state.rebuildRequestedAt = null;
        state.graphChangedAt = Date.now();
      }

      log(
        "INFO",
        `stats updated: ${stats.nodeCount}N ${stats.edgeCount}E, health=${healthLabel(stats.ambiguousRatio, stats.edgeCount)}`,
      );
    } else {
      state.parseErrorCount++;
      state.totalParseErrors++;
      log("WARN", `parse failed (attempt ${state.parseErrorCount})`);
      if (state.parseErrorCount >= MAX_PARSE_ERRORS) {
        if (state.totalParseErrors <= MAX_PARSE_ERRORS) {
          vscode.window.showWarningMessage(
            `GraphifyStats: Failed to parse graph.json ${MAX_PARSE_ERRORS} times. The file may be malformed.`,
          );
        }
        state.parseErrorCount = 0;
      }
      return;
    }

    state.cachedTooltip = null;
    state.cachedTooltipHash = 0;
    updateStatusBar();
    maybeShowSetupPrompt();
  } catch {
    state.parseErrorCount++;
    state.totalParseErrors++;
    log("ERROR", "pollStats exception");
  }
}

function maybeShowSetupPrompt() {
  if (state.configured || state.setupNotificationShown) return;

  state.setupNotificationShown = true;
  if (state.context) {
    state.context.globalState.update("setupNotificationShown", true).then(
      () => {},
      () => {},
    );
  }
  vscode.window
    .showInformationMessage(
      "GraphifyStats: Graph detected. Configure activity monitoring so your LLM can signal Graphify usage.",
      "Copy Setup Command",
    )
    .then((selection) => {
      if (selection === "Copy Setup Command") {
        state.setupWaiting = true;
        updateStatusBar();
        copySetupCommand();
      }
    });
}

function getActiveWorkspacePath() {
  if (state && state.cachedWorkspacePath) return state.cachedWorkspacePath;

  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    if (folder) {
      state.cachedWorkspacePath = folder.uri.fsPath;
      return state.cachedWorkspacePath;
    }
  }
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    state.cachedWorkspacePath = folders[0].uri.fsPath;
    return state.cachedWorkspacePath;
  }
  return null;
}

function getGraphPath() {
  const base = getActiveWorkspacePath();
  if (!base) return null;
  return path.join(base, GRAPHIFY_OUT, GRAPH_JSON);
}

function getGraphHtmlPath() {
  const base = getActiveWorkspacePath();
  if (!base) return null;
  return path.join(base, GRAPHIFY_OUT, GRAPH_HTML);
}

function getGraphReportPath() {
  const base = getActiveWorkspacePath();
  if (!base) return null;
  return path.join(base, GRAPHIFY_OUT, GRAPH_REPORT);
}

function getGraphifyOutPath() {
  const base = getActiveWorkspacePath();
  if (!base) return null;
  return path.join(base, GRAPHIFY_OUT);
}

let _testConfiguredPath = null;

function getConfiguredPath() {
  if (_testConfiguredPath) return _testConfiguredPath;
  return path.join(HOME_CONFIG_DIR, CONFIGURED_FILE);
}

function tooltipStateHash() {
  const s = state.graphStats;
  if (!s) return 0;
  return (
    s.nodeCount * 31 +
    s.edgeCount * 37 +
    (state.configured ? 41 : 0) +
    (state.activityActive ? 43 : 0) +
    (state.setupWaiting ? 47 : 0) +
    (state.lastTriggerTime ? Math.floor(state.lastTriggerTime / 10000) : 0)
  );
}

async function updateStatusBar() {
  try {
    const workspaceRoot = getActiveWorkspacePath();

    if (!workspaceRoot) {
      statusBar.hide();
      return;
    }

    statusBar.show();

    const graphPath = getGraphPath();
    const outDir = getGraphifyOutPath();
    const outDirExists = outDir && fs.existsSync(outDir);

    if (!outDirExists) {
      const expectedPath = workspaceRoot
        ? path.join(workspaceRoot, GRAPHIFY_OUT, GRAPH_JSON)
        : "graphify-out/graph.json";
      statusBar.text = "$(graph) Graphify: Not set up";
      statusBar.tooltip = new vscode.MarkdownString(
        [
          `Expected: \`${expectedPath}\``,
          "",
          "GraphifyStats monitors your knowledge graph in the VS Code status bar.",
          "",
          "Install Graphify: `uv tool install graphifyy && graphify install && graphify .`",
          "",
          "Click for options.",
        ].join("\n"),
        true,
      );
      statusBar.color = undefined;
      state.graphStats = null;
      state.graphSummary = null;
      state.lastGraphMtime = null;
      return;
    }

    if (!fs.existsSync(graphPath)) {
      statusBar.text = "$(graph) Graphify: Run graphify update";
      statusBar.tooltip = new vscode.MarkdownString(
        [
          `Expected: \`${graphPath}\``,
          "",
          "The `graphify-out/` directory exists but `graph.json` is missing.",
          "Run `graphify update .` or ask your LLM to rebuild the graph.\n\nClick for options.",
        ].join("\n"),
        true,
      );
      statusBar.color = undefined;
      state.graphStats = null;
      state.graphSummary = null;
      state.lastGraphMtime = null;
      return;
    }

    if (!state.graphStats && !state.graphSummary) {
      await loadInitialStats(graphPath);
    }

    if (state.graphSummary) {
      renderSummaryStatus();
      return;
    }

    const stats = state.graphStats;
    if (!stats) return;

    if (stats.nodeCount === 0 && stats.edgeCount === 0) {
      statusBar.text = "$(info) Graphify: Empty graph";
      statusBar.tooltip = new vscode.MarkdownString(
        [
          "Empty graph — no nodes or edges extracted yet.",
          "",
          "Run `graphify .` in your terminal or ask your LLM to build the graph.\n\nClick for options.",
        ].join("\n"),
        true,
      );
      statusBar.color = undefined;
      return;
    }

    renderStatsStatus(stats);
  } catch (e) {
    log("ERROR", `updateStatusBar failed: ${e && e.message ? e.message : e}`);
  }
}

async function loadInitialStats(graphPath) {
  try {
    const result = await readGraphStats(graphPath, {
      data: null,
      summary: false,
      mtime: undefined,
    });
    if (result.summary) {
      state.graphSummary = result.data;
      state.lastGraphMtime = null;
    } else if (result.data) {
      state.graphStats = result.data;
      state.lastGraphMtime = result.mtime || null;
    } else {
      state.parseErrorCount++;
      statusBar.text = "$(error) Graphify: Parse error";
      statusBar.tooltip =
        "Failed to parse graph.json. The file may be malformed, incomplete, or a JSON parse error occurred.\n\nClick for options";
      statusBar.color = undefined;
    }
  } catch (err) {
    statusBar.text = "$(error) Graphify: Parse error";
    statusBar.tooltip = `Failed to read or parse graph.json: ${err && err.message ? err.message : "unknown error"}\n\nClick for options`;
    statusBar.color = undefined;
  }
}

function renderSummaryStatus() {
  const sizeMB = (state.graphSummary.size / 1048576).toFixed(1);
  statusBar.text = `$(graph) Graphify: Large graph (${sizeMB} MB)`;
  statusBar.tooltip = [
    "GraphifyStats — graph too large to parse inline",
    `File size: ${sizeMB} MB`,
    "",
    "Click for options",
  ].join("\n");
  statusBar.color = undefined;
}

function renderStatsStatus(stats) {
  const safeRefreshed = stats.lastRefreshed || new Date();
  const timeAgoShort = getTimeAgoShort(safeRefreshed);

  const graphChangedRecently =
    state.graphChangedAt !== null && Date.now() - state.graphChangedAt < getActivityDurationMs();
  const nodeDelta = graphChangedRecently
    ? formatDelta(stats.nodeCount, state.previousNodeCount)
    : "";
  const edgeDelta = graphChangedRecently
    ? formatDelta(stats.edgeCount, state.previousEdgeCount)
    : "";

  const hLabel = healthLabel(stats.ambiguousRatio, stats.edgeCount);
  const dLabel = densityLabel(stats.density);

  let triggerSuffix = "";
  if (state.configured && state.lastTriggerTime) {
    const triggerAge = getTimeAgoShort(new Date(state.lastTriggerTime));
    triggerSuffix = ` · ${triggerAge}`;
  }

  const icon = "$(graph)";

  statusBar.text =
    `${icon} Graphify: ${formatCount(stats.nodeCount)} N${nodeDelta} · ` +
    `${formatCount(stats.edgeCount)} E${edgeDelta} · ${timeAgoShort}${triggerSuffix}`;
  let a11yLabel = `GraphifyStats: ${stats.nodeCount} nodes, ${stats.edgeCount} edges, last refreshed ${timeAgoShort}${triggerSuffix}${
    state.activityActive ? ", LLM activity detected" : ""
  }`;
  if (a11yLabel.length > 200) {
    a11yLabel = a11yLabel.slice(0, 200) + "...";
  }
  statusBar.accessibilityInformation = {
    label: a11yLabel,
    role: "button",
  };

  if (isActivityEnabled()) {
    if (graphChangedRecently) {
      statusBar.color = "#22cc44";
    } else if (state.activityActive && state.configured) {
      statusBar.color = "#22cc44";
    }
  }
  if (!statusBar.color) {
    if (stats.ambiguousRatio > AMBIGUOUS_WARN_THRESHOLD && stats.edgeCount > 0) {
      statusBar.color = new vscode.ThemeColor("statusBarItem.warningForeground");
    } else {
      const hoursStale = (Date.now() - safeRefreshed.getTime()) / 3600000;
      if (hoursStale > 6) {
        statusBar.color = new vscode.ThemeColor("statusBarItem.errorForeground");
      } else if (hoursStale > 1) {
        statusBar.color = new vscode.ThemeColor("statusBarItem.warningForeground");
      } else {
        statusBar.color = undefined;
      }
    }
  }

  const hash = tooltipStateHash();
  if (state.cachedTooltip !== null && state.cachedTooltipHash === hash) {
    statusBar.tooltip = state.cachedTooltip;
    return;
  }

  const md = buildTooltip(stats, hLabel, dLabel);
  state.cachedTooltip = md;
  state.cachedTooltipHash = hash;
  statusBar.tooltip = md;
}

function buildTooltip(stats, hLabel, dLabel) {
  const tooltipMd = new vscode.MarkdownString("", true);
  tooltipMd.isTrusted = true;

  const lines = [];

  const nodeDelta = formatDelta(stats.nodeCount, state.previousNodeCount);
  const edgeDelta = formatDelta(stats.edgeCount, state.previousEdgeCount);

  lines.push(
    `${stats.nodeCount.toLocaleString("en-US")} nodes${nodeDelta}  ·  ${stats.edgeCount.toLocaleString("en-US")} edges${edgeDelta}  ·  ` +
      `${stats.communityCount} communities  ·  ${stats.fileCount} files`,
  );

  const confidence =
    `E ${stats.confidenceCounts.EXTRACTED.toLocaleString("en-US")}  ` +
    `I ${stats.confidenceCounts.INFERRED.toLocaleString("en-US")}  ` +
    `A ${stats.confidenceCounts.AMBIGUOUS.toLocaleString("en-US")}` +
    (stats.confidenceCounts.OTHER > 0
      ? `  O ${stats.confidenceCounts.OTHER.toLocaleString("en-US")}`
      : "");

  lines.push(
    `Density ${(stats.density || 0).toFixed(2)} (${dLabel})  ·  Health ${hLabel} (${(stats.ambiguousRatio * 100).toFixed(0)}% ambiguous)`,
  );
  lines.push(confidence);

  if (stats.ambiguousRatio > 0.3 && stats.edgeCount > 0) {
    lines.push("Run `graphify update .` to re-extract flagged edges.");
  }

  if (stats.godNodes.length > 0) {
    lines.push("");
    lines.push("Top god nodes");
    for (const gn of stats.godNodes) {
      const displayName = gn.sourceFile
        ? `${sanitizeText(gn.sourceFile)}:${sanitizeText(gn.label)}`
        : sanitizeText(gn.label);
      lines.push(`  ${displayName} — ${gn.degree}`);
    }
  }

  lines.push("");

  const timeAgo = getTimeAgo(stats.lastRefreshed || new Date());
  lines.push(`Refreshed ${timeAgo}`);

  if (state.configured && state.lastTriggerTime) {
    const triggerAgo = getTimeAgo(new Date(state.lastTriggerTime));
    lines.push(`Last activity ${triggerAgo} (${state.lastTriggerSource || "unknown"})`);

    const msSinceTrigger = Date.now() - state.lastTriggerTime;
    if (msSinceTrigger > INACTIVITY_WARN_MS) {
      const daysSince = Math.floor(msSinceTrigger / 86400000);
      lines.push(`\u26a0 No activity in ${daysSince}d \u2014 verify LLM setup.`);
    }
  }

  if (!state.configured) {
    lines.push("", "Activity monitoring not configured \u2014 click to set up");
  } else if (state.setupWaiting) {
    lines.push("", "Waiting for LLM to complete setup\u2026");
  }

  if (state.activityActive && state.configured) {
    lines.push("", 'Ask your LLM: "What did you just do with Graphify?"');
  }

  lines.push("", "Click for options");
  tooltipMd.appendMarkdown(lines.join("\n"));
  return tooltipMd;
}

function copySetupCommand() {
  vscode.env.clipboard.writeText(LLM_PROMPT_TEMPLATE).then(
    () => {
      vscode.window.showInformationMessage(
        "Prompt copied! Paste it to your AI agent to finish setting up Graphify.",
      );
    },
    () => {
      vscode.window.showErrorMessage("Failed to copy to clipboard.", {
        modal: true,
      });
    },
  );
}

async function showQuickPick() {
  const items = [];

  if (state.graphStats) {
    const stats = state.graphStats;
    const hLabel = healthLabel(stats.ambiguousRatio, stats.edgeCount);

    if (!state.configured) {
      items.push({
        label: "Setup Activity Monitoring",
        description: "Copy setup commands and LLM prompt to clipboard",
        iconPath: new vscode.ThemeIcon("plug", new vscode.ThemeColor("editorWarning.foreground")),
        alwaysShow: true,
        action: "setup-activity",
      });
      items.push({ label: "", kind: vscode.QuickPickItemKind.Separator });
    } else if (state.lastTriggerTime) {
      const triggerAgo = getTimeAgo(new Date(state.lastTriggerTime));
      items.push({
        label: `$(pulse) Last activity ${triggerAgo}`,
        description: state.lastTriggerSource
          ? `via ${state.lastTriggerSource}`
          : "LLM activity detected",
        alwaysShow: true,
      });
      items.push({ label: "", kind: vscode.QuickPickItemKind.Separator });
    } else {
      items.push({
        label: "$(plug) Activity monitoring configured",
        description: "Status bar shows trigger times after first LLM activity",
        alwaysShow: true,
      });
      items.push({ label: "", kind: vscode.QuickPickItemKind.Separator });
    }

    items.push({
      label: "$(graph) Graph Stats",
      description: `${formatCount(stats.nodeCount)} N · ${formatCount(stats.edgeCount)} E`,
      detail: `${stats.communityCount} communities · ${stats.fileCount} files · ${hLabel} health · refreshed ${getTimeAgo(stats.lastRefreshed || new Date())}`,
      alwaysShow: true,
    });
    items.push({ label: "", kind: vscode.QuickPickItemKind.Separator });

    items.push(
      { label: "Actions", kind: vscode.QuickPickItemKind.Separator },
      {
        label: "$(sync) Refresh Stats",
        description: "Re-read graph.json and update stats",
        alwaysShow: true,
        action: "refresh",
      },
      {
        label: "$(repo-sync) Rebuild Graph",
        description: "Copies 'graphify update .' to clipboard — paste to your LLM",
        alwaysShow: true,
        action: "rebuild",
      },
      { label: "", kind: vscode.QuickPickItemKind.Separator },
      { label: "Open", kind: vscode.QuickPickItemKind.Separator },
      {
        label: "$(eye) Graph Visualization",
        description: "Open graph.html",
        alwaysShow: true,
        action: "open-graph",
      },
      {
        label: "$(file-text) Graph Report",
        description: "Open GRAPH_REPORT.md",
        alwaysShow: true,
        action: "open-report",
      },
      {
        label: "$(json) graph.json",
        description: "Open raw graph data",
        alwaysShow: true,
        action: "open-json",
      },
      { label: "", kind: vscode.QuickPickItemKind.Separator },
      {
        label: isActivityEnabled()
          ? "$(eye) Green indicators: On"
          : "$(eye-closed) Green indicators: Off",
        description: "Toggle green glow for activity and graph updates",
        alwaysShow: true,
        action: "toggle-green",
      },
      {
        label: "$(plug) Run Setup Again",
        description: "Re-copy setup commands and LLM prompt to clipboard",
        alwaysShow: true,
        action: "setup-activity",
      },
    );
  } else {
    items.push(
      {
        label: "$(sparkle) One Prompt: Install & Setup Graphify",
        description: "Copy the full LLM prompt — paste to your AI agent to set up everything",
        alwaysShow: true,
        action: "setup-activity",
      },
      { label: "", kind: vscode.QuickPickItemKind.Separator },
      {
        label: "$(globe) Learn More",
        description: "Open graphifylabs.ai",
        alwaysShow: true,
        action: "learn-more",
      },
      {
        label: "$(sync) Refresh",
        description: "Re-check for graph.json",
        alwaysShow: true,
        action: "refresh",
      },
    );
  }

  const quickPick = vscode.window.createQuickPick();
  quickPick.title = "GraphifyStats";
  quickPick.placeholder = "Select an action";
  quickPick.matchOnDescription = false;
  quickPick.matchOnDetail = false;
  quickPick.items = items;

  const done = new Promise((resolve) => {
    quickPick.onDidAccept(() => {
      const [selected] = quickPick.selectedItems;
      if (selected && selected.action) {
        quickPick.hide();
        handleAction(selected.action);
      }
      resolve();
    });
    quickPick.onDidHide(() => resolve());
  });

  quickPick.show();
  return done;
}

async function handleAction(action) {
  switch (action) {
    case "refresh":
      state.graphStats = null;
      state.graphSummary = null;
      state.parseErrorCount = 0;
      state.previousNodeCount = null;
      state.previousEdgeCount = null;
      state.lastGraphMtime = null;
      state.lastTriggerSource = "manual-refresh";
      state.cachedTooltip = null;
      state.cachedTooltipHash = 0;
      await pollStats();
      vscode.window.showInformationMessage("GraphifyStats refreshed.");
      break;
    case "setup-activity":
      state.setupWaiting = true;
      copySetupCommand();
      break;
    case "rebuild":
      await vscode.env.clipboard.writeText("graphify update .");
      state.rebuildRequestedAt = Date.now();
      vscode.window.showInformationMessage(
        "'graphify update .' copied! Paste to your LLM to rebuild. You'll get a confirmation when the rebuild completes.",
      );
      break;
    case "toggle-green": {
      const config = vscode.workspace.getConfiguration("graphify-stats");
      const current = config.get("activityIndicator.enabled", true);
      await config.update("activityIndicator.enabled", !current, true);
      updateStatusBar();
      vscode.window.showInformationMessage(
        `Green indicators ${!current ? "enabled" : "muted"}. Status bar colors are now ${!current ? "on" : "off"}.`,
      );
      break;
    }
    case "copy-setup":
      await vscode.env.clipboard.writeText(
        "uv tool install graphifyy && graphify install && graphify .",
      );
      vscode.window.showInformationMessage(
        "Install command copied! Paste it into your terminal or AI assistant.",
      );
      break;
    case "learn-more":
      await vscode.env.openExternal(vscode.Uri.parse("https://graphifylabs.ai"));
      break;
    case "open-graph": {
      const htmlPath = getGraphHtmlPath();
      if (htmlPath && fs.existsSync(htmlPath)) {
        const panel = vscode.window.createWebviewPanel(
          "graphify-stats.graphView",
          "Graphify — Graph Visualization",
          vscode.ViewColumn.One,
          {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [],
          },
        );
        panel.webview.options = {
          enableScripts: true,
          localResourceRoots: [],
        };
        const htmlContent = fs.readFileSync(htmlPath, "utf-8");
        panel.webview.html = htmlContent;
      } else {
        vscode.window.showWarningMessage("graphify-out/graph.html not found.");
      }
      break;
    }
    case "open-report": {
      const reportPath = getGraphReportPath();
      if (reportPath && fs.existsSync(reportPath)) {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(reportPath));
        await vscode.window.showTextDocument(doc);
      } else {
        vscode.window.showWarningMessage("graphify-out/GRAPH_REPORT.md not found.");
      }
      break;
    }
    case "open-json": {
      const jsonPath = getGraphPath();
      if (jsonPath && fs.existsSync(jsonPath)) {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(jsonPath));
        await vscode.window.showTextDocument(doc);
      } else {
        vscode.window.showWarningMessage(
          "graphify-out/graph.json not found. Run graphify update .",
        );
      }
      break;
    }
    default:
      console.warn(`GraphifyStats: unhandled action "${action}"`);
  }
}

function _initForTesting() {
  outputChannel = vscode.window.createOutputChannel("graphify-stats", { log: true });
  state = initState();
  timers = initTimers();
  lastTriggerTimestamp = 0;
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = "graphify-stats.click";
  statusBar.text = "";
  statusBar.tooltip = null;
  statusBar.color = undefined;
}

function _getTestState() {
  if (!state) return null;
  return {
    configured: state.configured,
    setupWaiting: state.setupWaiting,
    activityActive: state.activityActive,
    rebuildRequestedAt: state.rebuildRequestedAt,
    graphChangedAt: state.graphChangedAt,
    graphStats: state.graphStats,
    previousNodeCount: state.previousNodeCount,
    previousEdgeCount: state.previousEdgeCount,
    lastTriggerTime: state.lastTriggerTime,
    lastTriggerSource: state.lastTriggerSource,
    lastActivityMtime: state.lastActivityMtime,
    pollingSuspended: state.pollingSuspended,
    nullPollCount: state.nullPollCount,
    parseErrorCount: state.parseErrorCount,
    cachedTooltip: state.cachedTooltip,
    cachedTooltipHash: state.cachedTooltipHash,
  };
}

function _setTestState(partial) {
  if (state) Object.assign(state, partial);
}

function _getStatusBar() {
  return statusBar;
}

function _setTestConfiguredPath(p) {
  _testConfiguredPath = p;
}

module.exports = {
  activate,
  deactivate,
  getGraphPath,
  getGraphifyOutPath,
  triggerActivity,
  pollActivity,
  pollConfigured,
  updateStatusBar,
  showQuickPick,
  copySetupCommand,
  LLM_PROMPT_TEMPLATE,
  handleAction,
  _initForTesting,
  _getTestState,
  _setTestState,
  _getStatusBar,
  _setTestConfiguredPath,
};
