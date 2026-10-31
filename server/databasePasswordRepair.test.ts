// @vitest-environment node
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { parse } from 'pg-connection-string';

/**
 * The driver is replaced by one that behaves like the server: a wrong password is refused with
 * the same error code (28P01) and a right one is accepted. The rest of the code is the real
 * one, so the whole path from the connection string to the accepted login is covered.
 */
const state = vi.hoisted(() => ({ attempts: [] as string[], password: 'Mhdy2020x@' }));

vi.mock('pg', async () => {
  const { parse } = await import('pg-connection-string');
  class Pool {
    constructor(options: { connectionString: string }) {
      state.attempts.push(options.connectionString);
    }
    on() { return this; }
    async end() { return undefined; }
    async query() {
      const password = parse(state.attempts[state.attempts.length - 1]).password;
      if (password !== state.password) {
        throw Object.assign(new Error('password authentication failed for user "postgres.abc"'), { code: '28P01' });
      }
      return { rows: [] };
    }
  }
  return { default: { Pool }, Pool };
});

const { connectionCandidates, describeConnection, openDatabase } = await import('./db.ts');

const host = 'aws-0-eu-north-1.pooler.supabase.com:5432';
const user = 'postgres.yvngvwhjavjzpxewblug';
const raw = `postgresql://${user}:Mhdy2020x@${host}/postgres`;

describe('a password that lost a character in the connection string', () => {
  beforeEach(() => {
    state.attempts = [];
    state.password = 'Mhdy2020x@';
    vi.stubEnv('DATABASE_REPAIR_DELAY_MS', '0');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('tries the configured string first', () => {
    const url = `postgresql://${user}:secret@${host}/postgres`;
    expect(connectionCandidates(url)[0]).toBe(url);
  });

  it('puts a lost @ back into the password', () => {
    // The password ends with @. A raw @ in a connection string separates the password from the
    // host, so the driver sends a password that is one character short and the server refuses
    // the login with 28P01.
    const candidates = connectionCandidates(raw);
    expect(parse(raw).password).toBe('Mhdy2020x');
    expect(candidates).toContain(`postgresql://${user}:Mhdy2020x%40@${host}/postgres`);
    // The repaired string really carries the whole password to the server.
    expect(parse(candidates[1]).password).toBe('Mhdy2020x@');
  });

  it('leaves a password that already has its @ alone', () => {
    const url = `postgresql://${user}:Mhdy2020x%40@${host}/postgres`;
    expect(connectionCandidates(url)).toEqual([url]);
    expect(parse(url).password).toBe('Mhdy2020x@');
  });

  it('keeps an @ that belongs to the password', () => {
    const url = `postgresql://user:pa@ss@${host}/postgres`;
    expect(parse(url).password).toBe('pa@ss');
    expect(connectionCandidates(url)[0]).toBe(url);
  });

  it('encodes a raw character that breaks the string', () => {
    const url = `postgresql://user:pa#ss@${host}/postgres`;
    const candidates = connectionCandidates(url);
    expect(candidates).toContain(`postgresql://user:pa%23ss@${host}/postgres`);
    expect(parse(candidates[1]).password).toBe('pa#ss');
  });

  it('takes the ssl parameters out of every candidate', () => {
    const candidates = connectionCandidates(`postgresql://user:Mhdy2020x@${host}/postgres?sslmode=require`);
    expect(candidates.every((candidate) => !candidate.includes('sslmode'))).toBe(true);
  });

  it('leaves a string without a password alone', () => {
    expect(connectionCandidates(`postgresql://user@${host}/postgres`)).toEqual([`postgresql://user@${host}/postgres`]);
    expect(connectionCandidates('memory')).toEqual(['memory']);
    expect(connectionCandidates('/tmp/meety-pgdata')).toEqual(['/tmp/meety-pgdata']);
  });

  it('describes the configured connection without the secret', () => {
    const summary = describeConnection(`postgresql://${user}:Mhdy2020x@${host}/postgres`);
    expect(summary.host).toBe('aws-0-eu-north-1.pooler.supabase.com');
    // The name of the user is hashed; the project id of a hosted database cannot be guessed.
    expect(summary.userHash).toBe(createHash('sha256').update(user).digest('hex').slice(0, 12));
    expect(summary.userHash).not.toContain(user);
    // The length of the password shows that the last character was eaten.
    expect(summary.passwordLength).toBe(9);
  });

  it('connects with the raw string although the password lost its @', async () => {
    const db = await openDatabase(raw);
    expect(state.attempts).toHaveLength(2);
    expect(state.attempts[0]).toBe(raw);
    expect(parse(state.attempts[1]).password).toBe('Mhdy2020x@');
    await db.close();
  });

  it('uses the string as it is when it is already right', async () => {
    const db = await openDatabase(`postgresql://${user}:Mhdy2020x%40@${host}/postgres`);
    expect(state.attempts).toHaveLength(1);
    await db.close();
  });

  it('gives up with the error of the server when no spelling works', async () => {
    state.password = 'another-password';
    await expect(openDatabase(raw)).rejects.toMatchObject({ code: '28P01' });
    expect(state.attempts).toHaveLength(2);
  });
});
