const ACTIVITY_EVENT_VERSION = 1;
const RUNNING_STALE_MS = 10 * 60 * 1000;
const ACTIVITY_JSON_MAX_BYTES = 16 * 1024;
const ACTIVITY_HISTORY_MAX = 5;
const REFRESH_HISTORY_MAX = 3;
const DUPLICATE_SIGNAL_WINDOW_MS = 5000;

/**
 * @typedef {object} ActivityEvent
 * @property {"start"|"done"|"error"} status
 * @property {string|null} command
 * @property {string|null} agent
 * @property {number|null} startedAt - epoch ms
 * @property {number|null} completedAt - epoch ms
 */

/**
 * Parse and validate one `.graphify-activity.json` payload (schema v1).
 * Agents overwrite the file with a single JSON object per phase:
 *   {"v":1,"status":"start","command":"graphify update .","agent":"claude-code","startedAt":"<ISO8601>"}
 *   {"v":1,"status":"done", ... ,"completedAt":"<ISO8601>"}
 * Returns null for anything malformed, unversioned, or from a future schema.
 * @param {string} raw
 * @returns {ActivityEvent|null}
 */
function parseActivityEvent(raw) {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > ACTIVITY_JSON_MAX_BYTES) {
    return null;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  if (data.v !== ACTIVITY_EVENT_VERSION) return null;
  if (data.status !== "start" && data.status !== "done" && data.status !== "error") return null;

  return {
    status: data.status,
    command: typeof data.command === "string" ? data.command.slice(0, 200) : null,
    agent: typeof data.agent === "string" ? data.agent.slice(0, 80) : null,
    startedAt: toEpochMs(data.startedAt),
    completedAt: toEpochMs(data.completedAt),
  };
}

function toEpochMs(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Record an activity event into a most-recent-first history list.
 *
 * Two kinds of duplicate are collapsed so one Graphify command shows up as
 * one use:
 * - a "done"/"error" event merges into the matching "start" entry at the head
 *   (same source, command, and agent);
 * - agents that follow both protocols touch `.graphify-activity` and write
 *   the JSON event within moments of each other — the richer JSON entry wins
 *   and the bare touch is dropped.
 *
 * @param {Array<object>} history - mutated in place, most recent first
 * @param {{ ts: number, status: string, source: string, command: string|null, agent: string|null }} entry
 * @returns {Array<object>} the same list, trimmed to ACTIVITY_HISTORY_MAX
 */
function recordActivityEntry(history, entry) {
  const head = history[0];
  if (head && Math.abs(entry.ts - head.ts) < DUPLICATE_SIGNAL_WINDOW_MS) {
    if (entry.source === "file-touch" && head.source === "json") return history;
    if (entry.source === "json" && head.source === "file-touch") history.shift();
  }

  const current = history[0];
  if (
    entry.status !== "start" &&
    current &&
    current.status === "start" &&
    current.source === entry.source &&
    current.command === entry.command &&
    current.agent === entry.agent
  ) {
    current.status = entry.status;
    current.ts = entry.ts;
  } else {
    history.unshift(entry);
    if (history.length > ACTIVITY_HISTORY_MAX) history.length = ACTIVITY_HISTORY_MAX;
  }
  return history;
}

/**
 * Record a graph.json refresh timestamp, deduped against the latest entry.
 * @param {number[]} history - mutated in place, most recent first
 * @param {number} mtimeMs
 * @returns {number[]} the same list, trimmed to REFRESH_HISTORY_MAX
 */
function recordRefreshEntry(history, mtimeMs) {
  if (typeof mtimeMs !== "number" || !Number.isFinite(mtimeMs)) return history;
  if (history[0] === mtimeMs) return history;
  history.unshift(mtimeMs);
  if (history.length > REFRESH_HISTORY_MAX) history.length = REFRESH_HISTORY_MAX;
  return history;
}

module.exports = {
  ACTIVITY_EVENT_VERSION,
  RUNNING_STALE_MS,
  ACTIVITY_JSON_MAX_BYTES,
  ACTIVITY_HISTORY_MAX,
  REFRESH_HISTORY_MAX,
  parseActivityEvent,
  recordActivityEntry,
  recordRefreshEntry,
};
