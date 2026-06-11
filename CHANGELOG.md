# Changelog

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
