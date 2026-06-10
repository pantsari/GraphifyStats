# GraphifyStats — Project Brief

Last updated: 2026-06-10
Status: v0.3.0 preview
Audience: AI agents, human reviewers, the project owner

## 1. Executive Summary

GraphifyStats is a VS Code extension that monitors your Graphify knowledge
graph directly in the editor status bar. It watches the `graphify-out/`
directory for changes, parses `graph.json` to extract live stats (node count,
edge count, communities, god nodes), and surfaces the last time Graphify was
triggered by an LLM agent. A single glance tells you whether your codebase
knowledge graph is up to date and how large it has grown.

## 2. Problem

Developers using [Graphify](https://graphifylabs.ai) (`/graphify` command in
Claude Code, OpenCode, Codex, Cursor, Gemini CLI, etc.) generate a knowledge
graph of their codebase. The graph lives in `graphify-out/` as local files. There
is no way to see at a glance inside VS Code whether the graph is fresh, how
many nodes/edges it contains, or when an AI agent last ran `/graphify`.

## 3. Architecture (v0.3.0)

### Detection

- `workspaceContains:graphify-out/graph.json` as primary activation event
- `fs.watch` on `graphify-out/` for near-instant change detection
- Polling via `setTimeout` chain (sequential, no overlapping) every 5s as backup
- `onDidSaveTextDocument` triggers immediate re-read for in-editor saves
- Polling suspends after 2 consecutive null polls (headless/remote guard)

### Activity signaling (LLM-driven)

- Extension monitors `graphify-out/.graphify-activity` mtime
- LLM touches this file after each graphify command
- `graphify-stats.indicateActivity` command as alternative for LLMs with VS Code command access
- Configuration marker at `~/.graphify-stats/configured` — LLM creates during setup

### Stats computation

- `lib/stats.js` — pure functions: computeGraphStats, formatCount, healthLabel, etc.
- Async I/O via `fs.promises.readFile` for non-blocking reads
- Mtime caching — skips recomputation when graph.json unchanged
- Size guard: graphs >50 MB show summary only
- Confidence-weighted god nodes, proportional delta threshold

### UI

- `extension.js` — activation, state management, polling, UI rendering
- Status bar with `$(pulse)` icon during activity, green color
- `vscode.MarkdownString` tooltips with semantic headings
- `accessibilityInformation` aria-labels with activity state
- QuickPick with grouped Actions and Open sections

### State

- Single `state` object with JSDoc typedef
- Persisted to `context.globalState`: setupNotificationShown, previousNodeCount, previousEdgeCount
- Output channel `graphify-stats` for structured logging

## 4. Zero Runtime Dependencies

Per ADR 0001. All functionality uses Node.js built-ins: `fs`, `path`, `os`.
No npm runtime dependencies. Dev dependencies only: `@vscode/vsce`, `eslint`, `prettier`, `vitest`.

## 5. Module Structure

```
extension.js      — activate/deactivate, polling, UI, commands
lib/stats.js      — computeGraphStats, formatCount, healthLabel, sanitizeText, time helpers
test/
  extension.test.js — 58 unit tests
TODO.md           — ship checklist
```
