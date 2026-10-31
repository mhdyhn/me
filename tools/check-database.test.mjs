// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildConnectionString, readOptions, withoutSslParameters } from './check-database.mjs';

describe('the connection string of the database', () => {
  it('encodes a password with special characters', () => {
    const url = buildConnectionString({ user: 'postgres.abc', password: 'p@ss:word/#1', host: 'aws-0-eu-north-1.pooler.supabase.com', port: '5432', database: 'postgres' });
    expect(url).toBe('postgresql://postgres.abc:p%40ss%3Aword%2F%231@aws-0-eu-north-1.pooler.supabase.com:5432/postgres');
    expect(new URL(url).password).toBe('p%40ss%3Aword%2F%231');
  });

  it('builds the pooler address of a Supabase project', () => {
    const { options } = readOptions(['--ref', 'yvngvwhjavjzpxewblug', '--password', 'secret']);
    expect(options.user).toBe('postgres.yvngvwhjavjzpxewblug');
    expect(options.host).toBe('aws-0-eu-north-1.pooler.supabase.com');
    expect(options.port).toBe('5432');
    expect(options.database).toBe('postgres');
  });

  it('keeps a connection string that was given directly', () => {
    const { positional } = readOptions(['postgresql://user:pass@host:5432/db']);
    expect(positional[0]).toBe('postgresql://user:pass@host:5432/db');
  });

  it('takes the ssl parameters out', () => {
    expect(withoutSslParameters('postgresql://u:p@h:5432/db?sslmode=require')).toBe('postgresql://u:p@h:5432/db');
    expect(withoutSslParameters('postgresql://u:p@h:5432/db')).toBe('postgresql://u:p@h:5432/db');
  });
});
