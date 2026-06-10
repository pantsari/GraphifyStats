# GraphifyStats — Project Brief

Last updated: 2026-06-10
Status: planning → implementing
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

## 3. User

A VS Code user who uses Graphify with any LLM coding assistant and wants
to monitor graph stats without leaving the editor.

## 4. Scope

### 4.1 In Scope (v0.1)

- Watch `graphify-out/graph.json` for changes via `fs.watchFile` / polling
- Parse `graph.json` to extract:
  - Node count
  - Edge count
  - Community count (unique community numbers)
  - File count (unique source_file values)
  - Top-3 god nodes (nodes with highest edge degree)
- Status bar text: `Graphify: N nodes · M edges`
- Tooltip: last-refresh time, community count, file count, god nodes
- Click: QuickPick with Refresh, Open graph.html, Open GRAPH_REPORT.md
- Detect when an LLM triggers `/graphify` (file watcher detects changes)
- Works across all LLM platforms (file-based, no platform-specific hooks needed)

### 4.2 Out of Scope (v0.1)

- Running `/graphify` from within the extension (user uses their AI agent)
- Webview visualization of the graph
- PR dashboard integration
- i18n (English only)
- TypeScript compilation
- Any backend or external services

## 5. Data Model

Read from `graphify-out/graph.json`:

```json
{
  "nodes": [
    {"id": "...", "label": "...", "source_file": "...", "source_location": "L42", "community": N}
  ],
  "links": [
    {"source": "id_a", "target": "id_b", "relation": "calls", "confidence": "EXTRACTED"}
  ]
}
```

Edge confidence values: `EXTRACTED`, `INFERRED`, `AMBIGUOUS`.

## 6. Architecture

Single file `extension.js` using only VS Code Extension API + Node.js built-in
modules (`fs`, `path`). Zero runtime dependencies.

- `fs.watchFile` or polling (`fs.stat`) to detect `graph.json` changes
- `fs.readFile` + `JSON.parse` to extract stats
- VS Code `StatusBarItem` for display + `QuickPick` for actions

## 7. Acceptance Criteria

- AC-1: No `graphify-out/graph.json` → `Graphify: Not found`
- AC-2: Graph exists → `Graphify: N nodes · M edges`
- AC-3: Hover tooltip shows last refresh, communities, files, god nodes
- AC-4: Click → QuickPick with Refresh, Open Graph, Open Report
- AC-5: Auto-detects when graph.json changes (LLM triggers `/graphify`)
- AC-6: Refresh re-reads graph.json and updates display
- AC-7: Works with any LLM platform (file-system based, no hooks)
