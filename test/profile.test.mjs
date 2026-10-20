/**
 * Unit tests for the Host profile store: validation of what the editor posts,
 * the neutral default of a fresh install, the atomic round trip through
 * `$DSH_HOME/usage-board/profile.json`, and the fallback when that file is
 * unreadable.
 *
 * Run from the package root with plain Node (no dependencies):
 *   node test/profile.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const bundleDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-codex-usage-board-'));
process.env.DSH_HOME = scratch;

const source = fs.readFileSync(path.join(bundleDir, 'index.js'), 'utf8');
const copy = path.join(scratch, 'index-copy.mjs');
fs.writeFileSync(copy, source);
const mod = await import(pathToFileURL(copy).href);

// --- a fresh install carries no identity -------------------------------------
assert.deepEqual(mod.emptyProfile(), { name: '', handle: '', avatar: null });
assert.deepEqual(await mod.readProfile(), { name: '', handle: '', avatar: null }, 'no file reads as the default');

// --- accepted shapes ---------------------------------------------------------
const accepted = mod.sanitizeProfile({ name: '  Ava  ', handle: 'ava', avatar: null });
assert.deepEqual(accepted, { ok: true, profile: { name: 'Ava', handle: '@ava', avatar: null } }, 'text is trimmed and the handle gains its @');

assert.deepEqual(
  mod.sanitizeProfile({ name: '', handle: '  ', avatar: '' }),
  { ok: true, profile: { name: '', handle: '', avatar: null } },
  'blank fields clear the header',
);

assert.deepEqual(
  mod.sanitizeProfile({ name: 'Ava', handle: '@ava', avatar: undefined }),
  { ok: true, profile: { name: 'Ava', handle: '@ava', avatar: null } },
  'an absent portrait clears it',
);

const portrait = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
assert.deepEqual(
  mod.sanitizeProfile({ name: 'Ava', handle: '@ava', avatar: portrait }),
  { ok: true, profile: { name: 'Ava', handle: '@ava', avatar: portrait } },
  'a small base64 portrait is kept',
);

assert.equal(mod.sanitizeProfile({ name: 'Ava', handle: 'a'.repeat(40) }).profile.handle.startsWith('@'), true);
assert.equal(mod.sanitizeProfile({ name: 'Ava', handle: '@' + 'a'.repeat(20) }).ok, true);
assert.equal(mod.sanitizeProfile({ name: 'Ava', handle: '@' + 'a'.repeat(60) }).ok, false, 'an over-long handle is refused');

// --- refusals ----------------------------------------------------------------
const notObject = mod.sanitizeProfile(['Ava']);
assert.equal(notObject.ok, false);
assert.match(notObject.errors[0], /JSON object/);

const tooLong = mod.sanitizeProfile({ name: 'x'.repeat(60) });
assert.equal(tooLong.ok, false);
assert.match(tooLong.errors[0], /at most 48 characters/);

const wrongType = mod.sanitizeProfile({ name: 42 });
assert.equal(wrongType.ok, false);
assert.match(wrongType.errors[0], /must be text/);

const wrongMime = mod.sanitizeProfile({ name: 'Ava', avatar: 'data:text/html;base64,AAAA' });
assert.equal(wrongMime.ok, false);
assert.match(wrongMime.errors[0], /base64 PNG/);

const remoteUrl = mod.sanitizeProfile({ name: 'Ava', avatar: 'https://example.com/a.png' });
assert.equal(remoteUrl.ok, false, 'a remote URL is not a portrait');

const huge = `data:image/png;base64,${'A'.repeat(400_000)}`;
const tooBig = mod.sanitizeProfile({ name: 'Ava', avatar: huge });
assert.equal(tooBig.ok, false);
assert.match(tooBig.errors[0], /256 KiB/);

// --- round trip through the Harness home -------------------------------------
const saved = await mod.writeProfile({ name: 'Ava Chen', handle: '@ava', avatar: null });
assert.deepEqual(saved, { name: 'Ava Chen', handle: '@ava', avatar: null });
assert.deepEqual(await mod.readProfile(), saved, 'the saved profile is read back');
const onDisk = path.join(scratch, 'usage-board', 'profile.json');
assert.ok(fs.existsSync(onDisk), 'profile lives under $DSH_HOME/usage-board/profile.json');
assert.equal(JSON.parse(fs.readFileSync(onDisk, 'utf8')).name, 'Ava Chen');

// --- an unreadable file must not blank the dashboard -------------------------
fs.writeFileSync(onDisk, '{ not json');
assert.deepEqual(await mod.readProfile(), { name: '', handle: '', avatar: null });
fs.writeFileSync(onDisk, JSON.stringify({ name: 'x'.repeat(99), handle: 1 }));
assert.deepEqual(await mod.readProfile(), { name: '', handle: '', avatar: null }, 'an invalid stored profile falls back');

fs.rmSync(scratch, { recursive: true, force: true });
console.log('profile tests passed');
