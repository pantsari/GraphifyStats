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

const HOME_CONFIG_DIR = path.join(os.homedir(), ".graphify-stats");
const CONFIGURED_FILE = "configured";

const LLM_PROMPT_TEMPLATE = `Add this instruction to your LLM's rules / AGENTS.md / system prompt:

From now on, after every graphify command you run (query, explain, path, update), also execute:
  touch graphify-out/.graphify-activity

This signals the GraphifyStats VS Code extension that you're actively using the knowledge graph.`;

/** @type {vscode.StatusBarItem} */
let statusBar;

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
 */

/** @type {ExtensionState} */
let state;

let timers;

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
  };
}

function initTimers() {
  return { stats: null, activity: null, configured: null };
}

function activate(context) {
  try {
    state = initState();
    timers = initTimers();
    state.context = context;
    state.setupNotificationShown = context.globalState.get("setupNotificationShown", false);
    state.previousNodeCount = context.globalState.get("previousNodeCount", null);
    state.previousEdgeCount = context.globalState.get("previousEdgeCount", null);

    const workspaceRoot = getActiveWorkspacePath();

    statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
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
      }),
    );

    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        const graphPath = getGraphPath();
        if (graphPath && doc.uri.fsPath === graphPath) {
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
        } catch {
          /* best-effort */
        }
      },
    });
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
  if (state && state.activityTimeout) {
    clearTimeout(state.activityTimeout);
    state.activityTimeout = null;
  }
}

function resumePollingIfNeeded() {
  if (!state.pollingSuspended) return;
  const dir = getGraphifyOutPath();
  if (dir && fs.existsSync(dir)) {
    state.pollingSuspended = false;
    state.nullPollCount = 0;
    scheduleNextStatsPoll();
  }
}

function startPolling() {
  const dir = getGraphifyOutPath();
  if (dir && fs.existsSync(dir)) {
    const activityPath = path.join(dir, GRAPHIFY_ACTIVITY);
    if (fs.existsSync(activityPath)) {
      try {
        state.lastActivityMtime = fs.statSync(activityPath).mtimeMs;
      } catch {
        /* skip */
      }
    }
  }

  pollConfigured();
  scheduleNextStatsPoll();

  timers.activity = setInterval(() => pollActivity(), ACTIVITY_POLL_MS);
  timers.configured = setInterval(() => pollConfigured(), getPollInterval() * 1000);
}

function scheduleNextStatsPoll() {
  if (state.pollingSuspended) return;
  const intervalS = getPollInterval();
  timers.stats = setTimeout(async () => {
    await pollStats();
    if (!state.pollingSuspended) {
      scheduleNextStatsPoll();
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
      let fresh = true;
      try {
        const st = fs.statSync(configuredPath);
        const created = getFileCreationTime(st, process.platform);
        fresh = created > state.sessionStart - 60000;
      } catch {
        /* accept anyway */
      }
      if (fresh) {
        state.configured = true;
        state.setupWaiting = false;
        vscode.window.showInformationMessage(
          "GraphifyStats: Activity monitoring configured. Status bar glows green when your LLM runs Graphify.",
        );
        updateStatusBar();
      }
    } else if (!exists && state.configured) {
      state.configured = false;
      updateStatusBar();
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
  if (!fs.existsSync(activityPath)) {
    state.lastActivityMtime = 0;
    return;
  }

  try {
    const stat = fs.statSync(activityPath);

    if (process.platform !== "win32" && stat.uid !== process.getuid()) return;

    if (state.lastActivityMtime === 0) {
      state.lastActivityMtime = stat.mtimeMs;
      return;
    }

    if (stat.mtimeMs !== state.lastActivityMtime) {
      state.lastTriggerSource = "file-touch";
      triggerActivity();
      updateStatusBar();
      state.lastActivityMtime = stat.mtimeMs;
    }
  } catch {
    /* skip */
  }
}

async function pollStats() {
  const graphPath = getGraphPath();
  if (!graphPath || !fs.existsSync(graphPath)) {
    state.nullPollCount++;
    if (state.nullPollCount >= MAX_NULL_POLLS_BEFORE_SUSPEND) {
      state.pollingSuspended = true;
      state.nullPollCount = 0;
    }

    if (state.graphStats !== null) {
      state.graphStats = null;
      state.previousNodeCount = null;
      state.previousEdgeCount = null;
      state.parseErrorCount = 0;
      updateStatusBar();
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

    if (result.unchanged) return;

    state.lastGraphMtime = result.mtime || null;

    if (result.summary) {
      state.graphSummary = result.data;
      state.parseErrorCount = 0;
    } else if (result.data) {
      if (state.graphStats && state.graphStats.nodeCount !== undefined) {
        state.previousNodeCount = state.graphStats.nodeCount;
        state.previousEdgeCount = state.graphStats.edgeCount;
        if (state.context) {
          state.context.globalState.update("previousNodeCount", state.graphStats.nodeCount);
          state.context.globalState.update("previousEdgeCount", state.graphStats.edgeCount);
        }
      }
      state.graphStats = result.data;
      state.graphSummary = null;
      state.parseErrorCount = 0;
    } else {
      state.parseErrorCount++;
      state.totalParseErrors++;
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

    updateStatusBar();
    maybeShowSetupPrompt();
  } catch {
    state.parseErrorCount++;
    state.totalParseErrors++;
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

function getConfiguredPath() {
  return path.join(HOME_CONFIG_DIR, CONFIGURED_FILE);
}

function updateStatusBar() {
  const workspaceRoot = getActiveWorkspacePath();

  if (!workspaceRoot) {
    statusBar.hide();
    return;
  }

  statusBar.show();

  const graphPath = getGraphPath();

  if (!graphPath || !fs.existsSync(graphPath)) {
    const expectedPath = workspaceRoot
      ? path.join(workspaceRoot, GRAPHIFY_OUT, GRAPH_JSON)
      : "graphify-out/graph.json";
    statusBar.text = "$(graph) Graphify: Not found";
    statusBar.tooltip = [
      `Expected: ${expectedPath}`,
      "",
      "Graphify builds a knowledge graph your AI can search — faster answers, fewer mistakes.",
      "",
      "Click for one-click setup.",
    ].join("\n");
    statusBar.color = undefined;
    state.graphStats = null;
    state.graphSummary = null;
    state.lastGraphMtime = null;
    return;
  }

  if (!state.graphStats && !state.graphSummary) {
    loadInitialStats(graphPath);
  }

  if (state.graphSummary) {
    renderSummaryStatus();
    return;
  }

  const stats = state.graphStats;
  if (!stats) return;

  renderStatsStatus(stats);
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
        "Failed to parse graph.json. The file may be malformed or incomplete.\n\nClick for options";
      statusBar.color = undefined;
    }
  } catch {
    statusBar.text = "$(error) Graphify: Parse error";
    statusBar.tooltip = "Failed to parse graph.json.\n\nClick for options";
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
  const timeAgoShort = getTimeAgoShort(stats.lastRefreshed);
  const nodeDelta = formatDelta(stats.nodeCount, state.previousNodeCount);
  const edgeDelta = formatDelta(stats.edgeCount, state.previousEdgeCount);
  const hLabel = healthLabel(stats.ambiguousRatio, stats.edgeCount);
  const dLabel = densityLabel(stats.density);
  const activitySuffix = state.activityActive && state.configured ? " · active" : "";

  let icon = "$(graph)";
  if (state.activityActive && state.configured) {
    icon = "$(pulse)";
  }

  statusBar.text =
    `${icon} Graphify: ${formatCount(stats.nodeCount)} N${nodeDelta} · ` +
    `${formatCount(stats.edgeCount)} E${edgeDelta} · ${timeAgoShort}${activitySuffix}`;
  statusBar.accessibilityInformation = {
    label: `GraphifyStats: ${stats.nodeCount} nodes, ${stats.edgeCount} edges, last refreshed ${timeAgoShort}${activitySuffix}${
      state.activityActive ? ", LLM activity detected" : ""
    }`,
    role: "button",
  };

  if (state.activityActive && state.configured) {
    statusBar.color = "#22cc44";
  } else if (stats.ambiguousRatio > AMBIGUOUS_WARN_THRESHOLD && stats.edgeCount > 0) {
    statusBar.color = new vscode.ThemeColor("statusBarItem.warningForeground");
  } else {
    const hoursStale = (Date.now() - stats.lastRefreshed.getTime()) / 3600000;
    if (hoursStale > 6) {
      statusBar.color = new vscode.ThemeColor("statusBarItem.errorForeground");
    } else if (hoursStale > 1) {
      statusBar.color = new vscode.ThemeColor("statusBarItem.warningForeground");
    } else {
      statusBar.color = undefined;
    }
  }

  if (state.lastTriggerTime === null && stats.lastRefreshed) {
    state.lastTriggerTime = stats.lastRefreshed.getTime();
  }

  buildTooltip(stats, hLabel, dLabel);
}

function buildTooltip(stats, hLabel, dLabel) {
  const bigSep = " ";
  const tooltipMd = new vscode.MarkdownString("", true);
  tooltipMd.isTrusted = true;

  const timeAgo = getTimeAgo(stats.lastRefreshed);
  const lines = [`**GraphifyStats** — last refreshed ${timeAgo}`];

  if (stats.lastRefreshed) {
    const modifiedAgo = getTimeAgo(stats.lastRefreshed);
    lines.push(`Graph last rebuilt ${modifiedAgo}`);
  }

  if (state.configured && state.lastTriggerTime) {
    const triggerAgo = getTimeAgo(new Date(state.lastTriggerTime));
    lines.push(`Last LLM activity ${triggerAgo}  (via ${state.lastTriggerSource})`);
  }

  const confidenceText =
    `E:${stats.confidenceCounts.EXTRACTED.toLocaleString()}  ` +
    `I:${stats.confidenceCounts.INFERRED.toLocaleString()}  ` +
    `A:${stats.confidenceCounts.AMBIGUOUS.toLocaleString()}` +
    (stats.confidenceCounts.OTHER > 0
      ? `  O:${stats.confidenceCounts.OTHER.toLocaleString()}`
      : "");

  lines.push(
    bigSep,
    `---`,
    `**Graph size**    ${stats.nodeCount.toLocaleString()} nodes  ·  ${stats.edgeCount.toLocaleString()} edges`,
    `**Density**       ${stats.density.toFixed(2)} edges/node  (${dLabel})`,
    `**Communities**   ${stats.communityCount}`,
    `**Files**         ${stats.fileCount}`,
    `---`,
    `**Health**        ${hLabel}  (${(stats.ambiguousRatio * 100).toFixed(0)}% ambiguous)`,
    `**Confidence**    ${confidenceText}`,
  );

  if (stats.godNodes.length > 0) {
    lines.push(`---`, `**Top god nodes**`);
    for (const gn of stats.godNodes) {
      const displayName = gn.sourceFile
        ? `${sanitizeText(gn.sourceFile)}:${sanitizeText(gn.label)}`
        : sanitizeText(gn.label);
      lines.push(`- ${displayName}  (${gn.degree} connections)`);
    }
  }

  if (!state.configured) {
    lines.push(
      `---`,
      `**Activity monitoring not configured**`,
      ``,
      `Tell your LLM: "Configure GraphifyStats activity monitoring"`,
      ``,
      `Or click → Setup Activity Monitoring to copy the command.`,
    );
  } else if (state.setupWaiting) {
    lines.push(`---`, `Setup command copied — waiting for LLM to complete setup.`);
  }

  if (state.activityActive && state.configured) {
    lines.push(`---`, `Ask your LLM: "What did you just do with Graphify?"`);
  }

  lines.push(`---`, `Click for options  (Cmd+Shift+G Cmd+S)`);
  tooltipMd.appendMarkdown(lines.join("\n"));
  statusBar.tooltip = tooltipMd;
}

function copySetupCommand() {
  const isWin = process.platform === "win32";
  const mkdir = isWin
    ? 'mkdir "%USERPROFILE%\\.graphify-stats" 2>NUL & type NUL > "%USERPROFILE%\\.graphify-stats\\configured"'
    : "mkdir -p ~/.graphify-stats && touch ~/.graphify-stats/configured";

  const touch = isWin
    ? "type NUL > graphify-out\\.graphify-activity"
    : "touch graphify-out/.graphify-activity";

  const psMkdir = isWin
    ? 'New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\\.graphify-stats" | Out-Null; New-Item -ItemType File -Force -Path "$env:USERPROFILE\\.graphify-stats\\configured" | Out-Null'
    : "";

  const psTouch = isWin
    ? "New-Item -ItemType File -Force -Path graphify-out\\.graphify-activity | Out-Null"
    : "";

  let cmd = [
    "**Shell commands:**",
    "```",
    `1. ${mkdir}`,
    "2. After every graphify command (query, explain, path, update), also run:",
    `   ${touch}`,
    "```",
  ];

  if (isWin) {
    cmd.push(
      "",
      "**PowerShell commands:**",
      "```",
      `1. ${psMkdir}`,
      "2. After every graphify command, also run:",
      `   ${psTouch}`,
      "```",
    );
  }

  cmd.push("", "**LLM prompt (give this to your AI agent):**", "```", LLM_PROMPT_TEMPLATE, "```");

  const fullCmd = cmd.join("\n");

  vscode.env.clipboard.writeText(fullCmd).then(
    () => {
      vscode.window.showInformationMessage(
        "Setup commands and LLM prompt copied! Paste to your LLM. The status bar glows green when Graphify is used.",
      );
    },
    () => {
      vscode.window.showErrorMessage("Failed to copy to clipboard. Copy manually:\n\n" + fullCmd, {
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
    items.push({
      label: "$(graph) Graph Stats",
      description: `${formatCount(stats.nodeCount)} N · ${formatCount(stats.edgeCount)} E`,
      detail: `${stats.communityCount} communities · ${stats.fileCount} files · ${hLabel} health · refreshed ${getTimeAgo(stats.lastRefreshed)}`,
      alwaysShow: true,
    });
    items.push({ label: "", kind: vscode.QuickPickItemKind.Separator });

    if (!state.configured) {
      items.push({
        label: "$(plug) Setup Activity Monitoring",
        description: "Copy setup commands and LLM prompt to clipboard",
        alwaysShow: true,
        action: "setup-activity",
      });
      items.push({ label: "", kind: vscode.QuickPickItemKind.Separator });
    }

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
      {
        label: "$(flame) Test Activity Glow",
        description: "Simulate an activity trigger to preview the green glow",
        alwaysShow: true,
        action: "test-glow",
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
    );
  } else {
    items.push(
      {
        label: "$(clippy) Copy Graphify Install Command",
        description: "uv tool install graphifyy && graphify install && graphify .",
        detail:
          "Graphify builds a knowledge graph your AI can search — faster answers, fewer mistakes.",
        alwaysShow: true,
        action: "copy-setup",
      },
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
      await pollStats();
      vscode.window.showInformationMessage("GraphifyStats refreshed.");
      break;
    case "setup-activity":
      state.setupWaiting = true;
      updateStatusBar();
      copySetupCommand();
      break;
    case "rebuild":
      await vscode.env.clipboard.writeText("graphify update .");
      vscode.window.showInformationMessage(
        "'graphify update .' copied! Paste to your LLM to rebuild. Stats will refresh automatically.",
      );
      break;
    case "test-glow":
      state.lastTriggerSource = "test-glow";
      triggerActivity();
      updateStatusBar();
      vscode.window.showInformationMessage(
        "Test glow activated! The status bar will stay green for 30 seconds.",
      );
      break;
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
        vscode.window.showWarningMessage("graphify-out/graph.json not found.");
      }
      break;
    }
    default:
      console.warn(`GraphifyStats: unhandled action "${action}"`);
  }
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
};
