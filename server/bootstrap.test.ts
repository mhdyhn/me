// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureAdmin } from './bootstrap.ts';
import { verifyPassword } from './auth.ts';
import { openDatabase, type Db } from './db.ts';
import { findUserByUsername } from './users.ts';

let db: Db;
const clock = new Date('2026-10-31T08:00:00Z');

beforeEach(async () => {
  db = await openDatabase('memory');
});

afterEach(async () => {
  await db.close();
  vi.restoreAllMocks();
});

describe('the admin account of the application', () => {
  it('is created from the environment', async () => {
    expect(await ensureAdmin(db, 'owner', 'owner-pass-123', clock)).toBe('created');
    const owner = await findUserByUsername(db, 'owner');
    expect(owner).toMatchObject({ role: 'admin', mustChangePassword: false });
  });

  it('is never overwritten on a later start', async () => {
    await ensureAdmin(db, 'owner', 'owner-pass-123', clock);
    expect(await ensureAdmin(db, 'owner', 'another-pass-456', clock)).toBe('exists');
  });

  it('refuses a password that is too short', async () => {
    await expect(ensureAdmin(db, 'owner', 'short', clock)).rejects.toThrow(/8 characters/);
  });

  it('is created with a random password when the environment names none', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await ensureAdmin(db, undefined, undefined, clock)).toBe('fallback');
    const admin = await findUserByUsername(db, 'admin');
    expect(admin).toMatchObject({ role: 'admin', mustChangePassword: true });
    // The password is written to the log of the server, once, and it works.
    const written = log.mock.calls.map((call) => String(call[0])).join('\n');
    const password = /password: (\S+)/.exec(written)?.[1] ?? '';
    expect(password.length).toBeGreaterThan(10);
    expect(verifyPassword(password, admin!.passwordHash)).toBe(true);
  });

  it('is not created twice when the database already has one', async () => {
    await ensureAdmin(db, 'owner', 'owner-pass-123', clock);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await ensureAdmin(db, undefined, undefined, clock)).toBe('exists');
    expect(log).not.toHaveBeenCalled();
    expect(await findUserByUsername(db, 'admin')).toBeNull();
  });
});
