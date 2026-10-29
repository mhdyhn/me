import { api, ApiError, getStoredUser, getToken } from './api';
import { scopeMatchesAccount, isOfflineBuild } from './accountScope';
import { db, type MeetyDatabase, type PersonalSyncMetadata } from './db';
import { PERSONAL_DATA_APPLIED, PERSONAL_DATA_CHANGED, notifyPersonalDataApplied } from './personalSyncEvents';
import type { PersonalChange, PersonalChangeResult, PersonalKind, PersonalRecord } from '../../shared/personalData';

export type SyncPhase = 'idle' | 'syncing' | 'synced' | 'offline' | 'conflict' | 'error';
interface Snapshot { kind: PersonalKind; key: string; value: unknown; deleted: boolean; signature: string }
export interface PersonalConflict { id: string; kind: PersonalKind; key: string; local: Snapshot; remote: PersonalRecord | null }
export interface PersonalSyncState { phase: SyncPhase; conflicts: PersonalConflict[]; message: string; lastSyncAt: string | null }
export interface SyncTransport {
  list(cursor: string | null): Promise<{ records: PersonalRecord[]; nextCursor: string | null }>;
  write(changes: PersonalChange[]): Promise<{ results: PersonalChangeResult[] }>;
}

const HEALTH_KEYS: Partial<Record<PersonalKind, string>> = {
  healthMetrics: 'meety_ai_health_metrics_v1', jointConcerns: 'meety_ai_joint_status_v1', mindfulLogs: 'meety_ai_mindful_logs_v1',
};
const PREF_KEYS: Partial<Record<PersonalKind, string>> = {
  profile: 'profile', nutritionGoals: 'nutritionGoals', program: 'programTemplates',
};
const singleKinds: PersonalKind[] = ['profile', 'nutritionGoals', 'program', 'healthMetrics', 'jointConcerns', 'mindfulLogs'];
const recordId = (kind: PersonalKind, key: string) => `${kind}:${key}`;
const absent = (kind: PersonalKind, key: string): Snapshot => ({ kind, key, value: null, deleted: true, signature: 'deleted' });

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stableValue(item)]));
  return value;
}
function snapshot(kind: PersonalKind, key: string, value: unknown): Snapshot {
  const json = JSON.stringify(value);
  if (json === undefined) throw new Error('یکی از داده‌های محلی قابل همگام‌سازی نیست.');
  const copy: unknown = JSON.parse(json);
  return { kind, key, value: copy, deleted: false, signature: `value:${JSON.stringify(stableValue(copy))}` };
}
const remoteSnapshot = (kind: PersonalKind, key: string, remote: PersonalRecord | null): Snapshot =>
  !remote || remote.deleted ? absent(kind, key) : snapshot(kind, key, remote.value);
const metadataMatches = (current: PersonalSyncMetadata | undefined, expected: PersonalSyncMetadata | undefined) =>
  current?.version === expected?.version && current?.signature === expected?.signature;
const newOperationId = () => globalThis.crypto?.randomUUID?.() ?? `op-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Bind each engine to its original token and account; never let a later tab login retarget it.
const apiTransport = (accountId: number, sessionToken: string): SyncTransport => ({
  list: (cursor) => api('GET', `/me/personal-data?accountId=${accountId}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, undefined, undefined, sessionToken),
  write: (changes) => api('POST', '/me/personal-data/batch', { accountId, changes }, undefined, sessionToken),
});

/** Per-item versions prevent a stale device from silently replacing a newer edit. */
export class PersonalSyncEngine {
  readonly database: MeetyDatabase;
  readonly storage: Storage;
  readonly transport: SyncTransport;
  readonly active: () => boolean;
  constructor(database: MeetyDatabase, storage: Storage, transport: SyncTransport, active: () => boolean = () => true) {
    this.database = database; this.storage = storage; this.transport = transport; this.active = active;
  }

  private healthKey(kind: PersonalKind): string | null {
    const key = HEALTH_KEYS[kind];
    return key ? `${this.database.name}:${key}` : null;
  }

  private async local(kind: PersonalKind, key: string): Promise<Snapshot> {
    const healthKey = this.healthKey(kind);
    if (healthKey) {
      const raw = this.storage.getItem(healthKey);
      if (raw === null) return absent(kind, key);
      try { return snapshot(kind, key, JSON.parse(raw)); }
      catch { throw new Error('یکی از داده‌های سلامت این دستگاه خراب است؛ پیش از همگام‌سازی آن را بازبینی کنید.'); }
    }
    const pref = PREF_KEYS[kind];
    if (pref) {
      const row = await this.database.preferences.get(pref);
      return row === undefined ? absent(kind, key) : snapshot(kind, key, row.value);
    }
    const table = kind === 'session' ? this.database.sessions : kind === 'bodyweight' ? this.database.bodyweights : this.database.nutritionDays;
    const row = await table.get(key);
    return row === undefined ? absent(kind, key) : snapshot(kind, key, row);
  }

  private async localRecords(): Promise<Map<string, Snapshot>> {
    const result = new Map<string, Snapshot>();
    const [sessions, weights, days, deletions] = await Promise.all([this.database.sessions.toArray(), this.database.bodyweights.toArray(), this.database.nutritionDays.toArray(), this.database.syncDeleted.toArray()]);
    for (const [kind, values] of [['session', sessions], ['bodyweight', weights], ['nutritionDay', days]] as const) {
      for (const value of values) { const item = snapshot(kind, value.id, value); result.set(recordId(kind, value.id), item); }
    }
    for (const item of deletions) {
      if (!result.has(item.id)) result.set(item.id, absent(item.kind, item.key));
    }
    for (const kind of singleKinds) {
      const item = await this.local(kind, 'main');
      if (!item.deleted) result.set(recordId(kind, 'main'), item);
    }
    return result;
  }

  private async listRemote(): Promise<Map<string, PersonalRecord>> {
    const result = new Map<string, PersonalRecord>();
    let cursor: string | null = null;
    do {
      if (!this.active()) throw new Error('نشست تغییر کرده است.');
      const page = await this.transport.list(cursor);
      for (const item of page.records) result.set(recordId(item.kind, item.key), item);
      if (page.nextCursor && page.nextCursor === cursor) throw new Error('صفحه‌بندی دادهٔ سرور متوقف شد.');
      cursor = page.nextCursor;
    } while (cursor);
    return result;
  }

  private validateRemote(item: PersonalRecord): void {
    if (item.deleted) return;
    if (item.kind === 'program') {
      if (!Array.isArray(item.value) || item.value.some((day) => !day || typeof day !== 'object' || !Array.isArray((day as { exercises?: unknown }).exercises))) throw new Error('برنامهٔ ذخیره‌شده در سرور ساختار معتبر ندارد؛ دادهٔ این دستگاه دست‌نخورده ماند.');
    }
  }

  /** Check the local snapshot again inside a transaction before applying a server change. */
  private async applyRemote(local: Snapshot, base: PersonalSyncMetadata | undefined, remote: PersonalRecord): Promise<boolean> {
    this.validateRemote(remote);
    const healthKey = this.healthKey(local.kind);
    const pref = PREF_KEYS[local.kind];
    const table = pref ? this.database.preferences : local.kind === 'session' ? this.database.sessions : local.kind === 'bodyweight' ? this.database.bodyweights : this.database.nutritionDays;
    let changed = false;
    const fn = async () => {
      if (!this.active() || !metadataMatches(await this.database.syncMetadata.get(recordId(local.kind, local.key)), base)) return;
      if ((await this.local(local.kind, local.key)).signature !== local.signature || !this.active()) return;
      const updated = remoteSnapshot(local.kind, local.key, remote);
      if (healthKey) {
        if (updated.deleted) this.storage.removeItem(healthKey);
        else this.storage.setItem(healthKey, JSON.stringify(updated.value));
      } else if (pref) {
        if (updated.deleted) await this.database.preferences.delete(pref);
        else await this.database.preferences.put({ key: pref, value: updated.value });
      } else if (local.kind === 'session') {
        if (updated.deleted) await this.database.sessions.delete(local.key);
        else await this.database.sessions.put(updated.value as Parameters<typeof this.database.sessions.put>[0]);
      } else if (local.kind === 'bodyweight') {
        if (updated.deleted) await this.database.bodyweights.delete(local.key);
        else await this.database.bodyweights.put(updated.value as Parameters<typeof this.database.bodyweights.put>[0]);
      } else {
        if (updated.deleted) await this.database.nutritionDays.delete(local.key);
        else await this.database.nutritionDays.put(updated.value as Parameters<typeof this.database.nutritionDays.put>[0]);
      }
      if (!healthKey && !pref) {
        if (updated.deleted) await this.database.syncDeleted.put({ id: recordId(local.kind, local.key), kind: local.kind, key: local.key });
        else await this.database.syncDeleted.delete(recordId(local.kind, local.key));
      }
      await this.database.syncMetadata.put({ id: recordId(local.kind, local.key), kind: local.kind, key: local.key, version: remote.version, signature: updated.signature });
      changed = updated.signature !== local.signature;
    };
    if (healthKey) await this.database.transaction('rw', this.database.syncMetadata, fn);
    else await this.database.transaction('rw', this.database.syncMetadata, this.database.syncDeleted, table, fn);
    return changed;
  }

  private async acknowledge(sent: Snapshot, base: PersonalSyncMetadata | undefined, remote: PersonalRecord): Promise<void> {
    await this.database.transaction('rw', this.database.syncMetadata, async () => {
      if (!this.active() || !metadataMatches(await this.database.syncMetadata.get(recordId(sent.kind, sent.key)), base)) return;
      // If the user edited while the request was in flight, this remains the base for the next sync.
      await this.database.syncMetadata.put({ id: recordId(sent.kind, sent.key), kind: sent.kind, key: sent.key, version: remote.version, signature: sent.signature });
    });
  }

  private async writeSafely(changes: PersonalChange[]): Promise<{ results: PersonalChangeResult[]; errors: string[] }> {
    if (!this.active()) throw new Error('نشست تغییر کرده است.');
    try { return { ...(await this.transport.write(changes)), errors: [] }; }
    catch (error) {
      // One corrupt legacy record must not block the rest of a large batch.
      if (error instanceof ApiError && (error.status === 400 || error.status === 413)) {
        if (changes.length === 1) return { results: [], errors: [`${changes[0]!.kind}: ${error.message}`] };
        const middle = Math.floor(changes.length / 2);
        const left = await this.writeSafely(changes.slice(0, middle));
        const right = await this.writeSafely(changes.slice(middle));
        return { results: [...left.results, ...right.results], errors: [...left.errors, ...right.errors] };
      }
      throw error;
    }
  }

  async synchronize(): Promise<{ conflicts: PersonalConflict[]; errors: string[]; applied: boolean }> {
    const remote = await this.listRemote();
    if (!this.active()) throw new Error('نشست تغییر کرده است.');
    const local = await this.localRecords();
    const meta = new Map((await this.database.syncMetadata.toArray()).map((item) => [item.id, item]));
    const ids = new Set([...local.keys(), ...remote.keys(), ...meta.keys()]);
    const conflicts: PersonalConflict[] = [];
    const errors: string[] = [];
    const pending: { local: Snapshot; base: PersonalSyncMetadata | undefined; change: PersonalChange }[] = [];
    let applied = false;
    for (const id of ids) {
      if (!this.active()) throw new Error('نشست تغییر کرده است.');
      const base = meta.get(id);
      const r = remote.get(id) ?? null;
      const identity = local.get(id) ?? r ?? base;
      if (!identity) continue;
      const l = local.get(id) ?? absent(identity.kind, identity.key);
      const rs = remoteSnapshot(identity.kind, identity.key, r);
      if (!base) {
        if (!r && !l.deleted) pending.push({ local: l, base, change: { kind: l.kind, key: l.key, baseVersion: 0, operationId: newOperationId(), deleted: l.deleted, value: l.value } });
        else if (r && (!local.has(id) || l.signature === rs.signature)) {
          try { applied = (await this.applyRemote(l, base, r)) || applied; } catch (error) { errors.push((error as Error).message); }
        } else if (r) conflicts.push({ id, kind: l.kind, key: l.key, local: l, remote: r });
        continue;
      }
      const localChanged = l.signature !== base.signature;
      const remoteChanged = (r?.version ?? 0) !== base.version;
      if (localChanged && remoteChanged && l.signature !== rs.signature) conflicts.push({ id, kind: l.kind, key: l.key, local: l, remote: r });
      else if (r && remoteChanged) {
        try { applied = (await this.applyRemote(l, base, r)) || applied; } catch (error) { errors.push((error as Error).message); }
      } else if (localChanged) {
        pending.push({ local: l, base, change: { kind: l.kind, key: l.key, baseVersion: base.version, operationId: newOperationId(), deleted: l.deleted, value: l.value } });
      } else if (remoteChanged) {
        // The server was reset or replaced; never silently re-upload a stale local copy.
        conflicts.push({ id, kind: l.kind, key: l.key, local: l, remote: r });
      }
    }
    // Bound both item count and wire size; full workout histories can span many requests.
    let index = 0;
    while (index < pending.length) {
      if (!this.active()) throw new Error('نشست تغییر کرده است.');
      const batch: typeof pending = []; let bytes = 0;
      while (index < pending.length && batch.length < 25) {
        const item = pending[index]!;
        const size = new TextEncoder().encode(JSON.stringify(item.change)).length;
        if (batch.length && bytes + size > 220 * 1024) break;
        batch.push(item); bytes += size; index++;
      }
      const valid: typeof pending = [];
      for (const item of batch) {
        const live = await this.local(item.local.kind, item.local.key);
        const liveMeta = await this.database.syncMetadata.get(recordId(item.local.kind, item.local.key));
        if (live.signature === item.local.signature && metadataMatches(liveMeta, item.base)) valid.push(item);
      }
      if (!valid.length) continue;
      const response = await this.writeSafely(valid.map((item) => item.change));
      errors.push(...response.errors);
      for (const result of response.results) {
        const source = valid.find((item) => item.local.kind === result.kind && item.local.key === result.key);
        if (!source) continue;
        if (result.status === 'saved' && result.current) await this.acknowledge(source.local, source.base, result.current);
        else if (result.status === 'conflict') conflicts.push({ id: recordId(result.kind, result.key), kind: result.kind, key: result.key, local: source.local, remote: result.current });
        else if (result.status === 'invalid') errors.push(result.message);
      }
    }
    return { conflicts, errors, applied };
  }

  /** A choice is based on the versions shown; if either side changed, require a fresh review. */
  async resolve(conflict: PersonalConflict, choice: 'local' | 'server'): Promise<void> {
    const all = await this.listRemote();
    const current = all.get(conflict.id) ?? null;
    const local = await this.local(conflict.kind, conflict.key);
    if (!this.active() || local.signature !== conflict.local.signature || (current?.version ?? 0) !== (conflict.remote?.version ?? 0)) throw new Error('داده از زمان نمایش تعارض تغییر کرده است؛ دوباره آن را بررسی کنید.');
    const base = await this.database.syncMetadata.get(conflict.id);
    if (choice === 'server') {
      const chosen = current ?? { kind: conflict.kind, key: conflict.key, version: 0, deleted: true, value: null, updatedAt: '' };
      const changed = await this.applyRemote(local, base, chosen);
      if (!changed && local.signature !== remoteSnapshot(conflict.kind, conflict.key, chosen).signature) throw new Error('داده در زمان انتخاب تغییر کرد؛ دوباره بررسی کنید.');
      return;
    }
    const change: PersonalChange = { kind: local.kind, key: local.key, baseVersion: current?.version ?? 0, operationId: newOperationId(), deleted: local.deleted, value: local.value };
    const result = (await this.writeSafely([change]));
    if (result.errors.length) throw new Error(result.errors.join('؛ '));
    const saved = result.results[0];
    if (!saved || saved.status !== 'saved' || !saved.current) throw new Error('نسخهٔ سرور دوباره تغییر کرد؛ تعارض را دوباره بررسی کنید.');
    await this.acknowledge(local, base, saved.current);
  }
}

let currentState: PersonalSyncState = { phase: 'idle', conflicts: [], message: '', lastSyncAt: null };
const subscribers = new Set<() => void>();
let currentEngine: PersonalSyncEngine | null = null;
let timer: number | undefined;
let interval: number | undefined;
let busy = false;
let again = false;

const setState = (next: Partial<PersonalSyncState>) => { currentState = { ...currentState, ...next }; subscribers.forEach((fn) => fn()); };
export const getPersonalSyncState = () => currentState;
export const subscribePersonalSync = (listener: () => void) => { subscribers.add(listener); return () => { subscribers.delete(listener); }; };

async function run(): Promise<void> {
  const engine = currentEngine;
  if (!engine) return;
  if (busy) { again = true; return; }
  busy = true;
  setState({ phase: 'syncing', message: 'در حال همگام‌سازی اطلاعات شخصی…' });
  try {
    const result = await engine.synchronize();
    if (engine !== currentEngine) return;
    if (result.applied) notifyPersonalDataApplied();
    else window.dispatchEvent(new Event(PERSONAL_DATA_APPLIED)); // A previous tab may have committed while this view was starting.
    // A partially failed initial sync is not proof that all remote sessions were applied.
    setState({ phase: result.errors.length ? 'error' : result.conflicts.length ? 'conflict' : 'synced', conflicts: result.conflicts,
      message: result.errors.length ? result.errors[0]! : result.conflicts.length ? 'چند تغییر هم‌زمان نیاز به بررسی دارد؛ هیچ‌کدام خودکار رونویسی نشد.' : 'اطلاعات شخصی با سرور همگام است.',
      lastSyncAt: result.errors.length ? currentState.lastSyncAt : new Date().toISOString() });
  } catch (error) {
    // Only a failed network request is offline; malformed data and storage errors need attention.
    if (engine === currentEngine) setState({ phase: error instanceof ApiError && error.status === 0 ? 'offline' : 'error', message: error instanceof ApiError ? error.message : 'بررسی اطلاعات یا حافظهٔ دستگاه کامل نشد؛ تغییرات روی دستگاه باقی می‌مانند.' });
  } finally {
    busy = false;
    if (again && currentEngine) { again = false; schedulePersonalSync(); }
  }
}

export function schedulePersonalSync(): void {
  if (!currentEngine) return;
  if (currentState.phase === 'synced') setState({ phase: 'syncing', message: 'تغییرات محلی در انتظار همگام‌سازی است…' });
  if (timer !== undefined) window.clearTimeout(timer);
  timer = window.setTimeout(() => { timer = undefined; void run(); }, 600);
}

export function startPersonalSync(user: { id: number }): () => void {
  const sessionToken = getToken();
  if (isOfflineBuild || !sessionToken || !scopeMatchesAccount(user) || db.name !== `meety-personal-user-${user.id}`) return () => {};
  const active = () => getStoredUser()?.id === user.id && getToken() === sessionToken && scopeMatchesAccount(user) && db.name === `meety-personal-user-${user.id}`;
  currentEngine = new PersonalSyncEngine(db, window.localStorage, apiTransport(user.id, sessionToken), active);
  setState({ phase: 'syncing', conflicts: [], message: 'در حال بررسی اطلاعات سرور…', lastSyncAt: null });
  const onFocus = () => schedulePersonalSync();
  window.addEventListener(PERSONAL_DATA_CHANGED, onFocus);
  window.addEventListener('online', onFocus);
  window.addEventListener('focus', onFocus);
  interval = window.setInterval(schedulePersonalSync, 30000);
  void run();
  const instance = currentEngine;
  return () => {
    window.removeEventListener(PERSONAL_DATA_CHANGED, onFocus);
    window.removeEventListener('online', onFocus);
    window.removeEventListener('focus', onFocus);
    if (timer !== undefined) window.clearTimeout(timer);
    if (interval !== undefined) window.clearInterval(interval);
    timer = undefined; interval = undefined;
    if (currentEngine === instance) { currentEngine = null; setState({ phase: 'idle', conflicts: [], message: '', lastSyncAt: null }); }
  };
}

export async function resolvePersonalConflict(conflict: PersonalConflict, choice: 'local' | 'server'): Promise<void> {
  const engine = currentEngine;
  if (!engine) throw new Error('همگام‌سازی در دسترس نیست.');
  await engine.resolve(conflict, choice);
  notifyPersonalDataApplied();
  await run();
}
