import type { Db } from './db.ts';

/** Preserve financial ledgers and former-coach conversations when an account is deleted. */
export async function migrateAccountHistory(db: Db): Promise<void> {
  await db.exec(`
    DO $$
    DECLARE fk RECORD;
    BEGIN
      -- NO ACTION is checked after other cascades: deleting a student may still delete their
      -- chat through student_id, while deleting a former coach must not erase that chat.
      FOR fk IN
        SELECT c.conname, c.conrelid::regclass::text AS table_name, a.attname AS column_name
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        WHERE c.contype = 'f' AND c.confrelid = 'users'::regclass AND c.confdeltype = 'c'
          AND array_length(c.conkey, 1) = 1 AND (
            (c.conrelid = 'payment_transactions'::regclass AND a.attname IN ('student_id', 'coach_id')) OR
            (c.conrelid = 'payment_test_transactions'::regclass AND a.attname IN ('student_id', 'coach_id')) OR
            (c.conrelid = 'messages'::regclass AND a.attname IN ('coach_id', 'sender_id')) OR
            (c.conrelid = 'admin_coach_messages'::regclass AND a.attname IN ('coach_id', 'sender_id'))
          )
      LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.table_name, fk.conname);
        EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES users(id) ON DELETE NO ACTION',
          fk.table_name, fk.conname, fk.column_name);
      END LOOP;
    END $$;
  `);
}
