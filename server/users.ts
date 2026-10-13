import { decryptSecret, type SecretKey } from './secrets.ts';
import type { Db } from './db.ts';

export type Role = 'admin' | 'coach' | 'student';

/** The shape the app receives. The password hash never leaves the server. */
export interface PublicUser {
  id: number;
  username: string;
  role: Role;
  displayName: string;
  coachId: number | null;
  mustChangePassword: boolean;
}

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: Role;
  display_name: string;
  coach_id: number | null;
  must_change_password: number;
  password_enc: string | null;
}

export interface StoredUser extends PublicUser {
  passwordHash: string;
  /** The generated password, encrypted, while the user still has it. Null after they choose their own. */
  passwordEnc: string | null;
}

function fromRow(row: UserRow): StoredUser {
  return {
    id: Number(row.id),
    username: row.username,
    role: row.role,
    displayName: row.display_name,
    coachId: row.coach_id === null ? null : Number(row.coach_id),
    mustChangePassword: Number(row.must_change_password) === 1,
    passwordHash: row.password_hash,
    passwordEnc: row.password_enc ?? null,
  };
}

export function toPublic(user: StoredUser): PublicUser {
  // Neither the password hash nor the encrypted copy of the generated password leaves the server.
  const { passwordHash: _hash, passwordEnc: _enc, ...publicUser } = user;
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
  input: { username: string; passwordHash: string; passwordEnc?: string | null; role: Role; displayName: string; coachId: number | null; mustChangePassword: boolean; now: Date },
): Promise<number> {
  const rows = await db.query<{ id: number }>(
    'INSERT INTO users (username, password_hash, role, display_name, coach_id, must_change_password, created_at, password_enc) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
    [
      input.username,
      input.passwordHash,
      input.role,
      input.displayName,
      input.coachId,
      input.mustChangePassword ? 1 : 0,
      input.now.toISOString(),
      input.passwordEnc ?? null,
    ],
  );
  return Number(rows[0]!.id);
}

/** Removes an account. Its sessions and any programme are removed by the foreign-key cascade. */
export async function deleteUser(db: Db, id: number): Promise<void> {
  await db.query('DELETE FROM users WHERE id = $1', [id]);
}

export async function countStudents(db: Db, coachId: number): Promise<number> {
  const row = (await db.query<{ n: string | number }>("SELECT COUNT(*) AS n FROM users WHERE role = 'student' AND coach_id = $1", [coachId]))[0]!;
  return Number(row.n);
}

export async function updatePassword(db: Db, id: number, passwordHash: string, mustChangePassword: boolean, passwordEnc: string | null): Promise<void> {
  await db.query('UPDATE users SET password_hash = $1, must_change_password = $2, password_enc = $3 WHERE id = $4', [passwordHash, mustChangePassword ? 1 : 0, passwordEnc, id]);
}

export async function listCoaches(db: Db): Promise<PublicUser[]> {
  const rows = await db.query<UserRow>("SELECT * FROM users WHERE role = 'coach' ORDER BY id");
  return rows.map((row) => toPublic(fromRow(row)));
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

export async function listStudents(db: Db, coachId: number, key: SecretKey): Promise<(PublicUser & { password: string | null })[]> {
  const rows = await db.query<UserRow>("SELECT * FROM users WHERE role = 'student' AND coach_id = $1 ORDER BY id", [coachId]);
  return rows.map((row) => {
    const user = fromRow(row);
    return { ...toPublic(user), password: decryptSecret(key, user.passwordEnc) };
  });
}
