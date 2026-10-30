import { appendFileSync, realpathSync } from 'node:fs';
import { isIP } from 'node:net';
import { pathToFileURL } from 'node:url';

// These defaults are limited to the original repository, not forks.
const OWNER_REPOSITORY = 'mhdyhn/me';
const OWNER_API_ORIGIN = 'https://meety-985n.onrender.com';
// Certificate of the latest previously published APK, not its private key.
const OWNER_PREVIOUS_CERT_SHA256 = 'df86d3816998ca9dde52768ad0444ac85d2d45992f855c27bdab4554156557ca';

export function normalizeCertificateSha256(value) {
  if (typeof value !== 'string' || !/^(?:[a-f0-9]{64}|(?:[a-f0-9]{2}:){31}[a-f0-9]{2})$/i.test(value)) {
    throw new Error('ANDROID_SIGNING_CERT_SHA256 must be a SHA-256 certificate fingerprint.');
  }
  return value.replaceAll(':', '').toLowerCase();
}

export function resolveAndroidReleaseConfig({ repository, apiBase, signingCertificate }) {
  const isOwnerRepository = repository === OWNER_REPOSITORY;
  const origin = apiBase || (isOwnerRepository ? OWNER_API_ORIGIN : '');
  if (!origin) throw new Error('ANDROID_API_BASE is required outside the original repository.');

  let url;
  try {
    if (/\s|[\u0000-\u001f\u007f]/.test(origin)) throw new Error();
    url = new URL(origin);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    const literalIp = hostname.replace(/^\[/, '').replace(/\]$/, '');
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash
        || origin.includes('?') || origin.includes('#') || !hostname.includes('.') || hostname.endsWith('.localhost')
        || hostname.endsWith('.local') || isIP(literalIp)) {
      throw new Error();
    }
  } catch {
    // Do not echo the input: a misconfiguration may accidentally contain credentials.
    throw new Error('ANDROID_API_BASE must be a public HTTPS hostname without credentials, a path, query or fragment.');
  }

  const certificate = signingCertificate || (isOwnerRepository ? OWNER_PREVIOUS_CERT_SHA256 : '');
  if (!certificate) throw new Error('ANDROID_SIGNING_CERT_SHA256 is required outside the original repository.');
  return { apiOrigin: url.origin, certificateSha256: normalizeCertificateSha256(certificate) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    const config = resolveAndroidReleaseConfig({
      repository: process.env.GITHUB_REPOSITORY,
      apiBase: process.env.ANDROID_API_BASE,
      signingCertificate: process.env.ANDROID_SIGNING_CERT_SHA256,
    });
    if (!process.env.GITHUB_ENV) throw new Error('GITHUB_ENV is required to configure the Android build.');
    appendFileSync(process.env.GITHUB_ENV, `VITE_API_BASE=${config.apiOrigin}\nANDROID_EXPECTED_CERT_SHA256=${config.certificateSha256}\n`);
    console.log('Android API origin and expected signing certificate are configured.');
    if (!process.env.ANDROID_SIGNING_CERT_SHA256) {
      console.log('::warning title=Android upgrade compatibility::The default matches the latest historical APK only; earlier installations may use a different signing key.');
    }
  } catch (error) {
    console.error(`::error title=Android release configuration::${error.message}`);
    process.exitCode = 1;
  }
}
