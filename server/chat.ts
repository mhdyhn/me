import type { Db } from './db.ts';

/** Text chat between one coach and one of their students. Photos, videos and voice notes come later, with their storage decided. */
export const MESSAGE_MAX = 1000;
const HISTORY_LIMIT = 200;

export interface ChatMessage {
  id: number;
  senderId: number;
  body: string;
  createdAt: string;
}

interface MessageRow {
  id: number;
  sender_id: number;
  body: string;
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
  `);
}

/** The most recent messages of one coach-student pair, oldest first. */
export async function listMessages(db: Db, coachId: number, studentId: number): Promise<ChatMessage[]> {
  const rows = await db.query<MessageRow>(
    'SELECT id, sender_id, body, created_at FROM messages WHERE coach_id = $1 AND student_id = $2 ORDER BY id DESC LIMIT $3',
    [coachId, studentId, HISTORY_LIMIT],
  );
  return rows.reverse().map((row) => ({ id: Number(row.id), senderId: Number(row.sender_id), body: row.body, createdAt: row.created_at }));
}

export async function addMessage(db: Db, coachId: number, studentId: number, senderId: number, body: string, createdAt: string): Promise<ChatMessage> {
  const rows = await db.query<{ id: number }>(
    'INSERT INTO messages (coach_id, student_id, sender_id, body, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [coachId, studentId, senderId, body, createdAt],
  );
  return { id: Number(rows[0]!.id), senderId, body, createdAt };
}
