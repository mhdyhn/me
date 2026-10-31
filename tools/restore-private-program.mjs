// Rebuilds the owner's private personal programme file from the historical admin programme
// and writes it in the format the app's importer accepts.
import { writeFileSync, mkdirSync, chmodSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '..');
const temporary = resolve(repo, 'src/data/adminProgram.restore.ts');
const target = resolve(repo, 'private-backups/meety-personal-program.json');

const historical = execFileSync('git', ['show', '633599b:src/data/adminProgram.ts'], {
  cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
});

// The historical file is TypeScript. The types are removed so Node can run it directly.
const source = historical
  .replace(/^import type .*$/m, '')
  .replace(/const exercise = \([^)]*\)/, 'const exercise = (exerciseId, name, sets, minReps, maxReps, restSeconds = 75, note)')
  .replace(/const day = \([^)]*\)/, 'const day = (id, dayLabel, name, focus, exercises)')
  .replace(/export const adminPersonalProgram: WorkoutTemplate\[\]/, 'export const adminPersonalProgram')
  .replace(/\): WorkoutTemplate =>/g, ') =>')
  .replace(/\): WorkoutExercise =>/g, ') =>');

writeFileSync(temporary, source);
const module = await import(`file://${temporary}?t=${Date.now()}`);
const programme = module.adminPersonalProgram;
const guidelines = module.adminProgramGuidelines ?? [];
const file = { app: 'Meety', format: 'personal-program', version: 1, programme, guidelines };

mkdirSync(resolve(repo, 'private-backups'), { recursive: true });
writeFileSync(target, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
chmodSync(target, 0o600);
rmSync(temporary, { force: true });

const exercises = programme.reduce((sum, day) => sum + day.exercises.length, 0);
console.log(`days=${programme.length} exercises=${exercises} guidelines=${guidelines.length}`);
console.log(target);
