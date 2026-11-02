#!/usr/bin/env node
/**
 * Waits until the hosted app runs the newest commit.
 *
 *   EXPECTED_REVISION=<sha> node tools/wait-for-deploy.mjs [baseUrl]
 *
 * The hosting service needs a couple of minutes to deploy a new commit. A check that runs
 * right after the push would otherwise test the old version and complain about the new one.
 * The wait ends as soon as the release endpoint reports the expected revision.
 */
const base = (process.argv[2] ?? process.env.APP_URL ?? 'https://meety-985n.onrender.com').replace(/\/$/, '');
const expected = (process.env.EXPECTED_REVISION ?? '').trim().toLowerCase();
const timeoutSeconds = Number(process.env.DEPLOY_TIMEOUT_SECONDS ?? 600);
const intervalSeconds = Number(process.env.DEPLOY_POLL_SECONDS ?? 15);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Reads the revision the hosted app is running right now, or an empty string when it cannot. */
export async function readDeployedRevision(baseUrl, fetchImpl = fetch) {
  const response = await fetchImpl(`${baseUrl}/api/release?wait=${Date.now()}`, { headers: { 'cache-control': 'no-cache' } });
  if (!response.ok) return '';
  const parsed = await response.json();
  return String(parsed?.revision ?? '').toLowerCase();
}

/**
 * Waits for the expected revision; returns the revision the app runs when the wait ends.
 * `onTick` is called after every try so the caller can show the progress.
 */
export async function waitForDeploy(options) {
  const { baseUrl, expectedRevision, timeoutSeconds: timeout, intervalSeconds: interval, fetchImpl = fetch, onTick = () => {} } = options;
  const deadline = Date.now() + timeout * 1000;
  let last = '';
  for (;;) {
    let note = '';
    try {
      last = await readDeployedRevision(baseUrl, fetchImpl);
    } catch (error) {
      last = '';
      note = `the host did not answer: ${String(error?.message ?? error).split('\n')[0]}`;
    }
    if (last === expectedRevision) {
      onTick(`the app runs ${last}`);
      return last;
    }
    onTick(note || `the app runs ${last || 'nothing'}`);
    if (Date.now() >= deadline) return last;
    await sleep(interval * 1000);
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  if (!expected) {
    console.log('No expected revision is given; the wait is skipped.');
    process.exit(0);
  }
  console.log(`Waiting for ${base} to run ${expected} (up to ${timeoutSeconds} seconds).`);
  const startedAt = Date.now();
  const last = await waitForDeploy({
    baseUrl: base,
    expectedRevision: expected,
    timeoutSeconds,
    intervalSeconds,
    onTick: (revision) => console.log(`  the app runs ${revision}`),
  });
  const seconds = Math.round((Date.now() - startedAt) / 1000);
  if (last === expected) {
    console.log(`The app now runs ${last} after ${seconds} seconds.`);
  } else {
    console.error(`The app did not run ${expected} in ${seconds} seconds; it still runs ${last || 'nothing'}.`);
    process.exitCode = 1;
  }
}
