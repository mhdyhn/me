// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import type { Db, Row } from './db.ts';
import { isProgramPaid, migratePayments } from './payments.ts';

/** A pre-upgrade schema: old payments had no programme identifier. */
describe('programme payment migration', () => {
  it('preserves existing access, isolates ambiguous payments and never backfills later programmes on restart', async () => {
    const pg = new PGlite();
    const db: Db = {
      async query<T extends Row = Row>(sql: string, params: unknown[] = []) { return (await pg.query<T>(sql, params)).rows; },
      async exec(sql) { await pg.exec(sql); },
      async close() { await pg.close(); },
    };
    try {
      await db.exec(`
        CREATE TABLE users (id INTEGER PRIMARY KEY, display_name TEXT NOT NULL);
        INSERT INTO users VALUES (1, 'مربی'), (2, 'شاگرد قدیمی'), (3, 'بدون برنامه'), (4, 'شاگرد سوم');
        CREATE TABLE student_programs (
          student_id INTEGER PRIMARY KEY REFERENCES users(id), coach_id INTEGER REFERENCES users(id),
          body TEXT NOT NULL, price_tomans INTEGER, updated_at TEXT NOT NULL
        );
        INSERT INTO student_programs VALUES
          (2, 1, '{"title":"برنامهٔ موجود","days":[]}', 100, '2026-01-02T00:00:00.000Z'),
          (4, 1, '{"title":"برنامهٔ نامشخص","days":[]}', 200, '2026-01-03T00:00:00.000Z');
        CREATE TABLE payment_transactions (
          id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES users(id),
          coach_id INTEGER NOT NULL REFERENCES users(id), amount_tomans INTEGER NOT NULL,
          coach_share_tomans INTEGER NOT NULL, admin_share_tomans INTEGER NOT NULL,
          authority TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'pending', ref_id TEXT, card_pan TEXT,
          created_at TEXT NOT NULL, verified_at TEXT
        );
        INSERT INTO payment_transactions (student_id, coach_id, amount_tomans, coach_share_tomans, admin_share_tomans, authority, status, ref_id, created_at) VALUES
          (2, 1, 100, 90, 10, 'old-paid', 'paid', '123', '2026-01-01T00:00:00.000Z'),
          (2, 1, 100, 90, 10, 'old-pending', 'pending', NULL, '2026-01-02T01:00:00.000Z'),
          (3, 1, 100, 90, 10, 'no-program', 'paid', '456', '2026-01-01T00:00:00.000Z'),
          (4, 1, 200, 180, 20, 'ambiguous-pending', 'pending', NULL, '2026-01-01T00:00:00.000Z');
      `);
      await migratePayments(db);
      const mapped = await db.query<{ authority: string; programme_id: string | null; programme_mapping: string }>(
        'SELECT authority, programme_id, programme_mapping FROM payment_transactions ORDER BY id'
      );
      expect(mapped.map((row) => row.programme_id)).toEqual(['legacy-2', 'legacy-2', null, null]);
      expect(mapped.map((row) => row.programme_mapping)).toEqual(['legacy_current', 'legacy_current', 'legacy_unmapped', 'legacy_unmapped']);
      expect(await isProgramPaid(db, 2, 'legacy-2')).toBe(true);
      expect((await db.query('SELECT * FROM programme_offers WHERE id = $1', ['legacy-2']))).toHaveLength(1);

      await db.query("UPDATE student_programs SET programme_id = 'new-offer' WHERE student_id = 2");
      await db.query("INSERT INTO student_programs (student_id, coach_id, body, price_tomans, updated_at, programme_id) VALUES (3, 1, '{}', 100, '2026-02-01T00:00:00.000Z', 'later-offer')");
      await migratePayments(db);
      expect(await isProgramPaid(db, 2, 'new-offer')).toBe(false);
      expect(await isProgramPaid(db, 3, 'later-offer')).toBe(false);
      expect((await db.query<{ programme_id: string | null }>("SELECT programme_id FROM payment_transactions WHERE authority = 'no-program'"))[0]?.programme_id).toBeNull();
    } finally {
      await db.close();
    }
  }, 30000);
});
