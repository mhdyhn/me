import { describe, expect, it, vi } from 'vitest';
import { EngineError, classifyFailure, createAssetLoader, probeModel } from '../../src/engine';

const deferredOk = <T,>(value: T) => async () => value;

describe('asset loader states', () => {
  it('goes idle → loading → ready and caches the value', async () => {
    const load = vi.fn(deferredOk('model'));
    const loader = createAssetLoader({ load });
    const ready = await loader.request('/models/a.glb');
    expect(ready.status).toBe('ready');
    expect(ready.value).toBe('model');
    await loader.request('/models/a.glb');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('retries a retryable failure and succeeds', async () => {
    let calls = 0;
    const loader = createAssetLoader({
      load: async () => {
        calls += 1;
        if (calls < 2) throw new TypeError('network down');
        return 'ok';
      },
    });
    const state = await loader.request('/models/a.glb');
    expect(state.status).toBe('ready');
    expect(state.attempts).toBe(2);
  });

  it('stops after the attempt limit and reports download-failed with retry available', async () => {
    const loader = createAssetLoader({
      maxAttempts: 2,
      load: async () => {
        throw new TypeError('offline');
      },
    });
    const state = await loader.request('/models/a.glb');
    expect(state.status).toBe('error');
    expect(state.error?.code).toBe('download-failed');
    expect(state.error?.retryable).toBe(true);
    expect(state.attempts).toBe(2);
  });

  it('does not retry a missing model', async () => {
    const load = vi.fn(async () => {
      throw new EngineError('missing-model', '/models/none.glb');
    });
    const loader = createAssetLoader({ load, maxAttempts: 5 });
    const state = await loader.request('/models/none.glb');
    expect(load).toHaveBeenCalledTimes(1);
    expect(state.error?.code).toBe('missing-model');
    expect(state.error?.retryable).toBe(false);
  });

  it('retry() repeats the last URL after a failure', async () => {
    let fail = true;
    const loader = createAssetLoader({
      maxAttempts: 1,
      load: async () => {
        if (fail) throw new TypeError('offline');
        return 'ok';
      },
    });
    expect((await loader.request('/models/a.glb')).status).toBe('error');
    fail = false;
    expect((await loader.retry()).status).toBe('ready');
  });

  it('dispose() drops the cache so the next request loads again', async () => {
    const load = vi.fn(deferredOk('model'));
    const loader = createAssetLoader({ load });
    await loader.request('/models/a.glb');
    loader.dispose();
    expect(loader.state().status).toBe('idle');
    await loader.request('/models/a.glb');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('a newer request wins over an older one still in flight', async () => {
    const loader = createAssetLoader({
      load: (url) => new Promise((resolve) => setTimeout(() => resolve(url), url.includes('slow') ? 40 : 1)),
    });
    const slow = loader.request('/models/slow.glb');
    const fast = await loader.request('/models/fast.glb');
    expect(fast.value).toBe('/models/fast.glb');
    await slow;
    expect(loader.state().value).toBe('/models/fast.glb');
  });
});

describe('failure classification', () => {
  it('keeps engine errors as they are', () => {
    expect(classifyFailure(new EngineError('corrupt-asset')).code).toBe('corrupt-asset');
  });
  it('maps a parse failure to corrupt-asset', () => {
    expect(classifyFailure(new SyntaxError('bad json')).code).toBe('corrupt-asset');
  });
  it('maps an unknown failure to download-failed', () => {
    expect(classifyFailure('something').code).toBe('download-failed');
  });
});

describe('model probe', () => {
  const abort = new AbortController().signal;
  const response = (status: number, body = new Uint8Array()) =>
    (async () => new Response(body, { status })) as unknown as typeof fetch;

  it('reports a 404 as a missing model', async () => {
    await expect(probeModel('/models/x.glb', abort, response(404))).rejects.toMatchObject({ code: 'missing-model' });
  });

  it('reports a non-binary-glTF body as corrupt', async () => {
    const body = new TextEncoder().encode('<html>');
    await expect(probeModel('/models/x.glb', abort, response(200, body))).rejects.toMatchObject({ code: 'corrupt-asset' });
  });

  it('accepts a binary glTF header', async () => {
    const body = new TextEncoder().encode('glTF\u0002\u0000\u0000\u0000');
    const buffer = await probeModel('/models/x.glb', abort, response(200, body));
    expect(buffer.byteLength).toBeGreaterThan(4);
  });

  it('reports other HTTP failures as a download problem', async () => {
    await expect(probeModel('/models/x.glb', abort, response(503))).rejects.toMatchObject({ code: 'download-failed' });
  });
});
