// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readDeployedRevision, waitForDeploy } from './wait-for-deploy.mjs';

/** Builds a fetch that answers with the given revisions, one per call. */
const fakeFetch = (revisions) => {
  let call = 0;
  return async () => {
    const revision = revisions[Math.min(call, revisions.length - 1)];
    call += 1;
    return {
      ok: revision !== '',
      async json() {
        return { revision };
      },
    };
  };
};

describe('waiting for the deployment', () => {
  it('reads the revision the app runs', async () => {
    expect(await readDeployedRevision('https://example.test', fakeFetch(['abc123']))).toBe('abc123');
  });

  it('keeps waiting while the app runs the old version', async () => {
    const revisions = ['old1', 'old2', 'new1'];
    const seen = [];
    const last = await waitForDeploy({
      baseUrl: 'https://example.test',
      expectedRevision: 'new1',
      timeoutSeconds: 30,
      intervalSeconds: 0,
      fetchImpl: fakeFetch(revisions),
      onTick: (revision) => seen.push(revision),
    });
    expect(last).toBe('new1');
    expect(seen).toEqual(['the app runs old1', 'the app runs old2', 'the app runs new1']);
  });

  it('gives up when the new version does not come', async () => {
    const last = await waitForDeploy({
      baseUrl: 'https://example.test',
      expectedRevision: 'new1',
      timeoutSeconds: 0,
      intervalSeconds: 0,
      fetchImpl: fakeFetch(['old1']),
    });
    expect(last).toBe('old1');
  });

  it('survives a host that does not answer', async () => {
    const last = await waitForDeploy({
      baseUrl: 'https://example.test',
      expectedRevision: 'new1',
      timeoutSeconds: 0,
      intervalSeconds: 0,
      fetchImpl: async () => {
        throw new Error('the host did not answer');
      },
    });
    expect(last).toBe('');
  });
});
