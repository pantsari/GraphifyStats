const fs = require("fs");

const MAX_GRAPH_SIZE_BYTES = 50 * 1024 * 1024;

/**
 * @typedef {object} GraphStats
 * @property {number} nodeCount
 * @property {number} edgeCount
 * @property {number} density
 * @property {number} communityCount
 * @property {number} fileCount
 * @property {Array<{id:string, label:string, sourceFile:string, degree:number}>} godNodes
 * @property {{ EXTRACTED: number, INFERRED: number, AMBIGUOUS: number }} confidenceCounts
 * @property {number} ambiguousRatio
 * @property {Date} [lastRefreshed]
 */

/**
 * @param {string} graphPath
 * @returns {Promise<{ data: object, summary: boolean } | null>}
 */
async function safeReadGraph(graphPath) {
  let stat;
  try {
    stat = await fs.promises.stat(graphPath);
  } catch {
    return null;
  }

  if (stat.size > MAX_GRAPH_SIZE_BYTES) {
    return { data: { oversized: true, size: stat.size, mtime: stat.mtime }, summary: true };
  }

  try {
    const raw = await fs.promises.readFile(graphPath, "utf-8");
    const data = JSON.parse(raw);
    return { data, summary: false };
  } catch {
    return null;
  }
}

/**
 * @param {string} graphPath
 * @param {{ data: GraphStats|null, summary: boolean, mtime?: number }} cached
 * @returns {Promise<{ data: object, summary: boolean, unchanged: boolean, mtime?: number }>}
 */
async function readGraphStats(graphPath, cached) {
  let stat;
  try {
    stat = await fs.promises.stat(graphPath);
  } catch {
    return { data: null, summary: false, unchanged: false };
  }

  if (cached && cached.mtime === stat.mtimeMs && cached.data) {
    return { data: { ...cached.data }, summary: false, unchanged: true };
  }

  if (stat.size > MAX_GRAPH_SIZE_BYTES) {
    return {
      data: { oversized: true, size: stat.size, lastRefreshed: stat.mtime },
      summary: true,
      unchanged: false,
    };
  }

  let data;
  try {
    const raw = await fs.promises.readFile(graphPath, "utf-8");
    data = JSON.parse(raw);
  } catch {
    return { data: null, summary: false, unchanged: false };
  }

  const stats = computeGraphStats(data);
  stats.lastRefreshed = stat.mtime;

  return { data: stats, summary: false, unchanged: false, mtime: stat.mtimeMs };
}

/**
 * Compute graph stats from already-parsed JSON data.
 * @param {object} data - Parsed graph JSON
 * @returns {GraphStats}
 */
function computeGraphStats(data) {
  const nodes = data.nodes || [];
  const edges = data.links || data.edges || [];

  const communitySet = new Set();
  const fileSet = new Set();
  const degreeMap = new Map();

  for (const node of nodes) {
    if (typeof node.community === "number") communitySet.add(node.community);
    if (node.source_file) fileSet.add(node.source_file);
  }

  for (const edge of edges) {
    const srcWeight = confidenceWeight(edge.confidence);
    degreeMap.set(edge.source, (degreeMap.get(edge.source) || 0) + srcWeight);
    degreeMap.set(edge.target, (degreeMap.get(edge.target) || 0) + srcWeight);
  }

  const godNodes = [...degreeMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([nodeId, degree]) => {
      const node = nodes.find((n) => n.id === nodeId);
      return {
        id: nodeId,
        label: node ? node.label : nodeId,
        sourceFile: node ? node.source_file : null,
        degree: Math.round(degree * 10) / 10,
      };
    });

  const confidenceCounts = { EXTRACTED: 0, INFERRED: 0, AMBIGUOUS: 0, OTHER: 0 };
  for (const edge of edges) {
    if (Object.prototype.hasOwnProperty.call(confidenceCounts, edge.confidence)) {
      confidenceCounts[edge.confidence]++;
    } else {
      confidenceCounts.OTHER++;
    }
  }

  const totalConfidence =
    confidenceCounts.EXTRACTED +
    confidenceCounts.INFERRED +
    confidenceCounts.AMBIGUOUS +
    confidenceCounts.OTHER;
  const ambiguousRatio = totalConfidence > 0 ? confidenceCounts.AMBIGUOUS / totalConfidence : 0;

  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    density: nodes.length > 0 ? edges.length / nodes.length : 0,
    communityCount: communitySet.size,
    fileCount: fileSet.size,
    godNodes,
    confidenceCounts,
    ambiguousRatio,
  };
}

function confidenceWeight(confidence) {
  switch (confidence) {
    case "EXTRACTED":
      return 1.0;
    case "INFERRED":
      return 0.5;
    case "AMBIGUOUS":
      return 0.25;
    default:
      return 0.25;
  }
}

/**
 * Health label derived from ambiguous edge ratio.
 * @param {number} ratio
 * @param {number} edgeCount
 * @returns {string}
 */
function healthLabel(ratio, edgeCount) {
  if (edgeCount === 0) return "N/A";
  if (ratio < 0.1) return "Excellent";
  if (ratio < 0.2) return "Good";
  if (ratio < 0.3) return "Fair";
  return "Poor";
}

function densityLabel(density) {
  if (density === 0) return "N/A";
  if (density < 0.5) return "Sparse";
  if (density <= 5.0) return "Typical";
  return "Dense";
}

/**
 * @param {string} text
 * @returns {string}
 */
function sanitizeText(text) {
  if (typeof text !== "string") return String(text);
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$")
    .replace(/javascript\s*:/gi, "[blocked]")
    .replace(/data\s*:/gi, "[blocked]")
    .slice(0, 200);
}

function formatCount(n) {
  const safe = Math.max(0, Math.round(n));
  if (safe >= 999500000) return (safe / 1000000000).toFixed(1) + "B";
  if (safe >= 999500) return (safe / 1000000).toFixed(1) + "M";
  if (safe >= 1000) return (safe / 1000).toFixed(1) + "K";
  return String(safe);
}

/**
 * @param {number} current
 * @param {number|null|undefined} previous
 * @returns {string}
 */
function formatDelta(current, previous) {
  if (previous === null || previous === undefined) return "";
  const diff = current - previous;
  if (Math.abs(diff) < 5 && Math.abs(diff) < Math.abs(current) * 0.05) return "";
  const sign = diff > 0 ? "+" : "";
  return ` (${sign}${diff})`;
}

function getTimeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day ago`;
}

function getTimeAgoShort(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/**
 * @param {string} osType - process.platform
 * @returns {number}
 */
function getFileCreationTime(stat, osType) {
  if (osType === "darwin") return stat.birthtimeMs;
  if (osType === "linux") return stat.ctimeMs;
  return stat.mtimeMs;
}

module.exports = {
  safeReadGraph,
  readGraphStats,
  computeGraphStats,
  confidenceWeight,
  healthLabel,
  densityLabel,
  sanitizeText,
  formatCount,
  formatDelta,
  getTimeAgo,
  getTimeAgoShort,
  getFileCreationTime,
  MAX_GRAPH_SIZE_BYTES,
};
