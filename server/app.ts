import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { createSession, deleteSession, deleteSessionsForUser, generatePassword, generateUsername, hashPassword, userIdForToken, verifyPassword } from './auth.ts';
import { HttpError, readJsonBody, requireObject, requireText } from './http.ts';
import { findUserById, findUserByUsername, insertUser, listCoaches, listStudents, toPublic, updatePassword, type Role, type StoredUser } from './users.ts';
import { loadProgramme, saveProgramme, validateProgramme } from './programs.ts';

export interface AppOptions {
  db: DatabaseSync;
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
}

type Auth = 'public' | 'signed-in' | Role[];

interface Route {
  method: 'GET' | 'POST' | 'PUT';
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
  const { db } = options;
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
        return { status: 200, body: { token, user: toPublic(user) } };
      },
    },

    {
      method: 'POST',
      pattern: /^\/api\/auth\/logout$/,
      auth: 'signed-in',
      handler: ({ token }) => {
        if (token) deleteSession(db, token);
        return { status: 200, body: { ok: true } };
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
        updatePassword(db, user!.id, hashPassword(next), false);
        return { status: 200, body: { ok: true } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/coaches$/,
      auth: ['admin'],
      handler: () => ({ status: 200, body: { coaches: listCoaches(db) } }),
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
      method: 'GET',
      pattern: /^\/api\/students$/,
      auth: ['coach'],
      handler: ({ user }) => ({ status: 200, body: { students: listStudents(db, user!.id) } }),
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
      pattern: /^\/api\/me\/program$/,
      auth: ['student'],
      handler: ({ user }) => {
        const coach = findUserById(db, user!.coachId!);
        return { status: 200, body: { program: loadProgramme(db, user!.id), coachName: coach?.displayName ?? null } };
      },
    },

    {
      method: 'POST',
      pattern: /^\/api\/students\/(\d+)\/reset-password$/,
      auth: ['coach'],
      handler: ({ user, params }) => {
        const student = ownStudent(user!, Number(params[0]));
        const password = generatePassword();
        updatePassword(db, student.id, hashPassword(password), true);
        deleteSessionsForUser(db, student.id);
        return { status: 200, body: { username: student.username, password } };
      },
    },
  ];

  function authenticate(request: IncomingMessage): { user: StoredUser | null; token: string | null } {
    const match = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(request.headers.authorization ?? '');
    if (!match) return { user: null, token: null };
    const userId = userIdForToken(db, match[1], now());
    if (userId === null) return { user: null, token: null };
    return { user: findUserById(db, userId), token: match[1] };
  }

  function dispatch(request: IncomingMessage, body: unknown): RouteResult {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const method = request.method ?? 'GET';
    const pathMatches = routes.filter((route) => route.pattern.test(url.pathname));
    if (pathMatches.length === 0) throw new HttpError(404, 'مسیر پیدا نشد.');
    const route = pathMatches.find((candidate) => candidate.method === method);
    if (!route) throw new HttpError(405, 'این روش برای این مسیر مجاز نیست.');

    const { user, token } = authenticate(request);
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
    try {
      const body = request.method === 'GET' ? {} : await readJsonBody(request);
      const result = dispatch(request, body);
      send(response, result.status, result.body);
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

function send(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  response.end(payload);
}
