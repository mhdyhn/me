import type { WorkoutTemplate } from '../types';
import { db } from './db';
import { validateProgram } from './programRules';
import { usesOwnerData } from './accountScope';
import { defaultPersonalProgram, isProgramReadOnly, originalProgramCopy, setActiveProgram } from './programStore';
import { adminPersonalProgram } from '../data/adminProgram';
import { notifyPersonalDataApplied, notifyPersonalDataChanged } from './personalSyncEvents';
import { DraftChangedError, requireUnchanged } from './draftGuard';

const PROGRAM_KEY = 'programTemplates';
const BACKUP_KEY = 'programBackup';

/** Update legacy labels when explicitly requested without replacing prescriptions or edits. */
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

/** Network synchronization is versioned and handled by the personal-data synchronizer. */
export async function syncCloudProgram(): Promise<void> { notifyPersonalDataChanged(); }

/** Load the local account's programme. A default is shown in memory, never blindly pushed to the server. */
export async function loadStoredProgram(): Promise<void> {
  try {
    const record = await db.preferences.get(PROGRAM_KEY);
    if (isProgramReadOnly()) return;
    if (record !== undefined) {
      if (Array.isArray(record.value) && record.value.length === 0) { setActiveProgram([]); return; }
      if (isProgramShape(record.value) && validateProgram(record.value).length === 0) { setActiveProgram(record.value); return; }
      console.error('The saved personal programme is invalid; it was not replaced.');
      return;
    }
    setActiveProgram(structuredClone(defaultPersonalProgram()));
  } catch (error) {
    console.error('Meety could not read the saved programme.', error);
  }
}

async function persistProgram(next: WorkoutTemplate[], expected?: WorkoutTemplate[]): Promise<void> {
  if (isProgramReadOnly()) throw new Error('برنامهٔ مربی قابل ویرایش شخصی نیست؛ صفحه را دوباره باز کنید.');
  try {
    await db.transaction('rw', db.preferences, async () => {
      const record = await db.preferences.get(PROGRAM_KEY);
      const current = record?.value ?? defaultPersonalProgram();
      if (expected !== undefined) requireUnchanged(current, expected);
      await db.preferences.put({ key: BACKUP_KEY, value: current });
      await db.preferences.put({ key: PROGRAM_KEY, value: next });
    });
  } catch (error) {
    if (error instanceof DraftChangedError) notifyPersonalDataApplied();
    throw error;
  }
  // A personal save started before connection must not replace the coach programme in memory.
  if (!isProgramReadOnly()) setActiveProgram(next);
  notifyPersonalDataChanged();
}

/** Save locally first; reject a stale editor in the same IndexedDB transaction. */
export async function saveProgram(next: WorkoutTemplate[], expected?: WorkoutTemplate[]): Promise<void> {
  const errors = validateProgram(next);
  if (errors.length) throw new Error(errors[0]);
  await persistProgram(next, expected);
}
export const clearProgram = (expected?: WorkoutTemplate[]) => persistProgram([], expected);
export const resetProgram = (expected?: WorkoutTemplate[]) => saveProgram(originalProgramCopy(), expected);
