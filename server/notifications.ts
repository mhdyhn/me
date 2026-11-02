import type { Db } from './db.ts';

/**
 * The in-app notifications of the club: the bell in the header.
 *
 * A notification is a short Persian message for one account with a link into the app.
 * The table is created with IF NOT EXISTS so an existing database keeps working.
 */
export type NotificationKind = 'payment' | 'programme' | 'message' | 'system';

export interface AppNotification {
  id: number;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Where inside the app the notification leads, for example '/pay/receipt'. */
  link: string | null;
  createdAt: string;
  readAt: string | null;
}

interface NotificationRow {
  id: number;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  created_at: string;
  read_at: string | null;
}

export async function migrateNotifications(db: Db): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'system',
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      link TEXT,
      created_at TEXT NOT NULL,
      read_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
  `);
}

function toNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    kind: (row.kind as NotificationKind) ?? 'system',
    title: row.title,
    body: row.body ?? '',
    link: row.link ?? null,
    createdAt: row.created_at,
    readAt: row.read_at ?? null,
  };
}

/** Saves one notification for an account. */
export async function createNotification(
  db: Db,
  userId: number,
  input: { kind?: NotificationKind; title: string; body?: string; link?: string | null },
  now = new Date()
): Promise<AppNotification> {
  const kind: NotificationKind = input.kind ?? 'system';
  const body = (input.body ?? '').slice(0, 500);
  const link = input.link ? input.link.slice(0, 200) : null;
  const createdAt = now.toISOString();
  const rows = await db.query<NotificationRow>(
    `INSERT INTO notifications (user_id, kind, title, body, link, created_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [userId, kind, input.title.slice(0, 120), body, link, createdAt]
  );
  const row = rows[0];
  if (!row) throw new Error('The notification was not saved');
  return toNotification(row);
}

/** The newest notifications of an account, the newest first. */
export async function listNotifications(db: Db, userId: number, limit = 30): Promise<AppNotification[]> {
  const rows = await db.query<NotificationRow>(
    'SELECT * FROM notifications WHERE user_id = $1 ORDER BY id DESC LIMIT $2',
    [userId, Math.min(100, Math.max(1, Math.floor(limit) || 30))]
  );
  return rows.map(toNotification);
}

/** How many notifications the account has not read yet. */
export async function unreadNotificationCount(db: Db, userId: number): Promise<number> {
  const rows = await db.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL',
    [userId]
  );
  return Number(rows[0]?.count ?? '0');
}

/** Marks the notifications as read; without ids every notification of the account is marked. */
export async function markNotificationsRead(db: Db, userId: number, ids?: number[], now = new Date()): Promise<void> {
  const readAt = now.toISOString();
  if (ids && ids.length) {
    await db.query(
      'UPDATE notifications SET read_at = $1 WHERE user_id = $2 AND id = ANY($3::int[]) AND read_at IS NULL',
      [readAt, userId, ids.map((id) => Math.floor(Number(id))).filter((id) => Number.isFinite(id))]
    );
    return;
  }
  await db.query('UPDATE notifications SET read_at = $1 WHERE user_id = $2 AND read_at IS NULL', [readAt, userId]);
}

/** The active managers, the ones who settle a receipt that needs a human look. */
export async function adminRecipients(db: Db): Promise<number[]> {
  const rows = await db.query<{ id: number }>(
    "SELECT id FROM users WHERE role = 'admin' AND is_active = 1 ORDER BY id"
  );
  return rows.map((row) => row.id);
}
