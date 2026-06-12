const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  MAX_GRAPH_SIZE_BYTES,
  getFileCreationTime,
  readGraphStats,
  safeReadGraph,
} = require("../lib/stats.js");

describe("stats file I/O", () => {
  let tmpDir;
  let graphPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "graphify-stats-io-"));
    graphPath = path.join(tmpDir, "graph.json");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reads valid JSON through safeReadGraph", async () => {
    fs.writeFileSync(graphPath, JSON.stringify({ nodes: [], links: [] }));

    const result = await safeReadGraph(graphPath);

    expect(result).toEqual({
      data: { nodes: [], links: [] },
      summary: false,
    });
  });

  it("returns null through safeReadGraph for malformed JSON", async () => {
    fs.writeFileSync(graphPath, "{");

    expect(await safeReadGraph(graphPath)).toBeNull();
  });

  it("returns an oversized summary without reading the file", async () => {
    fs.writeFileSync(graphPath, "");
    fs.truncateSync(graphPath, MAX_GRAPH_SIZE_BYTES + 1);
    const readSpy = vi.spyOn(fs.promises, "readFile");

    const safeResult = await safeReadGraph(graphPath);
    const statsResult = await readGraphStats(graphPath, {
      data: null,
      summary: false,
      mtime: undefined,
    });

    expect(readSpy).not.toHaveBeenCalled();
    expect(safeResult.summary).toBe(true);
    expect(safeResult.data.oversized).toBe(true);
    expect(statsResult.summary).toBe(true);
    expect(statsResult.data.size).toBe(MAX_GRAPH_SIZE_BYTES + 1);
  });

  it("returns an empty result when graph.json disappears", async () => {
    const result = await readGraphStats(graphPath, {
      data: null,
      summary: false,
      mtime: undefined,
    });

    expect(result).toEqual({
      data: null,
      summary: false,
      unchanged: false,
    });
  });

  it("returns an empty result for malformed JSON", async () => {
    fs.writeFileSync(graphPath, "{invalid");

    const result = await readGraphStats(graphPath, {
      data: null,
      summary: false,
      mtime: undefined,
    });

    expect(result.data).toBeNull();
    expect(result.unchanged).toBe(false);
  });

  it("returns an empty result for a structurally invalid graph", async () => {
    fs.writeFileSync(graphPath, JSON.stringify({ nodes: {}, links: [] }));

    const result = await readGraphStats(graphPath, {
      data: null,
      summary: false,
      mtime: undefined,
    });

    expect(result.data).toBeNull();
    expect(result.summary).toBe(false);
  });

  it("attaches graph mtime to computed stats", async () => {
    fs.writeFileSync(
      graphPath,
      JSON.stringify({
        nodes: [{ id: "a", label: "A", source_file: "a.js", community: 1 }],
        links: [],
      }),
    );

    const result = await readGraphStats(graphPath, {
      data: null,
      summary: false,
      mtime: undefined,
    });

    expect(result.data.nodeCount).toBe(1);
    expect(result.data.lastRefreshed).toBeInstanceOf(Date);
    expect(result.mtime).toBeGreaterThan(0);
  });

  it("selects the platform-appropriate file creation timestamp", () => {
    const stat = { birthtimeMs: 1, ctimeMs: 2, mtimeMs: 3 };

    expect(getFileCreationTime(stat, "darwin")).toBe(1);
    expect(getFileCreationTime(stat, "linux")).toBe(2);
    expect(getFileCreationTime(stat, "win32")).toBe(3);
  });
});
