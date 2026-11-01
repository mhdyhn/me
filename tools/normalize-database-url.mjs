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
 * The US letters that sit on the same key as the Persian ones. A password that was typed while
 * the keyboard was in Persian comes out with the Persian letters and digits, and the US
 * spelling is the one that was meant.
 */
const PERSIAN_TO_US = {
  'ض': 'q', 'ص': 'w', 'ث': 'e', 'ف': 'r', 'ق': 't', 'ع': 'y', 'ه': 'u', 'خ': 'i', 'ح': 'o', 'ج': 'p', 'د': '[', 'چ': ']',
  'ش': 'a', 'س': 's', 'ی': 'd', 'ي': 'd', 'ب': 'f', 'ل': 'g', 'ك': 'l', '،': 'h', 'ؤ': 'j', 'ئ': 'k', '؛': 'l',
  'ظ': 'z', 'ط': 'x', 'ز': 'c', 'غ': 'v', 'ر': 'b', 'ن': 'n', 'م': 'm', 'و': '.', 'ة': 'h', 'أ': 'a', 'إ': 'i', 'آ': 'a',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '؟': '/', '«': '@',
};

/** Keys that give the same Persian character, so the US letter behind them is not certain. */
const PERSIAN_AMBIGUOUS = {
  '،': [','],
};

/**
 * The password as it looks on a US keyboard. The list is empty when the password holds no
 * Persian character.
 */
export function usLayoutSpellings(password) {
  const characters = [...String(password ?? '')];
  const primary = characters.map((character) => PERSIAN_TO_US[character] ?? character).join('');
  if (primary === characters.join('')) return [];
  const spellings = [primary];
  for (const [index, character] of characters.entries()) {
    for (const alternative of PERSIAN_AMBIGUOUS[character] ?? []) {
      const spelled = characters
        .map((current, position) => (position === index ? alternative : (PERSIAN_TO_US[current] ?? current)))
        .join('');
      if (!spellings.includes(spelled)) spellings.push(spelled);
    }
  }
  // The Persian keyboard has no upper case, so the case of the letters is unknown: the first
  // letter may have been capital.
  const withCase = [];
  for (const spelled of spellings) {
    const capitalized = spelled.replace(/[a-z]/, (letter) => letter.toUpperCase());
    if (capitalized !== spelled) withCase.push(capitalized);
    withCase.push(spelled);
  }
  return withCase;
}

/**
 * The connection strings that are worth trying for one configured string: the string itself,
 * the string with the password percent-encoded, the string with the password on a US keyboard
 * and the string with a `@` put back at the end of the password. The password can only lose
 * that character when it is copied into the string by hand.
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
      const build = (value) => `${url.slice(0, authorityStart)}${user}:${encodeURIComponent(value)}@${authority.slice(separator + 1)}${url.slice(authorityEnd)}`;
      // A password that was typed with a Persian keyboard: the US spelling is the one meant.
      for (const spelling of usLayoutSpellings(decoded)) add(build(spelling));
      if (password.endsWith('@')) {
        // The string has the character twice: the password may be the one without it.
        add(build(decoded.slice(0, -1)));
      }
      // The character was eaten by the URL syntax: it belongs to the password. That can only
      // have happened when the password holds no such character at all.
      if (!password.includes('@')) add(build(`${decoded}@`));
      // A hosted database has two forms: the direct connection, which only speaks IPv6 on the
      // free plan, and the shared pooler, which speaks IPv4 and carries the project behind the
      // name of the user. Whichever form is configured, the other one is worth a try.
      const host = authority.slice(separator + 1);
      const pooler = /^aws-\d+-([a-z0-9-]+)\.pooler\.supabase\.com(?::\d+)?$/.exec(host);
      const direct = /^db\.([a-z0-9]+)\.supabase\.co(?::\d+)?$/.exec(host);
      const buildUrl = (userName, hostName, value) =>
        `${url.slice(0, authorityStart)}${userName}:${encodeURIComponent(value)}@${hostName}${url.slice(authorityEnd)}`;
      if (pooler) {
        const project = /^postgres\.(.+)$/.exec(user)?.[1] ?? '';
        if (project) add(buildUrl('postgres', `db.${project}.supabase.co:5432`, decoded));
      }
      if (direct) {
        const project = direct[1] ?? '';
        if (project) {
          const region = String(process.env.DATABASE_REGION ?? '').trim() || 'eu-north-1';
          add(buildUrl(`postgres.${project}`, `aws-0-${region}.pooler.supabase.com:5432`, decoded));
        }
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
