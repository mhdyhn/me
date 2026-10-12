/**
 * Thin client for the Meety API. Paths are relative (`/api/...`): the browser talks to the
 * same origin, and the dev server or the production host forwards them to the API.
 */
const TOKEN_KEY = 'meety.session-token';
export const UNAUTHORIZED_EVENT = 'meety:unauthorized';

export type Role = 'admin' | 'coach' | 'student';

export interface PublicUser {
  id: number;
  username: string;
  role: Role;
  displayName: string;
  coachId: number | null;
  mustChangePassword: boolean;
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
  title: string;
  days: ProgramDay[];
  updatedAt: string;
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

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

export async function api<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<T> {
  // The session cookie is sent automatically (same origin); the bearer header is a fallback for proxies that drop cookies.
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`/api${path}`, { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'اتصال به سرور برقرار نشد. اینترنت را بررسی کنید.');
  }
  const json = (await response.json().catch(() => ({}))) as { error?: string } & T;
  // A rejected session anywhere in the app sends the user back to sign-in, instead of a dead screen.
  if (response.status === 401 && path !== '/auth/login') {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
  if (!response.ok) {
    throw new ApiError(response.status, json.error ?? 'خطای ناشناخته‌ای رخ داد.');
  }
  return json;
}
