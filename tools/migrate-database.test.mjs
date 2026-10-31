// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildInsert, chunk, TABLES } from './migrate-database.mjs';

/** Every table the server creates. */
const schemaTables = () => {
  const files = readdirSync(resolve('server')).filter((name) => name.endsWith('.ts'));
  const found = new Set();
  for (const file of files) {
    const source = readFileSync(resolve('server', file), 'utf8');
    for (const match of source.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)) found.add(match[1]);
  }
  return [...found].sort();
};

describe('the database copy tool', () => {
  it('covers every table the server creates', () => {
    for (const table of schemaTables()) {
      expect(TABLES, table).toContain(table);
    }
  });

  it('puts the accounts before the tables that point at them', () => {
    expect(TABLES.indexOf('users')).toBeLessThan(TABLES.indexOf('sessions'));
    expect(TABLES.indexOf('users')).toBeLessThan(TABLES.indexOf('student_programs'));
  });

  it('builds an insert with one placeholder per column', () => {
    expect(buildInsert('users', ['id', 'username'])).toBe('INSERT INTO users (id, username) VALUES ($1, $2) ON CONFLICT DO NOTHING');
  });

  it('splits the rows into batches', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
