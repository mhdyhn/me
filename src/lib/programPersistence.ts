import type { WorkoutTemplate } from '../types';
import { db } from './db';
import { validateProgram } from './programRules';
import { getActiveProgram, originalProgramCopy, setActiveProgram } from './programStore';

const PROGRAM_KEY = 'programTemplates';
const BACKUP_KEY = 'programBackup';

const isProgramShape = (value: unknown): value is WorkoutTemplate[] =>
  Array.isArray(value) && value.length > 0 && value.every((day) => day && typeof day === 'object' && Array.isArray((day as WorkoutTemplate).exercises));

/** Loads the user's saved programme, if any. A stored programme that fails validation is ignored. */
export async function loadStoredProgram() {
  try {
    const record = await db.preferences.get(PROGRAM_KEY);
    const value = record?.value;
    if (isProgramShape(value) && validateProgram(value).length === 0) setActiveProgram(value);
  } catch (error) {
    console.error('Meety could not read the saved programme.', error);
  }
}

/**
 * Saves a programme after validation. The previous programme is kept under a backup key
 * before it is replaced, so a bad edit can be recovered.
 */
export async function saveProgram(next: WorkoutTemplate[]) {
  const errors = validateProgram(next);
  if (errors.length) throw new Error(errors[0]);
  await db.preferences.put({ key: BACKUP_KEY, value: getActiveProgram() });
  await db.preferences.put({ key: PROGRAM_KEY, value: next });
  setActiveProgram(next);
}

/** Restores the original RAGE programme (the current one is kept as backup). */
export const resetProgram = () => saveProgram(originalProgramCopy());
