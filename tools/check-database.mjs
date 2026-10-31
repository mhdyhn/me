/**
 * Checks that a PostgreSQL connection string works for this application.
 *
 *   node tools/check-database.mjs "postgresql://user:pass@host/db?sslmode=require"
 *
 * It connects, runs a trivial query and reports the result. Nothing is written to the
 * database and the connection string is never printed back.
 */
import pg from 'pg';

const target = process.argv[2] ?? process.env.DATABASE_URL ?? '';

if (!target) {
  console.error('Give a connection string as an argument or set DATABASE_URL.');
  console.error('Example: node tools/check-database.mjs "postgresql://user:pass@host/db?sslmode=require"');
  process.exit(1);
}
if (!target.startsWith('postgres')) {
  console.error('The connection string must start with postgres:// or postgresql://');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: target,
  max: 1,
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS ?? 30000),
  ssl: { rejectUnauthorized: false },
});

const started = Date.now();
try {
  const rows = await pool.query('SELECT current_database() AS name, version() AS version');
  const info = rows[0] ?? {};
  console.log(`Connected in ${Date.now() - started} ms.`);
  console.log(`Database: ${info.name ?? 'unknown'}`);
  console.log(`Server:  ${String(info.version ?? '').split(' on ')[0]}`);
  console.log('');
  console.log('This string works. Set it as DATABASE_URL in Render (Environment) and deploy.');
} catch (error) {
  console.error(`Connection failed: ${error.message}`);
  console.error('Check the host, the user, the password, the database name and whether sslmode=require is needed.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
