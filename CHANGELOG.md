# Changelog

## [0.2.3] - 2026-06-10

### Activity monitoring (redesigned)

- LLM-driven activity signaling via `touch graphify-out/.graphify-activity` or command
- Setup flow: extension detects unconfigured state, guides user to prompt LLM
- Configuration marker at `~/.graphify-stats/configured` — LLM creates it during setup
- Status bar glows green for 30s (configurable) when activity is signaled

### Stats & display

- Delta tracking: shows `+12` / `-3` for node/edge changes between polls
- Health scoring: Excellent / Good / Fair / Poor based on ambiguous edge ratio
- `formatCount` fix: 999999 now correctly displays as "1.0M" (not "1000.0K")
- Negative count guard: corrupted graphs no longer show negative numbers
- Last graph rebuild time shown independently from last LLM activity time

### Architecture

- Split pure functions into `lib/stats.js` (computeGraphStats, formatCount, time helpers)
- Single state object replaces 12 module-level variables
- Event-driven refresh: `onDidSaveTextDocument` triggers instant re-read for graph.json
- `onDidChangeWorkspaceFolders` invalidates cached workspace path
- Mtime caching: skips recomputation when graph.json hasn't changed
- `healthLabel()` derived metric separates display logic from raw stats

### Performance

- `updateStatusBar` no longer re-reads graph.json if stats are already populated
- `readGraphStats` compares cached mtime before parsing — returns `{ unchanged: true }`
- Workspace path cached and invalidated on folder changes only

### Security

- Size guard: graphs >50 MB show summary instead of parsing
- `graph.html` opens in webview with script/event-handler stripping
- Signal file owner check: rejects touches from non-owner processes on Unix
- `configured` marker freshness check: only accepts files created after session start
- All tooltip content sanitized (control chars, backticks, `$`, length-limited)

### Accessibility

- `aria-label` on status bar item for screen readers
- `accessibilityInformation` with `role: "button"`
- Green glow paired with text suffix `· active` for colorblind users
- Unicode box-drawing separators replaced with short text separators

### UX

- QuickPick grouped into "Actions" and "Open" sections
- `$(repo-sync)` icon for Rebuild Graph (was `$(sync-ignored)`)
- Delta display suppressed for changes < 5 nodes/edges (reduces noise)
- `Cmd+Shift+G Cmd+S` keyboard shortcut (was `Cmd+G Cmd+S` — conflicted with Go to Line)
- Rebuild confirmation tells user stats will refresh automatically

### DevOps

- `prepackage` script: tests + lint run before every vsix build
- Platform-specific setup commands (Windows cmd vs Unix shell)

### Test coverage (44 tests, up from 25)

- New: `formatDelta`, `sanitizeText`, `healthLabel`, `safeReadGraph`
- New: `formatCount` negative/rounding edge cases
- New: `updateStatusBar` and `showQuickPick` export checks

## [0.2.1] - 2026-06-10

- Fixed activity dot position — now renders after the graph icon, before the label
- Fixed trigger timestamp — properly updates when graph.json is rebuilt
- New `graphify-stats.indicateActivity` command — LLM agents can explicitly signal activity

## [0.2.0] - 2026-06-10

- Persistent activity dot — outline when idle, filled green when triggered
- Tooltip shows last time Graphify was triggered by an LLM
- One-click setup for new users — copy install command to clipboard
- QuickPick adapts to show setup vs graph actions based on state

## [0.1.0] - 2026-06-10

Initial scaffolding.
