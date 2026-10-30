// Keeps gzip sidecars out of the Android package.
//
// The web build writes "file.svg" and "file.svg.gz" next to each other so the server can
// deliver compressed files. Android's packager derives a resource name from the file name
// without its last extension, so both files claim the same name and the build stops with
// "Duplicate resources". The APK has no use for the sidecars, so they are removed.
import { readdir, rm } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DIST = resolve('dist');
const ANDROID_ASSETS = resolve('android/app/src/main/assets/public');

export async function listFiles(root) {
  const found = [];
  async function visit(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile()) found.push(file);
    }
  }
  await visit(root);
  return found;
}

/** Files whose name without ".gz" already exists; packaging both would duplicate a resource. */
export function conflictingSidecars(files) {
  const names = new Set(files.map((file) => file.split('/').pop() ?? ''));
  return files.filter((file) => file.endsWith('.gz') && names.has((file.split('/').pop() ?? '').slice(0, -3)));
}

export async function removeSidecars(files) {
  for (const file of files) await rm(file, { force: true });
  return files.length;
}

export async function verifyNoSidecars(roots) {
  const offenders = [];
  for (const root of roots) {
    const files = await listFiles(root);
    offenders.push(...conflictingSidecars(files));
  }
  if (offenders.length) {
    throw new Error(`Gzip sidecars must not be packaged for Android: ${offenders.slice(0, 5).join(', ')}${offenders.length > 5 ? ` and ${offenders.length - 5} more` : ''}`);
  }
}

export async function prepareAndroidAssets({ mode, dist = DIST, assets = ANDROID_ASSETS }) {
  if (mode === 'clean') {
    const files = await listFiles(dist);
    const sidecars = conflictingSidecars(files);
    const removed = await removeSidecars(sidecars);
    return { removed };
  }
  if (mode === 'verify') {
    await verifyNoSidecars([dist, assets]);
    return { removed: 0 };
  }
  throw new Error('Unknown mode: use "clean" or "verify".');
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const mode = process.argv[2] ?? 'clean';
  try {
    const result = await prepareAndroidAssets({ mode });
    console.log(mode === 'clean'
      ? `Removed ${result.removed} gzip sidecars from the Android web build.`
      : 'The Android package contains no gzip sidecars.');
  } catch (error) {
    console.error(`::error title=Android assets::${error.message}`);
    process.exitCode = 1;
  }
}
