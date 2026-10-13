import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Db } from './db.ts';
import { createSession, deleteSession, deleteSessionsForUser, generatePassword, generateUsername, hashPassword, userForToken, verifyPassword } from './auth.ts';
import { HttpError, SESSIONS_BODY_BYTES, CHAT_BODY_BYTES, clearSessionCookie, readCookie, readJsonBody, requireObject, requireText, SESSION_COOKIE, SESSION_HEADER, sessionCookie } from './http.ts';
import { countStudents, deleteUser, findUserById, findUserByUsername, insertUser, listCoachSummaries, listStudents, toPublic, updateCoachIban, updatePassword, type Role, type StoredUser } from './users.ts';
import { loadProgramme, saveProgramme, validateProgramme } from './programs.ts';
import { MESSAGE_MAX, addAdminCoachMessage, addMessage, listAdminCoachMessages, listMessages } from './chat.ts';
import { createPaymentRequest, getTransactionByAuthority, isProgramPaid, listAllTransactions, listCoachTransactions, normalizeIban, verifyPayment } from './payments.ts';
import { encryptSecret, type SecretKey } from './secrets.ts';
import { emptyPlan, loadDiary, loadPlan, saveDiary, savePlan, validateDay, validateDiary, validatePlan } from './nutrition.ts';
import { listSummaries, saveSummaries, validateSummaries } from './sessions.ts';

export interface AppOptions {
  db: Db;
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
  url: URL;
  request: IncomingMessage;
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
  handler: (ctx: Context) => Promise<RouteResult>;
}

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
const NAME_MIN = 2;
const NAME_MAX = 60;

/** Routes a student may still call before changing a generated password. */
const ALWAYS_ALLOWED = new Set(['/api/me', '/api/me/password', '/api/auth/logout']);

function parseMessageInput(body: unknown): { text: string; mediaType: string | null; mediaData: string | null } {
  const input = requireObject(body);
  const mediaType = typeof input.mediaType === 'string' && ['image', 'voice', 'video', 'text'].includes(input.mediaType) ? input.mediaType : null;
  const mediaData = typeof input.mediaData === 'string' && input.mediaData.length > 0 ? input.mediaData : null;
  if (typeof input.body === 'string' && input.body.trim().length > MESSAGE_MAX) {
    throw new HttpError(400, `پیام باید حداکثر ${MESSAGE_MAX} نویسه باشد.`);
  }
  const rawBody = typeof input.body === 'string' ? input.body.trim() : '';
  const text = rawBody || (mediaType === 'voice' ? 'پیام صوتی' : mediaType === 'image' ? 'تصویر' : mediaType === 'video' ? 'ویدیو' : '');
  if (!text && !mediaData) throw new HttpError(400, 'متن یا فایل پیام را وارد کنید.');
  return { text, mediaType, mediaData };
}

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

  function cleanExpiredFailures(): void {
    const current = now().getTime();
    for (const [userKey, data] of failures.entries()) {
      if (data.lockedUntil > 0 && data.lockedUntil <= current) {
        failures.delete(userKey);
      }
    }
  }

  // Hashed once at startup. Used when the username does not exist so a failed login takes
  // the same time either way and does not reveal which usernames are registered.
  const dummyHash = hashPassword(generatePassword(24));

  function assertNotLocked(username: string): void {
    cleanExpiredFailures();
    const entry = failures.get(username);
    if (entry && entry.lockedUntil > now().getTime()) {
      throw new HttpError(429, 'تعداد تلاش‌های ناموفق زیاد بود. چند دقیقه صبر کنید و دوباره امتحان کنید.');
    }
  }

  function recordFailure(username: string): void {
    cleanExpiredFailures();
    const entry = failures.get(username) ?? { count: 0, lockedUntil: 0 };
    entry.count += 1;
    if (entry.count >= maxFailed) {
      entry.lockedUntil = now().getTime() + lockMs;
      entry.count = 0;
    }
    failures.set(username, entry);
  }

  /** The admin's view of a coach. Same answer for missing and non-coach ids. */
  async function ownCoach(coachId: number): Promise<StoredUser> {
    const coach = await findUserById(db, coachId);
    if (!coach || coach.role !== 'coach') throw new HttpError(404, 'مربی پیدا نشد.');
    return coach;
  }

  async function ownStudent(coach: StoredUser, studentId: number): Promise<StoredUser> {
    const student = await findUserById(db, studentId);
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
      handler: async () => ({ status: 200, body: { name: 'Meety API', ok: true } }),
    },

    {
      method: 'GET',
      pattern: /^\/api\/health$/,
      auth: 'public',
      // Also touches the database, so the free database stays awake between visits (the monitor pings this every few minutes).
      handler: async () => {
        try {
          await db.query('SELECT 1');
          return { status: 200, body: { ok: true, database: true } };
        } catch {
          return { status: 503, body: { ok: false, database: false } };
        }
      },
    },

    {
      method: 'POST',
      pattern: /^\/api\/auth\/login$/,
      auth: 'public',
      handler: async ({ body }) => {
        const input = requireObject(body);
        const username = requireText(input, 'username', 1, 64, 'نام کاربری');
        const password = requireText(input, 'password', 1, PASSWORD_MAX, 'رمز عبور');
        assertNotLocked(username);
        const user = await findUserByUsername(db, username);
        const valid = user ? verifyPassword(password, user.passwordHash) : (verifyPassword(password, dummyHash), false);
        if (!user || !valid) {
          recordFailure(username);
          throw new HttpError(401, 'نام کاربری یا رمز عبور اشتباه است.');
        }
        failures.delete(username);
        const token = await createSession(db, user.id, now());
        return { status: 200, body: { token, user: toPublic(user) }, headers: { 'Set-Cookie': sessionCookie(token) } };
      },
    },

    {
      method: 'POST',
      pattern: /^\/api\/auth\/logout$/,
      auth: 'signed-in',
      handler: async ({ token }) => {
        if (token) await deleteSession(db, token);
        return { status: 200, body: { ok: true }, headers: { 'Set-Cookie': clearSessionCookie() } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/me$/,
      auth: 'signed-in',
      handler: async ({ user }) => ({ status: 200, body: { user: toPublic(user!) } }),
    },

    {
      method: 'POST',
      pattern: /^\/api\/me\/password$/,
      auth: 'signed-in',
      handler: async ({ user, body }) => {
        const input = requireObject(body);
        const current = requireText(input, 'currentPassword', 1, PASSWORD_MAX, 'رمز فعلی');
        const next = requireText(input, 'newPassword', PASSWORD_MIN, PASSWORD_MAX, 'رمز جدید');
        if (!verifyPassword(current, user!.passwordHash)) throw new HttpError(400, 'رمز فعلی درست نیست.');
        if (next === current) throw new HttpError(400, 'رمز جدید باید با رمز فعلی فرق داشته باشد.');
        await updatePassword(db, user!.id, hashPassword(next), false, null);
        return { status: 200, body: { ok: true } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/coaches$/,
      auth: ['admin'],
      handler: async () => ({ status: 200, body: { coaches: await listCoachSummaries(db, secretKey) } }),
    },

    {
      method: 'POST',
      pattern: /^\/api\/coaches$/,
      auth: ['admin'],
      handler: async ({ body }) => {
        const input = requireObject(body);
        const displayName = requireText(input, 'displayName', NAME_MIN, NAME_MAX, 'نام مربی');
        const username = await generateUsername(db, 'c');
        const password = generatePassword();
        const id = await insertUser(db, {
          username,
          passwordHash: hashPassword(password),
          passwordEnc: encryptSecret(secretKey, password),
          role: 'coach',
          displayName,
          coachId: null,
          mustChangePassword: true,
          now: now(),
        });
        return { status: 201, body: { user: toPublic((await findUserById(db, id))!), username, password } };
      },
    },

    {
      method: 'DELETE',
      pattern: /^\/api\/coaches\/(\d+)$/,
      auth: ['admin'],
      handler: async ({ params }) => {
        const coach = await ownCoach(Number(params[0]));
        const students = await countStudents(db, coach.id);
        if (students > 0) {
          throw new HttpError(409, `این مربی هنوز ${students} شاگرد دارد. ابتدا شاگردهایش را حذف کنید.`);
        }
        await deleteSessionsForUser(db, coach.id);
        await deleteUser(db, coach.id);
        return { status: 200, body: { ok: true } };
      },
    },

    {
      method: 'POST',
      pattern: /^\/api\/coaches\/(\d+)\/reset-password$/,
      auth: ['admin'],
      handler: async ({ params }) => {
        const coach = await ownCoach(Number(params[0]));
        const password = generatePassword();
        await updatePassword(db, coach.id, hashPassword(password), true, encryptSecret(secretKey, password));
        await deleteSessionsForUser(db, coach.id);
        return { status: 200, body: { username: coach.username, password } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/students$/,
      auth: ['coach'],
      handler: async ({ user }) => ({ status: 200, body: { students: await listStudents(db, user!.id, secretKey) } }),
    },

    {
      method: 'POST',
      pattern: /^\/api\/students$/,
      auth: ['coach'],
      handler: async ({ user, body }) => {
        const input = requireObject(body);
        const displayName = requireText(input, 'displayName', NAME_MIN, NAME_MAX, 'نام شاگرد');
        const username = await generateUsername(db, 's');
        const password = generatePassword();
        const id = await insertUser(db, {
          username,
          passwordHash: hashPassword(password),
          passwordEnc: encryptSecret(secretKey, password),
          role: 'student',
          displayName,
          coachId: user!.id,
          mustChangePassword: true,
          now: now(),
        });
        return { status: 201, body: { user: toPublic((await findUserById(db, id))!), username, password } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/students\/(\d+)\/program$/,
      auth: ['coach'],
      handler: async ({ user, params }) => {
        const student = await ownStudent(user!, Number(params[0]));
        return { status: 200, body: { program: await loadProgramme(db, student.id) } };
      },
    },

    {
      method: 'PUT',
      pattern: /^\/api\/students\/(\d+)\/program$/,
      auth: ['coach'],
      handler: async ({ user, params, body }) => {
        const student = await ownStudent(user!, Number(params[0]));
        const programme = validateProgramme(body);
        return { status: 200, body: { program: await saveProgramme(db, student.id, user!.id, programme, now()) } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/me\/nutrition$/,
      auth: ['student'],
      handler: async ({ user }) => {
        const coach = await findUserById(db, user!.coachId!);
        return { status: 200, body: { coachName: coach?.displayName ?? null, plan: await loadPlan(db, user!.id) } };
      },
    },

    // Personal meal diary: any signed-in user, only their own days.
    {
      method: 'GET',
      pattern: /^\/api\/me\/diary\/([^/]+)$/,
      auth: 'signed-in',
      handler: async ({ user, params }) => {
        const day = validateDay(decodeURIComponent(params[0]!));
        return { status: 200, body: { diary: await loadDiary(db, user!.id, day) } };
      },
    },

    {
      method: 'PUT',
      pattern: /^\/api\/me\/diary$/,
      auth: 'signed-in',
      handler: async ({ user, body }) => {
        const diary = validateDiary(body);
        return { status: 200, body: { diary: await saveDiary(db, user!.id, diary.day, diary.meals, now().toISOString()) } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/students\/(\d+)\/nutrition$/,
      auth: ['coach'],
      handler: async ({ user, params }) => {
        const student = await ownStudent(user!, Number(params[0]));
        return { status: 200, body: { plan: await loadPlan(db, student.id) ?? emptyPlan() } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/students\/(\d+)\/diary\/([^/]+)$/,
      auth: ['coach'],
      handler: async ({ user, params }) => {
        const student = await ownStudent(user!, Number(params[0]));
        const day = validateDay(decodeURIComponent(params[1]!));
        return { status: 200, body: { studentName: student.displayName, diary: await loadDiary(db, student.id, day) } };
      },
    },

    {
      method: 'PUT',
      pattern: /^\/api\/students\/(\d+)\/nutrition$/,
      auth: ['coach'],
      handler: async ({ user, params, body }) => {
        const student = await ownStudent(user!, Number(params[0]));
        const plan = validatePlan(body);
        return { status: 200, body: { plan: await savePlan(db, student.id, user!.id, plan, now().toISOString()) } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/me\/chat$/,
      auth: ['student'],
      handler: async ({ user }) => {
        const coach = await findUserById(db, user!.coachId!);
        return { status: 200, body: { coachName: coach?.displayName ?? null, messages: await listMessages(db, user!.coachId!, user!.id) } };
      },
    },

    {
      method: 'POST',
      pattern: /^\/api\/me\/chat$/,
      auth: ['student'],
      handler: async ({ user, body }) => {
        const { text, mediaType, mediaData } = parseMessageInput(body);
        return { status: 201, body: { message: await addMessage(db, user!.coachId!, user!.id, user!.id, text, now().toISOString(), mediaType, mediaData) } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/students\/(\d+)\/chat$/,
      auth: ['coach'],
      handler: async ({ user, params }) => {
        const student = await ownStudent(user!, Number(params[0]));
        return { status: 200, body: { studentName: student.displayName, messages: await listMessages(db, user!.id, student.id) } };
      },
    },

    {
      method: 'POST',
      pattern: /^\/api\/students\/(\d+)\/chat$/,
      auth: ['coach'],
      handler: async ({ user, params, body }) => {
        const student = await ownStudent(user!, Number(params[0]));
        const { text, mediaType, mediaData } = parseMessageInput(body);
        return { status: 201, body: { message: await addMessage(db, user!.id, student.id, user!.id, text, now().toISOString(), mediaType, mediaData) } };
      },
    },

    // Chat between a coach and the admin
    {
      method: 'GET',
      pattern: /^\/api\/coach\/chat$/,
      auth: ['coach'],
      handler: async ({ user }) => {
        return { status: 200, body: { adminName: 'مدیر باشگاه', messages: await listAdminCoachMessages(db, user!.id) } };
      },
    },

    {
      method: 'POST',
      pattern: /^\/api\/coach\/chat$/,
      auth: ['coach'],
      handler: async ({ user, body }) => {
        const { text, mediaType, mediaData } = parseMessageInput(body);
        return { status: 201, body: { message: await addAdminCoachMessage(db, user!.id, user!.id, text, now().toISOString(), mediaType, mediaData) } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/coaches\/(\d+)\/chat$/,
      auth: ['admin'],
      handler: async ({ params }) => {
        const coach = await ownCoach(Number(params[0]));
        return { status: 200, body: { coachName: coach.displayName, messages: await listAdminCoachMessages(db, coach.id) } };
      },
    },

    {
      method: 'POST',
      pattern: /^\/api\/coaches\/(\d+)\/chat$/,
      auth: ['admin'],
      handler: async ({ user, params, body }) => {
        const coach = await ownCoach(Number(params[0]));
        const { text, mediaType, mediaData } = parseMessageInput(body);
        return { status: 201, body: { message: await addAdminCoachMessage(db, coach.id, user!.id, text, now().toISOString(), mediaType, mediaData) } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/me\/program$/,
      auth: ['student'],
      handler: async ({ user }) => {
        const coach = await findUserById(db, user!.coachId!);
        const prog = await loadProgramme(db, user!.id);
        if (!prog) {
          return { status: 200, body: { program: null, coachName: coach?.displayName ?? null, isPaid: true } };
        }
        const isPaid = (prog.priceTomans ?? 0) === 0 || (await isProgramPaid(db, user!.id));
        if (!isPaid) {
          return {
            status: 200,
            body: {
              program: {
                title: prog.title,
                days: [],
                priceTomans: prog.priceTomans,
                updatedAt: prog.updatedAt,
              },
              coachName: coach?.displayName ?? null,
              isPaid: false,
            },
          };
        }
        return {
          status: 200,
          body: {
            program: prog,
            coachName: coach?.displayName ?? null,
            isPaid: true,
          },
        };
      },
    },

    // Payment endpoints
    {
      method: 'POST',
      pattern: /^\/api\/pay\/start$/,
      auth: ['student'],
      handler: async ({ user, request, url }) => {
        const proto = request.headers['x-forwarded-proto'] || 'http';
        const host = request.headers['x-forwarded-host'] || request.headers.host || url.host;
        const origin = request.headers.origin || `${proto}://${host}`;
        const result = await createPaymentRequest(db, user!.id, origin, now());
        return { status: 201, body: result };
      },
    },

    {
      method: 'POST',
      pattern: /^\/api\/pay\/verify$/,
      auth: 'signed-in',
      handler: async ({ body }) => {
        const input = requireObject(body);
        const authority = requireText(input, 'authority', 5, 100, 'شناسه ارجاع پرداخت');
        const status = typeof input.status === 'string' ? input.status : 'OK';
        const result = await verifyPayment(db, authority, status, now());
        return { status: 200, body: result };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/pay\/callback$/,
      auth: 'public',
      handler: async ({ url }) => {
        const authority = url.searchParams.get('Authority') || '';
        const status = url.searchParams.get('Status') || '';
        if (!authority) throw new HttpError(400, 'شناسه پرداخت یافت نشد.');
        const result = await verifyPayment(db, authority, status, now());
        const outcome = result.success ? 'paid' : 'failed';
        return {
          status: 302,
          body: { redirect: `/payment/result?authority=${encodeURIComponent(authority)}&status=${outcome}` },
          headers: { Location: `/payment/result?authority=${encodeURIComponent(authority)}&status=${outcome}` },
        };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/pay\/transaction\/([^/]+)$/,
      auth: 'signed-in',
      handler: async ({ params }) => {
        const authority = decodeURIComponent(params[0]!);
        const transaction = await getTransactionByAuthority(db, authority);
        if (!transaction) throw new HttpError(404, 'تراکنش یافت نشد.');
        return { status: 200, body: { transaction } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/coach\/transactions$/,
      auth: ['coach'],
      handler: async ({ user }) => {
        return { status: 200, body: { transactions: await listCoachTransactions(db, user!.id) } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/admin\/transactions$/,
      auth: ['admin'],
      handler: async () => {
        return { status: 200, body: { transactions: await listAllTransactions(db) } };
      },
    },

    {
      method: 'PUT',
      pattern: /^\/api\/coach\/iban$/,
      auth: ['coach'],
      handler: async ({ user, body }) => {
        const input = requireObject(body);
        const rawIban = requireText(input, 'iban', 10, 40, 'شماره شبا');
        const iban = normalizeIban(rawIban);
        await updateCoachIban(db, user!.id, iban);
        return { status: 200, body: { ok: true, iban } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/coach\/iban$/,
      auth: ['coach'],
      handler: async ({ user }) => {
        const current = await findUserById(db, user!.id);
        return { status: 200, body: { iban: current?.iban ?? null } };
      },
    },

    // The student's phone sends its workout summaries (a batch, newest first). Only the summary is kept on the server.
    {
      method: 'PUT',
      pattern: /^\/api\/me\/sessions$/,
      auth: ['student'],
      handler: async ({ user, body }) => {
        const summaries = validateSummaries(body);
        const saved = await saveSummaries(db, user!.id, summaries);
        return { status: 200, body: { ok: true, saved } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/students\/(\d+)\/sessions$/,
      auth: ['coach'],
      handler: async ({ user, params }) => {
        const student = await ownStudent(user!, Number(params[0]));
        return { status: 200, body: { studentName: student.displayName, sessions: await listSummaries(db, student.id) } };
      },
    },

    {
      method: 'DELETE',
      pattern: /^\/api\/students\/(\d+)$/,
      auth: ['coach'],
      handler: async ({ user, params }) => {
        const student = await ownStudent(user!, Number(params[0]));
        await deleteSessionsForUser(db, student.id);
        await deleteUser(db, student.id);
        return { status: 200, body: { ok: true } };
      },
    },

    {
      method: 'POST',
      pattern: /^\/api\/students\/(\d+)\/reset-password$/,
      auth: ['coach'],
      handler: async ({ user, params }) => {
        const student = await ownStudent(user!, Number(params[0]));
        const password = generatePassword();
        await updatePassword(db, student.id, hashPassword(password), true, encryptSecret(secretKey, password));
        await deleteSessionsForUser(db, student.id);
        return { status: 200, body: { username: student.username, password } };
      },
    },
  ];

  /** Accepts the bearer header or the session cookie. Reports which one was used, because cookie requests need a CSRF check. */
  async function authenticate(request: IncomingMessage): Promise<{ user: StoredUser | null; token: string | null; viaCookie: boolean }> {
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
    const session = await userForToken(db, candidate, now());
    if (!session) return { user: null, token: null, viaCookie: false };
    // Only a cookie-only session is subject to the JSON-only rule for writes (CSRF protection).
    return { user: await findUserById(db, session.userId), token: candidate, viaCookie: !bearer && !header };
  }

  async function dispatch(request: IncomingMessage, body: unknown): Promise<RouteResult> {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const method = request.method ?? 'GET';
    const pathMatches = routes.filter((route) => route.pattern.test(url.pathname));
    if (pathMatches.length === 0) throw new HttpError(404, 'مسیر پیدا نشد.');
    const route = pathMatches.find((candidate) => candidate.method === method);
    if (!route) throw new HttpError(405, 'این روش برای این مسیر مجاز نیست.');

    const { user, token, viaCookie } = await authenticate(request);
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
    return route.handler({ user, token, body, params, url, request });
  }

  return async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    // The Android app runs from its own origin and calls this API from there.
    const origin = String(request.headers.origin ?? '');
    if (origin && APP_ORIGINS.has(origin)) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      // X-Meety-Session is the fallback session header the app sends; the browser blocks it unless listed here.
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Meety-Session');
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      response.setHeader('Access-Control-Max-Age', '600');
      response.setHeader('Vary', 'Origin');
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }
    // A human opening the API address gets a readable page, not a blank JSON view.
    if (request.method === 'GET' && new URL(request.url ?? '/', 'http://localhost').pathname === '/') {
      sendHtml(response, STATUS_PAGE);
      return;
    }
    try {
      const path = new URL(request.url ?? '/', 'http://localhost').pathname;
      const limit = path.endsWith('/chat') ? CHAT_BODY_BYTES : path === '/api/me/sessions' ? SESSIONS_BODY_BYTES : undefined;
      const body = request.method === 'GET' ? {} : await readJsonBody(request, limit);
      const result = await dispatch(request, body);
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

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function sendHtml(response: ServerResponse, html: string): void {
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(html),
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
  });
  response.end(html);
}

function send(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
    ...headers,
  });
  response.end(payload);
}

/** Origins of the native app shells that may call the API. Capacitor on Android uses https://localhost. */
const APP_ORIGINS = new Set(['https://localhost', 'capacitor://localhost', 'http://localhost']);
