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
- **Detailed tooltip** — hover to see communities, file count, god nodes, and
  confidence breakdown with health label
- **QuickPick command palette** — click the status bar or `Cmd+Shift+G Cmd+S` to
  refresh stats, open the graph visualization, or read the full report
- **Graph.json change detection** — auto-updates when the graph is rebuilt
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

Click the status bar → **Setup Activity Monitoring** → paste the command to your LLM.
The LLM creates a marker file and will signal activity after each graphify command.

### 3. Your LLM signals activity

After every `graphify` command (`query`, `explain`, `path`, `update`), your LLM runs:

```
touch graphify-out/.graphify-activity
```

The status bar glows green for 30 seconds each time.

## Usage

The status bar shows: `$(zap) Graphify: 1.2K N (+12) · 890 E · now · active`

- **Green glow** = your LLM just used Graphify
- **Warning color** = graph is stale (>1h) or has high ambiguity
- **Error color** = graph is very stale (>6h)
- **Click** for QuickPick actions (Refresh, Rebuild, Open Visualization, etc.)

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

## How it works

1. Extension polls `graphify-out/graph.json` for stat changes
2. A marker file at `~/.graphify-stats/configured` signals that activity monitoring is set up
3. The LLM touches `graphify-out/.graphify-activity` after each graphify command
4. Extension detects the touch and turns the status bar green

## Privacy

This extension reads only local files in your workspace (`graphify-out/`).
No network calls, no telemetry, no third-party services.

## License

[MIT](LICENSE)
