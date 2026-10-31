import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { normalizeCertificateSha256 } from './android-release-config.mjs';

/** The apksigner process must also have exited successfully before this check runs. */
export function verifyExpectedSigner(output, expectedCertificate) {
  const count = /^Number of signers:\s*(\d+)\s*$/m.exec(output);
  const signers = [...output.matchAll(/^Signer #(\d+) certificate SHA-256 digest:\s*([a-f\d:]+)\s*$/gim)];
  if (!/^Verifies\s*$/m.test(output) || count?.[1] !== '1' || signers.length !== 1 || signers[0][1] !== '1') {
    throw new Error('The APK does not have exactly one verified signing certificate.');
  }
  // A pinned certificate is enforced; without one the release uses the stored keystore.
  const expected = expectedCertificate?.trim() ?? '';
  if (!expected) return;
  if (normalizeCertificateSha256(signers[0][2]) !== normalizeCertificateSha256(expected)) {
    throw new Error('The APK signing certificate does not match the expected certificate; release blocked.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    if (!process.argv[2]) throw new Error('The apksigner verification output file is required.');
    verifyExpectedSigner(readFileSync(process.argv[2], 'utf8'), process.env.ANDROID_EXPECTED_CERT_SHA256);
    console.log('APK signature matches the expected certificate.');
  } catch (error) {
    console.error(`::error title=Android APK signing::${error.message}`);
    process.exitCode = 1;
  }
}
