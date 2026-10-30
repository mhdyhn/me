// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { conflictingSidecars, listFiles, prepareAndroidAssets, removeSidecars } from './prepare-android-assets.mjs';

let directory;
afterEach(() => { if (directory) rmSync(directory, { recursive: true, force: true }); directory = undefined; });

function makeTree(files) {
  directory = mkdtempSync(join(tmpdir(), 'meety-android-assets-'));
  for (const [name, content] of Object.entries(files)) {
    const path = join(directory, name);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, content);
  }
  return directory;
}

describe('Android asset preparation', () => {
  it('finds only sidecars that would duplicate a packaged resource', async () => {
    const root = makeTree({
      'index.html': '<html></html>', 'index.html.gz': 'compressed',
      'assets/app.js': 'code', 'assets/app.js.gz': 'compressed',
      'assets/only.js.gz': 'compressed', 'icons/icon-192.png': 'png',
    });
    const files = await listFiles(root);
    const conflicts = conflictingSidecars(files);
    expect(conflicts.map((file) => file.split('/').pop()).sort()).toEqual(['app.js.gz', 'index.html.gz']);
  });

  it('removes the sidecars and leaves the original files untouched', async () => {
    const root = makeTree({ 'index.html': '<html></html>', 'index.html.gz': 'compressed', 'assets/app.js': 'code', 'assets/app.js.gz': 'compressed' });
    const files = await listFiles(root);
    const removed = await removeSidecars(conflictingSidecars(files));
    expect(removed).toBe(2);
    const left = (await listFiles(root)).map((file) => file.split('/').pop()).sort();
    expect(left).toEqual(['app.js', 'index.html']);
  });

  it('cleans the web build and then verifies that no sidecar reaches the Android package', async () => {
    const root = makeTree({ 'index.html': '<html></html>', 'index.html.gz': 'compressed' });
    const dist = join(root, 'dist');
    const assets = join(root, 'android/app/src/main/assets/public');
    mkdirSync(join(dist, 'assets'), { recursive: true });
    mkdirSync(join(assets, 'assets'), { recursive: true });
    writeFileSync(join(dist, 'index.html'), '<html></html>');
    writeFileSync(join(dist, 'index.html.gz'), 'compressed');
    writeFileSync(join(dist, 'assets', 'app.js'), 'code');
    writeFileSync(join(assets, 'assets', 'app.js'), 'code');
    expect(await prepareAndroidAssets({ mode: 'clean', dist })).toEqual({ removed: 1 });
    expect(await prepareAndroidAssets({ mode: 'verify', dist, assets })).toEqual({ removed: 0 });
    writeFileSync(join(assets, 'assets', 'app.js.gz'), 'compressed');
    await expect(prepareAndroidAssets({ mode: 'verify', dist, assets })).rejects.toThrow('must not be packaged');
  });

  it('rejects an unknown mode', async () => {
    await expect(prepareAndroidAssets({ mode: 'publish' })).rejects.toThrow('Unknown mode');
  });
});
