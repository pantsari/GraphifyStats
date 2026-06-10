# ADR 0001: Zero Runtime Dependencies

Status: Accepted
Date: 2026-06-10

## Context

The extension needs to make HTTPS requests to the GitHub API. Common
approaches include using npm packages like octokit, node-fetch, or axios.

## Options Considered

1. Third-party HTTP library (@octokit/rest, node-fetch, axios) — more
   ergonomic, but adds supply-chain risk and maintenance burden.
2. Node.js built-in `https` module (chosen) — zero runtime dependencies at the
   cost of slightly more verbose code.

## Decision

Use Node.js built-in `https` module for all HTTP requests. No runtime npm
dependencies.

## Consequences

- Zero runtime dependencies, minimizing supply-chain risk.
- API request functions are slightly more verbose.
- Dev dependencies (ESLint, Prettier, Vitest) are not bundled with the
  extension.
