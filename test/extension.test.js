const {
  computeGraphStats,
  confidenceWeight,
  formatCount,
  formatDelta,
  sanitizeText,
  safeReadGraph,
  healthLabel,
  densityLabel,
  getTimeAgo,
  getTimeAgoShort,
  getFileCreationTime,
} = require("../lib/stats.js");

describe("formatCount", () => {
  it("formats zero", () => {
    expect(formatCount(0)).toBe("0");
  });

  it("formats small numbers directly", () => {
    expect(formatCount(42)).toBe("42");
    expect(formatCount(999)).toBe("999");
  });

  it("formats thousands with K suffix", () => {
    expect(formatCount(1000)).toBe("1.0K");
    expect(formatCount(1500)).toBe("1.5K");
  });

  it("formats 999999 as 1.0M not 1000.0K", () => {
    expect(formatCount(999999)).toBe("1.0M");
  });

  it("formats millions with M suffix", () => {
    expect(formatCount(1000000)).toBe("1.0M");
    expect(formatCount(2500000)).toBe("2.5M");
  });

  it("formats billions with B suffix", () => {
    expect(formatCount(1500000000)).toBe("1.5B");
    expect(formatCount(999500000)).toBe("1.0B");
  });

  it("handles negative numbers gracefully", () => {
    expect(formatCount(-1)).toBe("0");
    expect(formatCount(-500)).toBe("0");
  });

  it("rounds fractional counts", () => {
    expect(formatCount(1499.6)).toBe("1.5K");
  });
});

describe("formatDelta", () => {
  it("returns empty string when previous is null", () => {
    expect(formatDelta(100, null)).toBe("");
  });

  it("returns empty string when previous is undefined", () => {
    expect(formatDelta(100, undefined)).toBe("");
  });

  it("returns empty for changes below min threshold", () => {
    expect(formatDelta(100, 97)).toBe("");
    expect(formatDelta(100, 103)).toBe("");
  });

  it("returns positive delta for increases >= 5", () => {
    expect(formatDelta(105, 100)).toBe(" (+5)");
  });

  it("returns negative delta for decreases >= 5", () => {
    expect(formatDelta(95, 100)).toBe(" (-5)");
  });

  it("returns empty string for no change", () => {
    expect(formatDelta(100, 100)).toBe("");
  });

  it("uses proportional threshold for small graphs", () => {
    expect(formatDelta(12, 10)).toBe(" (+2)");
    expect(formatDelta(10, 10)).toBe("");
  });
});

describe("sanitizeText", () => {
  it("passes through normal text", () => {
    expect(sanitizeText("hello")).toBe("hello");
  });

  it("strips control characters", () => {
    expect(sanitizeText("he\x00llo")).toBe("hello");
  });

  it("escapes backslashes", () => {
    expect(sanitizeText("path\\to")).toBe("path\\\\to");
  });

  it("escapes backticks", () => {
    expect(sanitizeText("`code`")).toBe("\\`code\\`");
  });

  it("truncates to 200 characters", () => {
    const long = "a".repeat(300);
    expect(sanitizeText(long).length).toBe(200);
  });

  it("converts non-strings", () => {
    expect(sanitizeText(123)).toBe("123");
    expect(sanitizeText(null)).toBe("null");
  });

  it("strips javascript: URIs", () => {
    const result = sanitizeText("javascript:alert(1)");
    expect(result).not.toContain("javascript:");
    expect(result).toContain("[blocked]");
  });

  it("strips data: URIs", () => {
    const result = sanitizeText("data:text/html,<script>");
    expect(result).not.toContain("data:");
    expect(result).toContain("[blocked]");
  });
});

describe("healthLabel", () => {
  it('returns "N/A" for zero edges', () => {
    expect(healthLabel(0, 0)).toBe("N/A");
  });

  it('returns "Excellent" for <10% ambiguous', () => {
    expect(healthLabel(0, 10)).toBe("Excellent");
    expect(healthLabel(0.05, 10)).toBe("Excellent");
  });

  it('returns "Good" for <20% ambiguous', () => {
    expect(healthLabel(0.1, 10)).toBe("Good");
    expect(healthLabel(0.15, 10)).toBe("Good");
  });

  it('returns "Fair" for <30% ambiguous', () => {
    expect(healthLabel(0.2, 10)).toBe("Fair");
    expect(healthLabel(0.25, 10)).toBe("Fair");
  });

  it('returns "Poor" for >=30% ambiguous', () => {
    expect(healthLabel(0.3, 10)).toBe("Poor");
    expect(healthLabel(0.5, 10)).toBe("Poor");
  });
});

describe("densityLabel", () => {
  it('returns "N/A" for zero density', () => {
    expect(densityLabel(0)).toBe("N/A");
  });

  it('returns "Sparse" for <0.5', () => {
    expect(densityLabel(0.3)).toBe("Sparse");
  });

  it('returns "Typical" for 0.5-5.0', () => {
    expect(densityLabel(1.0)).toBe("Typical");
    expect(densityLabel(5.0)).toBe("Typical");
  });

  it('returns "Dense" for >5.0', () => {
    expect(densityLabel(5.1)).toBe("Dense");
  });
});

describe("confidenceWeight", () => {
  it("weights EXTRACTED as 1.0", () => {
    expect(confidenceWeight("EXTRACTED")).toBe(1.0);
  });

  it("weights INFERRED as 0.5", () => {
    expect(confidenceWeight("INFERRED")).toBe(0.5);
  });

  it("weights AMBIGUOUS as 0.25", () => {
    expect(confidenceWeight("AMBIGUOUS")).toBe(0.25);
  });

  it("weights unknown as 0.25", () => {
    expect(confidenceWeight("UNKNOWN")).toBe(0.25);
  });
});

describe("getTimeAgo", () => {
  it('returns "just now" for recent timestamps', () => {
    const d = new Date(Date.now() - 30 * 1000);
    expect(getTimeAgo(d)).toBe("just now");
  });

  it("returns minutes with full word", () => {
    const d = new Date(Date.now() - 5 * 60 * 1000);
    expect(getTimeAgo(d)).toBe("5 min ago");
  });

  it("returns hours with full word", () => {
    const d = new Date(Date.now() - 3 * 3600 * 1000);
    expect(getTimeAgo(d)).toBe("3 hr ago");
  });

  it("returns days with full word", () => {
    const d = new Date(Date.now() - 2 * 86400 * 1000);
    expect(getTimeAgo(d)).toBe("2 day ago");
  });
});

describe("getTimeAgoShort", () => {
  it('returns "now" for recent timestamps', () => {
    const d = new Date(Date.now() - 30 * 1000);
    expect(getTimeAgoShort(d)).toBe("now");
  });

  it("returns minutes as Xm", () => {
    const d = new Date(Date.now() - 5 * 60 * 1000);
    expect(getTimeAgoShort(d)).toBe("5m");
  });

  it("returns hours as Xh", () => {
    const d = new Date(Date.now() - 3 * 3600 * 1000);
    expect(getTimeAgoShort(d)).toBe("3h");
  });

  it("returns days as Xd", () => {
    const d = new Date(Date.now() - 2 * 86400 * 1000);
    expect(getTimeAgoShort(d)).toBe("2d");
  });
});

describe("computeGraphStats", () => {
  it("parses node and edge counts from valid graph", () => {
    const graph = {
      nodes: [
        { id: "a", label: "Auth", source_file: "src/auth.py", community: 1 },
        { id: "b", label: "Database", source_file: "src/db.py", community: 1 },
        { id: "c", label: "Router", source_file: "src/router.py", community: 2 },
      ],
      edges: [
        { source: "a", target: "b", relation: "calls", confidence: "EXTRACTED" },
        { source: "c", target: "a", relation: "calls", confidence: "INFERRED" },
        { source: "c", target: "b", relation: "references", confidence: "AMBIGUOUS" },
      ],
    };

    const stats = computeGraphStats(graph);

    expect(stats.nodeCount).toBe(3);
    expect(stats.edgeCount).toBe(3);
    expect(stats.density).toBeCloseTo(1.0, 1);
    expect(stats.communityCount).toBe(2);
    expect(stats.fileCount).toBe(3);
    expect(stats.confidenceCounts.EXTRACTED).toBe(1);
    expect(stats.confidenceCounts.INFERRED).toBe(1);
    expect(stats.confidenceCounts.AMBIGUOUS).toBe(1);
  });

  it("reads edges from links key (actual graphify format)", () => {
    const graph = {
      nodes: [
        { id: "a", label: "Auth", source_file: "src/auth.py", community: 1 },
        { id: "b", label: "Database", source_file: "src/db.py", community: 1 },
      ],
      links: [
        { source: "a", target: "b", relation: "calls", confidence: "EXTRACTED" },
        { source: "b", target: "a", relation: "imports", confidence: "INFERRED" },
      ],
    };

    const stats = computeGraphStats(graph);

    expect(stats.nodeCount).toBe(2);
    expect(stats.edgeCount).toBe(2);
  });

  it("handles empty graph", () => {
    const stats = computeGraphStats({ nodes: [], edges: [] });

    expect(stats.nodeCount).toBe(0);
    expect(stats.edgeCount).toBe(0);
    expect(stats.density).toBe(0);
    expect(stats.communityCount).toBe(0);
    expect(stats.fileCount).toBe(0);
    expect(stats.godNodes).toEqual([]);
  });

  it("weights god nodes by edge confidence", () => {
    const graph = {
      nodes: [
        { id: "a", label: "Hub", source_file: "hub.py", community: 1 },
        { id: "b", label: "Leaf1", source_file: "leaf1.py", community: 1 },
        { id: "c", label: "Leaf2", source_file: "leaf2.py", community: 2 },
      ],
      edges: [
        { source: "a", target: "b", relation: "calls", confidence: "EXTRACTED" },
        { source: "a", target: "c", relation: "calls", confidence: "AMBIGUOUS" },
      ],
    };

    const stats = computeGraphStats(graph);

    expect(stats.godNodes).toHaveLength(3);
    expect(stats.godNodes[0].id).toBe("a");
    expect(stats.godNodes[0].degree).toBe(1.3);
  });

  it("handles missing fields gracefully", () => {
    const stats = computeGraphStats({});

    expect(stats.nodeCount).toBe(0);
    expect(stats.edgeCount).toBe(0);
    expect(stats.density).toBe(0);
  });

  it("deduplicates communities and files", () => {
    const graph = {
      nodes: [
        { id: "a", label: "A", source_file: "src/a.py", community: 1 },
        { id: "b", label: "B", source_file: "src/a.py", community: 1 },
        { id: "c", label: "C", source_file: "src/c.py", community: 2 },
      ],
      edges: [],
    };

    const stats = computeGraphStats(graph);

    expect(stats.communityCount).toBe(2);
    expect(stats.fileCount).toBe(2);
  });

  it("skips nodes without community field", () => {
    const graph = {
      nodes: [
        { id: "a", label: "A", source_file: "a.py", community: 1 },
        { id: "b", label: "B", source_file: "b.py" },
      ],
      edges: [],
    };

    const stats = computeGraphStats(graph);

    expect(stats.communityCount).toBe(1);
  });

  it("counts unknown confidence as OTHER", () => {
    const graph = {
      nodes: [],
      edges: [{ source: "a", target: "b", relation: "uses", confidence: "UNKNOWN_KIND" }],
    };

    const stats = computeGraphStats(graph);

    expect(stats.confidenceCounts.EXTRACTED).toBe(0);
    expect(stats.confidenceCounts.INFERRED).toBe(0);
    expect(stats.confidenceCounts.AMBIGUOUS).toBe(0);
    expect(stats.confidenceCounts.OTHER).toBe(1);
  });

  it("computes ambiguous ratio", () => {
    const graph = {
      nodes: [],
      edges: [
        { source: "a", target: "b", relation: "uses", confidence: "AMBIGUOUS" },
        { source: "b", target: "c", relation: "uses", confidence: "AMBIGUOUS" },
        { source: "c", target: "d", relation: "uses", confidence: "EXTRACTED" },
      ],
    };

    const stats = computeGraphStats(graph);

    expect(stats.ambiguousRatio).toBeCloseTo(2 / 3, 2);
  });
});

describe("safeReadGraph", () => {
  it("returns null for missing file", async () => {
    const result = await safeReadGraph("/nonexistent/path/graph.json");
    expect(result).toBeNull();
  });
});

describe("getFileCreationTime", () => {
  it("is a function", () => {
    expect(typeof getFileCreationTime).toBe("function");
  });
});

describe("Extension — module exports", () => {
  it("exports all public functions", () => {
    const mod = require("../extension.js");
    expect(typeof mod.activate).toBe("function");
    expect(typeof mod.deactivate).toBe("function");
    expect(typeof mod.getGraphPath).toBe("function");
    expect(typeof mod.getGraphifyOutPath).toBe("function");
    expect(typeof mod.triggerActivity).toBe("function");
    expect(typeof mod.pollActivity).toBe("function");
    expect(typeof mod.pollConfigured).toBe("function");
    expect(typeof mod.updateStatusBar).toBe("function");
    expect(typeof mod.showQuickPick).toBe("function");
    expect(typeof mod.copySetupCommand).toBe("function");
    expect(typeof mod.LLM_PROMPT_TEMPLATE).toBe("string");
  });
});

describe("getGraphifyOutPath", () => {
  it("returns null when no workspace folder", () => {
    const { getGraphifyOutPath } = require("../extension.js");
    expect(getGraphifyOutPath()).toBeNull();
  });
});

describe("pollActivity", () => {
  it("does not throw when called", () => {
    const { pollActivity } = require("../extension.js");
    expect(() => pollActivity()).not.toThrow();
  });
});
