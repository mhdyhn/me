import type { DatabaseSync } from 'node:sqlite';

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

export function migrateChat(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
export function listMessages(db: DatabaseSync, coachId: number, studentId: number): ChatMessage[] {
  const rows = db
    .prepare('SELECT id, sender_id, body, created_at FROM messages WHERE coach_id = ? AND student_id = ? ORDER BY id DESC LIMIT ?')
    .all(coachId, studentId, HISTORY_LIMIT) as unknown as MessageRow[];
  return rows.reverse().map((row) => ({ id: row.id, senderId: row.sender_id, body: row.body, createdAt: row.created_at }));
}

export function addMessage(db: DatabaseSync, coachId: number, studentId: number, senderId: number, body: string, createdAt: string): ChatMessage {
  const result = db
    .prepare('INSERT INTO messages (coach_id, student_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(coachId, studentId, senderId, body, createdAt);
  return { id: Number(result.lastInsertRowid), senderId, body, createdAt };
}
