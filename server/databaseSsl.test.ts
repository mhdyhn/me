// @vitest-environment node
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { poolOptions, tidyConnectionString, withoutSslParameters } from './db.ts';

const supabase = 'postgresql://postgres.yvngvwhjavjzpxewblug:secret@aws-0-eu-north-1.pooler.supabase.com:5432/postgres';

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('DATABASE_SSL_REJECT_UNAUTHORIZED', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the TLS options of the database connection', () => {
  it('takes the sslmode out of the connection string', () => {
    // node-postgres lets the string win over the pool options, and `sslmode=require` leaves
    // the certificate check on. That fails against a pooler with a self-signed chain.
    expect(withoutSslParameters(`${supabase}?sslmode=require`)).toBe(supabase);
    expect(withoutSslParameters(`${supabase}?sslmode=verify-full`)).toBe(supabase);
    expect(withoutSslParameters(`${supabase}?sslmode=no-verify`)).toBe(supabase);
  });

  it('keeps the other parameters of the connection string', () => {
    expect(withoutSslParameters(`${supabase}?sslmode=require&application_name=meety`))
      .toBe(`${supabase}?application_name=meety`);
  });

  it('leaves a connection string without parameters alone', () => {
    expect(withoutSslParameters(supabase)).toBe(supabase);
  });

  it('does not touch the password', () => {
    const url = 'postgresql://user:p%40ss%3Aword@host:5432/db?sslmode=require';
    expect(withoutSslParameters(url)).toBe('postgresql://user:p%40ss%3Aword@host:5432/db');
  });

  it('uses TLS for a remote database without checking the private chain', () => {
    const options = poolOptions(`${supabase}?sslmode=require`);
    expect(options.connectionString).not.toContain('sslmode');
    expect(options.ssl).toEqual({ rejectUnauthorized: false });
  });

  it('can check the certificate when it is asked for', () => {
    vi.stubEnv('DATABASE_SSL_REJECT_UNAUTHORIZED', 'true');
    expect(poolOptions(supabase).ssl).toEqual({ rejectUnauthorized: true });
  });

  it('drops the spaces a copy and paste leaves behind', () => {
    // A password with a space around it is a wrong password for the server.
    expect(tidyConnectionString(`${supabase}\n`)).toBe(supabase);
    expect(tidyConnectionString('postgresql://user: secret @host:5432/db')).toBe('postgresql://user:secret@host:5432/db');
    expect(tidyConnectionString('postgresql://user@host:5432/db')).toBe('postgresql://user@host:5432/db');
  });

  it('does not use TLS for a database on the same machine', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(poolOptions('postgresql://postgres:postgres@127.0.0.1:5432/postgres').ssl).toBeUndefined();
    expect(poolOptions('postgresql://postgres:postgres@localhost:5432/postgres').ssl).toBeUndefined();
  });
});
