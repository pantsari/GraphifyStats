# GraphifyStats

Monitor your [Graphify](https://graphifylabs.ai) knowledge graph stats right
inside the VS Code status bar. See node count, edge count, community info,
god nodes, graph health, and when Graphify was last triggered by your AI
coding assistant — all without leaving the editor.

Works with **any LLM platform** that runs Graphify: Claude Code, OpenCode,
Codex, Cursor, Gemini CLI, and more.

## Features

- **Live graph stats in the status bar** — node/edge counts with delta tracking
- **LLM activity signaling** — your LLM touches a file; the status bar glows green
- **Health scoring** — Excellent / Good / Fair / Poor based on ambiguous edge ratio
- **Density labels** — Sparse / Typical / Dense alongside raw density
- **Confidence-weighted god nodes** — EXTRACTED edges weighted higher than INFERRED/AMBIGUOUS
- **Detailed Markdown tooltip** — hover to see communities, file count, god nodes, health, remediation guidance
- **QuickPick command palette** — click the status bar or `Cmd+Shift+G Cmd+S` to
  refresh stats, rebuild graph, test activity glow, or open visualization
- **Graph.json change detection** — `onDidSaveTextDocument` for in-editor saves,
  plus `fs.watch` + polling for external changes (terminal/LLM)
- **Zero runtime dependencies** — built entirely on the VS Code Extension API
  and Node.js built-in modules
- **Keyboard shortcut** — `Cmd+Shift+G Cmd+S` (Mac) / `Ctrl+Shift+G Ctrl+S` opens QuickPick

## Setup

### 1. Install Graphify

```
uv tool install graphifyy && graphify install && graphify .
```

Paste into your terminal or AI assistant.

### 2. Configure activity monitoring

Click the status bar → **Setup Activity Monitoring** → paste the commands and LLM prompt to your AI agent.
The copied text includes:

- Shell commands to create the marker file
- A natural-language LLM prompt your agent will understand

### 3. Your LLM signals activity

After every `graphify` command (`query`, `explain`, `path`, `update`), your LLM runs:

**Mac/Linux:**

```
touch graphify-out/.graphify-activity
```

**Windows (cmd):**

```
type NUL > graphify-out\.graphify-activity
```

**Windows (PowerShell):**

```
New-Item -ItemType File -Force -Path graphify-out\.graphify-activity | Out-Null
```

The status bar glows green for 30 seconds each time.

Alternatively, LLMs that can call VS Code commands can use:

```
graphify-stats.indicateActivity
```

## Usage

The status bar shows: `$(pulse) Graphify: 1.2K N (+12) · 890 E · now · active`

- **Green glow** = your LLM just used Graphify
- **Warning color** = graph is stale (>1h) or has high ambiguity (>30%)
- **Error color** = graph is very stale (>6h)
- **Click** for QuickPick actions (Refresh, Rebuild, Test Glow, View Graph, etc.)

## How it works

1. Extension detects `graphify-out/graph.json` via `workspaceContains` activation event
2. Polls every 5s for stat changes, plus `fs.watch` for near-instant detection
3. A marker file at `~/.graphify-stats/configured` signals that activity monitoring is set up
4. The LLM touches `graphify-out/.graphify-activity` after each graphify command
5. Extension detects the touch and turns the status bar green
6. `onDidSaveTextDocument` triggers immediate re-read when graph.json is saved in-editor

## Troubleshooting

**Activity not triggering?**

- Verify `~/.graphify-stats/configured` exists (created during setup)
- Verify `graphify-out/.graphify-activity` exists in your workspace
- Run **Test Activity Glow** from QuickPick to verify the visual indicator works
- Check the extension's output channel: **View → Output → graphify-stats**

**Parse errors?**

- `graph.json` may be malformed or being written mid-read. The extension retries automatically.
- If the file is >50 MB, only a summary is shown (by design).

**"Polling stalled" warning?**

- The extension suspends polling after consecutive failures. Reopen the workspace or click Refresh.

**Setup notification won't reappear?**

- The notification shows once per VS Code installation. Use QuickPick → Setup Activity Monitoring to access it anytime.

## Requirements

- VS Code 1.85+
- [Graphify](https://github.com/safishamsi/graphify) installed
- A `graphify-out/graph.json` file in your workspace

## Configuration

| Setting                                            | Default | Description                    |
| -------------------------------------------------- | ------- | ------------------------------ |
| `graphify-stats.pollInterval`                      | 5       | Seconds between stat refreshes |
| `graphify-stats.activityIndicator.enabled`         | true    | Enable green glow on activity  |
| `graphify-stats.activityIndicator.durationSeconds` | 30      | How long green glow stays      |

## Privacy

This extension reads only local files in your workspace (`graphify-out/`).
No network calls, no telemetry, no third-party services.

## License

[MIT](LICENSE)
