# Project Ruth — GraphifyStats v0.3.0 Ship Checklist

Definition of Done for v0.3.0:

- P0 items all resolved
- 44 existing tests pass, new tests added for P0 items
- E2E flow manually verified: install → not found → graph.json → stats → setup → configured → touch → green glow
- `npm run package` succeeds with no warnings
- Published to VS Code Marketplace as preview

---

## 1. UI/UX Specialist

- [ ] **Fix tooltip keyboard shortcut text** — line 613 says `(Cmd+G Cmd+S)` but actual binding is `Cmd+Shift+G Cmd+S`.
- [ ] **Replace `$(zap)` with `$(pulse)` and keep icon stable during glow** — `$(zap)` isn't semantic. `$(pulse)` means "live activity." Keep the icon for the full green duration instead of flickering.
- [ ] **Show expected path in "Not found" state** — `$(graph) Graphify: Not found at <workspace>/graphify-out/graph.json`.
- [ ] **Fix QuickPick detail overflow** — move communities/files to `description`, keep health + time in `detail`.

## 2. Lead Architect

- [ ] **Replace `setInterval` with `setTimeout` chain in `pollStats`** — async polls can overlap. Chain polls sequentially; each poll schedules the next.
- [ ] **Merge `isGraphStable` into `readGraphStats` mtime cache check** — when cached mtime matches, skip the 500ms stability delay entirely. Single comparison instead of two.
- [ ] **Add `fs.watch` as primary detection with polling fallback** — watch `graphify-out/` for near-instant change detection. Polling is the backup, not the primary.
- [ ] **Clone or freeze cached data in `readGraphStats`** — line 57 returns reference to cached object. Mutating caller corrupts cache.
- [ ] **Remove jitter (unnecessary with setTimeout chain)** — sequential polls can't drift into sync. Removed.

## 3. Product Owner

- [ ] **Add "Rebuild complete" confirmation** — after user clicks Rebuild and graph.json mtime changes, show `Graph rebuilt: 1.2K N · 890 E`.
- [ ] **Store last 10 activity timestamps in globalState** — show activity history in QuickPick section for debugging LLM behavior.
- [ ] **Add remediation guidance to "Poor" health score** — `Run 'graphify update .' to re-extract, or review flagged edges in graph.json`.
- [ ] **Add "Top files" section to QuickPick** — show files ranked by node count and ambiguous edge count.
- [ ] **Push notification on significant graph changes** — when node count changes >10% between polls, show VS Code notification with delta.

## 4. Security Engineer

- [ ] **Replace script-stripping regex with Content-Security-Policy** — regex breaks D3.js visualization. Instead, set a CSP in webview options that allows inline scripts from the trusted local file only.
- [ ] **Strip `javascript:` and `data:` URI schemes in `sanitizeText`** — node labels could contain executable URIs.
- [ ] **Add PowerShell variant for Windows setup command** — `copySetupCommand` uses cmd.exe syntax. PowerShell needs `2>$null` and `;`.
- [ ] **Rate-limit `indicateActivity` command** — cap triggers to once per second to prevent DoS via `executeCommand` loop.

## 5. QA/Reliability Engineer

- [ ] **Fix activity mtime comparison** — two bugs: (a) `lastActivityMtime !== 0` guard skips first touch after file creation — set mtime when file first appears. (b) use `!==` instead of `>` to catch identical-ms timestamps.
- [ ] **Persist `previousNodeCount`/`previousEdgeCount` in globalState** — delta tracking lost on VS Code restart. Store for cross-session continuity.
- [ ] **Test `handleAction` for every action type** — refresh, setup-activity, rebuild, copy-setup, learn-more, open-graph, open-report, open-json. Verify each produces expected state mutations and user messages.
- [ ] **Test that `readGraphStats` returns `{ unchanged: true }` on cached mtime match** — core performance path. Needs a temp file with stable mtime.
- [ ] **Test that `triggerActivity` sets `activityActive` and resets after timeout** — mock timers for deterministic testing.
- [ ] **Test that `pollConfigured` detects the configured file appearing** — write temp file, call pollConfigured, assert `state.configured === true`.
- [ ] **Test `buildTooltip` output format** — verify tooltip contains health label, stale warning, god nodes, and setup prompt when unconfigured.
- [ ] **Test `copySetupCommand` generates platform-appropriate commands** — mock `process.platform`, verify clipboard receives correct command for each platform.
- [ ] **Test `sanitizeText` with `javascript:` and `data:` URIs** — verify they're stripped per 4.2.
- [ ] **Test `formatCount` with billions** — 1,500,000,000 → "1.5B".

## 6. Performance Engineer

- [ ] **Move `JSON.parse` off main thread** — 40 MB graph.json blocks UI for 100-300ms. Use `worker_threads` (built-in Node, zero deps).
- [ ] **Cache built tooltip string and recompute only on state change** — currently rebuilds arrays, joins, and sanitizes on every `updateStatusBar` call. Store the cached string and invalidate when `graphStats`, `configured`, `activityActive`, or `setupWaiting` change.
- [ ] **Reduce `isGraphStable` delay from 500ms to 200ms** — or remove entirely when cached mtime matches (per 2.2).
- [ ] **Batch `fs.statSync` calls per poll cycle** — stat all paths once, pass results down. ~5 sync stats every 5s is fine on SSDs but noticeable on HDDs.
- [ ] **Delete task: store sanitized god nodes separately** — merged into 6.2 (cached tooltip string includes god nodes).

## 7. Accessibility Specialist

- [ ] **Update `accessibilityInformation.label` on activity state change** — append `— LLM activity detected` when green glow is active.
- [ ] **Replace plain-text tooltip with `vscode.MarkdownString`** — use headings for screen reader navigation of tooltip sections.
- [ ] **Strip Codicon text from `accessibilityInformation.label`** — `$(pulse)` renders as literal text "pulse" in screen readers.
- [ ] **Add `Ctrl+Alt+G` as primary single-chord keybinding** — keep chord as documented fallback. Single chords are accessible for motor-impaired users.

## 8. DevOps/CI Engineer

- [ ] **Initialize git repository** — required for VS Code Marketplace. `git init && git add -A && git commit -m "v0.3.0: LLM-driven activity signaling, health scoring, delta tracking"`.
- [ ] **Create GitHub Actions CI workflow** — matrix: `ubuntu-latest`, `macos-latest`, `windows-latest`. Steps: `npm ci`, `npm test`, `npm run lint`.
- [ ] **Add `vscode:prepublish` step** — `node -e "require('./lib/stats')"` catches syntax errors before packaging.

## 9. Developer Experience (DX) Engineer

- [ ] **Fix `ExtensionState` typedef** — `ReturnType<typeof setTimeout>` → `number` (VS Code extension host uses stripped Node types).
- [ ] **Add `.vscode/launch.json` for F5 debugging** — include `"type": "extensionHost"` configuration.
- [ ] **Add `default` case to `handleAction` switch** — log warning when unhandled action is received.
- [ ] **Export pure UI functions for testing** — `buildTooltip`, `loadInitialStats`, `renderStatsStatus`, `copySetupCommand`. Prerequisite for 5.3-5.6.
- [ ] **Add code comment on `setInterval(() => pollStats())`** — explain why polls are fire-and-forget async and what happens if they overlap.

## 10. Technical Writer

- [ ] **Document graph change detection mechanism in README** — `onDidSaveTextDocument` (in-editor) + polling (external). Clarify that external graphify writes are detected on the next poll, not instantly.
- [ ] **Break CHANGELOG into Added/Changed/Fixed/Security sections** — per Keep a Changelog.
- [ ] **Add Windows setup commands to README** — both `touch` (Unix) and `type NUL >` (Windows) variants.
- [ ] **Document `graphify-stats.indicateActivity` command** — README should explain this is an alternative to file-touch for LLMs that can call VS Code commands.
- [ ] **Add troubleshooting section** — "Activity not triggering? Check: is `configured` file at `~/.graphify-stats/configured`? Does `.graphify-activity` exist in `graphify-out/`? Is the extension polling?"
- [ ] **Update stale specs/ and CONTRIBUTING.md** — specs describe the file-watcher architecture removed three rewrites ago.

## 11. Internationalization (i18n) Specialist

- [ ] **Add numeric fallback for health labels** — `Health 12% ambiguous` as alternative to English-only labels.
- [ ] **Replace time abbreviations with full words** — `5 min` / `3 hr` / `2 day` instead of `5m` / `3h` / `2d`.
- [ ] **Pass explicit locale to `toLocaleString()`** — use `vscode.env.language` for number formatting consistency.
- [ ] **Full `vscode.l10n.t` migration deferred to v1.0** — non-blocking for preview release.

## 12. API/Integration Engineer

- [ ] **Add optional parameters to `indicateActivity` command** — `{ command?: string, duration?: number }` for LLMs to pass metadata.
- [ ] **Create `graphify-stats` output channel** — log: poll cycle results, activity detection events, parse failures, timer lifecycle. Configurable log level via `graphify-stats.logLevel`.
- [ ] **Expose `graphify-stats.getState` command** — return current state JSON for programmatic query. Merged with diagnostic dump.

## 13. Observability/Monitoring Engineer

- [ ] **Add concrete log points** — (a) pollStats: "unchanged" / "updated N→M nodes" / "parse failed", (b) pollActivity: "mtime changed X→Y" / "owner rejected" / "not configured", (c) pollConfigured: "detected" / "removed", (d) timer lifecycle: "polls started" / "polls stopped."
- [ ] **Cap `parseErrorCount` warnings at once per session** — currently spams every 3rd failure. Track total errors separately, warn once.
- [ ] **Add watchdog timer for polling loops** — if `pollStats` hasn't completed in >30s, show `$(warning) Graphify: Polling stalled`.
- [ ] **Store `lastTriggerSource` in state** — track which mechanism triggered activity: `command`, `file-touch`, or `manual-refresh`.

## 14. Release Manager

- [ ] **Bump version to 0.3.0** — three rewrites shipped as 0.2.3. Minor bump for new features.
- [ ] **Add `"icon": "icon.png"` to package.json** — 128×128 PNG. Marketplace requirement.
- [ ] **Add 1400×560 banner image for marketplace** — `galleryBanner.color` is set but no image.
- [ ] **Change `displayName` to `GraphifyStats: Knowledge Graph Monitor`** — colon instead of em-dash for marketplace search compatibility.
- [ ] **Set `"preview": true` in package.json** — until at least one external user confirms end-to-end setup flow works.
- [ ] **Tag and sign a git release** — `git tag -s v0.3.0 -m "v0.3.0"`.

## 15. Data Scientist

- [ ] **Gate health label on edge count > 0** — zero-edge graphs show "N/A" instead of degenerate "Excellent."
- [ ] **Add qualitative density labels** — "Sparse" (<0.5), "Typical" (0.5–5.0), "Dense" (>5.0).
- [ ] **Weight god nodes by edge confidence** — EXTRACTED=1.0, INFERRED=0.5, AMBIGUOUS=0.25 instead of pure degree count.
- [ ] **Show community size distribution in QuickPick** — min/median/max community sizes, not just count.
- [ ] **Make `formatDelta` threshold proportional** — `Math.abs(diff) < Math.max(5, current * 0.05)`.
- [ ] **Add billion suffix to `formatCount`** — 1.5B nodes should show as "1.5B" not "1500.0M."
- [ ] **Track unknown confidence values** — Graphify vNext might add a 4th confidence level. Count and show as "Other" instead of silently dropping.

## 16. Setup & Onboarding Flow

- [ ] **Add "Try it now" test-glow button in QuickPick** — triggers a 30s activity glow without needing the LLM. Critical for first-run: users see the value before configuring their LLM.
- [ ] **Ship a tested LLM prompt template** — users need natural-language text to give their LLM, not just a shell command. Tested template: _"From now on, after every graphify command you run (query, explain, path, update), also execute: touch graphify-out/.graphify-activity"_. Include platform-specific variants (Claude Code, OpenCode, GPT, Gemini CLI).
- [ ] **Add "Re-show setup" always available in QuickPick when unconfigured** — setup notification fires once. If dismissed, user can't get it back. Already exists in QuickPick (verify it stays even after notification dismissed, not tied to `setupNotificationShown`).
- [ ] **Add inactivity warning after 24h** — if `.graphify-activity` hasn't been touched in >24h and extension is configured, show `$(warning)` in tooltip: "LLM may not be signaling activity. Verify setup with your LLM."
- [ ] **Show onboarding value prop in "Not found" state tooltip** — current tooltip is one line about setup. Expand: "GraphifyStats monitors your knowledge graph. When your LLM uses Graphify, the status bar glows green. Click to get started."

## 17. Edge Cases & Robustness

- [ ] **Handle `graphify-out/` as symlink** — `fs.existsSync` follows symlinks. `fs.watch` behavior on symlinks is platform-specific. Test and document on macOS, Linux, Windows.
- [ ] **Show "Empty graph" for `{"nodes":[],"links":[]}`** — "0 N · 0 E" is technically correct but unhelpful. Show "$(info) Graphify: Empty graph — run `graphify .` to build."
- [ ] **Use `mtimeMs`/`ctimeMs` fallback for `birthtimeMs`** — line 247 uses `birthtimeMs` for configured-file freshness check. `birthtimeMs` is macOS-only (`st_birthtime`). Linux uses `ctimeMs` (`st_ctime`); Windows doesn't populate either meaningfully. Cross-platform fallback: try `birthtimeMs`, fall back to `ctimeMs`, fall back to `mtimeMs`.
- [ ] **Add config migration for `activityIndicator.durationSeconds`** — default changed from 3s to 30s. Upgrading users get a 10x longer glow with no notice. Detect old value and notify.
- [ ] **Guard polling against headless/remote VS Code** — `onStartupFinished` fires in Codespaces, Remote SSH, Dev Containers. Three timers run forever polling a path that never exists. When `getGraphifyOutPath()` is null for >2 consecutive polls, suspend polling.
- [ ] **Fix activation event to `workspaceContains:graphify-out/graph.json`** — `onStartupFinished` activates for 100% of users. `workspaceContains` activates only when a project has Graphify. Keep `onStartupFinished` as fallback for late-binding of `graphify-out/` after activation.
- [ ] **Add restart-survival test** — verify `configured` survives restart, deltas survive (if persisted), setup notification doesn't re-trigger, timers reinitialize cleanly.
- [ ] **Handle empty workspace gracefully** — if user opens VS Code with no folder open, `getGraphifyOutPath()` returns null. Status bar should be hidden or show nothing. Currently shows "Not found" which implies something is wrong.
- [ ] **Test LLM prompt template with all 4 LLM platforms** — Claude, OpenCode, GPT, Gemini CLI. Each interprets instructions differently. Verify they all produce the expected `touch` behavior. If any platform fails, document the workaround.

---

## 18. Pre-Flight Checklist (precedes all tasks)

- [x] **Run existing 44 tests — all must pass before starting any task** — baseline. `npx vitest run`.
- [x] **Manually verify current VSIX installs and activates in VS Code** — install `graphify-stats-0.2.3.vsix`, verify status bar appears, verify QuickPick opens.
- [x] **Run `npm run prepackage` — verify clean build** — tests + lint must pass before any code change.

---

**Total: 89 tasks across 18 sections.**
(90 → 89 after merging 6 overlapping, removing 1 jitter task, adding 6 new test/edge-case/onboarding tasks, adding 3 pre-flight checks.)

### Priority Tiers

**P0 — blocks release (20 tasks):** Must be resolved before 0.3.0 ships. Any one of these unfixed means the extension is broken or unreleasable.

| #    | Task                                    | Why P0                                                                                                                                      |
| ---- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1  | setTimeout chain for pollStats          | Overlapping async polls corrupt state                                                                                                       |
| 2.2  | Merge isGraphStable into mtime cache    | Redundant 500ms delay on every poll — 5.5s latency per change                                                                               |
| 4.1  | Replace script-stripping regex with CSP | D3.js visualization completely broken — core feature dead                                                                                   |
| 5.1  | Fix activity mtime comparison           | First activity touch after file creation silently dropped                                                                                   |
| 6.1  | Move JSON.parse off main thread         | 40MB graph.json freezes VS Code for 100-300ms                                                                                               |
| 8.1  | Initialize git repository               | Marketplace publishing hard requirement                                                                                                     |
| 14.1 | Bump version to 0.3.0                   | Three rewrites on same version — semver violation                                                                                           |
| 14.2 | Add icon.png to package.json            | Marketplace review rejects extensions without icon                                                                                          |
| 14.5 | Set "preview": true                     | Breaking setup flow changes, experimental LLM prompt integration                                                                            |
| 16.1 | Ship tested LLM prompt template         | Entire value prop ("LLM signals activity") depends on LLM understanding the prompt. Without testing, the product doesn't work for any user. |
| 17.1 | Handle graphify-out/ as symlink         | Undefined behavior on symlinked projects — extension may silently fail                                                                      |
| 17.3 | Cross-platform birthtimeMs fallback     | `configured` detection broken on Linux and Windows                                                                                          |
| 17.5 | Guard polling against headless VS Code  | Timers leak in Codespaces/Remote/Dev Containers — battery and CPU waste                                                                     |
| 17.6 | Fix activation event                    | Extension activates for 100% of VS Code users, 99% of whom don't use Graphify                                                               |
| 17.7 | Restart-survival test                   | No verification that state survives VS Code restart                                                                                         |
| 17.8 | Empty workspace handling                | Status bar shows misleading "Not found" when no folder is open                                                                              |
| 18.1 | Existing tests pass                     | Baseline broken → can't verify any new changes                                                                                              |
| 18.2 | Manual VSIX install verification        | Current build may not activate — must verify before changing anything                                                                       |
| 18.3 | Clean prepackage build                  | Tests + lint failing → can't ship                                                                                                           |

**P1 — ship with 0.3.0 (30 tasks):** Feature-complete and polished.

| #    | Task                                   |
| ---- | -------------------------------------- |
| 1.1  | Fix tooltip keyboard shortcut text     |
| 1.2  | Replace zap with pulse, stable icon    |
| 1.3  | Show expected path in Not found        |
| 1.4  | Fix QuickPick detail overflow          |
| 3.1  | Rebuild complete confirmation          |
| 3.3  | Health score remediation guidance      |
| 4.2  | Strip URI schemes in sanitizeText      |
| 4.3  | PowerShell setup command variant       |
| 4.4  | Rate-limit indicateActivity            |
| 5.3  | Test handleAction all types            |
| 5.4  | Test readGraphStats unchanged path     |
| 5.5  | Test triggerActivity timeout           |
| 5.6  | Test pollConfigured detection          |
| 5.7  | Test buildTooltip output               |
| 5.8  | Test copySetupCommand platform         |
| 5.9  | Test sanitizeText URI stripping        |
| 5.10 | Test formatCount billions              |
| 7.1  | Accessibility label on activity change |
| 7.2  | MarkdownString tooltip                 |
| 7.3  | Strip Codicon text from label          |
| 7.4  | Single-chord keybinding                |
| 9.4  | Export pure UI functions               |
| 10.1 | Document change detection in README    |
| 10.2 | Changelog sections                     |
| 10.3 | Windows setup in README                |
| 10.5 | Troubleshooting section                |
| 12.1 | indicateActivity parameters            |
| 13.1 | Concrete log points                    |
| 15.1 | Gate health on edge count              |
| 15.6 | Billion suffix                         |
| 16.2 | Re-show setup always available         |
| 16.3 | Inactivity warning after 24h           |
| 16.5 | Onboarding value prop in Not found     |
| 17.2 | Empty graph state                      |
| 17.4 | durationSeconds migration              |
| 17.9 | LLM prompt platform testing            |

**P2 — v0.3.1 (39 tasks):** Quality-of-life, polish, deferred features.

All remaining items.

### v0.3.0 Ship Criteria

- [ ] 20 P0 tasks resolved
- [ ] 30 P1 tasks resolved (or explicitly deferred with reason)
- [ ] All 44 existing tests pass + new P0/P1 tests pass
- [ ] E2E flow manually verified on macOS
- [ ] `npm run package` succeeds with 0 warnings
- [ ] VSIX installed and activated on clean VS Code instance
- [ ] LLM prompt template tested with at least 2 platforms
- [ ] Published to VS Code Marketplace as `"preview": true`
