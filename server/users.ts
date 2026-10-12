import type { DatabaseSync } from 'node:sqlite';
import { decryptSecret, type SecretKey } from './secrets.ts';

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
  const { passwordHash: _hash, ...publicUser } = user;
  return publicUser;
}

export function findUserById(db: DatabaseSync, id: number): StoredUser | null {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow | undefined;
  return row ? fromRow(row) : null;
}

export function findUserByUsername(db: DatabaseSync, username: string): StoredUser | null {
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as unknown as UserRow | undefined;
  return row ? fromRow(row) : null;
}

export function insertUser(
  db: DatabaseSync,
  input: { username: string; passwordHash: string; passwordEnc?: string | null; role: Role; displayName: string; coachId: number | null; mustChangePassword: boolean; now: Date },
): number {
  const result = db
    .prepare(
      'INSERT INTO users (username, password_hash, role, display_name, coach_id, must_change_password, created_at, password_enc) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      input.username,
      input.passwordHash,
      input.role,
      input.displayName,
      input.coachId,
      input.mustChangePassword ? 1 : 0,
      input.now.toISOString(),
      input.passwordEnc ?? null,
    );
  return Number(result.lastInsertRowid);
}

/** Removes an account. Its sessions and any programme are removed by the foreign-key cascade. */
export function deleteUser(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

export function countStudents(db: DatabaseSync, coachId: number): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'student' AND coach_id = ?").get(coachId) as { n: number };
  return Number(row.n);
}

export function updatePassword(db: DatabaseSync, id: number, passwordHash: string, mustChangePassword: boolean, passwordEnc: string | null): void {
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = ?, password_enc = ? WHERE id = ?').run(passwordHash, mustChangePassword ? 1 : 0, passwordEnc, id);
}

export function listCoaches(db: DatabaseSync): PublicUser[] {
  const rows = db.prepare("SELECT * FROM users WHERE role = 'coach' ORDER BY id").all() as unknown as UserRow[];
  return rows.map((row) => toPublic(fromRow(row)));
}

/** Coaches with how many students each one has, for the admin's coach list. */
export interface CoachSummary extends PublicUser {
  studentCount: number;
  /** The generated password, if it is still the one in use. */
  password: string | null;
}

export function listCoachSummaries(db: DatabaseSync, key: SecretKey): CoachSummary[] {
  const rows = db
    .prepare(
      `SELECT u.*, (SELECT COUNT(*) FROM users s WHERE s.role = 'student' AND s.coach_id = u.id) AS student_count
       FROM users u WHERE u.role = 'coach' ORDER BY u.id`,
    )
    .all() as unknown as (UserRow & { student_count: number })[];
  return rows.map((row) => {
    const user = fromRow(row);
    return { ...toPublic(user), studentCount: Number(row.student_count), password: decryptSecret(key, user.passwordEnc) };
  });
}

export function listStudents(db: DatabaseSync, coachId: number, key: SecretKey): (PublicUser & { password: string | null })[] {
  const rows = db.prepare("SELECT * FROM users WHERE role = 'student' AND coach_id = ? ORDER BY id").all(coachId) as unknown as UserRow[];
  return rows.map((row) => {
    const user = fromRow(row);
    return { ...toPublic(user), password: decryptSecret(key, user.passwordEnc) };
  });
}
