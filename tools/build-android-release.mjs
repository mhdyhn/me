/**
 * Builds the signed Android release APK on this machine.
 *
 *   node tools/build-android-release.mjs
 *
 * It needs a JDK (17 or newer) and the Android SDK (platform 36 and build tools 36),
 * and the keystore that `tools/create-android-keystore.mjs` wrote. The signed APK ends
 * up in `dist/meety.apk` so the website can offer it from the same origin.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { keystorePath, secretNames, signingValues } from './android-secrets.mjs';

const root = resolve(import.meta.dirname, '..');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function run(command, args, options = {}) {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32', ...options });
  if (result.error) fail(`${command} could not start: ${result.error.message}`);
  if (result.status !== 0) fail(`${command} failed with exit code ${result.status}.`);
}

function findKeytool() {
  if (process.env.JAVA_HOME) {
    const candidate = resolve(process.env.JAVA_HOME, 'bin', 'keytool');
    if (existsSync(candidate)) return candidate;
  }
  const found = spawnSync('bash', ['-lc', 'command -v keytool || true'], { encoding: 'utf8' });
  const path = found.stdout.trim();
  return path || '';
}

function findAndroidHome() {
  const home = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
  if (home && existsSync(home)) return home;
  return '';
}

function findApksigner(androidHome) {
  if (!androidHome) return '';
  const tools = resolve(androidHome, 'build-tools');
  if (!existsSync(tools)) return '';
  const versions = readdirSync(tools).sort().reverse();
  for (const version of versions) {
    const candidate = resolve(tools, version, 'apksigner');
    if (existsSync(candidate)) return candidate;
  }
  return '';
}

const values = signingValues();
const missing = secretNames().filter((name) => !values[name]);
if (missing.length) {
  fail(`The signing values are missing: ${missing.join(', ')}.\n` +
    'Run "node tools/create-android-keystore.mjs" first, or set them in the environment.');
}
const store = keystorePath();
if (!store || !existsSync(store)) {
  fail('The keystore file was not found. Run "node tools/create-android-keystore.mjs" first.');
}

const keytool = findKeytool();
if (!keytool) fail('A JDK with keytool is required (JDK 17 or newer). Set JAVA_HOME and try again.');
const androidHome = findAndroidHome();
if (!androidHome) fail('The Android SDK was not found. Set ANDROID_HOME (or ANDROID_SDK_ROOT) and try again.');
const apksigner = findApksigner(androidHome);
if (!apksigner) fail('apksigner was not found in the Android SDK build tools. Install build-tools 36.0.0.');

console.log('Building the signed release APK.');
console.log(`Keystore: ${store}`);
console.log(`Alias:    ${values.ANDROID_KEY_ALIAS}`);
console.log(`SDK:      ${androidHome}`);

run('npm', ['run', 'build']);
run('node', ['tools/prepare-android-assets.mjs', 'clean']);
run('npx', ['cap', 'sync', 'android']);
run('node', ['tools/prepare-android-assets.mjs', 'verify']);

const gradle = resolve(root, 'android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
run(gradle, ['assembleRelease', '--no-daemon'], {
  cwd: resolve(root, 'android'),
  env: {
    ...process.env,
    KEYSTORE_PATH: store,
    KEYSTORE_PASSWORD: values.ANDROID_KEYSTORE_PASSWORD,
    KEY_ALIAS: values.ANDROID_KEY_ALIAS,
    KEY_PASSWORD: values.ANDROID_KEY_PASSWORD,
  },
});

const apk = resolve(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
if (!existsSync(apk)) fail('The release APK was not produced.');
run(apksigner, ['verify', '--verbose', '--print-certs', apk]);

const dist = resolve(root, 'dist');
mkdirSync(dist, { recursive: true });
const target = resolve(dist, 'meety.apk');
copyFileSync(apk, target);

console.log('');
console.log(`The signed APK is ready: ${target}`);
console.log('Publish it in a GitHub Release (for example the tag v1.0.1) and set VITE_ANDROID_APK_URL');
console.log('to its address, or keep it on the same origin as dist/meety.apk and use /meety.apk.');
console.log('');
console.log('Important: keep this keystore file. Without it, installed apps cannot be updated');
console.log('and must be installed again.');
