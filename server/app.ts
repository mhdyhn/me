import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { createSession, deleteSession, deleteSessionsForUser, generatePassword, generateUsername, hashPassword, userIdForToken, verifyPassword } from './auth.ts';
import { HttpError, clearSessionCookie, readCookie, readJsonBody, requireObject, requireText, SESSION_COOKIE, SESSION_HEADER, sessionCookie } from './http.ts';
import { countStudents, deleteUser, findUserById, findUserByUsername, insertUser, listCoachSummaries, listStudents, toPublic, updatePassword, type Role, type StoredUser } from './users.ts';
import { loadProgramme, saveProgramme, validateProgramme } from './programs.ts';
import { MESSAGE_MAX, addMessage, listMessages } from './chat.ts';
import { encryptSecret, type SecretKey } from './secrets.ts';
import { emptyPlan, loadDiary, loadPlan, saveDiary, savePlan, validateDay, validateDiary, validatePlan } from './nutrition.ts';

export interface AppOptions {
  db: DatabaseSync;
  /** Key for the encrypted copy of generated passwords. Required: there is no built-in default. */
  secretKey: SecretKey;
  /** Injected clock so tests can move time forward (session expiry, lock windows). */
  now?: () => Date;
  maxFailedLogins?: number;
  lockMinutes?: number;
}

interface Context {
  user: StoredUser | null;
  token: string | null;
  body: unknown;
  params: string[];
}

interface RouteResult {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

type Auth = 'public' | 'signed-in' | Role[];

interface Route {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  pattern: RegExp;
  auth: Auth;
  handler: (ctx: Context) => RouteResult;
}

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
const NAME_MIN = 2;
const NAME_MAX = 60;

/** Routes a student may still call before changing a generated password. */
const ALWAYS_ALLOWED = new Set(['/api/me', '/api/me/password', '/api/auth/logout']);

/**
 * Creates the request handler. Coaches create students; students only read their own data.
 * Login attempts are limited per username so a generated password cannot be guessed by
 * repeated tries.
 */
export function createApp(options: AppOptions) {
  const { db, secretKey } = options;
  const now = options.now ?? (() => new Date());
  const maxFailed = options.maxFailedLogins ?? 5;
  const lockMs = (options.lockMinutes ?? 15) * 60 * 1000;
  const failures = new Map<string, { count: number; lockedUntil: number }>();

  // Hashed once at startup. Used when the username does not exist so a failed login takes
  // the same time either way and does not reveal which usernames are registered.
  const dummyHash = hashPassword(generatePassword(24));

  function assertNotLocked(username: string): void {
    const entry = failures.get(username);
    if (entry && entry.lockedUntil > now().getTime()) {
      throw new HttpError(429, 'تعداد تلاش‌های ناموفق زیاد بود. چند دقیقه صبر کنید و دوباره امتحان کنید.');
    }
  }

  function recordFailure(username: string): void {
    const entry = failures.get(username) ?? { count: 0, lockedUntil: 0 };
    entry.count += 1;
    if (entry.count >= maxFailed) {
      entry.lockedUntil = now().getTime() + lockMs;
      entry.count = 0;
    }
    failures.set(username, entry);
  }

  /** The admin's view of a coach. Same answer for missing and non-coach ids. */
  function ownCoach(coachId: number): StoredUser {
    const coach = findUserById(db, coachId);
    if (!coach || coach.role !== 'coach') throw new HttpError(404, 'مربی پیدا نشد.');
    return coach;
  }

  function ownStudent(coach: StoredUser, studentId: number): StoredUser {
    const student = findUserById(db, studentId);
    if (!student || student.role !== 'student' || student.coachId !== coach.id) {
      // Same answer for "missing" and "belongs to another coach", so ids cannot be probed.
      throw new HttpError(404, 'شاگرد پیدا نشد.');
    }
    return student;
  }

  const routes: Route[] = [
    {
      method: 'GET',
      pattern: /^\/api\/?$/,
      auth: 'public',
      handler: () => ({ status: 200, body: { name: 'Meety API', ok: true } }),
    },

    {
      method: 'GET',
      pattern: /^\/api\/health$/,
      auth: 'public',
      handler: () => ({ status: 200, body: { ok: true } }),
    },

    {
      method: 'POST',
      pattern: /^\/api\/auth\/login$/,
      auth: 'public',
      handler: ({ body }) => {
        const input = requireObject(body);
        const username = requireText(input, 'username', 1, 64, 'نام کاربری');
        const password = requireText(input, 'password', 1, PASSWORD_MAX, 'رمز عبور');
        assertNotLocked(username);
        const user = findUserByUsername(db, username);
        const valid = user ? verifyPassword(password, user.passwordHash) : (verifyPassword(password, dummyHash), false);
        if (!user || !valid) {
          recordFailure(username);
          throw new HttpError(401, 'نام کاربری یا رمز عبور اشتباه است.');
        }
        failures.delete(username);
        const token = createSession(db, user.id, now());
        return { status: 200, body: { token, user: toPublic(user) }, headers: { 'Set-Cookie': sessionCookie(token) } };
      },
    },

    {
      method: 'POST',
      pattern: /^\/api\/auth\/logout$/,
      auth: 'signed-in',
      handler: ({ token }) => {
        if (token) deleteSession(db, token);
        return { status: 200, body: { ok: true }, headers: { 'Set-Cookie': clearSessionCookie() } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/me$/,
      auth: 'signed-in',
      handler: ({ user }) => ({ status: 200, body: { user: toPublic(user!) } }),
    },

    {
      method: 'POST',
      pattern: /^\/api\/me\/password$/,
      auth: 'signed-in',
      handler: ({ user, body }) => {
        const input = requireObject(body);
        const current = requireText(input, 'currentPassword', 1, PASSWORD_MAX, 'رمز فعلی');
        const next = requireText(input, 'newPassword', PASSWORD_MIN, PASSWORD_MAX, 'رمز جدید');
        if (!verifyPassword(current, user!.passwordHash)) throw new HttpError(400, 'رمز فعلی درست نیست.');
        if (next === current) throw new HttpError(400, 'رمز جدید باید با رمز فعلی فرق داشته باشد.');
        updatePassword(db, user!.id, hashPassword(next), false, null);
        return { status: 200, body: { ok: true } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/coaches$/,
      auth: ['admin'],
      handler: () => ({ status: 200, body: { coaches: listCoachSummaries(db, secretKey) } }),
    },

    {
      method: 'POST',
      pattern: /^\/api\/coaches$/,
      auth: ['admin'],
      handler: ({ body }) => {
        const input = requireObject(body);
        const displayName = requireText(input, 'displayName', NAME_MIN, NAME_MAX, 'نام مربی');
        const username = generateUsername(db, 'c');
        const password = generatePassword();
        const id = insertUser(db, {
          username,
          passwordHash: hashPassword(password),
          passwordEnc: encryptSecret(secretKey, password),
          role: 'coach',
          displayName,
          coachId: null,
          mustChangePassword: true,
          now: now(),
        });
        return { status: 201, body: { user: toPublic(findUserById(db, id)!), username, password } };
      },
    },

    {
      method: 'DELETE',
      pattern: /^\/api\/coaches\/(\d+)$/,
      auth: ['admin'],
      handler: ({ params }) => {
        const coach = ownCoach(Number(params[0]));
        const students = countStudents(db, coach.id);
        if (students > 0) {
          throw new HttpError(409, `این مربی هنوز ${students} شاگرد دارد. ابتدا شاگردهایش را حذف کنید.`);
        }
        deleteSessionsForUser(db, coach.id);
        deleteUser(db, coach.id);
        return { status: 200, body: { ok: true } };
      },
    },

    {
      method: 'POST',
      pattern: /^\/api\/coaches\/(\d+)\/reset-password$/,
      auth: ['admin'],
      handler: ({ params }) => {
        const coach = ownCoach(Number(params[0]));
        const password = generatePassword();
        updatePassword(db, coach.id, hashPassword(password), true, encryptSecret(secretKey, password));
        deleteSessionsForUser(db, coach.id);
        return { status: 200, body: { username: coach.username, password } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/students$/,
      auth: ['coach'],
      handler: ({ user }) => ({ status: 200, body: { students: listStudents(db, user!.id, secretKey) } }),
    },

    {
      method: 'POST',
      pattern: /^\/api\/students$/,
      auth: ['coach'],
      handler: ({ user, body }) => {
        const input = requireObject(body);
        const displayName = requireText(input, 'displayName', NAME_MIN, NAME_MAX, 'نام شاگرد');
        const username = generateUsername(db, 's');
        const password = generatePassword();
        const id = insertUser(db, {
          username,
          passwordHash: hashPassword(password),
          passwordEnc: encryptSecret(secretKey, password),
          role: 'student',
          displayName,
          coachId: user!.id,
          mustChangePassword: true,
          now: now(),
        });
        return { status: 201, body: { user: toPublic(findUserById(db, id)!), username, password } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/students\/(\d+)\/program$/,
      auth: ['coach'],
      handler: ({ user, params }) => {
        const student = ownStudent(user!, Number(params[0]));
        return { status: 200, body: { program: loadProgramme(db, student.id) } };
      },
    },

    {
      method: 'PUT',
      pattern: /^\/api\/students\/(\d+)\/program$/,
      auth: ['coach'],
      handler: ({ user, params, body }) => {
        const student = ownStudent(user!, Number(params[0]));
        const programme = validateProgramme(body);
        return { status: 200, body: { program: saveProgramme(db, student.id, user!.id, programme, now()) } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/me\/nutrition$/,
      auth: ['student'],
      handler: ({ user }) => {
        const coach = findUserById(db, user!.coachId!);
        return { status: 200, body: { coachName: coach?.displayName ?? null, plan: loadPlan(db, user!.id) } };
      },
    },

    // Personal meal diary: any signed-in user, only their own days.
    {
      method: 'GET',
      pattern: /^\/api\/me\/diary\/([^/]+)$/,
      auth: 'signed-in',
      handler: ({ user, params }) => {
        const day = validateDay(decodeURIComponent(params[0]!));
        return { status: 200, body: { diary: loadDiary(db, user!.id, day) } };
      },
    },

    {
      method: 'PUT',
      pattern: /^\/api\/me\/diary$/,
      auth: 'signed-in',
      handler: ({ user, body }) => {
        const diary = validateDiary(body);
        return { status: 200, body: { diary: saveDiary(db, user!.id, diary.day, diary.meals, now().toISOString()) } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/students\/(\d+)\/nutrition$/,
      auth: ['coach'],
      handler: ({ user, params }) => {
        const student = ownStudent(user!, Number(params[0]));
        return { status: 200, body: { plan: loadPlan(db, student.id) ?? emptyPlan() } };
      },
    },

    {
      method: 'PUT',
      pattern: /^\/api\/students\/(\d+)\/nutrition$/,
      auth: ['coach'],
      handler: ({ user, params, body }) => {
        const student = ownStudent(user!, Number(params[0]));
        const plan = validatePlan(body);
        return { status: 200, body: { plan: savePlan(db, student.id, user!.id, plan, now().toISOString()) } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/me\/chat$/,
      auth: ['student'],
      handler: ({ user }) => {
        const coach = findUserById(db, user!.coachId!);
        return { status: 200, body: { coachName: coach?.displayName ?? null, messages: listMessages(db, user!.coachId!, user!.id) } };
      },
    },

    {
      method: 'POST',
      pattern: /^\/api\/me\/chat$/,
      auth: ['student'],
      handler: ({ user, body }) => {
        const input = requireObject(body);
        const text = requireText(input, 'body', 1, MESSAGE_MAX, 'پیام');
        return { status: 201, body: { message: addMessage(db, user!.coachId!, user!.id, user!.id, text, now().toISOString()) } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/students\/(\d+)\/chat$/,
      auth: ['coach'],
      handler: ({ user, params }) => {
        const student = ownStudent(user!, Number(params[0]));
        return { status: 200, body: { studentName: student.displayName, messages: listMessages(db, user!.id, student.id) } };
      },
    },

    {
      method: 'POST',
      pattern: /^\/api\/students\/(\d+)\/chat$/,
      auth: ['coach'],
      handler: ({ user, params, body }) => {
        const student = ownStudent(user!, Number(params[0]));
        const input = requireObject(body);
        const text = requireText(input, 'body', 1, MESSAGE_MAX, 'پیام');
        return { status: 201, body: { message: addMessage(db, user!.id, student.id, user!.id, text, now().toISOString()) } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/me\/program$/,
      auth: ['student'],
      handler: ({ user }) => {
        const coach = findUserById(db, user!.coachId!);
        return { status: 200, body: { program: loadProgramme(db, user!.id), coachName: coach?.displayName ?? null } };
      },
    },

    {
      method: 'DELETE',
      pattern: /^\/api\/students\/(\d+)$/,
      auth: ['coach'],
      handler: ({ user, params }) => {
        const student = ownStudent(user!, Number(params[0]));
        deleteSessionsForUser(db, student.id);
        deleteUser(db, student.id);
        return { status: 200, body: { ok: true } };
      },
    },

    {
      method: 'POST',
      pattern: /^\/api\/students\/(\d+)\/reset-password$/,
      auth: ['coach'],
      handler: ({ user, params }) => {
        const student = ownStudent(user!, Number(params[0]));
        const password = generatePassword();
        updatePassword(db, student.id, hashPassword(password), true, encryptSecret(secretKey, password));
        deleteSessionsForUser(db, student.id);
        return { status: 200, body: { username: student.username, password } };
      },
    },
  ];

  /** Accepts the bearer header or the session cookie. Reports which one was used, because cookie requests need a CSRF check. */
  function authenticate(request: IncomingMessage): { user: StoredUser | null; token: string | null; viaCookie: boolean } {
    // Three channels, because preview proxies and browsers differ in what they pass through:
    // the Authorization header, a custom header (proxies rarely strip it), and the session cookie.
    const bearer = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(request.headers.authorization ?? '');
    const custom = request.headers[SESSION_HEADER];
    const customValue = typeof custom === 'string' ? custom : '';
    const header = /^[A-Za-z0-9_-]{20,200}$/.test(customValue) ? customValue : null;
    const cookie = readCookie(request.headers.cookie, SESSION_COOKIE);
    const fromCookie = cookie && /^[A-Za-z0-9_-]{20,200}$/.test(cookie) ? cookie : null;
    const candidate = bearer ? bearer[1] : header ?? fromCookie;
    if (!candidate) return { user: null, token: null, viaCookie: false };
    const userId = userIdForToken(db, candidate, now());
    if (userId === null) return { user: null, token: null, viaCookie: false };
    // Only a cookie-only session is subject to the JSON-only rule for writes (CSRF protection).
    return { user: findUserById(db, userId), token: candidate, viaCookie: !bearer && !header };
  }

  function dispatch(request: IncomingMessage, body: unknown): RouteResult {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const method = request.method ?? 'GET';
    const pathMatches = routes.filter((route) => route.pattern.test(url.pathname));
    if (pathMatches.length === 0) throw new HttpError(404, 'مسیر پیدا نشد.');
    const route = pathMatches.find((candidate) => candidate.method === method);
    if (!route) throw new HttpError(405, 'این روش برای این مسیر مجاز نیست.');

    const { user, token, viaCookie } = authenticate(request);
    // Cookie-authenticated writes must be JSON. A cross-site form cannot send that type without a preflight.
    if (viaCookie && method !== 'GET') {
      const type = String(request.headers['content-type'] ?? '');
      if (!type.startsWith('application/json')) throw new HttpError(415, 'درخواست باید JSON باشد.');
    }
    if (route.auth !== 'public') {
      if (!user) throw new HttpError(401, 'ابتدا وارد شوید.');
      if (Array.isArray(route.auth) && !route.auth.includes(user.role)) throw new HttpError(403, 'دسترسی به این بخش ندارید.');
      if (user.mustChangePassword && !ALWAYS_ALLOWED.has(url.pathname)) {
        throw new HttpError(403, 'ابتدا رمز عبور خود را تغییر دهید.');
      }
    }
    const params = route.pattern.exec(url.pathname)?.slice(1) ?? [];
    return route.handler({ user, token, body, params });
  }

  return async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    // A human opening the API address gets a readable page, not a blank JSON view.
    if (request.method === 'GET' && new URL(request.url ?? '/', 'http://localhost').pathname === '/') {
      sendHtml(response, STATUS_PAGE);
      return;
    }
    try {
      const body = request.method === 'GET' ? {} : await readJsonBody(request);
      const result = dispatch(request, body);
      send(response, result.status, result.body, result.headers);
    } catch (error) {
      if (error instanceof HttpError) {
        send(response, error.status, { error: error.message });
      } else {
        console.error(error);
        send(response, 500, { error: 'خطای داخلی سرور.' });
      }
    }
  };
}

const STATUS_PAGE = `<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Meety API</title></head>
<body style="font-family:Tahoma,Arial,sans-serif;background:#0e1110;color:#edf1ec;padding:24px;line-height:1.9">
<h1 style="font-size:20px">سرور میتی در حال اجراست</h1>
<p>این آدرس فقط سرور API است و صفحهٔ برنامه نیست. برای باز کردن برنامه، پیش‌نمایش پورت <strong>5180</strong> را باز کن.</p>
<p>وضعیت سرور: <a style="color:#d9f66f" href="/api/">/api/</a></p>
</body></html>`;

function sendHtml(response: ServerResponse, html: string): void {
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(html),
    'Cache-Control': 'no-store',
  });
  response.end(html);
}

function send(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    ...headers,
  });
  response.end(payload);
}
