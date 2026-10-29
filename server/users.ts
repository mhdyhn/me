import { decryptSecret, type SecretKey } from './secrets.ts';
import type { Db } from './db.ts';
import { HttpError } from './http.ts';

export type Role = 'admin' | 'coach' | 'student';

/** The shape the app receives. The password hash never leaves the server. */
export interface PublicUser {
  id: number;
  username: string;
  role: Role;
  displayName: string;
  coachId: number | null;
  mustChangePassword: boolean;
  iban?: string | null;
  isActive: boolean;
  selfRegistered: boolean;
  pendingApproval: boolean;
  coachAccess: boolean;
  personalProgramMode: boolean;
  /** Null for existing accounts created before mobile numbers were collected. */
  phoneNumber: string | null;
}

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: Role;
  display_name: string;
  phone_number?: string | null;
  coach_id: number | null;
  must_change_password: number;
  password_enc: string | null;
  iban?: string | null;
  is_active?: number | null;
  self_registered?: number | null;
  pending_approval?: number | null;
  coach_access?: number | null;
  coach_access_version?: string | number | null;
  personal_program_mode?: number | null;
  session_guard_version?: string | number | null;
  auth_version: string | number;
}

export interface StoredUser extends PublicUser {
  passwordHash: string;
  /** Changes when credentials are reset or the account is deactivated; never sent to clients. */
  authVersion: number;
  /** Invalidates stale profile-sharing requests when coach access is withdrawn. */
  coachAccessVersion: number;
  /** Detects a session write racing a programme/relationship switch. */
  sessionGuardVersion: number;
  /** The generated password, encrypted, while the user still has it. Null after they choose their own. */
  passwordEnc: string | null;
}

function fromRow(row: UserRow): StoredUser {
  return {
    id: Number(row.id),
    username: row.username,
    role: row.role,
    displayName: row.display_name,
    phoneNumber: row.phone_number ?? null,
    coachId: row.coach_id === null ? null : Number(row.coach_id),
    mustChangePassword: Number(row.must_change_password) === 1,
    passwordHash: row.password_hash,
    authVersion: Number(row.auth_version),
    coachAccessVersion: Number(row.coach_access_version ?? 0),
    sessionGuardVersion: Number(row.session_guard_version ?? 0),
    passwordEnc: row.password_enc ?? null,
    iban: row.iban ?? null,
    isActive: row.is_active === undefined || row.is_active === null ? true : Number(row.is_active) === 1,
    selfRegistered: Number(row.self_registered ?? 0) === 1,
    pendingApproval: Number(row.pending_approval ?? 0) === 1,
    coachAccess: Number(row.coach_access ?? 1) === 1,
    personalProgramMode: Number(row.personal_program_mode ?? 0) === 1,
  };
}

export function toPublic(user: StoredUser): PublicUser {
  // Credentials and the session version never leave the server.
  const { passwordHash: _hash, passwordEnc: _enc, authVersion: _version, coachAccessVersion: _coachVersion, sessionGuardVersion: _sessionVersion, ...publicUser } = user;
  return publicUser;
}

export async function findUserById(db: Db, id: number): Promise<StoredUser | null> {
  const row = (await db.query<UserRow>('SELECT * FROM users WHERE id = $1', [id]))[0];
  return row ? fromRow(row) : null;
}

export async function findUserByUsername(db: Db, username: string): Promise<StoredUser | null> {
  const row = (await db.query<UserRow>('SELECT * FROM users WHERE username = $1', [username]))[0];
  return row ? fromRow(row) : null;
}

export async function insertUser(
  db: Db,
  input: { username: string; passwordHash: string; passwordEnc?: string | null; role: Role; displayName: string; phoneNumber?: string | null; coachId: number | null; mustChangePassword: boolean; now: Date; selfRegistered?: boolean; isActive?: boolean; pendingApproval?: boolean },
): Promise<number> {
  const rows = await db.query<{ id: number }>(
    'INSERT INTO users (username, password_hash, role, display_name, coach_id, must_change_password, created_at, password_enc, self_registered, is_active, pending_approval, phone_number) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id',
    [
      input.username,
      input.passwordHash,
      input.role,
      input.displayName,
      input.coachId,
      input.mustChangePassword ? 1 : 0,
      input.now.toISOString(),
      input.passwordEnc ?? null,
      input.selfRegistered ? 1 : 0,
      input.isActive === false ? 0 : 1,
      input.pendingApproval ? 1 : 0,
      input.phoneNumber ?? null,
    ],
  );
  return Number(rows[0]!.id);
}

/** Empty accounts may be removed; foreign keys keep financial and former-coach history intact. */
export async function deleteUser(db: Db, id: number): Promise<void> {
  try {
    await db.query('DELETE FROM users WHERE id = $1', [id]);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23503') {
      throw new HttpError(409, 'این حساب به سوابق یا حساب‌های دیگری مرتبط است و حذف نمی‌شود؛ به‌جای حذف، آن را غیرفعال کنید.');
    }
    throw error;
  }
}

export async function countStudents(db: Db, coachId: number): Promise<number> {
  const row = (await db.query<{ n: string | number }>("SELECT COUNT(*) AS n FROM users WHERE role = 'student' AND coach_id = $1", [coachId]))[0]!;
  return Number(row.n);
}

export async function updateCoachIban(db: Db, id: number, iban: string): Promise<void> {
  await db.query("UPDATE users SET iban = $1 WHERE id = $2 AND role = 'coach'", [iban, id]);
}

export async function setUserActive(db: Db, id: number, isActive: boolean): Promise<void> {
  if (isActive) {
    await db.query('UPDATE users SET is_active = 1, pending_approval = 0 WHERE id = $1', [id]);
    return;
  }
  // Bumping the version also invalidates an old-credential login racing with this update.
  await db.query(
    `WITH updated AS (
       UPDATE users SET is_active = 0, auth_version = auth_version + 1 WHERE id = $1 RETURNING id
     ), revoked AS (
       DELETE FROM sessions WHERE user_id = $1 AND EXISTS (SELECT 1 FROM updated)
     ) SELECT id FROM updated`,
    [id],
  );
}

/** Coaches with how many students each one has, for the admin's coach list. */
export interface CoachSummary extends PublicUser {
  studentCount: number;
  /** The generated password, if it is still the one in use. */
  password: string | null;
}

export async function listCoachSummaries(db: Db, key: SecretKey): Promise<CoachSummary[]> {
  const rows = await db.query<UserRow & { student_count: string | number }>(
    `SELECT u.*, (SELECT COUNT(*) FROM users s WHERE s.role = 'student' AND s.coach_id = u.id) AS student_count
     FROM users u WHERE u.role = 'coach' ORDER BY u.id`,
  );
  return rows.map((row) => {
    const user = fromRow(row);
    return { ...toPublic(user), studentCount: Number(row.student_count), password: decryptSecret(key, user.passwordEnc) };
  });
}

export async function listAdminStudents(db: Db, key: SecretKey, username: string | null = null, before: number | null = null): Promise<{ students: (PublicUser & { coachName: string | null; password: string | null })[]; nextCursor: number | null }> {
  const pageSize = 30;
  const rows = await db.query<UserRow & { coach_name: string | null }>(
    "SELECT s.*, c.display_name AS coach_name FROM users s LEFT JOIN users c ON c.id = s.coach_id WHERE s.role = 'student' AND ($1::text IS NULL OR lower(s.username) = lower($1)) AND ($2::integer IS NULL OR s.id < $2) ORDER BY s.id DESC LIMIT 31",
    [username, before],
  );
  const page = rows.slice(0, pageSize);
  return {
    students: page.map((row) => {
      const user = fromRow(row);
      return { ...toPublic(user), coachName: row.coach_name ?? null, password: decryptSecret(key, user.passwordEnc) };
    }),
    nextCursor: rows.length > pageSize ? Number(page[page.length - 1]!.id) : null,
  };
}

export async function listStudents(db: Db, coachId: number, key: SecretKey, includeRevoked = false): Promise<(PublicUser & { password: string | null })[]> {
  const rows = await db.query<UserRow>("SELECT * FROM users WHERE role = 'student' AND coach_id = $1 AND ($2::boolean OR coach_access = 1) ORDER BY id", [coachId, includeRevoked]);
  return rows.map((row) => {
    const user = fromRow(row);
    return { ...toPublic(user), password: decryptSecret(key, user.passwordEnc) };
  });
}
