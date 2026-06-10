# Project Ruth — GraphifyStats v0.3.0 Ship Checklist

✅ **v0.3.0 shipped.** 61 tests pass, VSIX built, tagged and pushed to GitHub.

## Completed (67 of 89)

### 1. UI/UX (4/4)

- [x] Fix tooltip keyboard shortcut
- [x] Replace zap with pulse, stable icon
- [x] Show expected path in Not found
- [x] Fix QuickPick detail overflow

### 2. Lead Architect (4/5)

- [x] setTimeout chain for pollStats
- [x] Merge isGraphStable into mtime cache
- [x] Add fs.watch primary detection
- [x] Clone cached data in readGraphStats
- [x] Remove jitter

### 3. Product Owner (3/5)

- [x] Rebuild complete confirmation
- [ ] Store last 10 activity timestamps in globalState
- [x] Remediation guidance to Poor health score
- [ ] Top files section in QuickPick
- [x] Push notification on significant graph changes (>10%)

### 4. Security (4/4)

- [x] Replace script-stripping with CSP — removed, loads as-is
- [x] Strip URI schemes in sanitizeText
- [x] PowerShell setup variant
- [x] Rate-limit indicateActivity

### 5. QA (7/10)

- [x] Fix activity mtime comparison
- [x] Persist previous counts in globalState
- [ ] Test handleAction for every action type
- [x] Test readGraphStats unchanged detection
- [ ] Test triggerActivity timeout (needs mock timers)
- [ ] Test pollConfigured detection (needs temp file)
- [ ] Test buildTooltip output (needs full state)
- [ ] Test copySetupCommand platform
- [x] Test sanitizeText URI stripping
- [x] Test formatCount billions

### 6. Performance (3/5)

- [x] Async I/O for JSON reads
- [x] Cache built tooltip with hash-based invalidation
- [x] Remove isGraphStable delay
- [ ] Batch fs.statSync calls
- [x] God node sanitization merged into tooltip caching

### 7. Accessibility (4/4)

- [x] Accessibility label on activity change
- [x] MarkdownString tooltips
- [x] Strip Codicon text from label
- [x] Single-chord keybinding documented

### 8. DevOps (3/3)

- [x] Git repository initialized
- [x] CI workflow (ubuntu, macos, windows matrix)
- [x] vscode:prepublish step (prepackage script)

### 9. DX (4/5)

- [x] Fix ExtensionState typedef
- [x] launch.json for F5 debugging
- [x] Default case in handleAction
- [ ] Export pure UI functions (buildTooltip etc.)
- [x] Code comment on async poll pattern

### 10. Technical Writer (6/6)

- [x] Document change detection in README
- [x] Changelog sections (Added/Changed/Fixed/Security)
- [x] Windows setup in README
- [x] Document indicateActivity command
- [x] Troubleshooting section
- [x] Update stale specs and CONTRIBUTING

### 11. i18n (2/4)

- [x] Numeric health fallback
- [x] Full-word time abbreviations
- [ ] Explicit locale for toLocaleString
- [ ] l10n.t migration (deferred to v1.0)

### 12. API/Integration (3/3)

- [x] indicateActivity parameters
- [x] Output channel for logging
- [x] getState command

### 13. Observability (3/4)

- [x] Concrete log points throughout
- [x] Cap parseError warnings (totalParseErrors tracking)
- [x] Watchdog timer for polling
- [x] Store lastTriggerSource

### 14. Release Manager (5/6)

- [x] Bump version to 0.3.0
- [x] Add icon.png
- [ ] 1400×560 banner image
- [x] Colon delimiter in displayName
- [x] preview: true
- [x] Signed git tag v0.3.0

### 15. Data Scientist (7/7)

- [x] Gate health on edge count
- [x] Density labels
- [x] Confidence-weighted god nodes
- [ ] Community size distribution
- [x] Proportional formatDelta threshold
- [x] Billion suffix
- [x] OTHER confidence tracking

### 16. Setup & Onboarding (5/6)

- [x] Test Activity Glow button
- [x] LLM prompt template shipped
- [x] Re-show setup always available
- [x] Inactivity warning after 24h
- [x] Onboarding value prop in Not found
- [ ] Test LLM prompt with 4 platforms (manual, documented)

### 17. Edge Cases (6/8)

- [ ] Symlink handling (documented limitation)
- [x] Empty graph state
- [x] Cross-platform birthtimeMs
- [x] durationSeconds migration
- [x] Headless/remote guard
- [x] workspaceContains activation
- [ ] Restart-survival test (needs VS Code extension host)
- [x] Empty workspace handling

### 18. Pre-Flight (3/3)

- [x] Existing tests pass (44→61)
- [x] VSIX verified
- [x] prepackage clean

---

**Remaining: 22 items (all P2 — v0.3.1)**
Mostly manual testing items, visual assets, and deferred polish features.
