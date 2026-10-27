import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MeetyDatabase } from './db';
import { PersonalSyncEngine, type SyncTransport } from './personalSync';
import type { PersonalChange, PersonalChangeResult, PersonalRecord } from '../../shared/personalData';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}
class Server implements SyncTransport {
  records = new Map<string, PersonalRecord>();
  batches: number[] = [];
  async list(cursor: string | null) {
    const ordered = [...this.records.values()].sort((a, b) => `${a.kind}:${a.key}`.localeCompare(`${b.kind}:${b.key}`));
    const start = cursor ? Number(cursor) : 0;
    const records = structuredClone(ordered.slice(start, start + 100));
    return { records, nextCursor: start + 100 < ordered.length ? String(start + 100) : null };
  }
  async write(changes: PersonalChange[]) {
    this.batches.push(changes.length);
    const results: PersonalChangeResult[] = changes.map((change) => {
      const id = `${change.kind}:${change.key}`;
      const current = this.records.get(id);
      if ((current?.version ?? 0) !== change.baseVersion) return { kind: change.kind, key: change.key, status: 'conflict', current: current ?? null };
      const next: PersonalRecord = { kind: change.kind, key: change.key, version: change.baseVersion + 1, deleted: change.deleted, value: structuredClone(change.value), updatedAt: '2026-10-27T12:00:00Z' };
      this.records.set(id, next);
      return { kind: change.kind, key: change.key, status: 'saved', current: structuredClone(next) };
    });
    return { results };
  }
}
let a: MeetyDatabase; let b: MeetyDatabase; let server: Server; let one: PersonalSyncEngine; let two: PersonalSyncEngine; let storageA: Storage; let storageB: Storage;
beforeEach(() => {
  const id = `${Date.now()}-${Math.random()}`;
  a = new MeetyDatabase(`sync-one-${id}`); b = new MeetyDatabase(`sync-two-${id}`); server = new Server();
  storageA = new MemoryStorage(); storageB = new MemoryStorage();
  one = new PersonalSyncEngine(a, storageA, server); two = new PersonalSyncEngine(b, storageB, server);
});
afterEach(async () => { await a.delete(); await b.delete(); });

const profile = (age: number) => ({ age, heightCm: 180, weightKg: 80, name: 'شخص' });
const weight = (id: string, weightKg: number) => ({ id, date: '2026-10-27', weightKg, notes: '' });

describe('personal sync engine', () => {
  it('moves data to a second device and requires a choice for concurrent edits', async () => {
    await a.preferences.put({ key: 'profile', value: profile(30) });
    await a.bodyweights.put(weight('w1', 80));
    storageA.setItem(`${a.name}:meety_ai_joint_status_v1`, '["knees"]');
    expect((await one.synchronize()).conflicts).toEqual([]);
    expect((await two.synchronize()).conflicts).toEqual([]);
    expect((await b.preferences.get('profile'))?.value).toEqual(profile(30));
    expect(await b.bodyweights.get('w1')).toEqual(weight('w1', 80));
    expect(storageB.getItem(`${b.name}:meety_ai_joint_status_v1`)).toBe('["knees"]');
    await a.preferences.put({ key: 'profile', value: profile(31) });
    await b.preferences.put({ key: 'profile', value: profile(32) });
    await two.synchronize();
    const clash = await one.synchronize();
    expect(clash.conflicts).toHaveLength(1);
    expect((await a.preferences.get('profile'))?.value).toEqual(profile(31));
    expect(server.records.get('profile:main')?.value).toEqual(profile(32));
    await one.resolve(clash.conflicts[0]!, 'local');
    await two.synchronize();
    expect((await b.preferences.get('profile'))?.value).toEqual(profile(31));
  });

  it('preserves unsynced local data offline and prevents a deletion from being resurrected', async () => {
    await a.bodyweights.put(weight('w1', 80)); await one.synchronize(); await two.synchronize();
    await a.transaction('rw', a.bodyweights, a.syncDeleted, async () => {
      await a.bodyweights.delete('w1'); await a.syncDeleted.put({ id: 'bodyweight:w1', kind: 'bodyweight', key: 'w1' });
    });
    const offline = new PersonalSyncEngine(a, storageA, { list: async () => { throw new Error('offline'); }, write: server.write.bind(server) });
    await expect(offline.synchronize()).rejects.toThrow('offline');
    expect(await a.bodyweights.get('w1')).toBeUndefined();
    await one.synchronize(); await two.synchronize();
    expect(await b.bodyweights.get('w1')).toBeUndefined();
    expect(server.records.get('bodyweight:w1')).toMatchObject({ deleted: true, version: 2 });
  });

  it('does not assume a legacy local value belongs over a different server value', async () => {
    await a.preferences.put({ key: 'profile', value: profile(20) });
    await b.preferences.put({ key: 'profile', value: profile(50) });
    await two.synchronize();
    const result = await one.synchronize();
    expect(result.conflicts).toHaveLength(1);
    expect((await a.preferences.get('profile'))?.value).toEqual(profile(20));
    await one.resolve(result.conflicts[0]!, 'server');
    expect((await a.preferences.get('profile'))?.value).toEqual(profile(50));
  });

  it('keeps an edit made while its previous version is in flight', async () => {
    await a.preferences.put({ key: 'profile', value: profile(30) });
    let release!: () => void;
    let entered!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const slow: SyncTransport = { list: server.list.bind(server), write: async (changes) => { entered(); await wait; return server.write(changes); } };
    const syncing = new PersonalSyncEngine(a, storageA, slow).synchronize();
    await started; await a.preferences.put({ key: 'profile', value: profile(31) }); release(); await syncing;
    expect((await a.preferences.get('profile'))?.value).toEqual(profile(31));
    await one.synchronize(); await two.synchronize();
    expect((await b.preferences.get('profile'))?.value).toEqual(profile(31));
  });

  it('batches a large history without dropping older records', async () => {
    await a.bodyweights.bulkPut(Array.from({ length: 600 }, (_, index) => weight(`w-${index}`, 75)));
    const result = await one.synchronize();
    expect(result.errors).toEqual([]);
    expect(server.records.size).toBe(600);
    expect(server.batches.every((size) => size <= 25)).toBe(true);
    await two.synchronize();
    expect(await b.bodyweights.count()).toBe(600);
  });
});
