const BEGIN_MARKER = "<!-- graphify-stats:instructions:begin -->";
const END_MARKER = "<!-- graphify-stats:instructions:end -->";
const MANAGED_NOTE =
  "<!-- Managed by the GraphifyStats VS Code extension. Content between these markers is replaced on refresh — keep your own notes outside them. -->";

/**
 * @typedef {object} AgentAdapter
 * @property {string} id
 * @property {string} label - Short name shown in the picker.
 * @property {string} detail - Which agents read this file.
 * @property {string} relativePath - Target path relative to the workspace root.
 * @property {string|null} frontmatter - YAML frontmatter required by the format, or null for plain markdown.
 */

/**
 * Workspace rule files understood by the major VS Code coding agents. The
 * instructions themselves are identical everywhere — only the file location
 * and (for Cursor rules and Claude skills) the required frontmatter differ.
 * @type {AgentAdapter[]}
 */
const ADAPTERS = [
  {
    id: "agents-md",
    label: "AGENTS.md",
    detail: "Open standard — Codex, OpenCode, Copilot, Cursor, Amp, Jules, and many others",
    relativePath: "AGENTS.md",
    frontmatter: null,
  },
  {
    id: "claude-md",
    label: "CLAUDE.md",
    detail: "Claude Code project memory, loaded every session",
    relativePath: "CLAUDE.md",
    frontmatter: null,
  },
  {
    id: "claude-skill",
    label: "Claude Code skill",
    detail: "Loaded on demand when Claude answers architecture questions",
    relativePath: ".claude/skills/graphify/SKILL.md",
    frontmatter: [
      "---",
      "name: graphify",
      'description: Query and maintain the Graphify knowledge graph for this repo. Use when answering architecture, dependency, or "how does X work" questions, after large refactors, or when the user mentions Graphify or the knowledge graph.',
      "---",
    ].join("\n"),
  },
  {
    id: "copilot",
    label: "Copilot instructions",
    detail: "GitHub Copilot Chat and the Copilot coding agent",
    relativePath: ".github/copilot-instructions.md",
    frontmatter: null,
  },
  {
    id: "cursor",
    label: "Cursor rule",
    detail: "Cursor — applied to every conversation",
    relativePath: ".cursor/rules/graphify.mdc",
    frontmatter: [
      "---",
      "description: Graphify knowledge graph usage and activity signaling",
      "alwaysApply: true",
      "---",
    ].join("\n"),
  },
  {
    id: "gemini",
    label: "GEMINI.md",
    detail: "Gemini CLI and Gemini Code Assist",
    relativePath: "GEMINI.md",
    frontmatter: null,
  },
  {
    id: "windsurf",
    label: "Windsurf rule",
    detail: "Windsurf Cascade",
    relativePath: ".windsurf/rules/graphify.md",
    frontmatter: null,
  },
  {
    id: "cline",
    label: "Cline rule",
    detail: "Cline and Roo Code (DeepSeek, Qwen, and other models)",
    relativePath: ".clinerules/graphify.md",
    frontmatter: null,
  },
  {
    id: "continue",
    label: "Continue rule",
    detail: "Continue (DeepSeek and other open models)",
    relativePath: ".continue/rules/graphify.md",
    frontmatter: null,
  },
];

/**
 * Wrap the canonical instructions in managed-block markers.
 * @param {string} canonicalText
 * @returns {string}
 */
function renderManagedBlock(canonicalText) {
  return [BEGIN_MARKER, MANAGED_NOTE, "", canonicalText.trim(), "", END_MARKER].join("\n");
}

/**
 * Find an existing managed block in file content.
 * @param {string|null|undefined} content
 * @returns {{ begin: number, end: number } | null} - Inclusive character range of the block.
 */
function findManagedBlock(content) {
  if (typeof content !== "string") return null;
  const begin = content.indexOf(BEGIN_MARKER);
  if (begin === -1) return null;
  const endMarkerAt = content.indexOf(END_MARKER, begin);
  if (endMarkerAt === -1) return null;
  return { begin, end: endMarkerAt + END_MARKER.length };
}

/**
 * Produce the full new file content for an adapter target.
 *
 * - Existing managed block → replaced in place; everything outside it is kept.
 * - Missing or empty file → frontmatter (if the format needs it) + managed block.
 * - Existing file without a block → plain markdown files get the block prepended
 *   (matching the "prepend to AGENTS.md" convention in GraphifyLLMsetup.md);
 *   frontmatter formats get it appended so the file's own frontmatter stays first.
 *
 * @param {AgentAdapter} adapter
 * @param {string} canonicalText
 * @param {string|null|undefined} existingContent
 * @returns {string}
 */
function renderAdapterFile(adapter, canonicalText, existingContent) {
  const block = renderManagedBlock(canonicalText);

  const existing = typeof existingContent === "string" ? existingContent : "";
  const range = findManagedBlock(existing);
  if (range) {
    return existing.slice(0, range.begin) + block + existing.slice(range.end);
  }

  if (existing.trim() === "") {
    const head = adapter.frontmatter ? adapter.frontmatter + "\n\n" : "";
    return head + block + "\n";
  }

  if (adapter.frontmatter) {
    return existing.replace(/\s*$/, "\n") + "\n" + block + "\n";
  }
  return block + "\n\n" + existing;
}

module.exports = {
  ADAPTERS,
  BEGIN_MARKER,
  END_MARKER,
  renderManagedBlock,
  findManagedBlock,
  renderAdapterFile,
};
