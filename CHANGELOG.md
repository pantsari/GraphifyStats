# Changelog

## [2.0.1] - 2026-07-18

### Added

- Clickable badges in the README (CI status, marketplace version, license, zero
  runtime dependencies)

## [2.0.0] - 2026-06-12

GraphifyStats 2.0 turns the status bar monitor into a full cross-agent companion
for Graphify: one command writes the rules every AI coding agent reads, the
status bar shows a live spinner while your agent rebuilds the graph, and the
tooltip becomes an activity log of who ran what, when. Fully backward
compatible — existing setups keep working without any changes.

### Added

- **One-command agent setup** — _"GraphifyStats: Add Agent Instructions to
  Workspace"_ (command palette or QuickPick) generates ready-to-use Graphify rules
  for Claude Code (`CLAUDE.md` plus an on-demand skill), Codex and OpenCode
  (`AGENTS.md`), GitHub Copilot, Cursor, Gemini CLI, Windsurf, Cline/Roo, and
  Continue — all from one canonical source shipped with the extension. Generated
  content lives in marker-managed blocks, so your own notes in those files are
  preserved and a re-run refreshes only the Graphify section.
- **Live "running" indicator** — agents can announce commands through the new v1
  activity event file (`graphify-out/.graphify-activity.json` with
  `status`/`command`/`agent`/`startedAt`/`completedAt`). The status bar shows a
  spinner while `graphify update .` runs and flips to the result when it
  finishes — no more wondering whether a 2-minute rebuild is actually happening.
- **Activity log in the tooltip** — hover to see the last 3 graph refreshes and
  the last 5 agent uses, including which command ran and which agent ran it,
  persisted per workspace across reloads.
- **Multi-root workspace support** — the extension finds the workspace folder
  that contains your graph and follows your active editor, instead of only ever
  watching the first folder.
- **Remote-ready file watching** — powered by VS Code's `FileSystemWatcher`, so
  change detection is instant in Remote SSH, WSL, Dev Containers, and Codespaces,
  with a local `fs.watch` fallback.

### Improved

- Replaced the Marketplace extension icon with the new neon Graphify artwork.
- Delta brackets `(+12 / -3)` and the green glow now appear after **every** graph
  update, not only large ones.
- Status bar and tooltip timestamps age in real time, and activity signals light
  up the status bar the moment they happen.
- Watcher events are debounced and graph reads coalesced, keeping the extension
  host idle even during heavy rebuild bursts.
- The setup prompt now guides agents on every platform to persist the
  instructions to their native rules file.
- Test suite grown from 90 to 145 tests with enforced coverage thresholds.

## [1.0.2] - 2026-06-11

### Fixed

- Fix repository URLs in package.json, README, CONTRIBUTING.md, and SECURITY.md to use the correct GitHub repo name (`GraphifyStats` instead of `graphify-stats`)

## [1.0.0] - 2026-06-11

### First public release

- Live knowledge graph stats in the VS Code status bar (node count, edge count, communities, god nodes)
- "One Prompt" setup — paste a single prompt to your AI coding agent to install and configure Graphify
- LLM-driven activity signaling with green status bar glow
- Health scoring (Excellent / Good / Fair / Poor) based on ambiguous edge ratio
- Delta tracking showing node/edge changes between polls
- Confidence-weighted god nodes
- Activity indicator toggle from command palette
- Auto-suspending polling in headless/remote VS Code
- Cross-platform support and `.graphify-stats/configured` marker
- 90 tests
