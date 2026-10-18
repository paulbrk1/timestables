// Dependency-free checks that the PWA pieces stay wired together.
// Run with: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = f => readFileSync(path.join(root, f), 'utf8');

function pngSize(file) {
  const buf = readFileSync(path.join(root, file));
  assert.equal(buf.toString('ascii', 1, 4), 'PNG', `${file} is not a PNG`);
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

test('manifest is valid and its icons exist at their declared sizes', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  for (const k of ['name', 'short_name', 'start_url', 'display', 'icons']) assert.ok(m[k], `missing ${k}`);
  assert.ok(m.icons.length > 0);
  const sizes = new Set();
  for (const icon of m.icons) {
    const [w, h] = pngSize(icon.src);
    assert.equal(`${w}x${h}`, icon.sizes, icon.src);
    sizes.add(icon.sizes);
  }
  assert.ok(sizes.has('192x192') && sizes.has('512x512'), 'installability needs 192 and 512 icons');
  assert.ok(m.icons.some(i => i.purpose === 'maskable'), 'no maskable icon');
});

test('every precached file exists', () => {
  const sw = read('sw.js');
  const list = sw.match(/const PRECACHE = \[([\s\S]*?)\];/);
  assert.ok(list, 'PRECACHE list not found');
  const paths = [...list[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  assert.ok(paths.length > 1, 'PRECACHE list is empty');
  for (const p of paths) {
    if (p === './') continue;
    assert.ok(existsSync(path.join(root, p)), `${p} is precached but missing`);
  }
});

test('index.html links the manifest and registers the service worker', () => {
  const html = read('index.html');
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /<meta name="theme-color"/);
  assert.match(html, /<link rel="apple-touch-icon" href="icons\/apple-touch-icon\.png">/);
  assert.match(html, /serviceWorker\.register\('sw\.js'\)/);
  for (const [, href] of html.matchAll(/<link rel="(?:icon|apple-touch-icon)"[^>]*href="([^"]+)"/g)) {
    assert.ok(existsSync(path.join(root, href)), `${href} is linked but missing`);
  }
});
