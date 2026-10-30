import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Db } from './db.ts';
import { changeOwnPassword, createSession, deleteSession, generatePassword, generateUsername, hashPassword, resetUserPassword, verifyPassword } from './auth.ts';
import { HttpError, SESSIONS_BODY_BYTES, CHAT_BODY_BYTES, NUTRITION_BODY_BYTES, clearSessionCookie, readCookie, readJsonBody, requireObject, requireText, SESSION_COOKIE, SESSION_HEADER, sessionCookie } from './http.ts';
import { countStudents, deleteUnclaimedStudent, deleteUser, findUserById, findUserBySession, findUserByUsername, insertUser, listCoachSummaries, listAdminStudents, listStudents, setUnclaimedStudentActive, setUserActive, toPublic, updateCoachIban, type Role, type StoredUser } from './users.ts';
import { limitRegistration, registerAccount } from './registration.ts';
import { makeClientAddressResolver } from './clientAddress.ts';
import { requireMobile } from './phone.ts';
import { acceptCoachInvitation, acceptCoachRegistrationLink, coachRegistrationLink, makeCoachInvitation, previewCoachInvitation, previewCoachRegistrationLink, returnToPersonalProgram, revokeCoachInvitations, revokeCoachRegistrationLink, withdrawCoachAccess } from './coachInvites.ts';
import { deleteProgramme, listCoachProgrammes, listPurchasedProgrammes, loadProgramme, restoreCoachProgramme, saveProgramme, studentProgrammeView, validateProgramme, validateProgrammeSave } from './programs.ts';
import { MESSAGE_MAX, addAdminCoachMessage, addMessage, listAdminCoachMessages, listFormerCoachThreads, listMessages } from './chat.ts';
import { calculateCommission, createPaymentRequest, getTransactionByAuthority, isProgramPaid, listAllTransactions, listCoachTransactions, normalizeIban, verifyPayment } from './payments.ts';
import { allowTestPurchase, confirmTestPurchase, getTestMode, listTestTransactions, revokeTestPurchase, setTestMode, startTestPurchase, studentTestPurchasesAvailable, testPurchaseState } from './testPurchases.ts';
import { encryptSecret, type SecretKey } from './secrets.ts';
import { emptyPlan, listFormerCoachPlans, loadDiary, loadPlan, saveDiary, savePlan, validateDay, validateDiary, validateMealList, validatePlan } from './nutrition.ts';
import { listSummaries, saveSummaries, validateSummaries } from './sessions.ts';
import { listFormerCoachBiometrics, loadBiometrics, saveBiometrics, validateBiometricsInput } from './biometrics.ts';
import { loadStudentProfile, loadStudentProfileForCoach, revokeStudentProfileSharing, saveStudentProfile, setStudentProfileSharing, validateStudentProfile } from './studentProfile.ts';
import { applyPersonalChange, clearStoredProfile, findOwnerProfileCopies, getPersonalRecord, listPersonalRecords, quarantineOwnerProfileCopies, validateChange } from './personalData.ts';

export interface AppOptions {
  db: Db;
  /** Key for the encrypted copy of generated passwords. Required: there is no built-in default. */
  secretKey: SecretKey;
  /** Injected clock so tests can move time forward (session expiry, lock windows). */
  now?: () => Date;
  maxFailedLogins?: number;
  lockMinutes?: number;
  /** Registration attempts per source address and 15-minute window. */
  maxRegistrationAttempts?: number;
  /** Explicitly verified proxy IPs/CIDRs; no forwarded headers are trusted by default. */
  trustedProxyRanges?: string[];
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

// Capacitor's local origin and explicitly configured web clients may use the API cross-origin.
const NATIVE_ORIGINS = new Set(['https://localhost', 'capacitor://localhost']);

function isAllowedOrigin(origin: string, request: IncomingMessage, configured: Set<string>): boolean {
  if (NATIVE_ORIGINS.has(origin) || configured.has(origin)) return true;
  try {
    const url = new URL(origin);
    const host = request.headers.host?.toLowerCase();
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.origin === origin && url.host.toLowerCase() === host;
  } catch {
    return false;
  }
}

function canViewTransaction(user: StoredUser, transaction: { studentId: number; coachId: number }): boolean {
  return user.role === 'admin' || (user.role === 'student' && user.id === transaction.studentId) || (user.role === 'coach' && user.id === transaction.coachId);
}

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
  const failures = new Map<string, { count: number; lockedUntil: number; lastFailure: number }>();
  const allowedOrigins = new Set((process.env.CORS_ALLOWED_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean));
  const clientAddress = makeClientAddressResolver(options.trustedProxyRanges ?? (process.env.MEETY_TRUSTED_PROXIES ?? '').split(','));

  function cleanExpiredFailures(): void {
    const current = now().getTime();
    for (const [userKey, data] of failures.entries()) {
      if (data.lockedUntil > 0 ? data.lockedUntil <= current : data.lastFailure + lockMs <= current) {
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
    const timestamp = now().getTime();
    const entry = failures.get(username) ?? { count: 0, lockedUntil: 0, lastFailure: timestamp };
    entry.count += 1;
    entry.lastFailure = timestamp;
    if (entry.count >= maxFailed) {
      entry.lockedUntil = timestamp + lockMs;
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
    if (!student || student.role !== 'student' || (coach.role !== 'admin' && (student.coachId !== coach.id || !student.coachAccess))) {
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
      // A simple DB check; its timing is not an end-to-end or authenticated benchmark.
      handler: async () => {
        try {
          // While the hosted database is still waking up the process is up and must say so.
          // Waiting for the database here would make the host restart the instance again.
          if (db.isReady && !db.isReady()) {
            return { status: 200, body: { ok: true, database: false, starting: true } };
          }
          const started = performance.now();
          await db.query('SELECT 1');
          const databaseMs = Math.round(performance.now() - started);
          return { status: 200, body: { ok: true, database: true, databaseMs } };
        } catch {
          return { status: 503, body: { ok: false, database: false } };
        }
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/release$/,
      auth: 'public',
      // Render provides these deployment values; never expose arbitrary environment contents.
      handler: async () => {
        const render = process.env.RENDER === 'true';
        const branch = render ? process.env.RENDER_GIT_BRANCH?.trim() : '';
        const sha = render ? process.env.RENDER_GIT_COMMIT?.trim() : '';
        return {
          status: 200,
          body: {
            stableBranch: 'main',
            deploymentBranch: branch === 'main' ? 'main' : branch ? 'other' : 'unknown',
            revision: sha && /^[a-f0-9]{7,64}$/i.test(sha) ? sha.toLowerCase() : null,
          },
          headers: { 'Cache-Control': 'no-store' },
        };
      },
    },

    {
      method: 'POST',
      pattern: /^\/api\/auth\/register$/,
      auth: 'public',
      handler: async ({ body, request }) => {
        if (!String(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
          throw new HttpError(415, 'درخواست باید JSON باشد.');
        }
        const at = now();
        await limitRegistration(db, secretKey, clientAddress(request), at, options.maxRegistrationAttempts);
        const result = await registerAccount(db, body, at);
        return { status: 201, body: result, headers: { 'Cache-Control': 'no-store' } };
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
        if (!user.isActive) {
          if (user.pendingApproval) throw new HttpError(403, 'ثبت‌نام مربی در انتظار تأیید مدیر است. پس از تأیید می‌توانید وارد شوید.');
          throw new HttpError(403, 'حساب کاربری شما غیرفعال شده است. لطفاً با مربی یا پشتیبانی تماس بگیرید.');
        }
        const token = await createSession(db, user.id, user.authVersion, now());
        if (!token) throw new HttpError(401, 'وضعیت حساب تغییر کرده است؛ دوباره وارد شوید.');
        failures.delete(username);
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
      handler: async ({ user, token, body }) => {
        const input = requireObject(body);
        const current = requireText(input, 'currentPassword', 1, PASSWORD_MAX, 'رمز فعلی');
        const next = requireText(input, 'newPassword', PASSWORD_MIN, PASSWORD_MAX, 'رمز جدید');
        if (!verifyPassword(current, user!.passwordHash)) throw new HttpError(400, 'رمز فعلی درست نیست.');
        if (next === current) throw new HttpError(400, 'رمز جدید باید با رمز فعلی فرق داشته باشد.');
        if (!token || !(await changeOwnPassword(db, user!.id, user!.passwordHash, user!.authVersion, token, hashPassword(next), now()))) {
          throw new HttpError(409, 'وضعیت حساب تغییر کرده است؛ دوباره وارد شوید و تلاش کنید.');
        }
        return { status: 200, body: { ok: true } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/me\/profile$/,
      auth: ['student'],
      handler: async ({ user, url }) => {
        const expected = url.searchParams.get('accountId');
        if (expected !== String(user!.id)) throw new HttpError(409, 'برای امنیت حساب، برنامه را به‌روز و دوباره باز کنید.');
        return { status: 200, body: { stored: await loadStudentProfile(db, user!.id), sharingVersion: user!.coachAccessVersion } };
      },
    },

    {
      method: 'PUT',
      pattern: /^\/api\/me\/profile$/,
      auth: ['student'],
      handler: async ({ user, body }) => {
        const input = requireObject(body);
        if (input.accountId !== user!.id) throw new HttpError(409, 'برای امنیت حساب، برنامه را به‌روز و دوباره باز کنید.');
        if (typeof input.shareWithCoach !== 'boolean') throw new HttpError(400, 'انتخاب اشتراک پروفایل با مربی الزامی است.');
        if (input.shareWithCoach && (user!.coachId === null || !user!.coachAccess)) throw new HttpError(409, 'دسترسی مربی فعال نیست.');
        if (input.shareWithCoach && input.sharingVersion !== user!.coachAccessVersion) throw new HttpError(409, 'وضعیت اشتراک تغییر کرده است؛ برنامه را به‌روز و وضعیت دسترسی را دوباره بررسی کنید.');
        const profile = validateStudentProfile(body);
        const stored = await saveStudentProfile(db, user!.id, profile, input.shareWithCoach, now().toISOString(), user!.coachAccessVersion, input.profile, user!.authVersion);
        return { status: 200, body: { stored, sharingVersion: stored.sharingVersion } };
      },
    },

    {
      method: 'POST',
      pattern: /^\/api\/me\/profile\/sharing$/,
      auth: ['student'],
      handler: async ({ user, body }) => {
        const input = requireObject(body);
        if (input.accountId !== user!.id) throw new HttpError(409, 'برای امنیت حساب، برنامه را به‌روز و دوباره باز کنید.');
        if (typeof input.shareWithCoach !== 'boolean') throw new HttpError(400, 'فیلد shareWithCoach باید بولین باشد.');
        if (input.shareWithCoach && (user!.coachId === null || !user!.coachAccess)) throw new HttpError(409, 'دسترسی مربی فعال نیست.');
        if (!input.shareWithCoach) {
          const sharingVersion = await revokeStudentProfileSharing(db, user!.id, user!.authVersion, now().toISOString());
          return { status: 200, body: { shareWithCoach: false, sharingVersion } };
        }
        if (input.sharingVersion !== user!.coachAccessVersion) throw new HttpError(409, 'وضعیت اشتراک تغییر کرده است؛ برنامه را به‌روز و وضعیت دسترسی را دوباره بررسی کنید.');
        const exists = await setStudentProfileSharing(db, user!.id, true, now().toISOString(), user!.coachAccessVersion, user!.authVersion);
        return { status: 200, body: { shareWithCoach: exists, sharingVersion: user!.coachAccessVersion } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/students\/(\d+)\/profile$/,
      auth: ['coach'],
      handler: async ({ user, params }) => {
        const result = await loadStudentProfileForCoach(db, Number(params[0]), user!.id);
        if (!result) throw new HttpError(404, 'شاگرد پیدا نشد.');
        return { status: 200, body: result };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/admin\/students$/,
      auth: ['admin'],
      handler: async ({ url }) => {
        const search = url.searchParams.get('username')?.trim() || null;
        if (search && search.length > 64) throw new HttpError(400, 'نام کاربری بیش از حد طولانی است.');
        const rawCursor = url.searchParams.get('before');
        const before = rawCursor === null ? null : Number(rawCursor);
        if (before !== null && (!Number.isSafeInteger(before) || before < 1 || before > 2147483647)) throw new HttpError(400, 'نشانگر فهرست نامعتبر است.');
        return { status: 200, body: await listAdminStudents(db, secretKey, search, before), headers: { 'Cache-Control': 'no-store' } };
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
        const phoneNumber = requireMobile(input.phoneNumber);
        const username = await generateUsername(db, 'c');
        const password = generatePassword();
        const id = await insertUser(db, {
          username,
          passwordHash: hashPassword(password),
          passwordEnc: encryptSecret(secretKey, password),
          role: 'coach',
          displayName,
          phoneNumber,
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
          throw new HttpError(409, `این مربی هنوز ${students} شاگرد دارد. به‌جای حذف، می‌توانید حساب مربی را غیرفعال کنید.`);
        }
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
        if (!(await resetUserPassword(db, coach.id, hashPassword(password), encryptSecret(secretKey, password)))) {
          throw new HttpError(404, 'مربی پیدا نشد.');
        }
        return { status: 200, body: { username: coach.username, password } };
      },
    },

    {
      method: 'PUT',
      pattern: /^\/api\/coaches\/(\d+)\/active$/,
      auth: ['admin'],
      handler: async ({ params, body }) => {
        const coach = await ownCoach(Number(params[0]));
        const input = requireObject(body);
        if (typeof input.active !== 'boolean') {
          throw new HttpError(400, 'فیلد active باید بولین باشد.');
        }
        await setUserActive(db, coach.id, input.active);
        return { status: 200, body: { ok: true, isActive: input.active, id: coach.id } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/admin\/coaches\/(\d+)\/students$/,
      auth: ['admin'],
      handler: async ({ params }) => {
        const coach = await ownCoach(Number(params[0]));
        const students = await listStudents(db, coach.id, secretKey, true);
        return { status: 200, body: { coachName: coach.displayName, students } };
      },
    },

    {
      method: 'POST', pattern: /^\/api\/coach\/registration-link$/,
      auth: ['coach'],
      handler: async ({ user, body }) => ({ status: 200, body: await coachRegistrationLink(db, secretKey, user!, body, now()), headers: { 'Cache-Control': 'no-store' } }),
    },
    {
      method: 'DELETE', pattern: /^\/api\/coach\/registration-link$/,
      auth: ['coach'],
      handler: async ({ user, body }) => { await revokeCoachRegistrationLink(db, user!, body); return { status: 200, body: { ok: true }, headers: { 'Cache-Control': 'no-store' } }; },
    },
    {
      method: 'POST', pattern: /^\/api\/coach-registration-link\/preview$/,
      auth: 'public',
      handler: async ({ body, request }) => ({ status: 200, body: await previewCoachRegistrationLink(db, secretKey, body, now(), clientAddress(request)), headers: { 'Cache-Control': 'no-store' } }),
    },
    {
      method: 'POST', pattern: /^\/api\/me\/coach-registration-link\/accept$/,
      auth: ['student'],
      handler: async ({ user, body }) => ({ status: 200, body: { user: toPublic(await acceptCoachRegistrationLink(db, secretKey, user!, body, now())) }, headers: { 'Cache-Control': 'no-store' } }),
    },

    {
      method: 'POST', pattern: /^\/api\/coach\/invitations$/,
      auth: ['coach'],
      handler: async ({ user, body }) => {
        const input = requireObject(body);
        if (input.accountId !== undefined && input.accountId !== user!.id) throw new HttpError(409, 'حساب تغییر کرده است؛ صفحه را دوباره باز کنید.');
        return { status: 201, body: await makeCoachInvitation(db, secretKey, user!, now()), headers: { 'Cache-Control': 'no-store' } };
      },
    },

    {
      method: 'DELETE', pattern: /^\/api\/coach\/invitations$/,
      auth: ['coach'],
      handler: async ({ user, body }) => {
        const input = requireObject(body);
        if (input.accountId !== undefined && input.accountId !== user!.id) throw new HttpError(409, 'حساب تغییر کرده است؛ صفحه را دوباره باز کنید.');
        await revokeCoachInvitations(db, user!);
        return { status: 200, body: { ok: true } };
      },
    },

    {
      method: 'POST', pattern: /^\/api\/me\/coach-invitation\/preview$/,
      auth: ['student'],
      handler: async ({ user, body }) => ({ status: 200, body: await previewCoachInvitation(db, secretKey, user!, body, now()), headers: { 'Cache-Control': 'no-store' } }),
    },

    {
      method: 'POST', pattern: /^\/api\/me\/coach-invitation\/accept$/,
      auth: ['student'],
      handler: async ({ user, body }) => ({ status: 200, body: { user: toPublic(await acceptCoachInvitation(db, secretKey, user!, body, now())) }, headers: { 'Cache-Control': 'no-store' } }),
    },

    {
      method: 'POST', pattern: /^\/api\/me\/coach-access\/withdraw$/,
      auth: ['student'],
      handler: async ({ user, body }) => ({ status: 200, body: { user: toPublic(await withdrawCoachAccess(db, user!, body)) }, headers: { 'Cache-Control': 'no-store' } }),
    },

    {
      method: 'POST', pattern: /^\/api\/me\/personal-program\/activate$/,
      auth: ['student'],
      handler: async ({ user, body }) => ({ status: 200, body: { user: toPublic(await returnToPersonalProgram(db, user!, body)) }, headers: { 'Cache-Control': 'no-store' } }),
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
        const phoneNumber = requireMobile(input.phoneNumber);
        const username = await generateUsername(db, 's');
        const password = generatePassword();
        const id = await insertUser(db, {
          username,
          passwordHash: hashPassword(password),
          passwordEnc: encryptSecret(secretKey, password),
          role: 'student',
          displayName,
          phoneNumber,
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
      auth: ['coach', 'admin'],
      handler: async ({ user, params, url }) => {
        const accountId = url.searchParams.get('accountId');
        if (accountId !== null && accountId !== String(user!.id)) throw new HttpError(409, 'حساب برنامه‌ساز تغییر کرده است؛ صفحه را دوباره باز کنید.');
        const student = await ownStudent(user!, Number(params[0]));
        return { status: 200, body: { student: toPublic(student), program: student.coachId === null ? null : await loadProgramme(db, student.id, student.coachId) }, headers: { 'Cache-Control': 'no-store' } };
      },
    },

    {
      method: 'GET', pattern: /^\/api\/students\/(\d+)\/programs\/archive$/,
      auth: ['coach', 'admin'],
      handler: async ({ user, params, url }) => {
        const accountId = url.searchParams.get('accountId');
        if (accountId !== null && accountId !== String(user!.id)) throw new HttpError(409, 'حساب برنامه‌ساز تغییر کرده است؛ صفحه را دوباره باز کنید.');
        const student = await ownStudent(user!, Number(params[0]));
        const cursor = url.searchParams.get('cursor');
        if (cursor !== null && (!cursor || cursor.length > 80)) throw new HttpError(400, 'نشانگر بایگانی نامعتبر است.');
        return { status: 200, body: student.coachId === null ? { programs: [], nextCursor: null } : await listCoachProgrammes(db, student.id, student.coachId, cursor), headers: { 'Cache-Control': 'no-store' } };
      },
    },

    {
      method: 'POST', pattern: /^\/api\/students\/(\d+)\/programs\/restore$/,
      auth: ['coach', 'admin'],
      handler: async ({ user, params, body }) => {
        const input = requireObject(body);
        if (input.accountId !== undefined && input.accountId !== user!.id) throw new HttpError(409, 'حساب برنامه‌ساز تغییر کرده است؛ صفحه را دوباره باز کنید.');
        const student = await ownStudent(user!, Number(params[0]));
        const offerId = requireText(input, 'offerId', 1, 80, 'شناسهٔ برنامه');
        if (!Number.isSafeInteger(input.offerVersion) || (input.offerVersion as number) < 1 || (input.offerVersion as number) >= Number.MAX_SAFE_INTEGER) throw new HttpError(409, 'نسخهٔ بایگانی نامعتبر است؛ صفحه را دوباره بارگذاری کنید.');
        const current = validateProgrammeSave(input);
        if (student.coachId === null) throw new HttpError(409, 'مربی این شاگرد مشخص نیست.');
        const program = await restoreCoachProgramme(db, student.id, student.coachId, offerId, input.offerVersion as number, current.expectedId, current.expectedVersion, now(), student.coachAccessVersion, user!.role === 'admin');
        return { status: 200, body: { program }, headers: { 'Cache-Control': 'no-store' } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/students\/(\d+)\/test-purchase$/,
      auth: ['coach', 'admin'],
      handler: async ({ user, params }) => {
        const student = await ownStudent(user!, Number(params[0]));
        const programme = student.coachId === null ? null : await loadProgramme(db, student.id, student.coachId);
        const state = programme ? await testPurchaseState(db, student.id, programme.id, now()) : null;
        const mode = await getTestMode(db, now());
        return {
          status: 200,
          body: { available: studentTestPurchasesAvailable(), enabled: !!state, purchased: state?.status === 'paid', expiresAt: state?.expires_at ?? null, globalModeEnabled: mode.enabled },
          headers: { 'Cache-Control': 'no-store' },
        };
      },
    },

    {
      method: 'PUT',
      pattern: /^\/api\/students\/(\d+)\/test-purchase$/,
      auth: ['coach', 'admin'],
      handler: async ({ user, params, body }) => {
        const student = await ownStudent(user!, Number(params[0]));
        const input = requireObject(body);
        if (typeof input.enabled !== 'boolean') throw new HttpError(400, 'وضعیت آزمایش نامعتبر است.');
        const expectedId = requireText(input, 'expectedId', 1, 80, 'شناسهٔ برنامه');
        if (!Number.isSafeInteger(input.expectedVersion) || (input.expectedVersion as number) < 0) {
          throw new HttpError(409, 'نسخهٔ برنامه مشخص نیست؛ صفحه را دوباره بارگذاری کنید.');
        }
        const programme = student.coachId === null ? null : await loadProgramme(db, student.id, student.coachId);
        if (!programme || programme.id !== expectedId || programme.version !== input.expectedVersion) {
          throw new HttpError(409, 'برنامه تغییر کرده است؛ صفحه را دوباره بارگذاری کنید.');
        }
        if (student.coachId === null) throw new HttpError(409, 'مربی این شاگرد مشخص نیست.');
        const relationship = { coachId: student.coachId, version: student.coachAccessVersion, allowRevoked: user!.role === 'admin' };
        if (!input.enabled) {
          await revokeTestPurchase(db, student.id, expectedId, now(), relationship);
          return { status: 200, body: { enabled: false } };
        }
        if (await isProgramPaid(db, student.id, expectedId)) throw new HttpError(409, 'این برنامه قبلاً خریداری شده است.');
        const expiresAt = await allowTestPurchase(db, student.id, { id: expectedId, version: input.expectedVersion as number }, now(), relationship);
        return { status: 200, body: { enabled: true, expiresAt } };
      },
    },

    {
      method: 'PUT',
      pattern: /^\/api\/students\/(\d+)\/program$/,
      auth: ['coach', 'admin'],
      handler: async ({ user, params, body }) => {
        const input = requireObject(body);
        if (input.accountId !== undefined && input.accountId !== user!.id) throw new HttpError(409, 'حساب برنامه‌ساز تغییر کرده است؛ صفحه را دوباره باز کنید.');
        const student = await ownStudent(user!, Number(params[0]));
        const programme = validateProgramme(body);
        const options = validateProgrammeSave(body);
        // The programme belongs to the student's coach even when an admin edits it.
        if (student.coachId === null) throw new HttpError(409, 'مربی این شاگرد مشخص نیست.');
        return { status: 200, body: { program: await saveProgramme(db, student.id, student.coachId, programme, options, now(), student.coachAccessVersion, user!.role === 'admin') } };
      },
    },

    {
      method: 'DELETE',
      pattern: /^\/api\/students\/(\d+)\/program$/,
      auth: ['coach', 'admin'],
      handler: async ({ user, params, body }) => {
        const input = requireObject(body);
        if (input.accountId !== undefined && input.accountId !== user!.id) throw new HttpError(409, 'حساب برنامه‌ساز تغییر کرده است؛ صفحه را دوباره باز کنید.');
        const student = await ownStudent(user!, Number(params[0]));
        const options = validateProgrammeSave(body);
        if (student.coachId === null) throw new HttpError(409, 'مربی این شاگرد مشخص نیست.');
        await deleteProgramme(db, student.id, student.coachId, options.expectedId, options.expectedVersion, student.coachAccessVersion, user!.role === 'admin');
        return { status: 200, body: { ok: true } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/me\/nutrition$/,
      auth: ['student'],
      handler: async ({ user }) => {
        const coach = user!.coachId === null ? null : await findUserById(db, user!.coachId);
        return { status: 200, body: { coachName: coach?.displayName ?? null, plan: user!.coachId === null ? null : await loadPlan(db, user!.id, user!.coachId) }, headers: { 'Cache-Control': 'no-store' } };
      },
    },

    {
      method: 'GET', pattern: /^\/api\/me\/nutrition\/archive$/,
      auth: ['student'],
      handler: async ({ user, url }) => {
        const cursor = url.searchParams.get('cursor');
        if (cursor !== null && (!/^[1-9]\d{0,9}$/.test(cursor) || !Number.isSafeInteger(Number(cursor)) || Number(cursor) > 2147483647)) {
          throw new HttpError(400, 'نشانگر بایگانی نامعتبر است.');
        }
        return { status: 200, body: await listFormerCoachPlans(db, user!.id, user!.coachId, cursor ? Number(cursor) : 0), headers: { 'Cache-Control': 'no-store' } };
      },
    },

    // Personal meal diary: any signed-in user, only their own days.
    {
      method: 'GET',
      pattern: /^\/api\/me\/diary\/([^/]+)$/,
      auth: 'signed-in',
      handler: async ({ user, params, url }) => {
        const expected = url.searchParams.get('accountId');
        if (expected !== null && expected !== String(user!.id)) throw new HttpError(409, 'حساب دفتر خوراک تغییر کرده است؛ صفحه را دوباره باز کنید.');
        const day = validateDay(decodeURIComponent(params[0]!));
        return { status: 200, body: { diary: await loadDiary(db, user!.id, day) }, headers: { 'Cache-Control': 'no-store' } };
      },
    },

    {
      method: 'PUT',
      pattern: /^\/api\/me\/diary$/,
      auth: 'signed-in',
      handler: async ({ user, body }) => {
        const input = requireObject(body);
        if (input.accountId !== undefined && input.accountId !== user!.id) throw new HttpError(409, 'حساب دفتر خوراک تغییر کرده است؛ صفحه را دوباره باز کنید.');
        const diary = validateDiary(body);
        const expected = input.expectedMeals === undefined ? undefined : validateMealList(input.expectedMeals, 'نسخهٔ قبلی دفتر خوراک نامعتبر است.');
        return { status: 200, body: { diary: await saveDiary(db, user!.id, diary.day, diary.meals, now().toISOString(), expected) } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/students\/(\d+)\/nutrition$/,
      auth: ['coach'],
      handler: async ({ user, params, url }) => {
        const accountId = url.searchParams.get('accountId');
        if (accountId !== null && accountId !== String(user!.id)) throw new HttpError(409, 'حساب مربی تغییر کرده است؛ صفحه را دوباره باز کنید.');
        const student = await ownStudent(user!, Number(params[0]));
        return { status: 200, body: { plan: student.coachId === null ? emptyPlan() : await loadPlan(db, student.id, student.coachId) ?? emptyPlan() }, headers: { 'Cache-Control': 'no-store' } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/students\/(\d+)\/diary\/([^/]+)$/,
      auth: ['coach'],
      handler: async ({ user, params, url }) => {
        const accountId = url.searchParams.get('accountId');
        if (accountId !== null && accountId !== String(user!.id)) throw new HttpError(409, 'حساب مربی تغییر کرده است؛ صفحه را دوباره باز کنید.');
        const student = await ownStudent(user!, Number(params[0]));
        const day = validateDay(decodeURIComponent(params[1]!));
        return { status: 200, body: { studentName: student.displayName, diary: await loadDiary(db, student.id, day) }, headers: { 'Cache-Control': 'no-store' } };
      },
    },

    {
      method: 'PUT',
      pattern: /^\/api\/students\/(\d+)\/nutrition$/,
      auth: ['coach'],
      handler: async ({ user, params, body }) => {
        const input = requireObject(body);
        if (input.accountId !== undefined && input.accountId !== user!.id) throw new HttpError(409, 'حساب مربی تغییر کرده است؛ صفحه را دوباره باز کنید.');
        const student = await ownStudent(user!, Number(params[0]));
        const plan = validatePlan(body);
        const expected = input.expectedPlan === undefined ? undefined : validatePlan(input.expectedPlan);
        return { status: 200, body: { plan: await savePlan(db, student.id, user!.id, plan, now().toISOString(), student.coachAccessVersion, expected) } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/me\/chat$/,
      auth: ['student'],
      handler: async ({ user }) => {
        if (user!.coachId === null) throw new HttpError(409, 'این حساب هنوز مربی ندارد.');
        const coach = await findUserById(db, user!.coachId);
        return { status: 200, body: { coachName: coach?.displayName ?? null, messages: await listMessages(db, user!.coachId, user!.id) } };
      },
    },

    {
      method: 'GET', pattern: /^\/api\/me\/chat\/archive$/,
      auth: ['student'],
      handler: async ({ user, url }) => {
        const cursor = url.searchParams.get('cursor');
        if (cursor !== null && (!/^[1-9]\d{0,9}$/.test(cursor) || !Number.isSafeInteger(Number(cursor)) || Number(cursor) > 2147483647)) {
          throw new HttpError(400, 'نشانگر بایگانی نامعتبر است.');
        }
        return { status: 200, body: await listFormerCoachThreads(db, user!.id, user!.coachId, cursor ? Number(cursor) : 0), headers: { 'Cache-Control': 'no-store' } };
      },
    },

    {
      method: 'GET', pattern: /^\/api\/me\/chat\/archive\/(\d+)$/,
      auth: ['student'],
      handler: async ({ user, params }) => {
        const coachId = Number(params[0]);
        if (!Number.isSafeInteger(coachId) || coachId < 1 || coachId > 2147483647) throw new HttpError(404, 'گفتگو پیدا نشد.');
        const coach = (await db.query<{ display_name: string }>(`SELECT c.display_name FROM users c
          WHERE c.id = $1 AND EXISTS (SELECT 1 FROM messages m WHERE m.coach_id = c.id AND m.student_id = $2)`, [coachId, user!.id]))[0];
        if (!coach) throw new HttpError(404, 'گفتگو پیدا نشد.');
        return { status: 200, body: { coachName: coach.display_name, messages: await listMessages(db, coachId, user!.id) }, headers: { 'Cache-Control': 'no-store' } };
      },
    },

    {
      method: 'POST',
      pattern: /^\/api\/me\/chat$/,
      auth: ['student'],
      handler: async ({ user, body }) => {
        if (user!.coachId === null) throw new HttpError(409, 'این حساب هنوز مربی ندارد.');
        if (!user!.coachAccess) throw new HttpError(409, 'دسترسی مربی قطع شده است؛ ارسال پیام فعال نیست.');
        const { text, mediaType, mediaData } = parseMessageInput(body);
        return { status: 201, body: { message: await addMessage(db, user!.coachId, user!.id, user!.id, text, now().toISOString(), mediaType, mediaData, user!.coachAccessVersion) } };
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
        return { status: 201, body: { message: await addMessage(db, user!.id, student.id, user!.id, text, now().toISOString(), mediaType, mediaData, student.coachAccessVersion) } };
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
      pattern: /^\/api\/me\/programs\/archive$/,
      auth: ['student'],
      handler: async ({ user, url }) => {
        const cursor = url.searchParams.get('cursor');
        if (cursor !== null && (!cursor || cursor.length > 80)) throw new HttpError(400, 'نشانگر بایگانی نامعتبر است.');
        return {
          status: 200,
          body: await listPurchasedProgrammes(db, user!.id, cursor, now()),
          headers: { 'Cache-Control': 'no-store' },
        };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/me\/program$/,
      auth: ['student'],
      handler: async ({ user }) => ({
        status: 200,
        body: await studentProgrammeView(db, user!, now()),
        headers: { 'Cache-Control': 'no-store' },
      }),
    },

    // Per-account personal data. Each item has a server version and is updated conditionally.
    {
      method: 'GET', pattern: /^\/api\/me\/personal-data$/,
      auth: 'signed-in',
      handler: async ({ user, url }) => {
        if (url.searchParams.get('accountId') !== String(user!.id)) throw new HttpError(409, 'حساب همگام‌سازی تغییر کرده است؛ صفحه را دوباره باز کنید.');
        return { status: 200, body: await listPersonalRecords(db, user!.id, url.searchParams.get('cursor')), headers: { 'Cache-Control': 'no-store' } };
      },
    },
    {
      method: 'POST', pattern: /^\/api\/me\/personal-data\/batch$/,
      auth: 'signed-in',
      handler: async ({ user, body }) => {
        const input = requireObject(body);
        if (input.accountId !== user!.id) throw new HttpError(409, 'حساب همگام‌سازی تغییر کرده است؛ صفحه را دوباره باز کنید.');
        if (!Array.isArray(input.changes) || input.changes.length < 1 || input.changes.length > 25) throw new HttpError(400, 'هر درخواست باید بین ۱ تا ۲۵ تغییر داشته باشد.');
        const changes = input.changes.map(validateChange);
        const identifiers = new Set(changes.map((change) => `${change.kind}:${change.key}`));
        if (identifiers.size !== changes.length) throw new HttpError(400, 'دادهٔ تکراری در درخواست وجود دارد.');
        const results = await Promise.all(changes.map((change) => applyPersonalChange(db, user!.id, change, now().toISOString())));
        return { status: 200, body: { results }, headers: { 'Cache-Control': 'no-store' } };
      },
    },

    // The account owner deletes their own stored profile. No other account can do this for them.
    {
      method: 'POST',
      pattern: /^\/api\/me\/profile\/purge$/,
      auth: 'signed-in',
      handler: async ({ user, body }) => {
        const input = requireObject(body);
        if (input.accountId !== user!.id) throw new HttpError(409, 'حساب تغییر کرده است؛ صفحه را دوباره باز کنید.');
        const result = await clearStoredProfile(db, user!.id, now().toISOString());
        return { status: 200, body: { cleared: true, ...result }, headers: { 'Cache-Control': 'no-store' } };
      },
    },

    // The owner removes copies of their own profile that reached other accounts.
    {
      method: 'GET',
      pattern: /^\/api\/admin\/owner-profile-copies$/,
      auth: ['admin'],
      handler: async () => ({ status: 200, body: { accounts: await findOwnerProfileCopies(db) }, headers: { 'Cache-Control': 'no-store' } }),
    },
    {
      method: 'POST',
      pattern: /^\/api\/admin\/owner-profile-copies$/,
      auth: ['admin'],
      handler: async () => {
        const removed = await quarantineOwnerProfileCopies(db, now().toISOString());
        return { status: 200, body: { removed }, headers: { 'Cache-Control': 'no-store' } };
      },
    },

    // Legacy clients may read the programme, but must update before making an unversioned write.
    {
      method: 'GET', pattern: /^\/api\/me\/personal-program$/,
      auth: 'signed-in',
      handler: async ({ user }) => {
        const result = await getPersonalRecord(db, user!.id, 'program', 'main');
        return { status: 200, body: { program: result && !result.deleted ? result.value : null, updatedAt: result?.updatedAt ?? null, version: result?.version ?? 0 }, headers: { 'Cache-Control': 'no-store' } };
      },
    },
    {
      method: 'PUT', pattern: /^\/api\/me\/personal-program$/,
      auth: 'signed-in',
      handler: async () => { throw new HttpError(409, 'نسخهٔ برنامه قدیمی است؛ صفحه را به‌روزرسانی کن تا همگام‌سازی امن انجام شود.'); },
    },
    {
      method: 'DELETE', pattern: /^\/api\/me\/personal-program$/,
      auth: 'signed-in',
      handler: async () => { throw new HttpError(409, 'نسخهٔ برنامه قدیمی است؛ صفحه را به‌روزرسانی کن تا همگام‌سازی امن انجام شود.'); },
    },

    // Payment endpoints
    // Test checkout requires an individual grant or an explicitly enabled global test session.
    {
      method: 'POST',
      pattern: /^\/api\/pay\/test\/start$/,
      auth: ['student'],
      handler: async ({ user, body }) => {
        const input = requireObject(body);
        const expectedId = requireText(input, 'expectedId', 1, 80, 'شناسهٔ برنامه');
        if (!Number.isSafeInteger(input.expectedVersion) || (input.expectedVersion as number) < 0) {
          throw new HttpError(409, 'نسخهٔ برنامه مشخص نیست؛ صفحه را دوباره بارگذاری کنید.');
        }
        if (await isProgramPaid(db, user!.id, expectedId)) throw new HttpError(409, 'این برنامه قبلاً خریداری شده است.');
        const checkout = await startTestPurchase(db, user!.id, { id: expectedId, version: input.expectedVersion as number }, now());
        return { status: 201, body: { simulation: true, ...checkout }, headers: { 'Cache-Control': 'no-store' } };
      },
    },

    {
      method: 'POST',
      pattern: /^\/api\/pay\/test\/confirm$/,
      auth: ['student'],
      handler: async ({ user, body }) => {
        const input = requireObject(body);
        const authority = requireText(input, 'authority', 5, 100, 'شناسهٔ آزمایشی');
        if (!/^TEST-[a-f0-9-]{36}$/.test(authority)) throw new HttpError(400, 'شناسهٔ آزمایشی نامعتبر است.');
        if (input.result !== 'success' && input.result !== 'cancel') throw new HttpError(400, 'نتیجهٔ آزمایش نامعتبر است.');
        const result = await confirmTestPurchase(db, user!.id, authority, input.result, now());
        return { status: 200, body: { simulation: true, ...result }, headers: { 'Cache-Control': 'no-store' } };
      },
    },

    // A read-only rehearsal: it neither creates transactions nor grants programme access.
    {
      method: 'POST',
      pattern: /^\/api\/pay\/practice$/,
      auth: ['student', 'coach', 'admin'],
      handler: async ({ user, body }) => {
        const input = requireObject(body);
        if (Object.hasOwn(input, 'sampleAmountTomans')) {
          if (user!.role === 'student') throw new HttpError(403, 'دسترسی به این بخش ندارید.');
          const amountTomans = input.sampleAmountTomans;
          if (!Number.isSafeInteger(amountTomans) || (amountTomans as number) < 1 || (amountTomans as number) > 2147483647) {
            throw new HttpError(400, 'مبلغ نمونه باید عدد صحیح بین ۱ تا ۲٬۱۴۷٬۴۸۳٬۶۴۷ تومان باشد.');
          }
          const { coachShare, adminShare } = calculateCommission(amountTomans as number);
          return { status: 200, body: { simulation: true, programmeTitle: 'برنامهٔ نمونه', amountTomans, coachShareTomans: coachShare, adminShareTomans: adminShare } };
        }
        let student = user!;
        if (user!.role === 'student') {
          if (input.studentId !== undefined && input.studentId !== student.id) throw new HttpError(404, 'شاگرد پیدا نشد.');
        } else {
          if (!Number.isSafeInteger(input.studentId) || (input.studentId as number) <= 0) {
            throw new HttpError(400, 'شاگرد را انتخاب کنید.');
          }
          student = await ownStudent(user!, input.studentId as number);
        }
        const expectedId = requireText(input, 'expectedId', 1, 80, 'شناسهٔ برنامه');
        if (!Number.isSafeInteger(input.expectedVersion) || (input.expectedVersion as number) < 0) {
          throw new HttpError(409, 'نسخهٔ برنامه مشخص نیست؛ صفحه را دوباره بارگذاری کنید.');
        }
        const programme = student.coachId === null || (user!.role === 'student' && student.personalProgramMode)
          ? null : await loadProgramme(db, student.id, student.coachId);
        if (!programme) throw new HttpError(404, 'برنامه‌ای برای آزمایش وجود ندارد.');
        if (programme.id !== expectedId || programme.version !== input.expectedVersion) {
          throw new HttpError(409, 'برنامه یا قیمت آن تغییر کرده است؛ صفحه را دوباره بارگذاری کنید.');
        }
        const amountTomans = programme.priceTomans ?? 0;
        if (amountTomans <= 0) throw new HttpError(400, 'برای آزمایش، یک برنامهٔ پولی ذخیره کنید.');
        const { coachShare, adminShare } = calculateCommission(amountTomans);
        return {
          status: 200,
          body: {
            simulation: true,
            programmeTitle: programme.title,
            amountTomans,
            ...(user!.role !== 'student' ? { coachShareTomans: coachShare, adminShareTomans: adminShare } : {}),
          },
        };
      },
    },

    {
      method: 'POST',
      pattern: /^\/api\/pay\/start$/,
      auth: ['student'],
      handler: async ({ user, request, url, body }) => {
        const input = requireObject(body);
        const expectedId = requireText(input, 'expectedId', 1, 80, 'شناسهٔ برنامه');
        if (!Number.isSafeInteger(input.expectedVersion) || (input.expectedVersion as number) < 0) {
          throw new HttpError(409, 'نسخهٔ برنامه مشخص نیست؛ صفحه را دوباره بارگذاری کنید.');
        }
        const configuredOrigin = process.env.PAYMENT_PUBLIC_BASE_URL?.trim().replace(/\/$/, '');
        if (process.env.NODE_ENV === 'production') {
          try {
            const publicUrl = new URL(configuredOrigin ?? '');
            if (publicUrl.protocol !== 'https:' || publicUrl.origin !== configuredOrigin) throw new Error('invalid payment origin');
          } catch {
            throw new HttpError(503, 'پرداخت واقعی هنوز آماده نیست؛ برای بررسی از «آزمایش پرداخت» استفاده کنید.');
          }
        }
        const proto = request.headers['x-forwarded-proto'] || 'http';
        const host = request.headers['x-forwarded-host'] || request.headers.host || url.host;
        const origin = configuredOrigin || request.headers.origin || `${proto}://${host}`;
        const result = await createPaymentRequest(db, user!.id, origin, { id: expectedId, version: input.expectedVersion as number }, now());
        return { status: 201, body: result };
      },
    },

    {
      method: 'POST',
      pattern: /^\/api\/pay\/verify$/,
      auth: 'signed-in',
      handler: async ({ body, user }) => {
        const input = requireObject(body);
        const authority = requireText(input, 'authority', 5, 100, 'شناسه ارجاع پرداخت');
        const transaction = await getTransactionByAuthority(db, authority);
        if (!transaction || !canViewTransaction(user!, transaction)) throw new HttpError(404, 'تراکنش یافت نشد.');
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
      handler: async ({ params, user }) => {
        const authority = decodeURIComponent(params[0]!);
        const transaction = await getTransactionByAuthority(db, authority);
        if (!transaction || !canViewTransaction(user!, transaction)) throw new HttpError(404, 'تراکنش یافت نشد.');
        return { status: 200, body: { transaction } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/coach\/transactions$/,
      auth: ['coach'],
      handler: async ({ user }) => {
        return { status: 200, body: { transactions: await listCoachTransactions(db, user!.id), testTransactions: await listTestTransactions(db, now(), user!.id) }, headers: { 'Cache-Control': 'no-store' } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/admin\/transactions$/,
      auth: ['admin'],
      handler: async () => {
        return { status: 200, body: { transactions: await listAllTransactions(db), testTransactions: await listTestTransactions(db, now()) }, headers: { 'Cache-Control': 'no-store' } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/admin\/payment-test-mode$/,
      auth: ['admin'],
      handler: async () => ({ status: 200, body: await getTestMode(db, now()), headers: { 'Cache-Control': 'no-store' } }),
    },

    {
      method: 'PUT',
      pattern: /^\/api\/admin\/payment-test-mode$/,
      auth: ['admin'],
      handler: async ({ user, body }) => {
        const input = requireObject(body);
        if (typeof input.enabled !== 'boolean') throw new HttpError(400, 'وضعیت آزمایش نامعتبر است.');
        return { status: 200, body: await setTestMode(db, user!.id, input.enabled, now()), headers: { 'Cache-Control': 'no-store' } };
      },
    },

    {
      method: 'PUT',
      pattern: /^\/api\/coach\/iban$/,
      auth: ['coach'],
      handler: async ({ user, body }) => {
        const input = requireObject(body);
        if (input.accountId !== undefined && input.accountId !== user!.id) throw new HttpError(409, 'حساب تغییر کرده است؛ صفحه را دوباره باز کنید.');
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
      handler: async ({ user, url }) => {
        if (url.searchParams.has('accountId') && url.searchParams.get('accountId') !== String(user!.id)) throw new HttpError(409, 'حساب تغییر کرده است؛ صفحه را دوباره باز کنید.');
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
      method: 'GET',
      pattern: /^\/api\/me\/ai-settings$/,
      auth: 'signed-in',
      handler: async ({ user }) => {
        const biometrics = await loadBiometrics(db, user!.id, user!.role === 'student' ? user!.coachId : null);
        return { status: 200, body: { biometrics } };
      },
    },

    {
      method: 'GET', pattern: /^\/api\/me\/ai-settings\/archive$/,
      auth: ['student'],
      handler: async ({ user, url }) => {
        const cursor = url.searchParams.get('cursor');
        if (cursor !== null && (!/^[1-9]\d{0,9}$/.test(cursor) || !Number.isSafeInteger(Number(cursor)) || Number(cursor) > 2147483647)) {
          throw new HttpError(400, 'نشانگر بایگانی نامعتبر است.');
        }
        return { status: 200, body: await listFormerCoachBiometrics(db, user!.id, user!.coachId, cursor ? Number(cursor) : 0), headers: { 'Cache-Control': 'no-store' } };
      },
    },

    {
      method: 'GET',
      pattern: /^\/api\/students\/(\d+)\/ai-settings$/,
      auth: ['coach', 'admin'],
      handler: async ({ user, params }) => {
        const student = await ownStudent(user!, Number(params[0]));
        const biometrics = await loadBiometrics(db, student.id, student.coachId);
        return { status: 200, body: { studentName: student.displayName, biometrics } };
      },
    },

    {
      method: 'PUT',
      pattern: /^\/api\/students\/(\d+)\/ai-settings$/,
      auth: ['coach', 'admin'],
      handler: async ({ user, params, body }) => {
        const student = await ownStudent(user!, Number(params[0]));
        const input = validateBiometricsInput(body);
        if (student.coachId === null) throw new HttpError(409, 'مربی این شاگرد مشخص نیست.');
        const biometrics = await saveBiometrics(db, student.id, student.coachId, input, now().toISOString(), student.coachAccessVersion, user!.role === 'admin');
        return { status: 200, body: { studentName: student.displayName, biometrics } };
      },
    },

    {
      method: 'DELETE',
      pattern: /^\/api\/students\/(\d+)$/,
      auth: ['coach'],
      handler: async ({ user, params }) => {
        const student = await ownStudent(user!, Number(params[0]));
        if (!(await deleteUnclaimedStudent(db, student.id, user!.id))) {
          throw new HttpError(403, 'حساب فعال‌شدهٔ شاگرد را مربی نمی‌تواند حذف کند.');
        }
        return { status: 200, body: { ok: true } };
      },
    },

    {
      method: 'POST',
      pattern: /^\/api\/students\/(\d+)\/reset-password$/,
      auth: ['coach', 'admin'],
      handler: async ({ user, params }) => {
        const student = await ownStudent(user!, Number(params[0]));
        const password = generatePassword();
        if (!(await resetUserPassword(db, student.id, hashPassword(password), encryptSecret(secretKey, password), user!.role === 'coach' ? user!.id : null))) {
          throw new HttpError(403, 'رمز حساب فعال‌شدهٔ شاگرد را مربی نمی‌تواند تغییر دهد؛ از پشتیبانی کمک بگیرید.');
        }
        return { status: 200, body: { username: student.username, password } };
      },
    },

    {
      method: 'PUT',
      pattern: /^\/api\/students\/(\d+)\/active$/,
      auth: ['coach', 'admin'],
      handler: async ({ user, params, body }) => {
        const student = await ownStudent(user!, Number(params[0]));
        const input = requireObject(body);
        if (typeof input.active !== 'boolean') {
          throw new HttpError(400, 'فیلد active باید بولین باشد.');
        }
        if (user!.role === 'coach') {
          if (!(await setUnclaimedStudentActive(db, student.id, user!.id, input.active))) throw new HttpError(403, 'وضعیت حساب فعال‌شدهٔ شاگرد را مربی نمی‌تواند تغییر دهد.');
        } else {
          await setUserActive(db, student.id, input.active);
        }
        return { status: 200, body: { ok: true, isActive: input.active, id: student.id } };
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
    const user = await findUserBySession(db, candidate, now());
    if (!user) return { user: null, token: null, viaCookie: false };
    // Only a cookie-only session is subject to the JSON-only rule for writes (CSRF protection).
    return { user, token: candidate, viaCookie: !bearer && !header };
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
      if (!user.isActive) {
        if (token) await deleteSession(db, token);
        throw new HttpError(403, 'حساب کاربری شما غیرفعال شده است. لطفاً با مربی یا پشتیبانی تماس بگیرید.');
      }
      if (Array.isArray(route.auth) && !route.auth.includes(user.role)) throw new HttpError(403, 'دسترسی به این بخش ندارید.');
      if (user.mustChangePassword && !ALWAYS_ALLOWED.has(url.pathname)) {
        throw new HttpError(403, 'ابتدا رمز عبور خود را تغییر دهید.');
      }
    }
    const params = route.pattern.exec(url.pathname)?.slice(1) ?? [];
    return route.handler({ user, token, body, params, url, request });
  }

  return async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const origin = String(request.headers.origin ?? '');
    if (origin) {
      response.setHeader('Vary', 'Origin');
      if (!isAllowedOrigin(origin, request, allowedOrigins)) {
        send(response, 403, { error: 'این مبدأ اجازهٔ دسترسی به سرور را ندارد.' });
        return;
      }
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Meety-Session');
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      response.setHeader('Access-Control-Allow-Credentials', 'true');
      response.setHeader('Access-Control-Max-Age', '600');
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
      const nutritionWrite = request.method === 'PUT' && (path === '/api/me/diary' || /^\/api\/students\/\d+\/nutrition$/.test(path));
      const limit = path.endsWith('/chat') ? CHAT_BODY_BYTES : path === '/api/me/sessions' || path === '/api/me/personal-data/batch' || path === '/api/me/profile' ? SESSIONS_BODY_BYTES : nutritionWrite ? NUTRITION_BODY_BYTES : undefined;
      const body = request.method === 'GET' ? {} : await readJsonBody(request, limit);
      const result = await dispatch(request, body);
      send(response, result.status, result.body, result.headers);
    } catch (error) {
      if (error instanceof HttpError) {
        if (error.status === 413) {
          // Do not keep a connection with an oversized, possibly still streaming body.
          request.resume();
          send(response, 413, { error: error.message }, { Connection: 'close' });
        } else send(response, error.status, { error: error.message });
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
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Permissions-Policy': 'geolocation=(), microphone=(self), camera=(self)',
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
