// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrateAccountHistory } from './accountHistory.ts';
import { openDatabase, type Db } from './db.ts';

let db: Db;
beforeEach(async () => { db = await openDatabase('memory'); });
afterEach(async () => { await db.close(); });

describe('account history migration', () => {
  it('replaces legacy cascades idempotently without deleting records', async () => {
    const refs = [
      ['payment_transactions', 'student_id'], ['payment_transactions', 'coach_id'],
      ['payment_test_transactions', 'student_id'], ['payment_test_transactions', 'coach_id'],
      ['messages', 'coach_id'], ['messages', 'sender_id'],
      ['admin_coach_messages', 'coach_id'], ['admin_coach_messages', 'sender_id'],
    ];
    for (const [table, column] of refs) {
      await db.exec(`ALTER TABLE ${table} DROP CONSTRAINT ${table}_${column}_fkey;
        ALTER TABLE ${table} ADD CONSTRAINT ${table}_${column}_fkey FOREIGN KEY (${column}) REFERENCES users(id) ON DELETE CASCADE`);
    }
    await db.query("INSERT INTO users (username, password_hash, role, display_name, created_at) VALUES ('coach', 'x', 'coach', 'Coach', 'today'), ('student', 'x', 'student', 'Student', 'today')");
    const [{ id: coach }] = await db.query("SELECT id FROM users WHERE username = 'coach'");
    const [{ id: student }] = await db.query("SELECT id FROM users WHERE username = 'student'");
    await db.query("INSERT INTO messages (coach_id, student_id, sender_id, body, created_at) VALUES ($1, $2, $1, 'kept', 'today'), ($1, $2, $2, 'reply', 'today')", [coach, student]);
    await migrateAccountHistory(db);
    await migrateAccountHistory(db);
    const actions = await db.query<{ conname: string; confdeltype: string }>(`SELECT conname, confdeltype FROM pg_constraint
      WHERE conname = ANY($1::text[])`, [refs.map(([table, column]) => `${table}_${column}_fkey`)]);
    expect(actions).toHaveLength(refs.length);
    expect(actions.every((row) => row.confdeltype === 'a')).toBe(true);
    await expect(db.query('DELETE FROM users WHERE id = $1', [coach])).rejects.toMatchObject({ code: '23503' });
    expect(await db.query('SELECT body FROM messages WHERE coach_id = $1 ORDER BY id', [coach])).toEqual([{ body: 'kept' }, { body: 'reply' }]);
    // The existing explicit deletion of a manually created student still removes that student's chat.
    await db.query('DELETE FROM users WHERE id = $1', [student]);
    expect(await db.query('SELECT id FROM messages')).toHaveLength(0);
  });
});
