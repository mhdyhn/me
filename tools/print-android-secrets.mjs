/**
 * Prints the four GitHub Actions secrets for the Android release signing.
 *
 *   node tools/print-android-secrets.mjs
 *
 * The values come from the private notes file that `tools/create-android-keystore.mjs`
 * wrote. Copy each value into the repository secrets yourself; never paste them into a
 * chat, a commit or a message.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { keystorePath, secretNames, signingValues } from './android-secrets.mjs';

const values = signingValues();
const missing = secretNames().filter((name) => !values[name]);

if (missing.length) {
  console.error(`These values are missing: ${missing.join(', ')}`);
  console.error('Run "node tools/create-android-keystore.mjs" first.');
  process.exit(1);
}

const store = keystorePath();
if (!store || !existsSync(store)) {
  console.error('The keystore file was not found. Run "node tools/create-android-keystore.mjs" first.');
  process.exit(1);
}

console.log('Repository: mhdyhn/me');
console.log('Settings -> Secrets and variables -> Actions -> New repository secret');
console.log('');
for (const name of secretNames()) {
  const value = values[name];
  console.log(`${name}`);
  console.log(value.length > 80 ? `${value.slice(0, 40)}… (${value.length} characters)` : value);
  console.log('');
}
console.log('Keep this output private.');
