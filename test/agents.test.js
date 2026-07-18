const fs = require("fs");
const os = require("os");
const path = require("path");
const vscode = require("vscode");
const {
  ADAPTERS,
  BEGIN_MARKER,
  END_MARKER,
  renderManagedBlock,
  findManagedBlock,
  renderAdapterFile,
} = require("../lib/agents.js");

const CANONICAL = "# Graphify Agent Instructions\n\nTouch the activity file before every command.";

function adapterById(id) {
  const adapter = ADAPTERS.find((a) => a.id === id);
  if (!adapter) throw new Error(`missing adapter ${id}`);
  return adapter;
}

describe("agent adapter catalog", () => {
  it("has unique ids and target paths", () => {
    const ids = ADAPTERS.map((a) => a.id);
    const paths = ADAPTERS.map((a) => a.relativePath);
    expect(new Set(ids).size).toBe(ADAPTERS.length);
    expect(new Set(paths).size).toBe(ADAPTERS.length);
  });

  it("covers the AGENTS.md open standard plus vendor-native rule files", () => {
    const paths = ADAPTERS.map((a) => a.relativePath);
    expect(paths).toContain("AGENTS.md");
    expect(paths).toContain("CLAUDE.md");
    expect(paths).toContain(".github/copilot-instructions.md");
    expect(paths).toContain(".cursor/rules/graphify.mdc");
    expect(paths).toContain("GEMINI.md");
  });

  it("gives the Claude skill and Cursor rule the frontmatter their formats require", () => {
    expect(adapterById("claude-skill").frontmatter).toContain("name: graphify");
    expect(adapterById("claude-skill").frontmatter).toContain("description:");
    expect(adapterById("cursor").frontmatter).toContain("alwaysApply: true");
  });
});

describe("renderManagedBlock / findManagedBlock", () => {
  it("wraps the canonical text in begin/end markers", () => {
    const block = renderManagedBlock(CANONICAL);
    expect(block.startsWith(BEGIN_MARKER)).toBe(true);
    expect(block.endsWith(END_MARKER)).toBe(true);
    expect(block).toContain(CANONICAL);
  });

  it("locates an existing block and returns null when absent", () => {
    const block = renderManagedBlock(CANONICAL);
    const content = "before\n" + block + "\nafter";
    const range = findManagedBlock(content);
    expect(content.slice(range.begin, range.end)).toBe(block);
    expect(findManagedBlock("no markers here")).toBeNull();
    expect(findManagedBlock(null)).toBeNull();
    expect(findManagedBlock(END_MARKER + "\n" + BEGIN_MARKER)).toBeNull();
  });
});

describe("renderAdapterFile", () => {
  it("creates a plain markdown file from scratch", () => {
    const out = renderAdapterFile(adapterById("agents-md"), CANONICAL, null);
    expect(out.startsWith(BEGIN_MARKER)).toBe(true);
    expect(out.endsWith(END_MARKER + "\n")).toBe(true);
    expect(out).toContain(CANONICAL);
  });

  it("creates frontmatter formats with frontmatter first", () => {
    const out = renderAdapterFile(adapterById("cursor"), CANONICAL, "");
    expect(out.startsWith("---\n")).toBe(true);
    expect(out.indexOf("alwaysApply: true")).toBeLessThan(out.indexOf(BEGIN_MARKER));
  });

  it("prepends to an existing plain markdown file, keeping its content", () => {
    const existing = "# My project rules\n\nKeep functions short.\n";
    const out = renderAdapterFile(adapterById("claude-md"), CANONICAL, existing);
    expect(out.startsWith(BEGIN_MARKER)).toBe(true);
    expect(out.endsWith(existing)).toBe(true);
  });

  it("appends to an existing frontmatter file without markers, keeping its frontmatter first", () => {
    const existing = "---\ndescription: my own rule\n---\n\nOwn content.\n";
    const out = renderAdapterFile(adapterById("cursor"), CANONICAL, existing);
    expect(out.startsWith("---\ndescription: my own rule")).toBe(true);
    expect(out).toContain(BEGIN_MARKER);
    expect(out.indexOf("Own content.")).toBeLessThan(out.indexOf(BEGIN_MARKER));
  });

  it("refreshes an existing managed block in place and is idempotent", () => {
    const adapter = adapterById("agents-md");
    const original = renderAdapterFile(adapter, "old instructions v1", null);
    const withUserContent = original + "\n## My own section\n\nHand-written notes.\n";

    const refreshed = renderAdapterFile(adapter, CANONICAL, withUserContent);
    expect(refreshed).toContain(CANONICAL);
    expect(refreshed).not.toContain("old instructions v1");
    expect(refreshed).toContain("Hand-written notes.");
    expect(refreshed.match(new RegExp(BEGIN_MARKER, "g")).length).toBe(1);

    const refreshedAgain = renderAdapterFile(adapter, CANONICAL, refreshed);
    expect(refreshedAgain).toBe(refreshed);
  });
});

describe("installAgentInstructions command", () => {
  let mod;
  let workspaceRoot;

  beforeEach(() => {
    mod = require("../extension.js");
    mod._initForTesting();
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "graphify-agents-"));
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: workspaceRoot } }];
  });

  afterEach(async () => {
    mod.deactivate();
    vi.restoreAllMocks();
    vscode.workspace.workspaceFolders = null;
    await fs.promises.rm(workspaceRoot, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  });

  it("writes the selected adapter files, creating nested directories", async () => {
    vi.spyOn(vscode.window, "showQuickPick").mockImplementation((items) =>
      Promise.resolve(items.filter((item) => ["AGENTS.md", "Cursor rule"].includes(item.label))),
    );

    await mod.installAgentInstructions();

    const agentsMd = fs.readFileSync(path.join(workspaceRoot, "AGENTS.md"), "utf-8");
    expect(agentsMd).toContain(BEGIN_MARKER);
    expect(agentsMd).toContain("Graphify Agent Instructions");

    const cursorRule = fs.readFileSync(
      path.join(workspaceRoot, ".cursor", "rules", "graphify.mdc"),
      "utf-8",
    );
    expect(cursorRule.startsWith("---\n")).toBe(true);
    expect(cursorRule).toContain(BEGIN_MARKER);
  });

  it("tells agents to keep graphify-out/ out of git", async () => {
    vi.spyOn(vscode.window, "showQuickPick").mockImplementation((items) =>
      Promise.resolve(items.filter((item) => item.label === "AGENTS.md")),
    );

    await mod.installAgentInstructions();

    const agentsMd = fs.readFileSync(path.join(workspaceRoot, "AGENTS.md"), "utf-8");
    expect(agentsMd).toContain(".gitignore");
  });

  it("preserves user content outside the managed block on re-run", async () => {
    vi.spyOn(vscode.window, "showQuickPick").mockImplementation((items) =>
      Promise.resolve(items.filter((item) => item.label === "AGENTS.md")),
    );

    await mod.installAgentInstructions();
    const agentsPath = path.join(workspaceRoot, "AGENTS.md");
    fs.appendFileSync(agentsPath, "\n## Team conventions\n\nUse tabs. Just kidding.\n");
    const afterEdit = fs.readFileSync(agentsPath, "utf-8");

    await mod.installAgentInstructions();
    const afterRefresh = fs.readFileSync(agentsPath, "utf-8");
    expect(afterRefresh).toBe(afterEdit);
    expect(afterRefresh).toContain("Use tabs. Just kidding.");
    expect(afterRefresh.match(new RegExp(BEGIN_MARKER, "g")).length).toBe(1);
  });

  it("pre-selects files that already exist for refresh", async () => {
    fs.writeFileSync(path.join(workspaceRoot, "CLAUDE.md"), "# Existing\n");
    let captured;
    vi.spyOn(vscode.window, "showQuickPick").mockImplementation((items) => {
      captured = items;
      return Promise.resolve(undefined);
    });

    await mod.installAgentInstructions();

    const byLabel = Object.fromEntries(captured.map((item) => [item.label, item]));
    expect(byLabel["AGENTS.md"].picked).toBe(true);
    expect(byLabel["CLAUDE.md"].picked).toBe(true);
    expect(byLabel["GEMINI.md"].picked).toBe(false);
    expect(fs.existsSync(path.join(workspaceRoot, "GEMINI.md"))).toBe(false);
  });

  it("warns and writes nothing without a workspace", async () => {
    vscode.workspace.workspaceFolders = null;
    mod._initForTesting();
    const warn = vi.spyOn(vscode.window, "showWarningMessage");
    const pick = vi.spyOn(vscode.window, "showQuickPick");

    await mod.installAgentInstructions();

    expect(warn).toHaveBeenCalled();
    expect(pick).not.toHaveBeenCalled();
  });
});
