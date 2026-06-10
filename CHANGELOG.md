# Changelog

## [0.3.0] - 2026-06-10

### Added

- LLM-driven activity signaling via `touch graphify-out/.graphify-activity` or `indicateActivity` command
- Setup flow: extension guides user to configure LLM with tested prompt template
- Configuration marker at `~/.graphify-stats/configured` — LLM creates it during setup
- Status bar glows green for 30s (configurable) when activity is signaled
- Health scoring: Excellent / Good / Fair / Poor based on ambiguous edge ratio
- Density labeling: Sparse / Typical / Dense alongside raw density value
- Delta tracking: shows `+12` / `-3` for node/edge changes between polls, proportional threshold
- Confidence-weighted god nodes: EXTRACTED=1.0, INFERRED=0.5, AMBIGUOUS=0.25
- "Test Activity Glow" QuickPick action: preview green glow without LLM
- "Rebuild Graph" QuickPick action: copies `graphify update .` to clipboard
- Billion suffix in `formatCount` (1.5B)
- Unknown confidence tracking as `OTHER` in confidenceCounts
- `Cmd+Shift+G Cmd+S` keyboard shortcut for QuickPick
- Webview rendering of `graph.html` with scripts enabled (D3.js visualization)
- `accessibilityInformation` aria-label on status bar with activity state
- `vscode.MarkdownString` tooltips with semantic headings
- Async I/O via `fs.promises.readFile` for non-blocking graph reads
- LLM prompt template included in setup command output

### Changed

- Removed all automatic activity detection (file watchers, process monitors)
- Architecture: `lib/stats.js` extracted with JSDoc typedefs, single state object
- Polling: `setTimeout` chain replaces `setInterval` (prevents overlapping polls)
- Removed `isGraphStable` stability delay — mtime caching handles this
- Status bar icon: `$(pulse)` replaces `$(zap)` during activity
- Time formatting: `5 min ago` / `3 hr ago` instead of `5m ago` / `3h ago`
- Activation event: `workspaceContains:graphify-out/graph.json` primary, `onStartupFinished` fallback
- Polling suspends after 2 null polls (headless/remote VS Code guard)
- Status bar hides when no workspace folder open
- `birthtimeMs` cross-platform fallback via `getFileCreationTime()`

### Fixed

- `formatCount(999999)` now correctly displays `1.0M` (was `1000.0K`)
- Negative count guard: corrupted graphs no longer show negative numbers
- Activity mtime comparison: first touch after file creation no longer missed
- `configured` marker freshness check uses platform-appropriate creation time
- Parse error warnings capped at once per session (totalParseErrors tracking)
- `indicateActivity` rate-limited to once per second
- `sanitizeText` strips `javascript:` and `data:` URI schemes
- `handleAction` default case catches unhandled actions with warning
- Activity source tracked in `lastTriggerSource` for debugging
- Delta tracking persisted across VS Code restarts via `globalState`

### Security

- Size guard: graphs >50 MB show summary instead of parsing
- Webview CSP via options (localResourceRoots restricted)
- Signal file owner check: rejects touches from non-owner processes on Unix
- PowerShell setup command variant for Windows users

## [0.2.1] - 2026-06-10

- Fixed activity dot position — now renders after the graph icon, before the label
- Fixed trigger timestamp — properly updates when graph.json is rebuilt
- New `graphify-stats.indicateActivity` command

## [0.2.0] - 2026-06-10

- Persistent activity dot — outline when idle, filled green when triggered
- Tooltip shows last time Graphify was triggered by an LLM
- One-click setup for new users — copy install command to clipboard
- QuickPick adapts to show setup vs graph actions based on state

## [0.1.0] - 2026-06-10

Initial scaffolding.
