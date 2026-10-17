import type { WorkoutTemplate } from '../types';
import { db } from './db';
import { validateProgram } from './programRules';
import { usesOwnerData } from './accountScope';
import { getActiveProgram, isProgramReadOnly, originalProgramCopy, setActiveProgram } from './programStore';
import { api } from './api';
import { adminPersonalProgram } from '../data/adminProgram';

const PROGRAM_KEY = 'programTemplates';
const BACKUP_KEY = 'programBackup';
const ADMIN_SEED_KEY = 'adminPersonalProgramSeeded';

async function hasAdminProgramSeedMarker(): Promise<boolean> {
  if (!usesOwnerData() || import.meta.env.MODE === 'test') return true;
  const record = await db.preferences.get(ADMIN_SEED_KEY);
  return record?.value === true;
}

async function seedAdminPersonalProgram() {
  const personalProgram = structuredClone(adminPersonalProgram);
  await db.preferences.put({ key: PROGRAM_KEY, value: personalProgram });
  await db.preferences.put({ key: ADMIN_SEED_KEY, value: true });
  setActiveProgram(personalProgram);
  await api('PUT', '/me/personal-program', { program: personalProgram }).catch(() => {});
}

/** Update labels in an existing admin programme without replacing its prescriptions or edits. */
export function normalizeAdminProgramNames(
  program: WorkoutTemplate[],
  enabled = usesOwnerData() && import.meta.env.MODE !== 'test',
): { program: WorkoutTemplate[]; changed: boolean } {
  if (!enabled) return { program, changed: false };
  const namesById = new Map(adminPersonalProgram.flatMap((workout) => workout.exercises.map(({ exerciseId, name }) => [exerciseId, name] as const)));
  let changed = false;
  const normalized = program.map((workout) => ({
    ...workout,
    exercises: workout.exercises.map((item) => {
      const name = namesById.get(item.exerciseId);
      if (!name || item.name === name) return item;
      changed = true;
      return { ...item, name };
    }),
  }));
  return { program: changed ? normalized : program, changed };
}

const isProgramShape = (value: unknown): value is WorkoutTemplate[] =>
  Array.isArray(value) && value.length > 0 && value.every((day) => day && typeof day === 'object' && Array.isArray((day as WorkoutTemplate).exercises));

const isLegacyOwnerDefault = (value: WorkoutTemplate[]) =>
  usesOwnerData() && import.meta.env.MODE !== 'test' && JSON.stringify(value) === JSON.stringify(originalProgramCopy());

/**
 * Syncs personal program with the cloud server (for manager/coach or any logged-in user).
 * If cloud has a program, updates local storage. If cloud is empty and local has one, uploads local copy.
 */
export async function syncCloudProgram() {
  if (isProgramReadOnly()) return;
  try {
    const res = await api<{ program: WorkoutTemplate[] | null; updatedAt: string | null }>('GET', '/me/personal-program');
    if (res.program !== null) {
      if (Array.isArray(res.program)) {
        if (isProgramShape(res.program) && validateProgram(res.program).length === 0 && isLegacyOwnerDefault(res.program)) {
          const personalProgram = structuredClone(adminPersonalProgram);
          await db.preferences.put({ key: PROGRAM_KEY, value: personalProgram });
          await db.preferences.put({ key: ADMIN_SEED_KEY, value: true });
          setActiveProgram(personalProgram);
          await api('PUT', '/me/personal-program', { program: personalProgram }).catch(() => {});
          return;
        }
        if (res.program.length === 0) {
          if (usesOwnerData() && !(await hasAdminProgramSeedMarker())) {
            await seedAdminPersonalProgram();
            return;
          }
          await db.preferences.put({ key: PROGRAM_KEY, value: [] });
          setActiveProgram([]);
          return;
        }
        if (isProgramShape(res.program) && validateProgram(res.program).length === 0) {
          const { program, changed } = normalizeAdminProgramNames(res.program);
          await db.preferences.put({ key: PROGRAM_KEY, value: program });
          if (usesOwnerData() && changed) await db.preferences.put({ key: ADMIN_SEED_KEY, value: true });
          setActiveProgram(program);
          if (changed) await api('PUT', '/me/personal-program', { program }).catch(() => {});
          return;
        }
      }
    } else {
      // Cloud has no personal program yet: if this device has one, back it up to cloud
      const current = getActiveProgram();
      if (current && current.length > 0) {
        await api('PUT', '/me/personal-program', { program: current }).catch(() => {});
      }
    }
  } catch {
    // Offline, guest, or unauthenticated: silently keep local program
  }
}

/** Loads the account's own programme. The developer starts from the original programme; everyone else from an empty one. */
export async function loadStoredProgram() {
  try {
    const record = await db.preferences.get(PROGRAM_KEY);
    if (isProgramReadOnly()) return;
    if (record !== undefined) {
      const value = record?.value;
      if (Array.isArray(value) && value.length === 0) {
        if (usesOwnerData() && !(await hasAdminProgramSeedMarker())) {
          await seedAdminPersonalProgram();
          void syncCloudProgram();
          return;
        }
        setActiveProgram([]);
        void syncCloudProgram();
        return;
      }
      if (isProgramShape(value) && validateProgram(value).length === 0) {
        if (isLegacyOwnerDefault(value)) {
          const personalProgram = structuredClone(adminPersonalProgram);
          await db.preferences.put({ key: PROGRAM_KEY, value: personalProgram });
          await db.preferences.put({ key: ADMIN_SEED_KEY, value: true });
          setActiveProgram(personalProgram);
          void syncCloudProgram();
          return;
        }
        const { program, changed } = normalizeAdminProgramNames(value);
        if (changed) {
          await db.preferences.put({ key: PROGRAM_KEY, value: program });
          await db.preferences.put({ key: ADMIN_SEED_KEY, value: true });
        }
        setActiveProgram(program);
        void syncCloudProgram();
        return;
      }
    }
    if (usesOwnerData() && import.meta.env.MODE !== 'test') {
      await seedAdminPersonalProgram();
    } else {
      setActiveProgram(usesOwnerData() ? originalProgramCopy() : []);
      void syncCloudProgram();
    }
  } catch (error) {
    console.error('Meety could not read the saved programme.', error);
  }
}

/**
 * Saves a programme after validation. The previous programme is kept under a backup key
 * before it is replaced, so a bad edit can be recovered. Also syncs to cloud if connected.
 */
export async function saveProgram(next: WorkoutTemplate[]) {
  const { program } = normalizeAdminProgramNames(next);
  const errors = validateProgram(program);
  if (errors.length) throw new Error(errors[0]);
  await db.preferences.put({ key: BACKUP_KEY, value: getActiveProgram() });
  await db.preferences.put({ key: PROGRAM_KEY, value: program });
  if (usesOwnerData() && import.meta.env.MODE !== 'test') await db.preferences.put({ key: ADMIN_SEED_KEY, value: true });
  setActiveProgram(program);

  // Sync to cloud in background
  try {
    await api('PUT', '/me/personal-program', { program });
  } catch (err) {
    console.warn('Personal programme cloud sync deferred (offline or guest):', err);
  }
}

/** Clears/deletes the entire programme with backup preservation. Also syncs deletion to cloud. */
export async function clearProgram() {
  await db.preferences.put({ key: BACKUP_KEY, value: getActiveProgram() });
  await db.preferences.put({ key: PROGRAM_KEY, value: [] });
  if (usesOwnerData() && import.meta.env.MODE !== 'test') await db.preferences.put({ key: ADMIN_SEED_KEY, value: true });
  setActiveProgram([]);

  // Sync deletion to cloud in background
  try {
    await api('PUT', '/me/personal-program', { program: [] });
  } catch (err) {
    console.warn('Personal programme cloud clear deferred:', err);
  }
}

/** Restores the original RAGE programme (the current one is kept as backup). */
export const resetProgram = () => saveProgram(originalProgramCopy());
