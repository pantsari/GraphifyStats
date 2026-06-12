# Cross-LLM Compatibility Improvements

Date: 2026-06-12
Status: largely implemented (2026-06-12) —

- Item 1 (adapters): `graphify-stats.installAgentInstructions` generates
  marker-managed rule files from `GraphifyLLMsetup.md` (see `lib/agents.js`).
- Item 3 (versioned event file): `.graphify-activity.json` v1 with
  status/command/agent/startedAt/completedAt (see `lib/activity.js`).
- Item 4 (multi-root): graph-bearing folder selection across all workspace folders.
- Item 5 (FileSystemWatcher): preferred watcher with `fs.watch` fallback.
- Item 7 (running state): spinner while a command runs, history afterward.

Items 2 (wrapper command, belongs upstream in the Graphify CLI) and 6
(extension-host integration tests) remain open.

## Conclusion

A single vendor-specific "skill" cannot currently work unchanged across Codex,
Claude Code, Copilot, Cursor, Gemini, DeepSeek clients, and other VS Code agents.
Their instruction discovery and skill formats differ.

The portable layer should instead be a small, tool-neutral protocol:

1. Before every Graphify command, update `graphify-out/.graphify-activity`.
2. Run the normal Graphify CLI command.
3. Keep `GraphifyLLMsetup.md` as the canonical human- and machine-readable source.
4. Generate thin provider adapters from that canonical source.

Every terminal-capable agent can follow this protocol, and agents with VS Code
command access can use `graphify-stats.indicateActivity` instead of touching the
file.

## Recommended Adapters

- `AGENTS.md` for Codex, OpenCode, and agents that honor the shared convention.
- `.claude/skills/graphify/SKILL.md` or `CLAUDE.md` for Claude Code.
- `.github/copilot-instructions.md` for GitHub Copilot.
- `.cursor/rules/graphify.mdc` for Cursor.
- `GEMINI.md` for Gemini CLI.
- A plain prompt snippet for clients without workspace instruction discovery.

These should be generated or synchronized from `GraphifyLLMsetup.md` to prevent
the instructions from drifting.

## Product Improvements

1. Add a command that writes or refreshes the provider adapters selected by the
   user while preserving existing project instructions.
2. Add a tiny cross-platform wrapper command that signals activity and then
   invokes Graphify. This reduces reliance on prompt compliance.
3. Move from a timestamp-only marker to a versioned JSON event file containing
   `startedAt`, `completedAt`, `command`, and an optional agent label. Keep the
   current touch file as the backward-compatible baseline.
4. Support all workspace folders instead of only the active or first folder.
5. Prefer VS Code's `FileSystemWatcher` API for remote and virtual workspaces,
   with Node `fs.watch` as the local fallback.
6. Add VS Code extension-host integration tests in addition to the fast mocked
   unit suite.
7. Surface a clear "Graphify is still running" state and a separate completion
   state when the richer activity protocol is available.

## Design Constraint

Provider adapters should contain instructions only. Core monitoring must remain
file- and command-based, with no dependency on private APIs from a specific LLM
vendor. That preserves compatibility with new agents without requiring an
extension release for each one.
