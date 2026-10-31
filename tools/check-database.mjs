/**
 * Checks that a PostgreSQL connection string works for this application.
 *
 *   node tools/check-database.mjs "postgresql://user:pass@host/postgres"
 *
 * It connects, runs a trivial query and reports the result. Nothing is written to the
 * database and the connection string is never printed back.
 */
import pg from 'pg';

const target = process.argv[2] ?? process.env.DATABASE_URL ?? '';

if (!target) {
  console.error('Give a connection string as an argument or set DATABASE_URL.');
  console.error('Example: node tools/check-database.mjs "postgresql://user:pass@host/postgres"');
  process.exit(1);
}
if (!target.startsWith('postgres')) {
  console.error('The connection string must start with postgres:// or postgresql://');
  process.exit(1);
}

/**
 * The SSL parameters of the string are removed, because node-postgres lets them win over the
 * options of the pool and `sslmode=require` then keeps the certificate check on, which fails
 * against a pooler with a self-signed certificate chain. The same happens in the server, so
 * this script tests exactly what the application does.
 */
const withoutSslParameters = (url) => {
  const at = url.indexOf('?');
  if (at < 0) return url;
  const base = url.slice(0, at);
  const kept = url.slice(at + 1).split('&').filter((part) => part && !/^(sslmode|sslcert|sslkey|sslrootcert|sslnegotiation)=/i.test(part));
  return kept.length ? `${base}?${kept.join('&')}` : base;
};

const pool = new pg.Pool({
  connectionString: withoutSslParameters(target),
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
  const message = String(error?.message ?? '');
  console.error(`Connection failed: ${message}`);
  if (/password authentication failed|authentication failed/i.test(message)) {
    console.error('The password or the user is wrong. For Supabase the user is postgres.<project> and the password is the database password of the project.');
  } else if (/ECIRCUITBREAKER|too many authentication failures/i.test(message)) {
    console.error('The host blocked new connections after failed logins. Fix the password first and wait a few minutes.');
  } else if (/self-signed|certificate/i.test(message)) {
    console.error('The certificate of the host could not be verified. Remove sslmode=... from the connection string; the app sets TLS itself.');
  } else {
    console.error('Check the host, the user, the password, the database name and the port.');
  }
  process.exitCode = 1;
} finally {
  await pool.end();
}
