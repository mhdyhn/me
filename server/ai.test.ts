// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aiConfig, askAi } from './ai.ts';
import { createApp } from './app.ts';
import { ensureAdmin } from './bootstrap.ts';
import { openDatabase, type Db } from './db.ts';
import { keyFromSecret } from './secrets.ts';

/** A fresh mobile number for every account: one number belongs to one account only. */
let phoneSequence = 0;
function nextPhone(): string {
  phoneSequence += 1;
  return `0912${String(4560000 + phoneSequence)}`;
}

type Json = Record<string, any>;
let db: Db;
let server: Server;
let base: string;
const clock = new Date('2026-10-30T08:00:00Z');

beforeEach(async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('COACH_COMMISSION_PERCENT', '90');
  vi.stubEnv('AI_API_KEY', '');
  vi.stubEnv('AI_BASE_URL', '');
  db = await openDatabase('memory');
  await ensureAdmin(db, 'owner', 'owner-pass-123', clock);
  server = createServer(createApp({ db, now: () => clock, secretKey: keyFromSecret('ai-suite-secret') }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function call(method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; json: Json }> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, json: await response.json() as Json };
}

async function signIn(username: string, password: string): Promise<string> {
  return (await call('POST', '/api/auth/login', { username, password })).json.token as string;
}

async function createCoach(admin: string) {
  const created = await call('POST', '/api/coaches', { phoneNumber: nextPhone(), displayName: 'مربی' }, admin);
  const token = await signIn(created.json.username, created.json.password);
  await call('POST', '/api/me/password', { currentPassword: created.json.password, newPassword: 'coach-test-pass-1' }, token);
  return { id: created.json.user.id as number, token };
}

async function createStudent(coachToken: string, name = 'شاگرد') {
  const created = await call('POST', '/api/students', { phoneNumber: nextPhone(), displayName: name }, coachToken);
  const token = await signIn(created.json.username, created.json.password);
  await call('POST', '/api/me/password', { currentPassword: created.json.password, newPassword: 'student-test-pass-1' }, token);
  return { id: created.json.user.id as number, token };
}

describe('the internal AI of the club', () => {
  it('stays off without a key and refuses an unsafe endpoint', () => {
    expect(aiConfig({} as NodeJS.ProcessEnv).enabled).toBe(false);
    expect(aiConfig({ AI_API_KEY: 'k' } as NodeJS.ProcessEnv).enabled).toBe(false);
    const plain = aiConfig({ AI_API_KEY: 'k', AI_BASE_URL: 'http://example.com/v1' } as NodeJS.ProcessEnv);
    expect(plain.enabled).toBe(false);
    expect(plain.reason).toContain('HTTPS');
    const withUser = aiConfig({ AI_API_KEY: 'k', AI_BASE_URL: 'https://user:pw@example.com/v1' } as NodeJS.ProcessEnv);
    expect(withUser.enabled).toBe(false);
    const good = aiConfig({ AI_API_KEY: 'k', AI_BASE_URL: 'https://api.example.com/v1', AI_MODEL: 'm' } as NodeJS.ProcessEnv);
    expect(good).toMatchObject({ enabled: true, baseUrl: 'https://api.example.com/v1', model: 'm' });
  });

  it('asks the service and stays quiet when the service fails', async () => {
    vi.stubEnv('AI_API_KEY', 'k');
    const config = aiConfig({ AI_API_KEY: 'k', AI_BASE_URL: 'https://api.example.com/v1' } as NodeJS.ProcessEnv);
    expect(await askAi({ ...config, enabled: false }, 'a', 'b')).toBeNull();

    const fetchMock = vi.fn(async (_input: string | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ choices: [{ message: { content: '  متن   خوب  ' } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await askAi(config, 'a', 'b')).toBe('متن خوب');
    const sent = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body));
    expect(sent.model).toBe('gpt-4o-mini');
    expect(sent.messages[1].content).toBe('b');

    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    expect(await askAi(config, 'a', 'b')).toBeNull();
    vi.unstubAllGlobals();
  });

  it('writes the smart lines with the rules when no AI is configured', async () => {
    const admin = await signIn('owner', 'owner-pass-123');
    const coach = await createCoach(admin);
    const student = await createStudent(coach.token);

    const insight = await call('GET', '/api/me/insight', undefined, student.token);
    expect(insight.status).toBe(200);
    expect(insight.json.insight.source).toBe('rules');
    expect(insight.json.insight.text).toContain('جلسه');

    const report = await call('GET', '/api/coach/inactive-students', undefined, coach.token);
    expect(report.status).toBe(200);
    expect(report.json.insight.source).toBe('rules');
    expect(report.json.insight.text).toContain('شاگرد');

    const status = await call('GET', '/api/admin/ai', undefined, admin);
    expect(status.json.enabled).toBe(false);
    expect(status.json.reason).toBeTruthy();
    expect((await call('GET', '/api/admin/ai', undefined, coach.token)).status).toBe(403);
  });

  it('lets the model write the line but never sends a name out of the club', async () => {
    vi.stubEnv('AI_API_KEY', 'k');
    vi.stubEnv('AI_BASE_URL', 'https://api.example.com/v1');
    const admin = await signIn('owner', 'owner-pass-123');
    const coach = await createCoach(admin);
    await createStudent(coach.token, 'سارا');

    const realFetch = globalThis.fetch;
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      if (!String(input).includes('api.example.com')) return realFetch(input, init);
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'شاگرد ۱ مدتی است تمرین نکرده؛ با او تماس بگیرید.' } }] }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const report = await call('GET', '/api/coach/inactive-students', undefined, coach.token);
    expect(report.json.insight.source).toBe('ai');
    // The name of the student is put back inside the app.
    expect(report.json.insight.text).toContain('سارا');
    expect(report.json.insight.text).not.toContain('شاگرد ۱');
    // The name was not sent to the service.
    const sent = String(fetchMock.mock.calls[0]![1]!.body);
    expect(sent).not.toContain('سارا');
    vi.unstubAllGlobals();
  });
});
