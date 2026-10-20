/**
 * Unit tests for the Host fold: usage buckets, fork-prefix exclusion, titles,
 * task wall time, reasoning effort, tool/skill counting, streaks, the activity
 * calendar, and the digest.
 *
 * Run from the package root with plain Node (no dependencies):
 *   node test/fold.test.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const bundleDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-usage-board-'));
const copy = path.join(scratch, 'index-copy.mjs');
const source = fs.readFileSync(path.join(bundleDir, 'index.js'), 'utf8');
fs.writeFileSync(copy, `${source}\nexport { summarizeLog, buildReport, dayIndexOf, dateOf, digest, fallbackTitle, parseOptions, mondayOffset };\n`);

const mod = await import(pathToFileURL(copy).href);

const DAY = 86_400_000;
const HOUR = 3_600_000;
const tz = -480; // Asia/Shanghai
const now = Date.now();
const todayIndex = mod.dayIndexOf(now, tz);
const todayIso = mod.dateOf(todayIndex, tz);

const usage = (input, output, cacheRead = 0) => ({
  inputTokens: input,
  outputTokens: output,
  cacheReadTokens: cacheRead,
});

const assistant = (seq, time, tokens, model = 'deepseek-flash') => ({
  type: 'assistant/message',
  seq,
  time,
  data: { turn: 1, step: 1, usage: tokens, message: { source: { kind: 'model', provider: 'deepseek-account', model } } },
});
const user = (seq, time, text) => ({
  type: 'user/message',
  seq,
  time,
  data: { source: { kind: 'user' }, content: [{ type: 'text', text }] },
});
const title = (seq, time, text) => ({
  type: 'session/title',
  seq,
  time,
  data: { title: text, messageSeqs: [1], source: { kind: 'fallback' } },
});
const turnStart = (seq, time, turn) => ({ type: 'turn/start', seq, time, data: { turn } });
const turnEnd = (seq, time, turn) => ({ type: 'turn/end', seq, time, data: { turn, reason: { kind: 'completed' } } });
const toolCall = (seq, time, name, args = '{}') => ({
  type: 'tool/call',
  seq,
  time,
  data: { turn: 1, step: 1, callId: `call-${seq}`, name, arguments: args },
});
const requestHeader = (seq, time, effort) => ({
  type: 'request/header',
  seq,
  time,
  data: { header: { config: { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: effort } }, reason: 'initial' },
});

const dayTime = (offset, hour = 12) => todayIndex + offset;

// --- fold: usage, behaviour, wall time ---------------------------------------
const logA = {
  session: { id: 'session-a', createdAt: now - 3 * DAY },
  inheritedEventCount: 0,
  events: [
    user(0, now - 3 * DAY, '# 用户确认：开始 M1\n第二行'),
    title(1, now - 3 * DAY + 10, 'M1 开发'),
    turnStart(2, now - 2 * DAY, 1),
    requestHeader(3, now - 2 * DAY + 60_000, 'high'),
    assistant(4, now - 2 * DAY + 120_000, usage(1000, 200, 500)),
    toolCall(5, now - 2 * DAY + 130_000, 'read'),
    turnEnd(6, now - 2 * DAY + 3 * HOUR, 1),
    turnStart(7, now - 1 * DAY, 2),
    requestHeader(8, now - 1 * DAY + 60_000, 'high'),
    assistant(9, now - 1 * DAY + 90_000, usage(500, 100, 300)),
    toolCall(10, now - 1 * DAY + 95_000, 'skill', '{"name":"office"}'),
    turnEnd(11, now - 1 * DAY + 600_000, 2),
    turnStart(12, now - 30_000, 3),
    requestHeader(13, now - 20_000, 'medium'),
    assistant(14, now - 10_000, usage(300, 50, 200)),
    toolCall(15, now - 5_000, 'bash'),
    turnEnd(16, now, 3),
  ],
};

const folded = mod.summarizeLog(logA, tz);
assert.equal(folded.title, 'M1 开发', 'explicit title wins over the first message');
assert.equal(folded.days.size, 3, 'three local days folded');
assert.equal(folded.turnMaxMs, 3 * HOUR, 'longest turn measured from its boundaries');
assert.deepEqual([...folded.efforts.entries()].sort(), [['high', 2], ['medium', 1]]);
assert.equal(folded.tools.get('read'), 1);
assert.equal(folded.tools.get('bash'), 1);
assert.deepEqual([...folded.skills.entries()], [['office', 1]], 'skill call counted by its argument');
const dayInputs = [...folded.days.values()].map((day) => day.totals.input).sort((a, b) => a - b);
assert.deepEqual(dayInputs, [300, 500, 1000], 'per-day input buckets');

// --- fork inherited prefix is not counted twice -------------------------------
const logFork = {
  session: { id: 'session-fork', createdAt: now - DAY },
  inheritedEventCount: 2,
  events: [
    assistant(0, now - DAY, usage(9999, 9999)),
    toolCall(1, now - DAY, 'read'),
    assistant(2, now, usage(10, 5)),
    toolCall(3, now, 'grep'),
  ],
};
const foldedFork = mod.summarizeLog(logFork, tz);
const forkTotals = [...foldedFork.days.values()][0].totals;
assert.equal(forkTotals.input, 10, 'inherited prefix skipped');
assert.equal(forkTotals.requests, 1);
assert.equal(foldedFork.tools.get('read'), undefined, 'inherited tool call skipped');

// --- fallback title normalization --------------------------------------------
assert.equal(mod.fallbackTitle('# 标题\n正文'), '标题');
assert.equal(mod.fallbackTitle('  >   quoted   prompt  '), 'quoted prompt');

// --- report: lifetime, stats, activity, insights ------------------------------
const records = [
  { header: { id: 'session-a', createdAt: now - 3 * DAY }, live: false, persisted: true },
  { header: { id: 'session-fork', createdAt: now - DAY }, live: false, persisted: true },
  { header: { id: 'session-old', createdAt: now - 40 * DAY }, live: false, persisted: true },
  { header: { id: 'session-gap', createdAt: now - 10 * DAY }, live: false, persisted: true },
];
const logs = {
  'session-a': logA,
  'session-fork': logFork,
  'session-old': {
    session: { id: 'session-old', createdAt: now - 40 * DAY },
    inheritedEventCount: 0,
    events: [assistant(0, now - 40 * DAY, usage(77, 77))],
  },
  'session-gap': {
    session: { id: 'session-gap', createdAt: now - 10 * DAY },
    inheritedEventCount: 0,
    events: [assistant(0, now - 10 * DAY, usage(100, 100))],
  },
};
const deps = {
  query: {
    listSessions: async () => records,
    readSession: async (id) => logs[id],
  },
  persistence: undefined,
  cache: new Map(),
};
const report = await mod.buildReport(deps, { tz });

assert.equal(report.lifetime.requests, 6, 'three in A, one in the fork tail, one old, one gap');
assert.equal(report.lifetime.input, 1000 + 500 + 300 + 10 + 77 + 100);
assert.equal(report.lifetime.total, report.lifetime.input + report.lifetime.output);
assert.equal(report.stats.longestTurnMs, 3 * HOUR);
assert.equal(report.stats.activeDays, 5, 'three recent days, the gap day and the 40-day-old day');
assert.equal(report.stats.longestStreak, 3, 'today-2 .. today');
assert.equal(report.stats.currentStreak, 3);
assert.equal(report.stats.peakDay.total, 1200, 'the busiest local day wins');
assert.equal(report.stats.peakDay.date, mod.dateOf(dayTime(-2), tz));

assert.equal(report.activity.length, 53 * 7, 'activity covers a full year');
assert.equal(report.activity[0].date, mod.dateOf(todayIndex - mod.mondayOffset(todayIndex, tz) - 52 * 7, tz));
assert.equal(report.efforts[0].id, 'high');
assert.equal(report.efforts[0].requests, 2);
assert.equal(report.skills.discovered, 1);
assert.equal(report.skills.calls, 1);
assert.equal(report.tools.calls, 4);
assert.deepEqual(report.tools.top.map((row) => row.name).sort(), ['bash', 'grep', 'read', 'skill']);
assert.equal(report.models.length, 1, 'only the 30-day window reports models');
assert.equal(report.sessions.length, 3, 'A, the fork tail and the gap session are inside the window');
assert.equal(report.sessions[0].title, 'M1 开发');
assert.equal(report.detailDays, 30);
assert.equal(report.scan.sessions, 4);
assert.equal(todayIso, mod.dateOf(todayIndex, tz));

// --- digest renders without throwing ----------------------------------------
const text = mod.digest(report);
assert.match(text, /^DeepSeek Harness token usage/);
assert.match(text, /peak day/);
assert.match(text, /most used reasoning effort: high/);
assert.match(text, /skills: 1 discovered, 1 calls/);
assert.match(text, /deepseek-flash/);

// --- request options ---------------------------------------------------------
assert.deepEqual(mod.parseOptions({ url: 'http://x/api/usage.dashboard?tz=-480' }), { tz: -480, fresh: false });
assert.equal(mod.parseOptions({ url: 'http://x/api/usage.dashboard?tz=oops' }).tz, new Date().getTimezoneOffset());
assert.equal(mod.parseOptions({ url: 'http://x/api/usage.dashboard?tz=99&fresh=1' }).tz, 99);

fs.rmSync(scratch, { recursive: true, force: true });
console.log('fold tests passed');

assert.equal(report.today, todayIso, 'report marks the browser-local today');

