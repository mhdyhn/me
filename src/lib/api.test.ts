import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, setToken, UNAUTHORIZED_EVENT } from './api';

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe('session-bound API requests', () => {
  it('does not send a replacement cookie or log out a newer session after a stale 401', async () => {
    setToken('old-session');
    let release!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { release = resolve; });
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => pending);
    vi.stubGlobal('fetch', fetchMock);
    const unauthorized = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, unauthorized);
    try {
      const request = api('GET', '/me', undefined, 10000, 'old-session');
      const options = fetchMock.mock.calls[0]?.[1];
      expect(options?.credentials).toBe('omit');
      expect(options?.headers).toMatchObject({ Authorization: 'Bearer old-session', 'X-Meety-Session': 'old-session' });
      setToken('new-session');
      release({ status: 401, ok: false, json: async () => ({ error: 'نشست منقضی شد' }) } as Response);
      await expect(request).rejects.toThrow('نشست منقضی شد');
      expect(unauthorized).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(UNAUTHORIZED_EVENT, unauthorized);
    }
  });

  it('still notifies the application if the current session is rejected', async () => {
    setToken('current-session');
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 401, ok: false, json: async () => ({ error: 'نشست منقضی شد' }) } as Response)));
    const unauthorized = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, unauthorized);
    try {
      await expect(api('GET', '/me')).rejects.toThrow('نشست منقضی شد');
      expect(unauthorized).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener(UNAUTHORIZED_EVENT, unauthorized);
    }
  });
});
