/**
 * Normalizes a PostgreSQL connection string so it can be pasted into a hosting panel.
 *
 * The password is percent-encoded. A password with a special character (`#`, `%`, `+`) otherwise
 * changes the meaning of the string: a raw `#` starts the fragment of the URL and the driver
 * then reads a wrong host.
 *
 *   node tools/normalize-database-url.mjs "postgresql://user:pa#ss@host:5432/postgres"
 *   DATABASE_URL=... node tools/normalize-database-url.mjs
 *
 * A password that ends with `@` cannot be repaired by reading the string alone: the raw `@` is
 * the separator between the password and the host, so the driver sends a password that is one
 * character short and the server refuses the login with 28P01. `connectionCandidates` returns
 * the spellings that are worth trying; the checker tries them against the server.
 *
 * The string is printed on purpose: it has to be pasted into the hosting panel.
 */
import { pathToFileURL } from 'node:url';

/**
 * The same connection with the password percent-encoded. The user, the host and everything
 * after the authority stay exactly as they are.
 */
export function normalizeDatabaseUrl(rawUrl) {
  const url = String(rawUrl ?? '').trim();
  const schemeEnd = url.indexOf('://');
  if (schemeEnd < 0) return url;
  const authorityStart = schemeEnd + 3;
  const pathStart = url.indexOf('/', authorityStart);
  const authorityEnd = pathStart < 0 ? url.length : pathStart;
  const authority = url.slice(authorityStart, authorityEnd);
  // The last `@` separates the password from the host; an `@` inside the password belongs to it.
  const separator = authority.lastIndexOf('@');
  if (separator < 0) return url;
  const userInfo = authority.slice(0, separator);
  const host = authority.slice(separator + 1);
  const colon = userInfo.indexOf(':');
  if (colon < 0) return url;
  const user = userInfo.slice(0, colon);
  const password = userInfo.slice(colon + 1);
  let decoded = password;
  try {
    decoded = decodeURIComponent(password);
  } catch {
    decoded = password;
  }
  return `${url.slice(0, authorityStart)}${user}:${encodeURIComponent(decoded)}@${host}${url.slice(authorityEnd)}`;
}

/**
 * The connection strings that are worth trying for one configured string: the string itself,
 * the string with the password percent-encoded, and the string with a `@` put back at the end
 * of the password. The password can only lose that character when it is copied into the
 * string by hand.
 */
export function connectionCandidates(rawUrl) {
  const url = String(rawUrl ?? '').trim();
  const candidates = [url];
  const add = (value) => {
    if (value && value !== url && !candidates.includes(value)) candidates.push(value);
  };
  const normalized = normalizeDatabaseUrl(url);
  add(normalized);
  // The password that ends with `@`: the URL syntax eats it, so it is put back encoded.
  const schemeEnd = url.indexOf('://');
  if (schemeEnd >= 0) {
    const authorityStart = schemeEnd + 3;
    const pathStart = url.indexOf('/', authorityStart);
    const authorityEnd = pathStart < 0 ? url.length : pathStart;
    const authority = url.slice(authorityStart, authorityEnd);
    const separator = authority.lastIndexOf('@');
    const colon = authority.slice(0, separator).indexOf(':');
    if (separator >= 0 && colon >= 0) {
      const user = authority.slice(0, colon);
      const password = authority.slice(colon + 1, separator);
      let decoded = password;
      try {
        decoded = decodeURIComponent(password);
      } catch {
        decoded = password;
      }
      if (password.endsWith('@')) {
        // The string has the character twice: the password may be the one without it.
        add(`${url.slice(0, authorityStart)}${user}:${encodeURIComponent(decoded.slice(0, -1))}@${authority.slice(separator + 1)}${url.slice(authorityEnd)}`);
      } else if (!decoded.endsWith('@')) {
        // The character was eaten by the URL syntax: it belongs to the password.
        add(`${url.slice(0, authorityStart)}${user}:${encodeURIComponent(`${decoded}@`)}@${authority.slice(separator + 1)}${url.slice(authorityEnd)}`);
      }
    }
  }
  return candidates;
}

export async function main(argv) {
  const given = (argv[0] ?? process.env.DATABASE_URL ?? '').trim();
  if (!given) {
    console.error('Give a connection string as an argument or in DATABASE_URL.');
    return 1;
  }
  if (!/^postgres(ql)?:\/\//i.test(given)) {
    console.error('The connection string must start with postgres:// or postgresql://');
    return 1;
  }
  process.stdout.write(`${normalizeDatabaseUrl(given)}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
