/**
 * Host half of the usage dashboard bundle.
 *
 * The profile page's numbers are folded out of the durable session logs:
 * `assistant/message` carries the provider's `TokenUsage`, `tool/call`
 * carries the tool name (and the `skill` tool's own argument),
 * `request/header` carries the reasoning effort, and the turn boundaries give
 * task wall time. One pass over a log therefore yields usage, activity,
 * streaks, tool/skill counts, and the longest task.
 *
 * Days are bucketed by the *browser's* local calendar (the caller passes its
 * `Date#getTimezoneOffset`), cached per session against
 * `sessionPersistence.stat()` revisions, and served on one authenticated
 * Fetch route under the shared `/api` channel. The `usage_board_report` tool
 * reads the same report.
 *
 * The name, handle and portrait above the numbers are not baked into the
 * bundle: they live in `$DSH_HOME/usage-board/profile.json`, are read on every
 * report, and are written back by the page's own editor through a second
 * route. A fresh install therefore shows a neutral header instead of anyone
 * else's identity.
 *
 * @module
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Absolute registration path; the browser addresses it document-relative as `api/codex-usage.dashboard`. */
const ROUTE = '/api/codex-usage.dashboard';
/** Absolute registration path of the profile editor's write endpoint. */
const PROFILE_ROUTE = '/api/codex-usage.profile';
/** Longest accepted name or handle, in characters. */
const PROFILE_TEXT_LIMIT = 48;
/** Largest accepted portrait, in decoded bytes. */
const AVATAR_LIMIT = 256 * 1024;
/** Largest accepted profile request body, in bytes. */
const PROFILE_BODY_LIMIT = 512 * 1024;
/** Accepted portrait data URLs; anything else is refused rather than stored. */
const AVATAR_PATTERN = /^data:image\/(?:png|jpeg|webp|gif|svg\+xml);base64,([A-Za-z0-9+/]+={0,2})$/;
/** Milliseconds in one local calendar day. */
const DAY = 86_400_000;
/** Activity heatmap width in weeks (one full calendar year plus the current week). */
const ACTIVITY_WEEKS = 53;
/** Detail panels cover this many recent days. */
const DETAIL_DAYS = 30;
/** Newest-first sessions read on one report; older ones are reported as truncated. */
const SCAN_LIMIT = 500;
/** Logs read concurrently during a scan. */
const CONCURRENCY = 6;
/** A composed report younger than this is reused. */
const REPORT_TTL_MS = 15_000;
/** Per-session summary cache entries kept before the fold cache resets. */
const CACHE_LIMIT = 4000;

/** Numeric accumulator fields, in one place so every merge stays complete. */
const TOTAL_FIELDS = ['requests', 'input', 'output', 'cacheRead', 'cacheWrite', 'reasoning'];

/** Host plugin name, matching the bundle row id. */
export const name = 'codex-usage-board';
/** The route needs the shared `/api` channel owned by Connection. */
export const inject = ['connection'];

/** @returns {{ name: string, handle: string, avatar: string | null }} the neutral header of a fresh install. */
export function emptyProfile() {
  return { name: '', handle: '', avatar: null };
}

/**
 * The directory this bundle owns under the Harness home.
 * @returns {string} absolute path.
 */
function profileDir() {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh');
  return join(home, 'usage-board');
}

/** @returns {string} absolute path of the saved profile. */
function profilePath() {
  return join(profileDir(), 'profile.json');
}

/**
 * Read one text field, trimmed and bounded.
 * @param {unknown} value - candidate value.
 * @param {string} label - field name for the refusal message.
 * @param {string[]} errors - collector for refusals.
 * @returns {string} the cleaned text, or an empty string.
 */
function profileText(value, label, errors) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    errors.push(`${label} must be text`);
    return '';
  }
  const text = value.trim();
  if (text.length > PROFILE_TEXT_LIMIT) {
    errors.push(`${label} must be at most ${String(PROFILE_TEXT_LIMIT)} characters`);
    return text.slice(0, PROFILE_TEXT_LIMIT);
  }
  return text;
}

/**
 * Validate a submitted profile before anything is stored.
 *
 * The editor sends all three fields on every save, so this is a replacement
 * rather than a merge: an absent field clears that part of the header. An
 * empty name is allowed and renders as the localized default; portraits are
 * restricted to base64 image data URLs within `AVATAR_LIMIT`.
 * @param {unknown} input - parsed request body.
 * @returns {{ ok: true, profile: { name: string, handle: string, avatar: string | null } }
 *   | { ok: false, errors: string[] }} the stored shape, or every refusal.
 */
export function sanitizeProfile(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['body must be a JSON object'] };
  }
  const errors = [];
  const name = profileText(input.name, 'name', errors);
  let handle = profileText(input.handle, 'handle', errors);
  if (handle.length > 0 && !handle.startsWith('@')) handle = `@${handle.slice(0, PROFILE_TEXT_LIMIT - 1)}`;
  let avatar = null;
  const rawAvatar = input.avatar;
  if (typeof rawAvatar === 'string' && rawAvatar.length > 0) {
    const match = AVATAR_PATTERN.exec(rawAvatar);
    if (match === null) {
      errors.push('avatar must be a base64 PNG, JPEG, WebP, GIF or SVG data URL');
    } else {
      const padding = match[1].endsWith('==') ? 2 : match[1].endsWith('=') ? 1 : 0;
      const bytes = Math.floor((match[1].length * 3) / 4) - padding;
      if (bytes > AVATAR_LIMIT) errors.push(`avatar must not exceed ${String(AVATAR_LIMIT / 1024)} KiB`);
      else avatar = rawAvatar;
    }
  } else if (rawAvatar !== undefined && rawAvatar !== null && rawAvatar !== '') {
    errors.push('avatar must be text');
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, profile: { name, handle, avatar } };
}

/**
 * Read the saved profile, falling back to the neutral header when the file is
 * absent or unreadable: a broken profile must never blank the dashboard.
 * @returns {Promise<{ name: string, handle: string, avatar: string | null }>} the profile.
 */
export async function readProfile() {
  try {
    const text = await readFile(profilePath(), 'utf8');
    const parsed = sanitizeProfile(JSON.parse(text));
    return parsed.ok ? parsed.profile : emptyProfile();
  } catch {
    return emptyProfile();
  }
}

/**
 * Store one profile atomically, so a crashed write cannot truncate the file.
 * @param {{ name: string, handle: string, avatar: string | null }} profile - validated profile.
 * @returns {Promise<{ name: string, handle: string, avatar: string | null }>} the saved profile.
 */
export async function writeProfile(profile) {
  const dir = profileDir();
  await mkdir(dir, { recursive: true });
  const target = profilePath();
  const temporary = `${target}.${String(process.pid)}.tmp`;
  await writeFile(temporary, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');
  await rename(temporary, target);
  return profile;
}

/** @returns {Record<string, number>} a zeroed usage accumulator. */
function emptyTotals() {
  return { requests: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 };
}

/**
 * Add one accumulator into another in place.
 * @param {Record<string, number>} target - accumulator that receives the values.
 * @param {Record<string, number>} source - accumulator to add.
 * @returns {Record<string, number>} `target`.
 */
function addTotals(target, source) {
  for (const field of TOTAL_FIELDS) target[field] += Number(source[field]) || 0;
  return target;
}

/**
 * Count one provider usage report.
 * @param {Record<string, number>} target - accumulator for the request and its tokens.
 * @param {object} usage - provider `TokenUsage`.
 * @returns {Record<string, number>} `target`.
 */
function addUsage(target, usage) {
  target.requests += 1;
  target.input += Number(usage.inputTokens) || 0;
  target.output += Number(usage.outputTokens) || 0;
  target.cacheRead += Number(usage.cacheReadTokens) || 0;
  target.cacheWrite += Number(usage.cacheWriteTokens) || 0;
  target.reasoning += Number(usage.reasoningTokens) || 0;
  return target;
}

/**
 * Add one to a string-keyed counter.
 * @param {Map<string, number>} counters - counter map.
 * @param {string} key - counted value.
 * @returns {void}
 */
function bump(counters, key) {
  counters.set(key, (counters.get(key) ?? 0) + 1);
}

/**
 * Read the plain text of one message, whichever shape the log stored.
 * @param {unknown} message - message or message data.
 * @returns {string | undefined} normalized text, or undefined when absent.
 */
function textOf(message) {
  if (typeof message === 'string') return message.trim() || undefined;
  if (message === null || typeof message !== 'object') return undefined;
  const content = message.content;
  if (typeof content === 'string') return content.trim() || undefined;
  if (!Array.isArray(content)) return undefined;
  const parts = [];
  for (const block of content) {
    if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text);
    }
  }
  const text = parts.join(' ').replace(/\s+/g, ' ').trim();
  return text.length > 0 ? text : undefined;
}

/**
 * Derive a readable fallback title from the first human message.
 *
 * Older logs without a `session/title` event still need a label; markdown
 * markers and the rest of a multi-line prompt would only add noise.
 * @param {string} text - first user message text.
 * @returns {string} one short line.
 */
function fallbackTitle(text) {
  const line = text.split('\n').find((candidate) => candidate.trim().length > 0) ?? text;
  return line.replace(/^[#>\-*\s]+/, '').replace(/\s+/g, ' ').trim().slice(0, 72);
}

/**
 * Local calendar-day index for one instant.
 * @param {number} time - epoch milliseconds.
 * @param {number} tz - `Date#getTimezoneOffset()` of the consumer, in minutes.
 * @returns {number} day index.
 */
function dayIndexOf(time, tz) {
  return Math.floor((Number(time) - tz * 60_000) / DAY);
}

/**
 * Calendar date for one local day index.
 * @param {number} index - local day index.
 * @param {number} tz - `Date#getTimezoneOffset()` of the consumer, in minutes.
 * @returns {string} `YYYY-MM-DD`.
 */
function dateOf(index, tz) {
  return new Date(index * DAY + tz * 60_000).toISOString().slice(0, 10);
}

/**
 * Read the skill name out of one `skill` tool call, when its arguments parse.
 * @param {unknown} argumentsText - raw JSON argument text from the log.
 * @returns {string | undefined} the requested skill name.
 */
function skillNameOf(argumentsText) {
  if (typeof argumentsText !== 'string' || argumentsText.length === 0) return undefined;
  try {
    const parsed = JSON.parse(argumentsText);
    const name = parsed?.name ?? parsed?.skill;
    return typeof name === 'string' && name.length > 0 ? name : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Fold one complete session log into usage, activity, and behaviour buckets.
 *
 * The inherited prefix of a fork or seeded session is skipped: those events
 * belong to the parent log and would otherwise be counted twice.
 * @param {object} snapshot - `SessionLogSnapshot` from `sessionQuery.readSession`.
 * @param {number} tz - `Date#getTimezoneOffset()` of the consumer, in minutes.
 * @returns {object} compact session summary.
 */
function summarizeLog(snapshot, tz) {
  const inherited = Number(snapshot.inheritedEventCount) || 0;
  const header = snapshot.session;
  const summary = {
    id: String(header.id),
    title: '',
    createdAt: Number(header.createdAt) || 0,
    updatedAt: Number(header.createdAt) || 0,
    days: new Map(),
    turnMaxMs: 0,
    efforts: new Map(),
    tools: new Map(),
    skills: new Map(),
  };
  const openTurns = new Map();
  let title;
  let firstUserText;
  for (const event of snapshot.events) {
    if ((Number(event.seq) || 0) < inherited) continue;
    const data = event.data;
    switch (event.type) {
      case 'session/title': {
        if (data !== null && typeof data === 'object' && typeof data.title === 'string') title = data.title;
        break;
      }
      case 'user/message': {
        if (firstUserText === undefined) firstUserText = textOf(data) ?? textOf(data?.message);
        break;
      }
      case 'turn/start': {
        const turn = Number(data?.turn);
        if (Number.isFinite(turn)) openTurns.set(turn, Number(event.time) || 0);
        break;
      }
      case 'turn/end': {
        const turn = Number(data?.turn);
        const start = openTurns.get(turn);
        if (start !== undefined) {
          openTurns.delete(turn);
          const duration = Math.max(0, (Number(event.time) || start) - start);
          if (duration > summary.turnMaxMs) summary.turnMaxMs = duration;
        }
        break;
      }
      case 'request/header': {
        const effort = data?.header?.config?.reasoningEffort;
        if (typeof effort === 'string' && effort.length > 0) bump(summary.efforts, effort);
        break;
      }
      case 'tool/call': {
        const tool = typeof data?.name === 'string' && data.name.length > 0 ? data.name : 'unknown';
        bump(summary.tools, tool);
        if (tool === 'skill') bump(summary.skills, skillNameOf(data?.arguments) ?? 'unknown');
        break;
      }
      case 'assistant/message': {
        if (data === null || typeof data !== 'object') break;
        const usage = data.usage;
        if (usage === null || typeof usage !== 'object') break;
        const source = data.message?.source;
        const provider = typeof source?.provider === 'string' ? source.provider : 'unknown';
        const model = typeof source?.model === 'string' ? source.model : 'unknown';
        const time = Number(event.time) || summary.updatedAt;
        if (time > summary.updatedAt) summary.updatedAt = time;
        const index = dayIndexOf(time, tz);
        let day = summary.days.get(index);
        if (day === undefined) {
          day = { totals: emptyTotals(), models: new Map() };
          summary.days.set(index, day);
        }
        addUsage(day.totals, usage);
        const key = `${provider}\u0000${model}`;
        let modelBucket = day.models.get(key);
        if (modelBucket === undefined) {
          modelBucket = { key, provider, model, totals: emptyTotals() };
          day.models.set(key, modelBucket);
        }
        addUsage(modelBucket.totals, usage);
        break;
      }
      default:
        break;
    }
  }
  summary.title = title ?? (firstUserText === undefined ? '' : fallbackTitle(firstUserText));
  return summary;
}

/**
 * Run one worker over items with a bounded number in flight.
 * @param {readonly unknown[]} items - work items.
 * @param {number} limit - maximum concurrent workers.
 * @param {(item: unknown, index: number) => Promise<unknown>} worker - per-item task.
 * @returns {Promise<unknown[]>} results in input order.
 */
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = [];
  const width = Math.min(limit, items.length);
  for (let i = 0; i < width; i += 1) {
    runners.push((async () => {
      for (;;) {
        const index = next;
        next += 1;
        if (index >= items.length) return;
        results[index] = await worker(items[index], index);
      }
    })());
  }
  await Promise.all(runners);
  return results;
}

/**
 * Load one session's summary, reusing the cached copy while its log revision holds.
 * @param {{ query: object, persistence: object | undefined, cache: Map<string, object> }} deps - composed services and the fold cache.
 * @param {object} record - `SessionRecord` from `sessionQuery.listSessions`.
 * @param {number} tz - consumer timezone offset in minutes.
 * @returns {Promise<object>} session summary.
 */
async function loadSummary(deps, record, tz) {
  const id = String(record.header.id);
  const key = `${tz}|${id}`;
  let revision;
  if (record.live !== true && deps.persistence !== undefined) {
    try {
      const stat = await deps.persistence.stat(id);
      revision = stat === undefined ? 'absent' : String(stat.revision);
    } catch {
      revision = undefined;
    }
  }
  const cached = deps.cache.get(key);
  if (cached !== undefined && revision !== undefined && cached.revision === revision) return cached.summary;
  const snapshot = await deps.query.readSession(id);
  const summary = summarizeLog(snapshot, tz);
  if (revision !== undefined) {
    if (deps.cache.size >= CACHE_LIMIT) deps.cache.clear();
    deps.cache.set(key, { revision, summary });
  }
  return summary;
}

/**
 * Weekday of one local day index, with Monday as 0.
 * @param {number} index - local day index.
 * @param {number} tz - consumer timezone offset in minutes.
 * @returns {number} 0 for Monday through 6 for Sunday.
 */
function mondayOffset(index, tz) {
  const sundayFirst = new Date(index * DAY + tz * 60_000).getUTCDay();
  return (sundayFirst + 6) % 7;
}

/**
 * Compose one profile report over the whole local session corpus.
 * @param {{ query: object, persistence: object | undefined, cache: Map<string, object> }} deps - composed services and the fold cache.
 * @param {{ tz: number }} options - consumer timezone.
 * @returns {Promise<object>} the report payload.
 */
async function buildReport(deps, options) {
  const tz = options.tz;
  const now = Date.now();
  const todayIndex = dayIndexOf(now, tz);
  const detailFrom = todayIndex - (DETAIL_DAYS - 1);
  const records = await deps.query.listSessions();
  const candidates = records.slice(0, SCAN_LIMIT);
  const summaries = await mapLimit(candidates, CONCURRENCY, async (record) => {
    try {
      return await loadSummary(deps, record, tz);
    } catch {
      /* one unreadable or migrating log must not fail the whole dashboard */
      return undefined;
    }
  });

  const lifetime = emptyTotals();
  const dayTotals = new Map();
  const modelTotals = new Map();
  const detailSessions = [];
  const efforts = new Map();
  const tools = new Map();
  const skills = new Map();
  let longestTurnMs = 0;
  let failed = 0;

  for (const summary of summaries) {
    if (summary === undefined) {
      failed += 1;
      continue;
    }
    if (summary.turnMaxMs > longestTurnMs) longestTurnMs = summary.turnMaxMs;
    for (const [name, count] of summary.efforts) efforts.set(name, (efforts.get(name) ?? 0) + count);
    for (const [name, count] of summary.tools) tools.set(name, (tools.get(name) ?? 0) + count);
    for (const [name, count] of summary.skills) skills.set(name, (skills.get(name) ?? 0) + count);
    const detailTotals = emptyTotals();
    for (const [index, bucket] of summary.days) {
      addTotals(lifetime, bucket.totals);
      let day = dayTotals.get(index);
      if (day === undefined) {
        day = emptyTotals();
        dayTotals.set(index, day);
      }
      addTotals(day, bucket.totals);
      if (index < detailFrom || index > todayIndex) continue;
      addTotals(detailTotals, bucket.totals);
      for (const model of bucket.models.values()) {
        let modelBucket = modelTotals.get(model.key);
        if (modelBucket === undefined) {
          modelBucket = { key: model.key, provider: model.provider, model: model.model, totals: emptyTotals() };
          modelTotals.set(model.key, modelBucket);
        }
        addTotals(modelBucket.totals, model.totals);
      }
    }
    if (detailTotals.requests === 0) continue;
    detailSessions.push({ id: summary.id, title: summary.title || summary.id, updatedAt: summary.updatedAt, totals: detailTotals });
  }

  const activeDays = [...dayTotals.entries()]
    .filter(([, totals]) => totals.requests > 0)
    .map(([index]) => index)
    .sort((a, b) => a - b);
  let longestStreak = 0;
  let run = 0;
  let previous;
  for (const index of activeDays) {
    run = previous !== undefined && index === previous + 1 ? run + 1 : 1;
    if (run > longestStreak) longestStreak = run;
    previous = index;
  }
  let currentStreak = 0;
  let cursor = activeDays.includes(todayIndex) ? todayIndex : todayIndex - 1;
  while ((dayTotals.get(cursor)?.requests ?? 0) > 0) {
    currentStreak += 1;
    cursor -= 1;
  }
  let peak = { date: dateOf(todayIndex, tz), total: 0, requests: 0 };
  for (const [index, totals] of dayTotals) {
    const total = totals.input + totals.output;
    if (total > peak.total) peak = { date: dateOf(index, tz), total, requests: totals.requests };
  }

  const weeks = ACTIVITY_WEEKS;
  const lastWeekStart = todayIndex - mondayOffset(todayIndex, tz);
  const firstWeekStart = lastWeekStart - (weeks - 1) * 7;
  const activity = [];
  for (let i = 0; i < weeks * 7; i += 1) {
    const index = firstWeekStart + i;
    const totals = dayTotals.get(index);
    activity.push({
      date: dateOf(index, tz),
      total: totals === undefined ? 0 : totals.input + totals.output,
      requests: totals === undefined ? 0 : totals.requests,
    });
  }

  const effortRows = [...efforts.entries()]
    .map(([id, requests]) => ({ id, requests }))
    .sort((a, b) => b.requests - a.requests);
  const toolRows = [...tools.entries()]
    .map(([name, calls]) => ({ name, calls }))
    .sort((a, b) => b.calls - a.calls);
  const skillRows = [...skills.entries()]
    .map(([name, calls]) => ({ name, calls }))
    .sort((a, b) => b.calls - a.calls);

  const models = [...modelTotals.values()]
    .map((bucket) => ({
      provider: bucket.provider,
      model: bucket.model,
      requests: bucket.totals.requests,
      input: bucket.totals.input,
      output: bucket.totals.output,
      cacheRead: bucket.totals.cacheRead,
      total: bucket.totals.input + bucket.totals.output,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);
  const sessions = detailSessions
    .map((row) => ({
      id: row.id,
      title: row.title,
      updatedAt: row.updatedAt,
      requests: row.totals.requests,
      input: row.totals.input,
      output: row.totals.output,
      cacheRead: row.totals.cacheRead,
      total: row.totals.input + row.totals.output,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  return {
    generatedAt: now,
    activityWeeks: weeks,
    detailDays: DETAIL_DAYS,
    today: dateOf(todayIndex, tz),
    lifetime: { ...lifetime, total: lifetime.input + lifetime.output },
    stats: {
      peakDay: peak,
      longestTurnMs,
      longestStreak,
      currentStreak,
      activeDays: activeDays.length,
    },
    activity,
    efforts: effortRows,
    skills: { discovered: skillRows.length, calls: skillRows.reduce((sum, row) => sum + row.calls, 0), top: skillRows.slice(0, 8) },
    tools: { calls: toolRows.reduce((sum, row) => sum + row.calls, 0), top: toolRows.slice(0, 6) },
    models,
    sessions,
    scan: {
      sessions: records.length,
      scanned: candidates.length,
      failed,
      truncated: records.length > candidates.length,
    },
  };
}

/**
 * Resolve the consumer timezone of one request.
 * @param {Request} request - incoming fetch request.
 * @returns {{ tz: number, fresh: boolean }} parsed options.
 */
function parseOptions(request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get('tz');
  const parsed = raw === null ? Number.NaN : Number(raw);
  const tz = Number.isFinite(parsed) ? Math.max(-840, Math.min(840, Math.trunc(parsed))) : new Date().getTimezoneOffset();
  return { tz, fresh: url.searchParams.get('fresh') === '1' };
}

/**
 * Serve one report, reusing a composed one inside the short TTL.
 * @param {object} ctx - Host context.
 * @param {object} state - route-owned caches.
 * @param {{ tz: number, fresh: boolean }} options - parsed request options.
 * @returns {Promise<object>} the report payload.
 */
async function readReport(ctx, state, options) {
  const query = ctx.get('sessionQuery');
  if (query === undefined) throw new Error('session query is unavailable');
  const key = String(options.tz);
  if (!options.fresh) {
    const hit = state.reports.get(key);
    if (hit !== undefined && Date.now() - hit.at < REPORT_TTL_MS) return hit.value;
  }
  let pending = state.inflight.get(key);
  if (pending === undefined) {
    const deps = { query, persistence: ctx.get('sessionPersistence'), cache: state.summaries };
    pending = buildReport(deps, options);
    state.inflight.set(key, pending);
    pending.then(
      () => { if (state.inflight.get(key) === pending) state.inflight.delete(key); },
      () => { if (state.inflight.get(key) === pending) state.inflight.delete(key); },
    );
  }
  const value = await pending;
  state.reports.set(key, { at: Date.now(), value });
  return value;
}

/**
 * One JSON response with no caching.
 * @param {unknown} value - JSON-serializable body.
 * @param {number} status - HTTP status.
 * @returns {Response} the response.
 */
function jsonResponse(value, status) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/**
 * Short digest the agent reads from the `usage_board_report` tool.
 * @param {object} report - report payload.
 * @returns {string} plain text.
 */
function digest(report) {
  const lines = [];
  const tokens = (value) => {
    const n = Number(value) || 0;
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
    return String(n);
  };
  const hours = (ms) => (ms / 3_600_000).toFixed(1);
  const lifetime = report.lifetime;
  const share = lifetime.cacheRead + lifetime.input > 0
    ? Math.round((lifetime.cacheRead / (lifetime.cacheRead + lifetime.input)) * 100)
    : 0;
  lines.push('DeepSeek Harness token usage (all local sessions):');
  lines.push(`total ${tokens(lifetime.total)} (input ${tokens(lifetime.input)} / output ${tokens(lifetime.output)}), ${lifetime.requests} requests, cache hit ${share}%`);
  lines.push(`peak day ${tokens(report.stats.peakDay.total)} (${report.stats.peakDay.date}), longest task ${hours(report.stats.longestTurnMs)}h, streaks ${report.stats.currentStreak}d current / ${report.stats.longestStreak}d longest over ${report.stats.activeDays} active days`);
  if (report.efforts.length > 0) {
    const top = report.efforts[0];
    const total = report.efforts.reduce((sum, row) => sum + row.requests, 0);
    lines.push(`most used reasoning effort: ${top.id} (${Math.round((top.requests / Math.max(1, total)) * 100)}%)`);
  }
  lines.push(`tools: ${report.tools.calls} calls, top ${report.tools.top.slice(0, 5).map((row) => `${row.name} ${row.calls}`).join(', ')}`);
  lines.push(`skills: ${report.skills.discovered} discovered, ${report.skills.calls} calls`);
  if (report.models.length > 0) {
    lines.push(`models (${report.detailDays}d): ${report.models.map((row) => `${row.model} ${tokens(row.total)}`).join(', ')}`);
  }
  lines.push(`scanned ${report.scan.scanned} of ${report.scan.sessions} sessions${report.scan.truncated ? ' (older sessions not scanned)' : ''}`);
  return lines.join('\n');
}

/**
 * Register the read-only `usage_board_report` tool on the same aggregation.
 * @param {object} ctx - Host context.
 * @param {object} state - route-owned caches.
 * @returns {void}
 */
function registerTool(ctx, state) {
  const tools = ctx.get('tools');
  if (tools === undefined) return;
  ctx.effect(() => tools.register({
    name: 'usage_board_report',
    description: 'Report this machine\'s DeepSeek Harness usage profile from the local session logs: lifetime tokens, peak day, longest task, streaks, reasoning effort, tool and skill counts, per-model detail.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => [{ type: 'text', text: typeof value?.digest === 'string' ? value.digest : 'usage report' }],
    },
    async execute() {
      const report = await readReport(ctx, state, { tz: new Date().getTimezoneOffset(), fresh: true });
      return { ...report, digest: digest(report) };
    },
  }), 'codex-usage-board: usage_board_report tool');
}

/**
 * Read one JSON request body, refusing anything larger than the profile limit.
 * @param {Request} request - incoming request.
 * @returns {Promise<unknown>} the parsed body.
 */
async function readJsonBody(request) {
  const text = await request.text();
  if (text.length > PROFILE_BODY_LIMIT) throw new Error(`body must not exceed ${String(PROFILE_BODY_LIMIT)} bytes`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('body must be JSON');
  }
}

/**
 * Serve the report with the current header profile beside it.
 * @param {object} ctx - Host context.
 * @param {object} state - route-owned caches.
 * @param {{ tz: number, fresh: boolean }} options - parsed request options.
 * @returns {Promise<object>} the report payload.
 */
async function serveReport(ctx, state, options) {
  const report = await readReport(ctx, state, options);
  return { ...report, profile: await readProfile() };
}

/**
 * Register the authenticated dashboard route, the profile editor's endpoint,
 * and the reporting tool.
 * @param {object} ctx - Host context carrying Connection.
 * @returns {void}
 */
export function apply(ctx) {
  const state = { summaries: new Map(), reports: new Map(), inflight: new Map() };
  ctx.effect(() => ctx.connection.fetch.register({
    path: ROUTE,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async (request) => {
      const options = parseOptions(request);
      try {
        return jsonResponse(await serveReport(ctx, state, options), 200);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonResponse({ error: message }, 500);
      }
    },
  }), 'codex-usage-board: fetch route');
  ctx.effect(() => ctx.connection.fetch.register({
    path: PROFILE_ROUTE,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      let input;
      try {
        input = await readJsonBody(request);
      } catch (error) {
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 400);
      }
      const checked = sanitizeProfile(input);
      if (!checked.ok) return jsonResponse({ error: checked.errors.join('; '), errors: checked.errors }, 400);
      try {
        const profile = await writeProfile(checked.profile);
        return jsonResponse({ profile }, 200);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonResponse({ error: message }, 500);
      }
    },
  }), 'codex-usage-board: profile route');
  registerTool(ctx, state);
}
