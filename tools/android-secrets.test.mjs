// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { keystorePasswords, secretNames, signingValues } from './android-secrets.mjs';

describe('the password of the Android keystore', () => {
  it('uses one password for the store and for the key', () => {
    // A PKCS12 keystore keeps one password: keytool ignores a separate -keypass.
    const { storePassword, keyPassword } = keystorePasswords();
    expect(keyPassword).toBe(storePassword);
    expect(storePassword.length).toBeGreaterThan(20);
    expect(storePassword).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('never repeats a password', () => {
    expect(keystorePasswords().storePassword).not.toBe(keystorePasswords().storePassword);
  });
});

describe('the signing values', () => {
  it('reads the four values from the notes file', () => {
    const directory = mkdtempSync(join(tmpdir(), 'meety-signing-'));
    const file = join(directory, 'android-signing.txt');
    writeFileSync(file, [
      '# Meety',
      'ANDROID_KEYSTORE_BASE64 = YWJj',
      'ANDROID_KEYSTORE_PASSWORD = store-pass',
      'ANDROID_KEY_ALIAS = meety',
      'ANDROID_KEY_PASSWORD = store-pass',
      '',
    ].join('\n'));
    const values = signingValues({}, file);
    expect(Object.keys(values)).toEqual(secretNames());
    expect(values.ANDROID_KEY_ALIAS).toBe('meety');
    expect(values.ANDROID_KEYSTORE_BASE64).toBe('YWJj');
    rmSync(directory, { recursive: true, force: true });
  });
});
