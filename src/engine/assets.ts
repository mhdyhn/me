/**
 * Asset loading with explicit states, cached successes, and retry. The viewer never
 * waits on an unknown state: every request ends in `ready` or in an `error` that names
 * a code the reader can act on.
 */
import { EngineError, type EngineErrorInfo } from './errors';

export type AssetStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface AssetState<T> {
  status: AssetStatus;
  value: T | null;
  error: EngineErrorInfo | null;
  /** Attempts made for the current request. */
  attempts: number;
}

export interface AssetLoaderOptions<T> {
  /** Loads one URL. Throw an EngineError, or any error that `classify` can map. */
  load: (url: string, signal: AbortSignal) => Promise<T>;
  /** Maps an unknown failure onto an engine error code. */
  classify?: (failure: unknown) => EngineError;
  maxAttempts?: number;
}

export interface AssetLoader<T> {
  /** Starts a load, or returns the cached value at once when one exists. */
  request(url: string): Promise<AssetState<T>>;
  /** Tries the current URL again after a retryable failure. */
  retry(): Promise<AssetState<T>>;
  state(): AssetState<T>;
  /** Cancels the in-flight request and drops the cache, e.g. when the viewer unmounts. */
  dispose(): void;
}

const IDLE = <T>(): AssetState<T> => ({ status: 'idle', value: null, error: null, attempts: 0 });

/** Default mapping: fetch-style failures become download errors, everything else is corrupt. */
export function classifyFailure(failure: unknown): EngineError {
  if (failure instanceof EngineError) return failure;
  if (failure instanceof TypeError) return new EngineError('download-failed', failure.message);
  if (failure instanceof SyntaxError || failure instanceof RangeError) return new EngineError('corrupt-asset', String(failure.message));
  return new EngineError('download-failed', String(failure));
}

export function createAssetLoader<T>(options: AssetLoaderOptions<T>): AssetLoader<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const classify = options.classify ?? classifyFailure;
  const cache = new Map<string, T>();
  let current: { url: string; controller: AbortController } | null = null;
  let snapshot: AssetState<T> = IDLE<T>();

  async function run(url: string): Promise<AssetState<T>> {
    const hit = cache.get(url);
    if (hit !== undefined) {
      snapshot = { status: 'ready', value: hit, error: null, attempts: snapshot.attempts };
      return snapshot;
    }
    current?.controller.abort();
    const controller = new AbortController();
    current = { url, controller };
    let attempts = snapshot.attempts;
    snapshot = { status: 'loading', value: null, error: null, attempts };

    for (;;) {
      attempts += 1;
      try {
        const value = await options.load(url, controller.signal);
        if (controller.signal.aborted) return snapshot;
        cache.set(url, value);
        snapshot = { status: 'ready', value, error: null, attempts };
        return snapshot;
      } catch (failure) {
        if (controller.signal.aborted) return snapshot;
        const engineError = classify(failure);
        const retry = engineError.info.retryable && attempts < maxAttempts;
        if (retry) continue;
        snapshot = { status: 'error', value: null, error: engineError.info, attempts };
        return snapshot;
      }
    }
  }

  return {
    request(url) {
      snapshot = { ...IDLE<T>(), attempts: 0 };
      return run(url);
    },
    retry() {
      if (!current) return Promise.resolve(snapshot);
      const { url } = current;
      return run(url);
    },
    state: () => snapshot,
    dispose() {
      current?.controller.abort();
      current = null;
      cache.clear();
      snapshot = IDLE<T>();
    },
  };
}

/**
 * Checks that a model file is present and is a binary glTF before the renderer is
 * asked to parse it. A 404 is a missing model, not a download problem, so it is not retried.
 */
export async function probeModel(url: string, signal: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<ArrayBuffer> {
  const response = await fetchImpl(url, { signal });
  if (response.status === 404) throw new EngineError('missing-model', url);
  if (!response.ok) throw new EngineError('download-failed', `HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  const magic = new TextDecoder().decode(buffer.slice(0, 4));
  if (magic !== 'glTF') throw new EngineError('corrupt-asset', `${url} is not a binary glTF`);
  return buffer;
}
