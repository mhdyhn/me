/**
 * Checks that a PostgreSQL connection string works for this application and prints the
 * connection string to paste into the hosting panel.
 *
 *   node tools/check-database.mjs --ref yvngvwhjavjzpxewblug --password 'the password'
 *   node tools/check-database.mjs "postgresql://user:pass@host/postgres"
 *
 * The password is encoded the way a connection string needs it, so a password with a special
 * character (`@`, `:`, `/`, `#`, `%`) cannot break the string. A string that lost a character
 * is tried in its repaired spelling as well, and the string that works is the one that is
 * printed. Nothing is written to the database. The connection string is printed on purpose:
 * it has to be pasted into Render.
 */
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { connectionCandidates, normalizeDatabaseUrl } from './normalize-database-url.mjs';

const FLAGS = new Set(['ref', 'password', 'region', 'host', 'port', 'db', 'user']);

/** Builds a connection string and encodes the password the way a URL needs it. */
export function buildConnectionString({ user, password, host, port, database }) {
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

/**
 * The SSL parameters of the string are removed, because node-postgres lets them win over the
 * options of the pool and `sslmode=require` then keeps the certificate check on, which fails
 * against a pooler with a self-signed certificate chain. The server does the same, so this
 * script tests exactly what the application does.
 */
export function withoutSslParameters(url) {
  const at = url.indexOf('?');
  if (at < 0) return url;
  const base = url.slice(0, at);
  const kept = url.slice(at + 1).split('&').filter((part) => part && !/^(sslmode|sslcert|sslkey|sslrootcert|sslnegotiation)=/i.test(part));
  return kept.length ? `${base}?${kept.join('&')}` : base;
}

/** The options of the command line, and the connection string that was given directly. */
export function readOptions(argv) {
  const options = { region: 'eu-north-1', port: '5432', database: 'postgres' };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument.startsWith('--')) {
      const name = argument.slice(2);
      const value = argv[index + 1];
      if (!FLAGS.has(name)) continue;
      if (value === undefined || value.startsWith('--')) continue;
      options[name] = value;
      index += 1;
      continue;
    }
    positional.push(argument);
  }
  options.ref = options.ref ?? '';
  options.password = options.password ?? '';
  options.user = options.user || (options.ref ? `postgres.${options.ref}` : 'postgres');
  options.host = options.host || (options.ref ? `aws-0-${options.region}.pooler.supabase.com` : '');
  options.database = options.db || options.database;
  return { options, positional };
}

/** Connects once and reports what the server answered. */
async function tryConnection(url) {
  const pool = new pg.Pool({
    connectionString: withoutSslParameters(url),
    max: 1,
    connectionTimeoutMillis: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS ?? 30000),
    ssl: { rejectUnauthorized: false },
  });
  const started = Date.now();
  try {
    const rows = await pool.query('SELECT current_database() AS name, version() AS version');
    const info = rows[0] ?? {};
    return { ok: true, ms: Date.now() - started, name: info.name ?? 'unknown', version: String(info.version ?? '').split(' on ')[0] };
  } catch (error) {
    return { ok: false, error };
  } finally {
    await pool.end();
  }
}

export async function main(argv) {
  // `--quiet` prints only the connection string that works; the rest of the answer goes away.
  const quiet = argv.includes('--quiet');
  const { options, positional } = readOptions(argv);
  const given = positional[0] ?? '';
  const target = given || (options.ref && options.password
    ? buildConnectionString({ user: options.user, password: options.password, host: options.host, port: options.port, database: options.database })
    : '');

  if (!target) {
    console.error('Give a connection string, or the project and the password:');
    console.error('  node tools/check-database.mjs --ref <project> --password "<password>"');
    console.error('  node tools/check-database.mjs "postgresql://user:pass@host/postgres"');
    return 1;
  }
  if (!target.startsWith('postgres')) {
    console.error('The connection string must start with postgres:// or postgresql://');
    return 1;
  }
  if (/[<>]/.test(target)) {
    console.error('The connection string still has a placeholder in it. Fill in the real values.');
    return 1;
  }

  // A password that lost a character in the string is tried in its repaired spelling as well.
  const candidates = connectionCandidates(target);
  let failure = null;
  for (const [index, candidate] of candidates.entries()) {
    // The pooler counts failed logins; a short pause keeps the next try out of its way.
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, 2000));
    const result = await tryConnection(candidate);
    if (result.ok) {
      if (quiet) {
        process.stdout.write(`${candidate}\n`);
        return 0;
      }
      console.log(`Connected in ${result.ms} ms.`);
      console.log(`Database: ${result.name}`);
      console.log(`Server:  ${result.version}`);
      console.log('');
      console.log('Paste this as DATABASE_URL in Render (Environment), then deploy:');
      console.log(candidate);
      return 0;
    }
    failure = result.error;
  }

  const message = String(failure?.message ?? '');
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
  if (!quiet) {
    console.error('');
    console.error('The connection string to paste into Render (Environment):');
    console.error(normalizeDatabaseUrl(target));
  }
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
