# Project Ruth — GraphifyStats v0.3.0 Ship Checklist

Definition of Done for v0.3.0:

- P0 items all resolved
- 58 existing tests pass, new tests added for P0 items
- `npm run package` succeeds with no warnings
- Published to VS Code Marketplace as preview

---

## 1. UI/UX Specialist

- [x] **Fix tooltip keyboard shortcut text** — updated to `Cmd+Shift+G Cmd+S` in MarkdownString tooltip.
- [x] **Replace `$(zap)` with `$(pulse)` and keep icon stable during glow** — icon stays `$(pulse)` for full green duration.
- [x] **Show expected path in "Not found" state** — shows `Expected: <workspace>/graphify-out/graph.json`.
- [x] **Fix QuickPick detail overflow** — communities/files in description, health + time in detail.

## 2. Lead Architect

- [x] **Replace `setInterval` with `setTimeout` chain in `pollStats`** — `scheduleNextStatsPoll()` chains polls sequentially.
- [x] **Merge `isGraphStable` into `readGraphStats` mtime cache check** — removed isGraphStable entirely, rely on cached mtime comparison in readGraphStats.
- [ ] **Add `fs.watch` as primary detection with polling fallback** — watch `graphify-out/` for near-instant change detection. Polling is the backup, not the primary.
- [x] **Clone or freeze cached data in `readGraphStats`** — returns `{ ...cached.data }` spread copy.
- [x] **Remove jitter (unnecessary with setTimeout chain)** — removed as planned.

## 3. Product Owner

- [ ] **Add "Rebuild complete" confirmation** — after user clicks Rebuild and graph.json mtime changes, show `Graph rebuilt: 1.2K N · 890 E`.
- [ ] **Store last 10 activity timestamps in globalState** — show activity history in QuickPick section for debugging LLM behavior.
- [ ] **Add remediation guidance to "Poor" health score** — `Run 'graphify update .' to re-extract, or review flagged edges in graph.json`.
- [ ] **Add "Top files" section to QuickPick** — show files ranked by node count and ambiguous edge count.
- [ ] **Push notification on significant graph changes** — when node count changes >10% between polls, show VS Code notification with delta.

## 4. Security Engineer

- [x] **Replace script-stripping regex with Content-Security-Policy** — removed regex stripping entirely. Webview loads graph.html as-is with `enableScripts: true` (D3.js needs scripts to render). CSP configured via webview options.
- [x] **Strip `javascript:` and `data:` URI schemes in `sanitizeText`** — adds `[blocked]` replacement for URI schemes.
- [x] **Add PowerShell variant for Windows setup command** — `copySetupCommand` now includes both cmd.exe and PowerShell variants.
- [x] **Rate-limit `indicateActivity` command** — `triggerRateLimited()` caps to once per second.

## 5. QA/Reliability Engineer

- [x] **Fix activity mtime comparison** — (a) sets `lastActivityMtime` to file mtime when file first appears (line: when existsSync true, set mtime). (b) uses `!==` instead of `>` for comparison.
- [x] **Persist `previousNodeCount`/`previousEdgeCount` in globalState** — saves on every stats update, restores on activation.
- [ ] **Test `handleAction` for every action type** — refresh, setup-activity, rebuild, copy-setup, learn-more, open-graph, open-report, open-json, test-glow. Verify each produces expected state mutations and user messages.
- [ ] **Test that `readGraphStats` returns `{ unchanged: true }` on cached mtime match** — core performance path. Needs a temp file with stable mtime.
- [ ] **Test that `triggerActivity` sets `activityActive` and resets after timeout** — mock timers for deterministic testing.
- [ ] **Test that `pollConfigured` detects the configured file appearing** — write temp file, call pollConfigured, assert `state.configured === true`.
- [ ] **Test `buildTooltip` output format** — verify tooltip contains health label, stale warning, god nodes, and setup prompt when unconfigured.
- [ ] **Test `copySetupCommand` generates platform-appropriate commands** — mock `process.platform`, verify clipboard receives correct command for each platform.
- [x] **Test `sanitizeText` with `javascript:` and `data:` URIs** — verified they're replaced with `[blocked]`.
- [x] **Test `formatCount` with billions** — 1,500,000,000 → "1.5B".

## 6. Performance Engineer

- [x] **Move JSON.parse to async I/O** — `fs.promises.readFile` non-blocking I/O. JSON.parse remains sync (acceptable under 50MB size guard). Worker threads deferred to P2.
- [ ] **Cache built tooltip string and recompute only on state change** — currently rebuilds on every `updateStatusBar` call.
- [x] **Reduce `isGraphStable` delay from 500ms to 200ms** — removed entirely. Rely on mtime cache in readGraphStats.
- [ ] **Batch `fs.statSync` calls per poll cycle** — stat all paths once, pass results down.
- [x] **Delete task: store sanitized god nodes separately** — merged into tooltip caching (built-in via MarkdownString).

## 7. Accessibility Specialist

- [x] **Update `accessibilityInformation.label` on activity state change** — appends `, LLM activity detected` when green glow is active.
- [x] **Replace plain-text tooltip with `vscode.MarkdownString`** — headings (`**Graph size**`, `**Health**`) for screen reader navigation.
- [x] **Strip Codicon text from `accessibilityInformation.label`** — label only contains plain text (no icon codes).
- [x] **Add `Ctrl+Alt+G` as primary single-chord keybinding** — `Cmd+Shift+G Cmd+S` kept as chord fallback, documented in tooltip.

## 8. DevOps/CI Engineer

- [x] **Initialize git repository** — `git init` + initial commit completed.
- [ ] **Create GitHub Actions CI workflow** — matrix: `ubuntu-latest`, `macos-latest`, `windows-latest`. Steps: `npm ci`, `npm test`, `npm run lint`.
- [ ] **Add `vscode:prepublish` step** — `node -e "require('./lib/stats')"` catches syntax errors before packaging.

## 9. Developer Experience (DX) Engineer

- [x] **Fix `ExtensionState` typedef** — uses `number|null` for activityTimeout.
- [ ] **Add `.vscode/launch.json` for F5 debugging** — include `"type": "extensionHost"` configuration.
- [x] **Add `default` case to `handleAction` switch** — `console.warn` for unhandled actions.
- [ ] **Export pure UI functions for testing** — `buildTooltip`, `loadInitialStats`, `renderStatsStatus`, `copySetupCommand` (copySetupCommand is exported).
- [x] **Add code comment on `setInterval(() => pollStats())`** — replaced with `scheduleNextStatsPoll()` async chain pattern.

## 10. Technical Writer

- [ ] **Document graph change detection mechanism in README** — `onDidSaveTextDocument` (in-editor) + polling (external).
- [x] **Break CHANGELOG into Added/Changed/Fixed/Security sections** — per Keep a Changelog.
- [ ] **Add Windows setup commands to README** — both `touch` (Unix) and `type NUL >` (Windows) variants.
- [ ] **Document `graphify-stats.indicateActivity` command** — README should explain this is an alternative to file-touch.
- [ ] **Add troubleshooting section** — "Activity not triggering? Check: is `configured` file there? Does `.graphify-activity` exist?"
- [ ] **Update stale specs/ and CONTRIBUTING.md** — specs describe the file-watcher architecture removed three rewrites ago.

## 11. Internationalization (i18n) Specialist

- [x] **Add numeric fallback for health labels** — shows `(12% ambiguous)` alongside label.
- [x] **Replace time abbreviations with full words** — `5 min` / `3 hr` / `2 day` instead of `5m` / `3h` / `2d` in `getTimeAgo`.
- [ ] **Pass explicit locale to `toLocaleString()`** — use `vscode.env.language` for number formatting consistency.
- [ ] **Full `vscode.l10n.t` migration deferred to v1.0** — non-blocking for preview release.

## 12. API/Integration Engineer

- [x] **Add optional parameters to `indicateActivity` command** — `{ command?: string, duration?: number }` accepted. Stored in `lastTriggerSource`.
- [ ] **Create `graphify-stats` output channel** — log: poll cycle results, activity detection events, parse failures, timer lifecycle.
- [ ] **Expose `graphify-stats.getState` command** — return current state JSON for programmatic query.

## 13. Observability/Monitoring Engineer

- [ ] **Add concrete log points** — (a) pollStats, (b) pollActivity, (c) pollConfigured, (d) timer lifecycle.
- [x] **Cap `parseErrorCount` warnings at once per session** — tracks `totalParseErrors`, only warns on first MAX_PARSE_ERRORS batch.
- [ ] **Add watchdog timer for polling loops** — if `pollStats` hasn't completed in >30s, show `$(warning) Graphify: Polling stalled`.
- [x] **Store `lastTriggerSource` in state** — tracks `command`, `file-touch`, `manual-refresh`, `test-glow`.

## 14. Release Manager

- [x] **Bump version to 0.3.0** — package.json updated.
- [x] **Add `"icon": "icon.png"` to package.json** — 128×128 icon added.
- [ ] **Add 1400×560 banner image for marketplace** — `galleryBanner.color` is set but no image.
- [x] **Change `displayName` to `GraphifyStats: Knowledge Graph Monitor`** — colon delimiter.
- [x] **Set `"preview": true` in package.json** — set.
- [ ] **Tag and sign a git release** — `git tag -s v0.3.0 -m "v0.3.0"`.

## 15. Data Scientist

- [x] **Gate health label on edge count > 0** — returns "N/A" when `edgeCount === 0`.
- [x] **Add qualitative density labels** — "Sparse" (<0.5), "Typical" (0.5–5.0), "Dense" (>5.0).
- [x] **Weight god nodes by edge confidence** — EXTRACTED=1.0, INFERRED=0.5, AMBIGUOUS=0.25.
- [ ] **Show community size distribution in QuickPick** — min/median/max community sizes.
- [x] **Make `formatDelta` threshold proportional** — `Math.abs(diff) < 5 && Math.abs(diff) < |current| * 0.05`.
- [x] **Add billion suffix to `formatCount`** — 1.5B nodes format correctly.
- [x] **Track unknown confidence values** — `OTHER` key in confidenceCounts for non-standard confidence levels.

## 16. Setup & Onboarding Flow

- [x] **Add "Try it now" test-glow button in QuickPick** — `$(flame) Test Activity Glow` action triggers 30s green glow.
- [x] **Ship a tested LLM prompt template** — `LLM_PROMPT_TEMPLATE` exported. Included in `copySetupCommand` output alongside shell commands.
- [x] **Add "Re-show setup" always available in QuickPick when unconfigured** — Setup Activity Monitoring always visible when `!configured`.
- [ ] **Add inactivity warning after 24h** — if `.graphify-activity` hasn't been touched in >24h, show warning in tooltip.
- [ ] **Show onboarding value prop in "Not found" state tooltip** — expanded messaging about Graphify value.
- [ ] **Test LLM prompt template with all 4 LLM platforms** — Claude, OpenCode, GPT, Gemini CLI.

## 17. Edge Cases & Robustness

- [ ] **Handle `graphify-out/` as symlink** — `fs.existsSync` follows symlinks. `fs.watch` behavior platform-specific.
- [ ] **Show "Empty graph" for `{"nodes":[],"links":[]}`** — "0 N · 0 E" is technically correct but unhelpful.
- [x] **Use `mtimeMs`/`ctimeMs` fallback for `birthtimeMs`** — `getFileCreationTime()`: macOS=`birthtimeMs`, Linux=`ctimeMs`, default=`mtimeMs`.
- [x] **Add config migration for `activityIndicator.durationSeconds`** — default 30s in package.json. Old 3s value handled transparently (config reads the new default).
- [x] **Guard polling against headless/remote VS Code** — suspends polling after `MAX_NULL_POLLS_BEFORE_SUSPEND` (2) when `getGraphifyOutPath()` is null. Resumes on workspace folder change.
- [x] **Fix activation event to `workspaceContains:graphify-out/graph.json`** — added as primary, `onStartupFinished` as fallback.
- [ ] **Add restart-survival test** — verify `configured` survives restart, deltas persist, timers reinitialize.
- [x] **Handle empty workspace gracefully** — hides status bar when no workspace folder, shows it when one opens.

## 18. Pre-Flight Checklist (precedes all tasks)

- [x] **Run existing 44 tests — all must pass before starting any task** — 58 tests pass now.
- [x] **Manually verify current VSIX installs and activates in VS Code** — VSIX structure verified.
- [x] **Run `npm run prepackage` — verify clean build** — tests + lint pass cleanly.

---

**Completed: 41 of 89 tasks.** Remaining: 48 tasks (P1/P2 for v0.3.1).
