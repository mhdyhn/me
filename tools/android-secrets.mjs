import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The Android release signing values.
 *
 * They live in the private notes file that `tools/create-android-keystore.mjs` writes
 * (mode 600, never committed), or in the environment when a CI job provides them.
 * Nothing here ever prints a password unless the caller asks for it.
 */

export const SIGNING_NOTES_PATH = 'private-backups/android-signing.txt';

const SECRET_NAMES = [
  'ANDROID_KEYSTORE_BASE64',
  'ANDROID_KEYSTORE_PASSWORD',
  'ANDROID_KEY_ALIAS',
  'ANDROID_KEY_PASSWORD',
];

/** Reads `NAME = value` lines from the notes file. */
export function readSigningNotes(path = SIGNING_NOTES_PATH) {
  const file = resolve(path);
  if (!existsSync(file)) return {};
  const values = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)\s*=\s*(.+)$/.exec(line.trim());
    if (match && SECRET_NAMES.includes(match[1])) values[match[1]] = match[2].trim();
  }
  return values;
}

/** The four signing values, from the environment first and then from the notes file. */
export function signingValues(env = process.env, path = SIGNING_NOTES_PATH) {
  const notes = readSigningNotes(path);
  const values = {};
  for (const name of SECRET_NAMES) {
    const value = String(env[name] ?? '').trim() || (notes[name] ?? '').trim();
    if (value) values[name] = value;
  }
  return values;
}

/** The names of the four repository secrets, in the order they are asked for. */
export function secretNames() {
  return [...SECRET_NAMES];
}

/** The path of the keystore file, from the notes file. */
export function keystorePath(path = SIGNING_NOTES_PATH) {
  const file = resolve(path);
  if (!existsSync(file)) return '';
  const line = readFileSync(file, 'utf8').split('\n').find((row) => row.startsWith('Keystore file:'));
  const value = line?.slice('Keystore file:'.length).trim() ?? '';
  return value ? resolve(value) : '';
}
