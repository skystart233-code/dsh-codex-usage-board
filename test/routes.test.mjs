/**
 * Route-level tests for the Host half: both Fetch routes register where the
 * Client calls them, the report carries the saved profile, a valid save is
 * stored atomically, and every refused shape answers 400 instead of 500.
 *
 * Run from the package root with plain Node (no dependencies):
 *   node test/routes.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const bundleDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-codex-usage-board-routes-'));
process.env.DSH_HOME = scratch;

const mod = await import(pathToFileURL(path.join(bundleDir, 'index.js')).href);

const routes = new Map();
const tools = [];
const ctx = {
  connection: {
    fetch: {
      register: (route) => {
        assert.equal(routes.has(route.path), false, `${route.path} is registered once`);
        routes.set(route.path, route);
        return () => {};
      },
    },
  },
  effect: (callback) => {
    const dispose = callback();
    return typeof dispose === 'function' ? dispose : () => {};
  },
  get: (service) => {
    if (service === 'sessionQuery') {
      return { listSessions: async () => [], readSession: async () => undefined };
    }
    if (service === 'tools') return { register: (tool) => { tools.push(tool); return () => {}; } };
    return undefined;
  },
};

mod.apply(ctx);

// --- registration ------------------------------------------------------------
assert.deepEqual([...routes.keys()].sort(), ['/api/codex-usage.dashboard', '/api/codex-usage.profile']);
assert.deepEqual(routes.get('/api/codex-usage.dashboard').methods, ['GET']);
assert.deepEqual(routes.get('/api/codex-usage.profile').methods, ['POST']);
assert.equal(tools.length, 1, 'one read-only tool is registered');
assert.equal(tools[0].name, 'usage_board_report');

const dashboard = routes.get('/api/codex-usage.dashboard').fetch;
const profileRoute = routes.get('/api/codex-usage.profile').fetch;
const get = (query = '') => dashboard(new Request(`http://127.0.0.1/api/codex-usage.dashboard${query}`));
const post = (body) => profileRoute(new Request('http://127.0.0.1/api/codex-usage.profile', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
}));

// --- report with the neutral default -----------------------------------------
const empty = await get('?tz=-480&fresh=1');
assert.equal(empty.status, 200);
const emptyBody = await empty.json();
assert.equal(emptyBody.lifetime.requests, 0);
assert.equal(emptyBody.activity.length, 53 * 7);
assert.deepEqual(emptyBody.profile, { name: '', handle: '', avatar: null }, 'a fresh install has no identity');

// --- a valid save is read back ----------------------------------------------
const saved = await post({ name: 'Ava', handle: 'ava' });
assert.equal(saved.status, 200);
assert.deepEqual((await saved.json()).profile, { name: 'Ava', handle: '@ava', avatar: null });
assert.ok(fs.existsSync(path.join(scratch, 'usage-board', 'profile.json')), 'the profile is stored under $DSH_HOME');

const after = await (await get('?tz=-480&fresh=1')).json();
assert.equal(after.profile.name, 'Ava', 'the next report carries the saved profile');

// --- refusals answer 400 -----------------------------------------------------
const badMime = await post({ name: 'Ava', avatar: 'data:text/html;base64,AAAA' });
assert.equal(badMime.status, 400);
assert.match((await badMime.json()).error, /base64 PNG/);

const notJson = await post('not json');
assert.equal(notJson.status, 400);
assert.match((await notJson.json()).error, /must be JSON/);

const notObject = await post(['Ava']);
assert.equal(notObject.status, 400);
assert.match((await notObject.json()).error, /JSON object/);

const oversized = await post({ name: 'Ava', avatar: `data:image/png;base64,${'A'.repeat(400_000)}` });
assert.equal(oversized.status, 400);
assert.match((await oversized.json()).error, /256 KiB/);

// --- clearing the header -----------------------------------------------------
const cleared = await post({ name: '', handle: '', avatar: null });
assert.equal(cleared.status, 200);
assert.deepEqual((await cleared.json()).profile, { name: '', handle: '', avatar: null });
assert.deepEqual((await (await get('?tz=-480&fresh=1')).json()).profile, { name: '', handle: '', avatar: null });

fs.rmSync(scratch, { recursive: true, force: true });
console.log('route tests passed');
