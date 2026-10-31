// @vitest-environment node
import { parse } from 'pg-connection-string';
import { describe, expect, it } from 'vitest';
import { connectionCandidates } from './db.ts';

const host = 'aws-0-eu-north-1.pooler.supabase.com:5432';
const user = 'postgres.yvngvwhjavjzpxewblug';

describe('a password that lost a character in the connection string', () => {
  it('tries the configured string first', () => {
    const url = `postgresql://${user}:secret@${host}/postgres`;
    expect(connectionCandidates(url)[0]).toBe(url);
  });

  it('puts a lost @ back into the password', () => {
    // The password ends with @. A raw @ in a connection string separates the password from the
    // host, so the driver sends a password that is one character short and the server refuses
    // the login with 28P01.
    const url = `postgresql://${user}:Mhdy2020x@${host}/postgres`;
    const candidates = connectionCandidates(url);
    expect(parse(url).password).toBe('Mhdy2020x');
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
});
