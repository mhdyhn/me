import type { Db } from './db.ts';

/** Text and media chat between coaches, students and admins. Supports text, photos, voice notes, and short video clips. */
export const MESSAGE_MAX = 1000;
const HISTORY_LIMIT = 200;

export interface ChatMessage {
  id: number;
  senderId: number;
  body: string;
  mediaType?: 'text' | 'image' | 'voice' | 'video' | null;
  mediaData?: string | null;
  createdAt: string;
}

interface MessageRow {
  id: number;
  sender_id: number;
  body: string;
  media_type?: string | null;
  media_data?: string | null;
  created_at: string;
}

export async function migrateChat(db: Db): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      coach_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS messages_by_student ON messages(student_id, id);

    ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_type TEXT;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_data TEXT;

    -- Chat thread between a coach and the administrator
    CREATE TABLE IF NOT EXISTS admin_coach_messages (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      coach_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      media_type TEXT,
      media_data TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS admin_coach_messages_by_coach ON admin_coach_messages(coach_id, id);
  `);
}

/** The most recent messages of one coach-student pair, oldest first. */
export async function listMessages(db: Db, coachId: number, studentId: number): Promise<ChatMessage[]> {
  const rows = await db.query<MessageRow>(
    'SELECT id, sender_id, body, media_type, media_data, created_at FROM messages WHERE coach_id = $1 AND student_id = $2 ORDER BY id DESC LIMIT $3',
    [coachId, studentId, HISTORY_LIMIT],
  );
  return rows.reverse().map((row) => ({
    id: Number(row.id),
    senderId: Number(row.sender_id),
    body: row.body,
    mediaType: (row.media_type as any) ?? null,
    mediaData: row.media_data ?? null,
    createdAt: row.created_at,
  }));
}

export async function addMessage(
  db: Db,
  coachId: number,
  studentId: number,
  senderId: number,
  body: string,
  createdAt: string,
  mediaType: string | null = null,
  mediaData: string | null = null,
): Promise<ChatMessage> {
  const rows = await db.query<{ id: number }>(
    'INSERT INTO messages (coach_id, student_id, sender_id, body, media_type, media_data, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
    [coachId, studentId, senderId, body, mediaType, mediaData, createdAt],
  );
  return { id: Number(rows[0]!.id), senderId, body, mediaType: (mediaType as any) ?? null, mediaData, createdAt };
}

/** The most recent messages between the administrator and a coach, oldest first. */
export async function listAdminCoachMessages(db: Db, coachId: number): Promise<ChatMessage[]> {
  const rows = await db.query<MessageRow>(
    'SELECT id, sender_id, body, media_type, media_data, created_at FROM admin_coach_messages WHERE coach_id = $1 ORDER BY id DESC LIMIT $2',
    [coachId, HISTORY_LIMIT],
  );
  return rows.reverse().map((row) => ({
    id: Number(row.id),
    senderId: Number(row.sender_id),
    body: row.body,
    mediaType: (row.media_type as any) ?? null,
    mediaData: row.media_data ?? null,
    createdAt: row.created_at,
  }));
}

export async function addAdminCoachMessage(
  db: Db,
  coachId: number,
  senderId: number,
  body: string,
  createdAt: string,
  mediaType: string | null = null,
  mediaData: string | null = null,
): Promise<ChatMessage> {
  const rows = await db.query<{ id: number }>(
    'INSERT INTO admin_coach_messages (coach_id, sender_id, body, media_type, media_data, created_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [coachId, senderId, body, mediaType, mediaData, createdAt],
  );
  return { id: Number(rows[0]!.id), senderId, body, mediaType: (mediaType as any) ?? null, mediaData, createdAt };
}
