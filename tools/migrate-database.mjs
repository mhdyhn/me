/**
 * Copies the application tables from one PostgreSQL database to another.
 *
 *   SOURCE_DATABASE_URL="postgresql://..." TARGET_DATABASE_URL="postgresql://..." \
 *     node tools/migrate-database.mjs
 *
 * Use it when the hosted database changes and the old accounts, programmes and
 * transactions should come along. The target schema has to exist already: deploy the
 * application once against the new database so its migrations create the tables, then
 * run this script. Nothing in the target is deleted; only missing rows are inserted.
 *
 * Flags:
 *   --dry-run   only count the rows, write nothing
 *   --tables=a,b  copy only these tables
 */
import pg from 'pg';

export const BATCH_SIZE = 200;

/** The tables the application uses. The order keeps the accounts before their sessions. */
export const TABLES = [
  'users',
  'student_profiles',
  'student_programs',
  'user_personal_programs',
  'sessions',
  'personal_data_records',
  'programme_offers',
  'coach_invitations',
  'coach_registration_links',
  'registration_attempts',
  'admin_coach_messages',
  'messages',
  'workout_sessions',
  'nutrition_plans',
  'nutrition_diary',
  'nutrition_coach_plans',
  'student_biometrics',
  'student_coach_biometrics',
  'payment_transactions',
  'payment_test_transactions',
  'payment_test_purchases',
  'payment_test_mode',
  'subscriptions',
  'subscription_payments',
  'app_data_migrations',
];

/** Splits a list into chunks of at most `size` items. */
export function chunk(items, size = BATCH_SIZE) {
  const out = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

/** The INSERT statement for one row, with the column names of the source table. */
export function buildInsert(table, columns) {
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
}

/** The tables of the `public` schema that hold rows. */
export async function listTables(pool) {
  const result = await pool.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
  );
  return result.rows.map((row) => row.table_name);
}

/** The column names of a table, in the order the rows are read. */
export async function listColumns(pool, table) {
  const result = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
    [table],
  );
  return result.rows.map((row) => row.column_name);
}

/**
 * Copies one table. The rows are read in batches and inserted with the same column
 * names, so the values keep their type and the accounts keep their password hashes.
 */
export async function copyTable(source, target, table, { dryRun = false } = {}) {
  const columns = await listColumns(source, table);
  if (!columns.length) return { table, rows: 0, skipped: 'no columns' };
  const targetColumns = new Set(await listColumns(target, table));
  const usable = columns.filter((column) => targetColumns.has(column));
  if (!usable.length) return { table, rows: 0, skipped: 'table missing in the target' };

  const total = Number((await source.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count);
  if (!total) return { table, rows: 0 };
  if (dryRun) return { table, rows: total, dryRun: true };

  let copied = 0;
  let offset = 0;
  for (;;) {
    const rows = (await source.query(`SELECT ${usable.join(', ')} FROM ${table} ORDER BY 1 LIMIT $1 OFFSET $2`, [BATCH_SIZE, offset])).rows;
    if (!rows.length) break;
    for (const group of chunk(rows)) {
      for (const row of group) {
        const values = usable.map((column) => row[column] ?? null);
        await target.query(buildInsert(table, usable), values);
        copied += 1;
      }
    }
    offset += rows.length;
    if (rows.length < BATCH_SIZE) break;
  }
  return { table, rows: copied, expected: total };
}

/** Moves the identity sequences of the copied tables to the end of the copied rows. */
export async function resetSequences(target, tables) {
  for (const table of tables) {
    await target.query(
      `SELECT setval(pg_get_serial_sequence($1, 'id'),
        GREATEST(COALESCE((SELECT max(id) FROM ${table}), 0), 1))`,
      [table],
    ).catch(() => {});
  }
}

const sourceUrl = process.env.SOURCE_DATABASE_URL ?? '';
const targetUrl = process.env.TARGET_DATABASE_URL ?? '';
const dryRun = process.argv.includes('--dry-run');
const only = process.argv.find((argument) => argument.startsWith('--tables='))?.split('=')[1];

if (sourceUrl && targetUrl) {
  const source = new pg.Pool({ connectionString: sourceUrl, max: 2, connectionTimeoutMillis: 30000, ssl: { rejectUnauthorized: false } });
  const target = new pg.Pool({ connectionString: targetUrl, max: 2, connectionTimeoutMillis: 30000, ssl: { rejectUnauthorized: false } });
  try {
    const available = await listTables(source);
    const wanted = only ? only.split(',').map((name) => name.trim()) : available;
    const tables = wanted.filter((table) => available.includes(table));
    const missing = wanted.filter((table) => !available.includes(table));
    if (missing.length) console.log(`Not in the source: ${missing.join(', ')}`);
    console.log(`${dryRun ? 'Dry run' : 'Copy'} of ${tables.length} tables from the source.`);
    for (const table of tables) {
      const result = await copyTable(source, target, table, { dryRun });
      const note = result.skipped ? ` (${result.skipped})` : result.expected && result.expected !== result.rows ? ` (source has ${result.expected})` : '';
      console.log(`  ${table}: ${result.rows} rows${note}`);
    }
    if (!dryRun) {
      await resetSequences(target, tables);
      console.log('The identity sequences are up to date.');
    }
  } finally {
    await source.end();
    await target.end();
  }
}
