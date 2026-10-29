export class HttpError extends Error {
  // Written out rather than as constructor parameter properties: Node's built-in TypeScript
  // support only strips types and cannot run parameter properties.
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const MAX_BODY_BYTES = 16 * 1024;
/** Workout summaries are a batch of sessions, so their upload may be larger. */
export const SESSIONS_BODY_BYTES = 256 * 1024;
/** A weekly plan can contain a validated current version and its comparison base. */
export const NUTRITION_BODY_BYTES = 192 * 1024;
/** Chat messages can carry photos, voice notes, or short clips. */
export const CHAT_BODY_BYTES = 6 * 1024 * 1024;

/** Reads the request body as JSON. An empty body is treated as an empty object. */
export async function readJsonBody(request: AsyncIterable<Buffer>, limit = MAX_BODY_BYTES): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'درخواست بیش از حد بزرگ است.');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'بدنهٔ درخواست JSON معتبر نیست.');
  }
}

export function requireObject(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'بدنهٔ درخواست نامعتبر است.');
  return body as Record<string, unknown>;
}

export function requireText(body: Record<string, unknown>, key: string, min: number, max: number, label: string): string {
  const value = body[key];
  if (typeof value !== 'string') throw new HttpError(400, `${label} را وارد کنید.`);
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) throw new HttpError(400, `${label} باید بین ${min} تا ${max} نویسه باشد.`);
  return trimmed;
}

export const SESSION_COOKIE = 'meety_session';
/** Lower-case because Node exposes incoming header names in lower case. */
export const SESSION_HEADER = 'x-meety-session';
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * The session also travels as an HttpOnly cookie. Some proxies drop the Authorization header,
 * and a cookie is the usual way a browser app keeps its session. SameSite=Strict keeps it
 * from being sent on cross-site requests.
 */
export function sessionCookie(token: string): string {
  const secure = process.env.COOKIE_SECURE === '1' || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`;
}

export function clearSessionCookie(): string {
  const secure = process.env.COOKIE_SECURE === '1' || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=') || null;
  }
  return null;
}
