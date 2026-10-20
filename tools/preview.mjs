/**
 * Preview renderer for the README screenshots.
 *
 * Server-renders the real Settings page with the real bundle and sample data,
 * then writes standalone HTML files a headless browser screenshots. It needs
 * React but is not part of the published package:
 *   npm install --no-save react@18 react-dom@18
 *   node tools/preview.mjs
 *   chrome --headless=new --window-size=920,1250 --screenshot=docs/preview.png docs/preview.html
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const source = fs.readFileSync(path.join(root, 'client.js'), 'utf8');

const DAY = 86_400_000;
const today = new Date();
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const start = today.getTime() - (371 - 1) * DAY;
const activity = [];
for (let i = 0; i < 371; i += 1) {
  const date = iso(start + i * DAY);
  const weekday = new Date(start + i * DAY).getUTCDay();
  const weekend = weekday === 0 || weekday === 6;
  const wave = Math.sin(i / 6) * 0.5 + 0.5;
  const recent = i > 330 ? 1.3 : 1;
  const base = weekend ? 0.16 : 0.55 + wave * 0.55;
  const total = Math.round((base * recent * 96_000) / 1000) * 1000;
  activity.push({ date, total: total < 12_000 ? 0 : total, requests: Math.round(total / 9_000) });
}

const sample = {
  generatedAt: Date.now(),
  detailDays: 30,
  profile: { name: '我的用量', handle: '@local-user', avatar: null },
  lifetime: { requests: 4_182, input: 21_640_000, output: 6_320_000, cacheRead: 180_400_000, cacheWrite: 0, reasoning: 0, total: 27_960_000 },
  stats: {
    peakDay: { date: iso(today.getTime() - 12 * DAY), total: 1_284_000, requests: 186 },
    longestTurnMs: 3 * 3_600_000 + 42 * 60_000,
    longestStreak: 46,
    currentStreak: 12,
    activeDays: 218,
  },
  activity,
  efforts: [{ id: 'xhigh', requests: 41 }, { id: 'high', requests: 33 }, { id: 'medium', requests: 26 }],
  skills: { discovered: 38, calls: 291, top: [] },
  tools: {
    calls: 5_214,
    top: [
      { name: 'bash', calls: 1_486 },
      { name: 'read', calls: 1_204 },
      { name: 'edit', calls: 842 },
      { name: 'grep', calls: 615 },
      { name: 'glob', calls: 402 },
      { name: 'task', calls: 265 },
    ],
  },
  models: [
    { provider: 'deepseek-account', model: 'deepseek-flash', requests: 2_910, total: 18_420_000 },
    { provider: 'deepseek-account', model: 'deepseek-pro', requests: 1_272, total: 9_540_000 },
  ],
  sessions: [
    { id: 's1', title: '重构设置页的用量统计', requests: 212, total: 3_180_000 },
    { id: 's2', title: '整理插件发布流程', requests: 164, total: 2_460_000 },
    { id: 's3', title: '梳理会话日志字段', requests: 138, total: 1_920_000 },
  ],
  scan: { sessions: 128, scanned: 128, failed: 0, truncated: false },
};

const patched = source.replace(
  "useState({ status: 'loading', data: undefined, error: '' })",
  "useState({ status: 'ready', data: globalThis.__USAGE_SAMPLE__, error: '' })",
);
/**
 * Render one variant of the page to a standalone HTML file.
 * @param {string} text - client.js source to evaluate.
 * @param {string} file - output file name under docs/.
 * @returns {void}
 */
function renderTo(text, file) {
  let registration;
  let dicts;
  let component;
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load(definition) {
          registration = definition.factory((name) => {
            if (name === 'react') return React;
            throw new Error(`unexpected require: ${name}`);
          });
        },
      },
    },
    document: { baseURI: 'http://127.0.0.1:60586/' },
    URL, Date, Math, Intl, console, AbortController,
    FileReader: class {},
    fetch: () => Promise.reject(new Error('no network')),
    setTimeout, clearTimeout,
    __USAGE_SAMPLE__: sample,
  };
  vm.runInNewContext(text, sandbox, { filename: 'client.js' });
  registration.apply({
    effect: (callback) => { const dispose = callback(); return typeof dispose === 'function' ? dispose : () => {}; },
    locale: {
      register: (_ns, value) => { dicts = value; return () => {}; },
      bind: () => (key) => key,
    },
    slots: {
      inject: (_key, callback) => callback(),
      register: (_options, value) => { component = value; return () => {}; },
    },
  });
  const t = (key, params) => {
    let value = dicts?.zh?.[key] ?? key;
    if (params !== undefined) value = String(value).replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
    return value;
  };
  const markup = renderToStaticMarkup(React.createElement(component, { t }));
  // React escapes text children for HTML, but `<style>` is raw text in a browser:
  // undo the escaping so the stylesheet parses in a static file.
  const raw = markup.replace(/<style[^>]*>[\s\S]*?<\/style>/g, (block) => block
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>preview</title>
<style>
:root{
  --dsw-alias-label-primary:#1c1c1e;
  --dsw-alias-label-secondary:#6e6e78;
  --dsw-alias-bg-layer-1:#ffffff;
  --dsw-alias-bg-layer-2:#f4f4f7;
  --dsw-alias-border-l1:rgba(0,0,0,.13);
  --dsw-alias-border-l2:rgba(0,0,0,.09);
  --dsw-alias-brand-primary:#3b6ef0;
  --dsw-alias-state-error-primary:#c53030;
}
html,body{margin:0;padding:0;background:#fff}
body{padding:36px 40px 44px;font-family:"Segoe UI","PingFang SC","Microsoft YaHei",system-ui,sans-serif;color:var(--dsw-alias-label-primary)}
</style></head><body>${raw}</body></html>`;
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', file), html);
  console.log('wrote docs/' + file, html.length, 'bytes');
}

renderTo(patched, 'preview.html');

const editingSource = patched
  .replace(
    "const [editing, setEditing] = useState(false);",
    "const [editing, setEditing] = useState(true);",
  )
  .replace(
    "useState({ name: '', handle: '', avatar: '' });",
    "useState({ name: '我的用量', handle: '@local-user', avatar: '' });",
  );
if (editingSource === patched) throw new Error('the editor-state patch no longer applies');
renderTo(editingSource, 'preview-edit.html');
