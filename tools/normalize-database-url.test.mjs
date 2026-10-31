// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { connectionCandidates, normalizeDatabaseUrl } from './normalize-database-url.mjs';

describe('the connection string of the database', () => {
  it('encodes the characters that break the string', () => {
    expect(normalizeDatabaseUrl('postgresql://u:p#ss@h:5432/db')).toBe('postgresql://u:p%23ss@h:5432/db');
    expect(normalizeDatabaseUrl('postgresql://u:p+ss@h:5432/db')).toBe('postgresql://u:p%2Bss@h:5432/db');
  });

  it('keeps a password that is already encoded', () => {
    const url = 'postgresql://postgres.abc:Mhdy2020x%40@aws-0-eu-north-1.pooler.supabase.com:5432/postgres';
    expect(normalizeDatabaseUrl(url)).toBe(url);
  });

  it('keeps an @ that belongs to the password', () => {
    const url = 'postgresql://postgres.abc:pa@ss@aws-0-eu-north-1.pooler.supabase.com:5432/postgres';
    expect(normalizeDatabaseUrl(url)).toBe('postgresql://postgres.abc:pa%40ss@aws-0-eu-north-1.pooler.supabase.com:5432/postgres');
  });

  it('keeps the host, the port, the path and the parameters', () => {
    const url = 'postgresql://u:p@h:5432/db?sslmode=require&application_name=meety';
    expect(normalizeDatabaseUrl(url)).toBe(url);
  });

  it('leaves a string without a password alone', () => {
    expect(normalizeDatabaseUrl('postgresql://u@h:5432/db')).toBe('postgresql://u@h:5432/db');
    expect(normalizeDatabaseUrl('not a url')).toBe('not a url');
  });

  it('offers the password with a lost @ as a second spelling', () => {
    // The raw @ ends the password, so the driver sends a password that is one character short.
    const url = 'postgresql://postgres.abc:Mhdy2020x@aws-0-eu-north-1.pooler.supabase.com:5432/postgres';
    const candidates = connectionCandidates(url);
    expect(candidates[0]).toBe(url);
    expect(candidates).toContain('postgresql://postgres.abc:Mhdy2020x%40@aws-0-eu-north-1.pooler.supabase.com:5432/postgres');
  });

  it('offers the password without a doubled @ as well', () => {
    // The string has the @ twice, so the password may be the shorter one.
    const url = 'postgresql://postgres.abc:Mhdy2020x@@aws-0-eu-north-1.pooler.supabase.com:5432/postgres';
    const candidates = connectionCandidates(url);
    expect(candidates).toContain('postgresql://postgres.abc:Mhdy2020x@aws-0-eu-north-1.pooler.supabase.com:5432/postgres');
  });

  it('keeps the string itself when the password has its @', () => {
    const url = 'postgresql://postgres.abc:Mhdy2020x%40@aws-0-eu-north-1.pooler.supabase.com:5432/postgres';
    expect(connectionCandidates(url)[0]).toBe(url);
  });
});
