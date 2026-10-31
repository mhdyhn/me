/**
 * Thin client for the Meety API. Paths are relative (`/api/...`): the browser talks to the
 * same origin, and the dev server or the production host forwards them to the API.
 */
export const TOKEN_KEY = 'meety.session-token';
export const USER_KEY = 'meety.session-user';

/** Empty on the website (same origin). The Android build sets it to the live server address. */
const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');
export const UNAUTHORIZED_EVENT = 'meety:unauthorized';

export type Role = 'admin' | 'coach' | 'student';

export interface PublicUser {
  id: number;
  username: string;
  role: Role;
  displayName: string;
  coachId: number | null;
  mustChangePassword: boolean;
  iban?: string | null;
  isActive?: boolean;
  selfRegistered?: boolean;
  pendingApproval?: boolean;
  coachAccess?: boolean;
  personalProgramMode?: boolean;
  phoneNumber?: string | null;
}

export interface ProgramItem {
  exerciseId: string;
  name: string;
  muscle: string;
  sets: number;
  reps: string;
  restSeconds: number;
}

export interface ProgramDay {
  name: string;
  exercises: ProgramItem[];
}

export interface Programme {
  id: string;
  version: number;
  title: string;
  days: ProgramDay[];
  priceTomans?: number;
  updatedAt: string;
  isTestPurchase?: boolean;
  testPurchaseExpiresAt?: string | null;
}

export interface PaymentTransaction {
  id: number;
  studentId: number;
  studentName?: string;
  coachId: number;
  coachName?: string;
  amountTomans: number;
  coachShareTomans: number;
  adminShareTomans: number;
  authority: string;
  status: 'pending' | 'paid' | 'failed' | 'canceled' | 'expired';
  refId: string | null;
  cardPan: string | null;
  createdAt: string;
  verifiedAt: string | null;
  /** How the money was paid: online gateway, card transfer, or an older record. */
  method?: 'online' | 'card_transfer' | 'sandbox' | 'legacy';
  cardTransferAmountTomans?: number | null;
  cardTransferReference?: string | null;
  cardTransferSenderLast4?: string | null;
  cardTransferConfirmedBy?: string | null;
}

export interface TestPaymentTransaction extends PaymentTransaction {
  simulation: true;
  programmeId: string;
  programmeVersion: number;
}

export interface SubscriptionShare {
  id: number;
  studentName: string;
  amountTomans: number;
  coachShareTomans: number;
  createdAt: string;
  expiresAt: string;
}

export interface TransactionsResponse {
  transactions: PaymentTransaction[];
  testTransactions?: TestPaymentTransaction[];
  /** The referral shares of the subscriptions of the students this coach referred. */
  subscriptionShares?: SubscriptionShare[];
}

export interface Credentials {
  user: PublicUser;
  username: string;
  password: string;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function getStoredUser(): PublicUser | null {
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as PublicUser) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: PublicUser): void {
  try {
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // Ignore storage quota errors
  }
}

export function clearStoredUser(): void {
  try {
    window.localStorage.removeItem(USER_KEY);
  } catch {
    // Storage unavailable
  }
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  clearStoredUser();
}

export async function api<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown, timeoutMs = 25000, fixedSessionToken?: string): Promise<T> {
  // The session cookie is sent automatically (same origin); the bearer header is a fallback for proxies that drop cookies.
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  // Background sync binds its account to the token it started with, not a newer tab's login.
  const token = fixedSessionToken ?? getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    // Some preview proxies drop Authorization; a custom header is passed through.
    headers['X-Meety-Session'] = token;
  }

  const controller = new AbortController();
  const timeoutMessage = 'پاسخ سرور بیش از حد طول کشید. لطفاً اتصال اینترنت را بررسی و دوباره تلاش کنید.';
  let timer = 0;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = window.setTimeout(() => {
      controller.abort();
      reject(new ApiError(0, timeoutMessage));
    }, timeoutMs);
  });

  let response: Response;
  let json: { error?: string } & T;
  try {
    // The deadline includes the response body, not just the arrival of headers.
    const fetchBody = async () => {
      const received = await fetch(`${API_BASE}/api${path}`, {
        method,
        headers,
        // A different tab can replace the cookie; an explicitly bound request must never use it.
        credentials: fixedSessionToken ? 'omit' : 'same-origin',
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      let data: { error?: string } & T;
      try {
        data = await received.json() as { error?: string } & T;
        if (data === null || typeof data !== 'object') throw new Error('Invalid JSON response');
      } catch (error) {
        if (controller.signal.aborted) throw error;
        if (received.ok) throw new ApiError(received.status, 'پاسخ سرور نامعتبر است. دوباره تلاش کنید.');
        data = {} as { error?: string } & T;
      }
      return { response: received, json: data };
    };
    ({ response, json } = await Promise.race([fetchBody(), timeout]));
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err;
    if (controller.signal.aborted || (err as Error)?.name === 'AbortError') throw new ApiError(0, timeoutMessage);
    throw new ApiError(0, 'اتصال به سرور برقرار نشد. اینترنت را بررسی کنید.');
  } finally {
    window.clearTimeout(timer);
  }
  // A rejected session anywhere in the app sends the user back to sign-in, instead of a dead screen.
  if (response.status === 401 && path !== '/auth/login' && getToken() === token) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
  if (response.status === 403 && path !== '/auth/login' && getToken() === token && json.error?.includes('غیرفعال')) {
    try {
      window.sessionStorage.setItem('meety:deactivated-message', json.error);
    } catch {
      // Ignore
    }
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
  if (!response.ok) {
    throw new ApiError(response.status, json.error ?? 'خطای ناشناخته‌ای رخ داد.');
  }
  return json;
}
