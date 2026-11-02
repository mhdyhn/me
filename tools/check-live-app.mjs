#!/usr/bin/env node
/**
 * Checks the app that is online: the API, the pages, the illustrations, the animations and
 * the 3D model. It is meant to run where the internet is reachable (the CI runner), because
 * a sandbox often cannot reach the hosted address.
 *
 *   node tools/check-live-app.mjs [baseUrl]
 *
 * Every check prints one line; the exit code is 1 when a check fails.
 */
const base = (process.argv[2] ?? process.env.APP_URL ?? 'https://meety-985n.onrender.com').replace(/\/$/, '');
const failures = [];

const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
};

const get = async (path, type = 'text') => {
  const response = await fetch(`${base}${path}`, { redirect: 'follow' });
  const body = type === 'bytes' ? Buffer.from(await response.arrayBuffer()) : await response.text();
  return { status: response.status, body, type: response.headers.get('content-type') ?? '' };
};

/** Runs one check; a host that does not answer is a failed check, not a crash. */
const attempt = async (name, run) => {
  try {
    await run();
  } catch (error) {
    check(name, false, `the host did not answer: ${String(error?.message ?? error).split('\n')[0]}`);
  }
};

const json = (body) => {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
};

console.log(`The app at ${base}\n`);

await attempt('the health endpoint', async () => {
  const { status, body } = await get('/api/health?probe=1');
  const parsed = json(body);
  check('the health answers with a JSON', status === 200 && parsed !== null, `status ${status}`);
  check('the database is reachable', parsed?.database === true, `database ${String(parsed?.database)}`);
  check('the admin account exists', parsed?.adminAccount === true, `adminAccount ${String(parsed?.adminAccount)}`);
});

await attempt('the release endpoint', async () => {
  const { status, body } = await get('/api/release');
  const parsed = json(body);
  check('the release answers', status === 200 && typeof parsed?.revision === 'string', parsed?.revision ?? `status ${status}`);
  check('the release points at the newest Android build', typeof parsed?.apkUrl === 'string' && parsed.apkUrl.startsWith('https://'), String(parsed?.apkUrl));
});

await attempt('the login page', async () => {
  const { status, body } = await get('/login');
  check('the login page is served', status === 200 && body.includes('id="root"'), `status ${status}`);
  check('the login page loads the app script', /<script[^>]+src="[^"]*assets\/index-[^"]+\.js"/.test(body));
});

await attempt('the session guard', async () => {
  const { status } = await get('/api/me');
  check('the API asks for a session', status === 401, `status ${status}`);
});

await attempt('the pack of the illustrations', async () => {
  const { status, body } = await get('/exercise-figures.json');
  const parsed = json(body);
  const names = parsed ? Object.keys(parsed) : [];
  const empty = names.filter((name) => typeof parsed[name] !== 'string' || parsed[name].length === 0);
  check('the pack of the illustrations is served', status === 200 && names.length > 0, `${names.length} figures`);
  check('every figure of the pack has its drawing', empty.length === 0, empty.length ? `${empty.length} empty, for example ${empty[0]}` : '');
});

await attempt('an illustration', async () => {
  const { status, body } = await get('/exercise-images/barbell-squat-start.svg');
  check('an illustration is served', status === 200 && body.includes('<svg'), `status ${status}`);
});

await attempt('an animation', async () => {
  const { status, body } = await get('/exercise-motion/barbell-squat.json');
  const parsed = json(body);
  check('an animation is served', status === 200 && Array.isArray(parsed?.elements) && parsed.elements.length > 0, `status ${status}`);
});

await attempt('the 3D model', async () => {
  const { status, body } = await get('/models/push-up-3f77e479.glb', 'bytes');
  check('the 3D model is served', status === 200 && body.length > 100000, `${Math.round(body.length / 1024)} KiB`);
});

await attempt('the icon', async () => {
  const { status, body } = await get('/icons/icon-192.png', 'bytes');
  check('the icon is served', status === 200 && body.length > 1000 && body[0] === 0x89 && body[1] === 0x50, `status ${status}`);
});

await attempt('the manifest', async () => {
  const { status, body } = await get('/manifest.webmanifest');
  const parsed = json(body);
  check('the manifest is served', status === 200 && parsed?.icons?.length > 0, `status ${status}`);
});

console.log('');
if (failures.length) {
  console.log(`${failures.length} check(s) failed: ${failures.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('Every check passed.');
}
