import pg from 'pg';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { migrateChat } from './chat.ts';
import { HttpError } from './http.ts';
import { migrateNutrition } from './nutrition.ts';
import { migrateSessions } from './sessions.ts';
import { migratePayments } from './payments.ts';
import { migrateCardTransfers } from './cardTransfer.ts';
import { migrateSubscriptions } from './subscriptions.ts';
import { migrateBiometrics } from './biometrics.ts';
import { migrateStudentProfiles } from './studentProfile.ts';
import { migratePersonalData } from './personalData.ts';
import { migrateTestPurchases } from './testPurchases.ts';
import { migrateRegistration } from './registration.ts';
import { migrateAccountHistory } from './accountHistory.ts';

/**
 * Storage for the server, PostgreSQL. Production uses a hosted database through
 * DATABASE_URL. Tests use an in-process PostgreSQL ('memory'). Local development without a
 * DATABASE_URL keeps its data in a folder on disk. The schema is created with IF NOT EXISTS
 * so a new and an existing database both work. Later phases add tables here, never edit
 * the ones already shipped.
 */
export type Row = Record<string, any>;

/**
 * A failure that comes from the database itself. The client shows it as a service notice
 * instead of an empty screen, for every role.
 */
export class DatabaseError extends HttpError {
  readonly database = true;
  readonly detail?: string;

  constructor(status: number, message: string, detail?: string) {
    super(status, message);
    this.detail = detail;
  }
}

/** Failures that waiting cannot fix: a wrong address, a wrong password, a suspended plan. */
const PERMANENT_FAILURES = new Set(['28P01', '53000', '3D000', 'ENOTFOUND', 'EAI_AGAIN']);

export interface Db {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  /** False while the database is still connecting. Only the lazy handle reports it. */
  isReady?(): boolean;
  /** Why the database is not reachable yet. Only the lazy handle reports it. */
  startupFailure?(): DatabaseFailure | null;
}

/** Opens the database. `target` is a postgres:// URL, 'memory', or a folder path for local use. */
export async function openDatabase(target: string): Promise<Db> {
  if (!target.startsWith('postgres')) {
    const db = fromPGlite(target === 'memory' ? new PGlite() : new PGlite(target));
    await migrate(db);
    return db;
  }
  // A pasted password can lose a character that the URL syntax eats. The server then refuses
  // the login, so the other spellings of the same connection are tried before giving up.
  const candidates = connectionCandidates(target);
  let failure: unknown = null;
  for (const [index, candidate] of candidates.entries()) {
    const database = fromPool(candidate);
    try {
      await migrate(database);
      if (index > 0) {
        console.warn('The database connection string was repaired: the password had lost a character that the URL syntax eats. Percent-encode the password (for example %40 for @) in DATABASE_URL.');
      }
      return database;
    } catch (error) {
      failure = error;
      await database.close().catch(() => {});
      if (!canRepairWithAnotherSpelling(error)) throw error;
      // The pooler counts failed logins and blocks new connections for a while.
      if (index < candidates.length - 1) await new Promise((resolve) => setTimeout(resolve, repairDelayMs()));
    }
  }
  throw failure;
}

/** True when another spelling of the same connection string could still work. */
function canRepairWithAnotherSpelling(error: unknown): boolean {
  if (describeFailure(error).code === '28P01') return true;
  const message = String((error as { message?: string })?.message ?? '');
  // A raw character in the password can make the string unreadable for the driver.
  return /invalid url|malformed/i.test(message);
}

/** The pause between two tries. The pooler counts the failed logins of a user. */
function repairDelayMs(): number {
  const configured = Number(process.env.DATABASE_REPAIR_DELAY_MS ?? '');
  return Number.isFinite(configured) && configured >= 0 ? configured : 12000;
}

/**
 * A safe description of the configured connection. It never contains the password or the name
 * of the user: the name is hashed (the project id of a hosted database cannot be guessed) and
 * only the length of the password is given. It shows which spelling of the string is in use,
 * so a wrong address, a wrong user and a truncated password can be told apart.
 */
export interface ConnectionSummary {
  host: string;
  userHash: string;
  passwordLength: number;
}

export function describeConnection(rawUrl: string): ConnectionSummary {
  const url = withoutSslParameters(tidyConnectionString(rawUrl));
  const schemeEnd = url.indexOf('://');
  if (schemeEnd < 0) return { host: '', userHash: '', passwordLength: 0 };
  const authorityStart = schemeEnd + 3;
  const pathStart = url.indexOf('/', authorityStart);
  const authorityEnd = pathStart < 0 ? url.length : pathStart;
  const authority = url.slice(authorityStart, authorityEnd);
  const separator = authority.lastIndexOf('@');
  if (separator < 0) return { host: authority, userHash: '', passwordLength: 0 };
  const userInfo = authority.slice(0, separator);
  const host = authority.slice(separator + 1);
  const colon = userInfo.indexOf(':');
  const user = colon < 0 ? userInfo : userInfo.slice(0, colon);
  const password = colon < 0 ? '' : userInfo.slice(colon + 1);
  return {
    host: host.replace(/:\d+$/, ''),
    userHash: createHash('sha256').update(user).digest('hex').slice(0, 12),
    passwordLength: password.length,
  };
}

/**
 * Connects to the database and keeps trying. The hosted database scales down when it is idle and
 * the connection attempt can fail or hang; the web server must answer the health check in the
 * meantime, otherwise the host restarts the instance and the site never comes up. The returned
 * handle works before the database is ready: queries wait for it and give up with a clear error
 * when it stays unreachable.
 */
export function connectDatabase(target: string, waitMs = 20000): Db {
  let failure: DatabaseFailure | null = null;
  let closed = false;
  const opening = (async () => {
    for (let attempt = 1; ; attempt += 1) {
      if (closed) throw new Error('The database connection was closed.');
      try {
        const database = await openDatabase(target);
        failure = null;
        return database;
      } catch (error) {
        failure = describeFailure(error);
        if (attempt === 1 || attempt % 12 === 0) {
          // The full message stays in the server log; the health check only shows a short reason.
          console.error(`Database not ready (attempt ${attempt}); retrying in 5 seconds.`, (error as Error)?.message ?? failure.code);
        }
        // A wrong password will not become right by trying again, and a host that blocks
        // connections after failed logins punishes a fast retry loop.
        const delay = PERMANENT_FAILURES.has(failure.code) ? 60000 : 5000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  })();
  const handle = lazyDatabase(opening, waitMs, () => failure);
  return {
    ...handle,
    async close(): Promise<void> {
      closed = true;
      await handle.close();
    },
  };
}

/**
 * A handle that works before the database finished connecting. Queries wait for the database and
 * give up with a clear error when it stays unreachable.
 */
export function lazyDatabase(open: Promise<Db>, waitMs = 20000, reportFailure?: () => DatabaseFailure | null): Db {
  let ready = false;
  let failure: DatabaseFailure | null = null;
  void open.then(() => { ready = true; }, (error: unknown) => { failure = describeFailure(error); });
  const wait = async (): Promise<Db> => {
    if (ready) return open;
    // A wrong address, a wrong password or a suspended plan does not fix itself by waiting.
    // Answer at once so no screen sits on a spinner for the whole timeout.
    const known = reportFailure?.() ?? failure;
    if (known && PERMANENT_FAILURES.has(known.code)) {
      throw new DatabaseError(503, known.message, known.detail);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        open,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new DatabaseError(503, 'پایگاه داده در حال اتصال است؛ کمی بعد دوباره تلاش کنید.')), waitMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  return {
    async query<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
      const database = await wait();
      return database.query<T>(sql, params);
    },
    async exec(sql: string): Promise<void> {
      const database = await wait();
      await database.exec(sql);
    },
    async close(): Promise<void> {
      const database = await open.catch(() => null);
      if (database) await database.close();
    },
    isReady: () => ready,
    startupFailure: () => failure ?? reportFailure?.() ?? null,
  };
}

/** A short, safe description of why the database is not reachable. No address or secret is included. */
export interface DatabaseFailure { code: string; message: string; detail?: string }

function describeFailure(error: unknown): DatabaseFailure {
  const raw = error as { code?: string; message?: string };
  const message = String(raw?.message ?? '');
  const code = String(raw?.code ?? '').trim();
  const detail = safeDetail(message);
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return { code: code || 'ENOTFOUND', message: 'نشانی پایگاه داده پیدا نشد.', detail };
  if (code === 'ECONNREFUSED') return { code, message: 'پایگاه داده اتصال را نپذیرفت.', detail };
  if (code === 'ETIMEDOUT' || message.includes('timeout')) return { code: code || 'ETIMEDOUT', message: 'اتصال به پایگاه داده به وقت گذشت.', detail };
  if (code === '28P01') return { code, message: 'اطلاعات دسترسی پایگاه داده درست نیست (رمز عبور یا نام کاربری).', detail };
  // The host answers with a generic code when it blocked new connections after failed logins.
  if (/password authentication failed|authentication failed|ECIRCUITBREAKER|too many authentication failures/i.test(message)) {
    return { code: code || '28P01', message: 'اطلاعات دسترسی پایگاه داده درست نیست (رمز عبور یا نام کاربری).', detail };
  }
  if (code === '53P01') return { code, message: 'سرویس پایگاه داده در دسترس نیست.' };
  if (code === '57P03') return { code, message: 'پایگاه داده در دسترس نیست.' };
  if (code === '53300') return { code, message: 'ظرفیت پایگاه داده پر است.' };
  if (code === '53000') return { code, message: 'سرویس پایگاه داده از دسترس خارج است؛ دسترسی حساب یا سهمیهٔ آن بررسی شود.', detail };
  if (code === '3D000') return { code, message: 'پایگاه داده پیدا نشد.', detail };
  return { code: code || 'unknown', message: 'اتصال به پایگاه داده برقرار نشد.', detail };
}

/** The short technical detail of a failure, without anything that looks like a secret or an address. */
function safeDetail(message: string): string | undefined {
  const text = message
    .replace(/postgres(ql)?:\/\/\S+/gi, '[database]')
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g, '[address]')
    .replace(/[\w.-]+:\d{2,5}\b/g, '[address]')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return undefined;
  if (/password|passphrase|secret|token/i.test(text)) return undefined;
  return text.slice(0, 140);
}

/** The SSL parameters of a connection string; the options of the app decide instead. */
const SSL_PARAMETERS = /^(sslmode|sslcert|sslkey|sslrootcert|sslnegotiation)=/i;

/** Hosts that run on the same machine and need no TLS. */
const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/i;

/**
 * Removes the SSL parameters from a connection string. node-postgres gives the parameters of
 * the string priority over the options of the pool, and with `sslmode=require` it then leaves
 * the certificate check on, which fails against a pooler whose certificate chain ends in a
 * self-signed certificate.
 */
export function withoutSslParameters(url: string): string {
  const at = url.indexOf('?');
  if (at < 0) return url;
  const base = url.slice(0, at);
  const kept = url.slice(at + 1).split('&').filter((part) => part && !SSL_PARAMETERS.test(part));
  return kept.length ? `${base}?${kept.join('&')}` : base;
}

/**
 * Removes the spaces around the connection string and around the password in it. A copy and
 * paste often brings a newline or a space along, and the server then reads a wrong password.
 */
export function tidyConnectionString(url: string): string {
  const trimmed = url.trim();
  const scheme = trimmed.indexOf('://');
  if (scheme < 0) return trimmed;
  const authorityStart = scheme + 3;
  const at = trimmed.indexOf('@', authorityStart);
  if (at < 0) return trimmed;
  const userInfo = trimmed.slice(authorityStart, at);
  const colon = userInfo.indexOf(':');
  if (colon < 0) return trimmed;
  const user = userInfo.slice(0, colon);
  const password = userInfo.slice(colon + 1).trim();
  return `${trimmed.slice(0, authorityStart)}${user}:${password}${trimmed.slice(at)}`;
}

export interface PoolOptions {
  connectionString: string;
  ssl?: { rejectUnauthorized: boolean };
}

/**
 * The characters that a connection string eats at the end of a password. A password that ends
 * with `@` arrives as `postgresql://user:secret@host`, and the URL syntax reads `secret` as the
 * password and `host` as the host: the password is one character short and the server refuses
 * the login with 28P01.
 */
const LOST_PASSWORD_CHARACTERS = ['@'];

/**
 * The connection strings to try for one configured string. The first one is the string itself.
 * The others are the same connection with the password percent-encoded and with the character
 * that the URL syntax may have eaten put back, so a copy and paste does not have to be perfect.
 */
export function connectionCandidates(rawUrl: string): string[] {
  const url = withoutSslParameters(tidyConnectionString(rawUrl));
  const schemeEnd = url.indexOf('://');
  if (schemeEnd < 0) return [url];
  const authorityStart = schemeEnd + 3;
  const pathStart = url.indexOf('/', authorityStart);
  const authorityEnd = pathStart < 0 ? url.length : pathStart;
  const authority = url.slice(authorityStart, authorityEnd);
  // The last `@` separates the password from the host; an `@` inside the password belongs to it.
  const separator = authority.lastIndexOf('@');
  if (separator < 0) return [url];
  const userInfo = authority.slice(0, separator);
  const host = authority.slice(separator + 1);
  const colon = userInfo.indexOf(':');
  if (colon < 0) return [url];
  const user = userInfo.slice(0, colon);
  const password = userInfo.slice(colon + 1);
  let decoded = password;
  try {
    decoded = decodeURIComponent(password);
  } catch {
    decoded = password;
  }
  const build = (value: string): string => `${url.slice(0, authorityStart)}${user}:${encodeURIComponent(value)}@${host}${url.slice(authorityEnd)}`;
  const candidates = [url];
  const add = (value: string): void => {
    const built = build(value);
    if (built !== url && !candidates.includes(built)) candidates.push(built);
  };
  // The password as it was meant, with the characters that the URL syntax eats encoded.
  add(decoded);
  for (const character of LOST_PASSWORD_CHARACTERS) {
    if (password.endsWith(character)) {
      // The string has the character twice: the password may be the one without it.
      add(decoded.slice(0, -character.length));
      continue;
    }
    // The password already has the character (encoded); nothing was lost.
    if (decoded.endsWith(character)) continue;
    // The character was eaten by the URL syntax: it belongs to the password.
    add(`${decoded}${character}`);
  }
  return candidates;
}

/**
 * The connection options for the database. A remote database speaks TLS; its certificate is
 * often signed by a private authority, so the chain is not verified unless
 * DATABASE_SSL_REJECT_UNAUTHORIZED is set to true.
 */
export function poolOptions(rawUrl: string): PoolOptions {
  const url = withoutSslParameters(tidyConnectionString(rawUrl));
  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = '';
  }
  const remote = hostname !== '' && !LOCAL_HOSTS.test(hostname);
  const strict = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'true';
  return {
    connectionString: url,
    ...(remote || process.env.NODE_ENV === 'production' ? { ssl: { rejectUnauthorized: strict } } : {}),
  };
}

function fromPool(rawUrl: string): Db {
  const options = poolOptions(rawUrl);
  const pool = new pg.Pool({
    connectionString: options.connectionString,
    max: 5,
    // The hosted database scales down when it is idle. Without a limit a connection attempt can
    // wait forever, and then nothing retries. A failed attempt is retried by the caller.
    // A cold start on a free host can take longer than the usual limit, so it is configurable.
    connectionTimeoutMillis: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS ?? 15000),
    ssl: options.ssl,
  });
  // The hosted database closes idle connections (free tier pauses after inactivity). Without this listener
  // Node treats the error as fatal and the whole server stops. The pool opens a new connection on the next request.
  pool.on('error', (error) => {
    console.error('Database connection dropped; a new one opens on the next request.', error.message);
  });
  return {
    async query<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
      try {
        const result = await pool.query(sql, params as unknown[]);
        return result.rows as T[];
      } catch (error: any) {
        const msg = String(error?.message ?? '');
        const code = String(error?.code ?? '');
        const isTransient = code === '57P01' || code === 'ECONNRESET' || msg.includes('Connection terminated') || msg.includes('connection closed');
        if (isTransient) {
          console.warn('Retrying query after transient connection drop:', msg);
          const result = await pool.query(sql, params as unknown[]);
          return result.rows as T[];
        }
        throw error;
      }
    },
    async exec(sql: string): Promise<void> {
      try {
        await pool.query(sql);
      } catch (error: any) {
        const msg = String(error?.message ?? '');
        const code = String(error?.code ?? '');
        const isTransient = code === '57P01' || code === 'ECONNRESET' || msg.includes('Connection terminated') || msg.includes('connection closed');
        if (isTransient) {
          console.warn('Retrying exec after transient connection drop:', msg);
          await pool.query(sql);
          return;
        }
        throw error;
      }
    },
    async close(): Promise<void> {
      await pool.end();
    },
  };
}

function fromPGlite(pg: PGlite): Db {
  return {
    async query<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
      const result = await pg.query(sql, params as unknown[]);
      return result.rows as T[];
    },
    async exec(sql: string): Promise<void> {
      await pg.exec(sql);
    },
    async close(): Promise<void> {
      await pg.close();
    },
  };
}

async function migrate(db: Db): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'coach', 'student')),
      display_name TEXT NOT NULL,
      coach_id INTEGER REFERENCES users(id),
      must_change_password INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      password_enc TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      auth_version INTEGER NOT NULL DEFAULT 0,
      self_registered INTEGER NOT NULL DEFAULT 0,
      pending_approval INTEGER NOT NULL DEFAULT 0,
      coach_access INTEGER NOT NULL DEFAULT 1,
      coach_access_version INTEGER NOT NULL DEFAULT 0,
      phone_number TEXT,
      CONSTRAINT users_coach_role_check CHECK (role = 'student' OR coach_id IS NULL)
    );

    -- One active programme per student. The coach replaces it; the body is validated by programs.ts.
    CREATE TABLE IF NOT EXISTS student_programs (
      student_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      coach_id INTEGER NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Personal workout programme synced across devices for any signed-in user (admin, coach, etc.)
    CREATE TABLE IF NOT EXISTS user_personal_programs (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      auth_version INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_users_coach_id ON users(coach_id);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_student_programs_coach_id ON student_programs(coach_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
  `);
  // Existing users and sessions both start at version zero, so migration keeps them signed in.
  await db.exec(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0;
  `);
  await migrateRegistration(db);
  await migrateChat(db);
  await migrateNutrition(db);
  await migrateSessions(db);
  await migratePayments(db);
  await migrateCardTransfers(db);
  await migrateSubscriptions(db);
  await migrateTestPurchases(db);
  await migrateBiometrics(db);
  await migrateStudentProfiles(db);
  await migratePersonalData(db);
  await migrateAccountHistory(db);
  await db.exec('ALTER TABLE users ADD COLUMN IF NOT EXISTS password_enc TEXT;');
  await db.exec('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active INTEGER NOT NULL DEFAULT 1;');
}
