// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { normalizeCertificateSha256, resolveAndroidReleaseConfig } from './android-release-config.mjs';
import { verifyExpectedSigner } from './verify-android-signer.mjs';

const latestCertificate = 'df86d3816998ca9dde52768ad0444ac85d2d45992f855c27bdab4554156557ca';
const olderCertificate = '1c8cde7e0b9ff200d9c172c0e1d6c917093908eca5e573625acd92588f67d606';
const baseConfig = { repository: 'mhdyhn/me', apiBase: '', signingCertificate: '' };
const verifierOutput = (sha = latestCertificate) => `Verifies\nVerified using v2 scheme (APK Signature Scheme v2): true\nNumber of signers: 1\nSigner #1 certificate SHA-256 digest: ${sha}\n`;
let tempDirectory;
afterEach(() => { if (tempDirectory) rmSync(tempDirectory, { recursive: true, force: true }); tempDirectory = undefined; });

describe('Android release configuration', () => {
  it('uses the known public origin and latest historical signer only for the owner repository', () => {
    expect(resolveAndroidReleaseConfig(baseConfig)).toEqual({
      apiOrigin: 'https://meety-985n.onrender.com', certificateSha256: latestCertificate,
    });
    expect(() => resolveAndroidReleaseConfig({ ...baseConfig, repository: 'someone/fork' })).toThrow('ANDROID_API_BASE is required');
    expect(() => resolveAndroidReleaseConfig({ ...baseConfig, repository: 'someone/fork', apiBase: 'https://api.example.com' })).toThrow('ANDROID_SIGNING_CERT_SHA256 is required');
  });

  it('honours an explicitly configured origin and signer without falling back on invalid values', () => {
    const fingerprint = olderCertificate.toUpperCase().match(/../g).join(':');
    expect(resolveAndroidReleaseConfig({ repository: 'someone/fork', apiBase: 'https://api.example.com:8443/', signingCertificate: fingerprint })).toEqual({
      apiOrigin: 'https://api.example.com:8443', certificateSha256: olderCertificate,
    });
    expect(() => resolveAndroidReleaseConfig({ ...baseConfig, signingCertificate: 'not-a-fingerprint' })).toThrow('ANDROID_SIGNING_CERT_SHA256');
  });

  it.each([
    'http://api.example.com',
    'https://user:password@api.example.com',
    'https://api.example.com/api',
    'https://api.example.com/?token=secret',
    'https://api.example.com/#fragment',
    'https://api.example.com?',
    'https://localhost',
    'https://localhost.',
    'https://intranet.local',
    'https://127.0.0.1',
    'https://[::1]',
    'https://api.example.com\nINJECTED=1',
  ])('rejects an unsafe API origin without echoing it: %s', (origin) => {
    expect(() => resolveAndroidReleaseConfig({ ...baseConfig, apiBase: origin })).toThrow('ANDROID_API_BASE');
    try { resolveAndroidReleaseConfig({ ...baseConfig, apiBase: origin }); } catch (error) {
      expect(error.message).not.toContain(origin);
      expect(error.message).not.toContain('password');
      expect(error.message).not.toContain('token=secret');
    }
  });

  it('writes only the resolved values to the Actions environment file', () => {
    tempDirectory = mkdtempSync(join(tmpdir(), 'meety-android-config-'));
    const file = join(tempDirectory, 'github-env');
    const env = { ...process.env, GITHUB_REPOSITORY: 'mhdyhn/me', GITHUB_ENV: file, ANDROID_API_BASE: '', ANDROID_SIGNING_CERT_SHA256: '' };
    execFileSync(process.execPath, ['tools/android-release-config.mjs'], { env });
    expect(readFileSync(file, 'utf8')).toBe(`VITE_API_BASE=https://meety-985n.onrender.com\nANDROID_EXPECTED_CERT_SHA256=${latestCertificate}\n`);
    const result = spawnSync(process.execPath, ['tools/android-release-config.mjs'], { env: { ...env, ANDROID_API_BASE: 'https://u:secret@example.com' }, encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain('secret');
    expect(readFileSync(file, 'utf8').split('\n')).toHaveLength(3);
  });

  it('requires a precisely formatted certificate fingerprint', () => {
    expect(normalizeCertificateSha256(latestCertificate.toUpperCase())).toBe(latestCertificate);
    for (const bad of ['', 'a'.repeat(63), 'a'.repeat(65), 'g'.repeat(64), `${latestCertificate}\nA=B`]) {
      expect(() => normalizeCertificateSha256(bad)).toThrow('ANDROID_SIGNING_CERT_SHA256');
    }
  });
});

describe('APK signer check', () => {
  it('accepts the configured certificate after successful verification', () => {
    expect(() => verifyExpectedSigner(verifierOutput(), latestCertificate)).not.toThrow();
  });
  it('runs the verifier even when the executable is reached through a symlink', () => {
    tempDirectory = mkdtempSync(join(tmpdir(), 'meety-android-signer-'));
    const script = join(tempDirectory, 'verify.mjs');
    const input = join(tempDirectory, 'apksigner.txt');
    symlinkSync(resolve('tools/verify-android-signer.mjs'), script);
    writeFileSync(input, verifierOutput(olderCertificate));
    const result = spawnSync(process.execPath, [script, input], { env: { ...process.env, ANDROID_EXPECTED_CERT_SHA256: latestCertificate }, encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('does not match');
  });
  it('rejects the actual older historical signer against the latest published signer', () => {
    expect(() => verifyExpectedSigner(verifierOutput(olderCertificate), latestCertificate)).toThrow('does not match');
    expect(() => verifyExpectedSigner(verifierOutput(olderCertificate), olderCertificate)).not.toThrow();
  });
  it('rejects missing, unverified or multiple signers', () => {
    expect(() => verifyExpectedSigner('', latestCertificate)).toThrow('exactly one verified');
    expect(() => verifyExpectedSigner(verifierOutput().replace('Verifies\n', ''), latestCertificate)).toThrow('exactly one verified');
    expect(() => verifyExpectedSigner(verifierOutput().replace('Number of signers: 1', 'Number of signers: 2'), latestCertificate)).toThrow('exactly one verified');
    expect(() => verifyExpectedSigner(`${verifierOutput()}Signer #2 certificate SHA-256 digest: ${olderCertificate}\n`, latestCertificate)).toThrow('exactly one verified');
    expect(() => verifyExpectedSigner(verifierOutput().replace('Signer #1', 'Signer #2'), latestCertificate)).toThrow('exactly one verified');
  });
});
