# GraphifyStats

Monitor your [Graphify](https://graphifylabs.ai) knowledge graph stats right
inside the VS Code status bar. See node count, edge count, community info,
god nodes, graph health, and when Graphify was last triggered by your AI
coding assistant — all without leaving the editor.

Works with **any LLM platform** that runs Graphify: Claude Code, OpenCode,
Codex, Cursor, Gemini CLI, and more.

![GraphifyStats command palette — One Prompt setup for installing and configuring Graphify](https://raw.githubusercontent.com/pantsari/GraphifyStats/main/GraphifyStats3.png)

![GraphifyStats QuickPick command palette with stats, actions, and setup options](https://raw.githubusercontent.com/pantsari/GraphifyStats/main/GraphifyStats.png)

![GraphifyStats status bar showing live node count, edge count, trigger time, and graph health](https://raw.githubusercontent.com/pantsari/GraphifyStats/main/GraphifyStats2.png)

## Features

- **Live graph stats in the status bar** — node/edge counts with delta tracking
- **LLM activity signaling** — your LLM touches a file; the status bar glows green
- **Health scoring** — Excellent / Good / Fair / Poor based on ambiguous edge ratio
- **Density labels** — Sparse / Typical / Dense alongside raw density
- **Confidence-weighted god nodes** — EXTRACTED edges weighted higher than INFERRED/AMBIGUOUS
- **Compact hover tooltip** — hover for communities, file count, god nodes, health, and activity history
- **QuickPick command palette** — click the status bar to
  refresh stats, rebuild graph, run setup again, or open visualization
- **Graph.json change detection** — `onDidSaveTextDocument` for in-editor saves,
  plus `fs.watch` + polling for external changes (terminal/LLM)
- **Zero runtime dependencies** — built entirely on the VS Code Extension API
  and Node.js built-in modules

## Usage

The status bar shows: `$(graph) Graphify: 1.2K N (+12) · 890 E · 5m · 2m`

- **Green glow** = graph was recently updated or your LLM just used Graphify
- **Delta brackets (+12 / -3)** = node/edge changes after `graphify update` (auto-hide after 30s)
- **Warning color** = graph is stale (>1h) or has high ambiguity (>30%)
- **Error color** = graph is very stale (>6h)
- **Trigger time** = how long ago your LLM last used Graphify (e.g. `2m`)
- **Click** for QuickPick actions (Refresh, Rebuild, Run Setup Again, View Graph, etc.)

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
- Check the extension's output channel: **View → Output → graphify-stats**
- Re-run setup via QuickPick → **Run Setup Again**

**Parse errors?**

- `graph.json` may be malformed or being written mid-read. The extension retries automatically.
- If the file is >50 MB, only a summary is shown (by design).

**"Polling stalled" warning?**

- The extension suspends polling after consecutive failures. Reopen the workspace or click Refresh.

**Setup notification won't reappear?**

- The notification shows once per VS Code installation. Use QuickPick → **Run Setup Again** to access it anytime.

## Commands

The extension contributes these commands (usable via `Cmd+Shift+P` or keybindings):

| Command                           | Description                                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `graphify-stats.click`            | Open the QuickPick command palette                                                                                                         |
| `graphify-stats.indicateActivity` | Signal Graphify activity (for LLMs with VS Code command access). Accepts `{ command: "graphify query" }` to record which command was used. |
| `graphify-stats.getState`         | Return current state as JSON (configured, activityActive, nodeCount, edgeCount, etc.)                                                      |

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
