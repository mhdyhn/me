#!/usr/bin/env node
// Creates the release signing keystore for the Android app and prints the exact values
// that belong in the GitHub Actions secrets. The private key never leaves this machine
// except through the encrypted secret the owner sets by hand.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, chmodSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

/** Finds keytool on the PATH, in JAVA_HOME or in a common JDK folder. */
function findKeytool() {
  const candidates = [];
  if (process.env.JAVA_HOME) candidates.push(join(process.env.JAVA_HOME, 'bin', 'keytool'));
  for (const folder of ['/usr/lib/jvm', '/Library/Java/JavaVirtualMachines', '/opt/homebrew/opt/openjdk']) {
    if (!existsSync(folder)) continue;
    for (const entry of readdirSync(folder)) {
      candidates.push(join(folder, entry, 'bin', 'keytool'));
      candidates.push(join(folder, entry, 'Contents', 'Home', 'bin', 'keytool'));
    }
  }
  try {
    const found = execFileSync('sh', ['-c', 'command -v keytool'], { encoding: 'utf8' }).trim();
    if (found) candidates.unshift(found);
  } catch {
    // keytool is not on the PATH.
  }
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

const keytool = findKeytool();
const alias = option('alias', 'meety');
const keystorePath = resolve(option('out', 'private-backups/meety-release.keystore'));
const notesPath = resolve(option('notes', 'private-backups/android-signing.txt'));

if (existsSync(keystorePath)) {
  console.error(`The keystore already exists: ${keystorePath}`);
  console.error('Android can only update an installed app with the same key. Keep this file safe and never replace it.');
  process.exit(1);
}

const password = () => randomBytes(24).toString('base64url');
const storePassword = password();
const keyPassword = password();

mkdirSync(dirname(keystorePath), { recursive: true });
console.log(`Creating the release keystore at ${keystorePath}`);

if (!keytool) {
  console.error('keytool was not found. Install a JDK (17 or newer) and make sure "keytool" is on the PATH, or set JAVA_HOME.');
  process.exit(1);
}

try {
  execFileSync(keytool, [
    '-genkeypair',
    '-v',
    '-keystore', keystorePath,
    '-storetype', 'PKCS12',
    '-alias', alias,
    '-keyalg', 'RSA',
    '-keysize', '4096',
    '-validity', '10000',
    '-storepass', storePassword,
    '-keypass', keyPassword,
    '-dname', 'CN=Meety, OU=Meety, O=Meety, L=Tehran, C=IR',
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
} catch (error) {
  console.error('keytool failed. Install a JDK (17 or newer) and make sure "keytool" is on the PATH.');
  console.error(error.message);
  process.exit(1);
}

chmodSync(keystorePath, 0o600);

const fingerprint = execFileSync(keytool, [
  '-list', '-v', '-keystore', keystorePath, '-alias', alias, '-storepass', storePassword,
], { encoding: 'utf8' })
  .split('\n')
  .find((line) => line.includes('SHA256:'))
  ?.split('SHA256:')[1]
  ?.trim() ?? '';

const base64 = readFileSync(keystorePath).toString('base64');

const notes = [
  '# Meety — Android release signing values',
  '# Keep this file private. Never commit it and never paste it into a chat.',
  '',
  `Keystore file: ${keystorePath}`,
  `Alias: ${alias}`,
  `Keystore password: ${storePassword}`,
  `Key password: ${keyPassword}`,
  `Certificate SHA-256: ${fingerprint}`,
  '',
  'GitHub Actions secrets (repository -> Settings -> Secrets and variables -> Actions):',
  `ANDROID_KEYSTORE_BASE64 = ${base64}`,
  `ANDROID_KEYSTORE_PASSWORD = ${storePassword}`,
  `ANDROID_KEY_ALIAS = ${alias}`,
  `ANDROID_KEY_PASSWORD = ${keyPassword}`,
  '',
  'Optional repository variable (Settings -> Secrets and variables -> Actions -> Variables):',
  `ANDROID_SIGNING_CERT_SHA256 = ${fingerprint.replaceAll(':', '').toLowerCase()}`,
  '',
].join('\n');

mkdirSync(dirname(notesPath), { recursive: true });
writeFileSync(notesPath, notes, { mode: 0o600 });
chmodSync(notesPath, 0o600);

console.log('');
console.log(`Alias:              ${alias}`);
console.log(`Keystore password:  ${storePassword}`);
console.log(`Key password:       ${keyPassword}`);
console.log(`Certificate SHA-256: ${fingerprint}`);
console.log('');
console.log(`The four secret values were written to ${notesPath} (mode 600).`);
console.log('Copy them into the repository secrets by hand; the file itself must never be committed.');
