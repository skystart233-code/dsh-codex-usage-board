/**
 * Render smoke tests for the Client half: the editable profile header, the
 * stat strip, the activity calendar, tool chips, insights, detail rows, and
 * the empty state. Catches a crashing slot entry, which would otherwise blank
 * the whole Settings section.
 *
 * Needs React; from the package root:
 *   npm install --no-save react@18 react-dom@18
 *   node test/render.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const bundleDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(bundleDir, 'client.js'), 'utf8');

const DAY = 86_400_000;
const today = new Date();
const dayIso = (offset) => new Date(today.getTime() + offset * DAY).toISOString().slice(0, 10);
const activity = [];
for (let i = -181; i <= 0; i += 1) {
  activity.push({ date: dayIso(i), total: i > -20 ? (i + 20) * 12_000 : 0, requests: i > -20 ? i + 20 : 0 });
}

const sample = {
  generatedAt: Date.now(),
  activityWeeks: 26,
  detailDays: 30,
  profile: { name: 'Ava Chen', handle: '@ava', avatar: 'data:image/png;base64,iVBORw0KGgo=' },
  lifetime: { requests: 735, input: 1_220_000, output: 958_500, cacheRead: 120_000_000, cacheWrite: 0, reasoning: 0, total: 2_178_500 },
  stats: {
    peakDay: { date: '2026-10-17', total: 450_000, requests: 200 },
    longestTurnMs: 42 * 3_600_000 + 15 * 60_000,
    longestStreak: 34,
    currentStreak: 14,
    activeDays: 28,
  },
  activity,
  efforts: [{ id: 'xhigh', requests: 41 }, { id: 'high', requests: 59 }],
  skills: { discovered: 35, calls: 276, top: [] },
  tools: { calls: 1234, top: [{ name: 'bash', calls: 400 }, { name: 'read', calls: 300 }] },
  models: [{ provider: 'deepseek-account', model: 'deepseek-flash', requests: 735, total: 2_178_500 }],
  sessions: [{ id: 's1', title: '同步 Codex 能力到 DSH', requests: 112, total: 433_300 }],
  scan: { sessions: 16, scanned: 16, failed: 0, truncated: false },
};

/**
 * Evaluate one client-module variant and return the component it registers.
 * @param {string} text - module source.
 * @param {Record<string, unknown>} [extra] - extra globals for the module's VM context.
 * @returns {{ Component: Function, options: object }} captured registration.
 */
function loadModule(text, extra = {}) {
  let registration;
  const window = {
    __ModuleLoader__: {
      load(definition) {
        registration = definition.factory((name) => {
          if (name === 'react') return React;
          throw new Error(`unexpected require: ${name}`);
        });
      },
    },
  };
  const sandbox = {
    window,
    document: { baseURI: 'http://127.0.0.1:60586/' },
    URL,
    Date,
    Math,
    Intl,
    console,
    AbortController,
    FileReader: class {
      readAsDataURL() {
        throw new Error('the render test never reads a file');
      }
    },
    fetch: () => Promise.reject(new Error('network disabled in the render test')),
    setTimeout,
    clearTimeout,
    ...extra,
  };
  vm.runInNewContext(text, sandbox, { filename: 'client.js' });
  assert.ok(registration !== undefined, 'module registered through __ModuleLoader__');
  assert.equal(registration.inject.join(','), 'slots,locale');
  const ctx = {
    effect: (callback) => {
      const dispose = callback();
      return typeof dispose === 'function' ? dispose : () => {};
    },
    locale: {
      register: () => () => {},
      bind: () => (key) => key,
    },
    slots: {
      inject: (_key, callback) => callback(),
      register: (options, Component) => {
        registration.options = options;
        registration.Component = Component;
        return () => {};
      },
    },
  };
  registration.apply(ctx);
  assert.equal(registration.options.name, 'settings.section');
  assert.equal(registration.options.id, 'codex-usage');
  assert.equal(registration.options.order, 25);
  return registration;
}

// --- initial (loading) render: neutral header, no baked-in identity ----------
const loadingModule = loadModule(source);
const loadingMarkup = renderToStaticMarkup(React.createElement(loadingModule.Component, { t: (key) => key }));
assert.match(loadingMarkup, /dshUsage-root/);
assert.match(loadingMarkup, /Your usage/, 'a fresh install shows the neutral default name');
assert.match(loadingMarkup, /dshUsage-avatarMark/, 'no portrait falls back to a monogram');
assert.match(loadingMarkup, /class="dshUsage-avatarWrap"/, 'the portrait is a button');
assert.match(loadingMarkup, /dshUsage-avatarBadge/, 'the portrait advertises the change mark');
assert.match(loadingMarkup, /class="dshUsage-name dshUsage-line dshUsage-lineEmpty"/, 'an empty name opens into a field');
assert.match(loadingMarkup, /Hover the portrait to change it/, 'the hint explains the inline editing');
assert.match(loadingMarkup, /type="file"/, 'a file picker is present');
assert.doesNotMatch(loadingMarkup, /data:image\/jpeg;base64/, 'no portrait is embedded in the bundle');
assert.match(loadingMarkup, /Reading session logs…/, 'loading state renders');
assert.match(loadingMarkup, /\.dshUsage-heat\{/, 'stylesheet travels with the tree');

// --- loaded render -----------------------------------------------------------
const readySource = source.replace(
  "useState({ status: 'loading', data: undefined, error: '' })",
  "useState({ status: 'ready', data: globalThis.__USAGE_SAMPLE__, error: '' })",
);
assert.ok(readySource !== source, 'ready-state patch applied');
const readyModule = loadModule(readySource, { __USAGE_SAMPLE__: sample });
const readyMarkup = renderToStaticMarkup(React.createElement(readyModule.Component, { t: (key) => key }));

assert.doesNotMatch(readyMarkup, /Reading session logs/);
assert.match(readyMarkup, /class="dshUsage-name dshUsage-line"[^>]*>Ava Chen</, 'the saved name renders as an editable line');
assert.match(readyMarkup, /class="dshUsage-handle dshUsage-line"[^>]*>@ava</, 'the saved handle renders as an editable line');
assert.match(readyMarkup, /src="data:image\/png;base64,iVBORw0KGgo="/, 'the saved portrait renders');
const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
assert.ok(readyMarkup.includes(`>${compact.format(2_178_500)}<`), 'lifetime total uses the compact format');
assert.match(readyMarkup, />42h 15m</, 'longest task duration');
assert.match(readyMarkup, />34d</, 'longest streak');
assert.match(readyMarkup, />14d</, 'current streak');
assert.match(readyMarkup, /Token activity/);
assert.match(readyMarkup, /Daily/, 'metric switcher');
assert.match(readyMarkup, /Very high · 41%/, 'top reasoning effort');
assert.match(readyMarkup, />35</, 'skills explored');
assert.match(readyMarkup, />276</, 'skill calls');
assert.match(readyMarkup, />1234</, 'tool calls');
assert.match(readyMarkup, /class="dshUsage-chipMark"[^>]*>ba</, 'tool chip initials');
assert.match(readyMarkup, /deepseek-flash/, 'model detail row');
assert.match(readyMarkup, /同步 Codex 能力到 DSH/, 'session detail row');
assert.match(readyMarkup, /Scanned 16 of 16 sessions/, 'footer');

const cells = readyMarkup.match(/class="dshUsage-cell"/g) ?? [];
assert.equal(cells.length, 182, 'one cell per activity day');
const levels = new Set((readyMarkup.match(/data-level="(\d)"/g) ?? []));
assert.ok(levels.size >= 4, 'heatmap uses several intensity levels');

// --- empty render ------------------------------------------------------------
const emptyModule = loadModule(readySource, {
  __USAGE_SAMPLE__: {
    ...sample,
    lifetime: { requests: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, total: 0 },
    stats: { peakDay: { date: dayIso(0), total: 0, requests: 0 }, longestTurnMs: 0, longestStreak: 0, currentStreak: 0, activeDays: 0 },
    activity: [],
  },
});
const emptyMarkup = renderToStaticMarkup(React.createElement(emptyModule.Component, { t: (key) => key }));
assert.match(emptyMarkup, /No token usage recorded yet\./, 'empty state renders');
assert.doesNotMatch(emptyMarkup, /Token activity/);

console.log('render tests passed');
