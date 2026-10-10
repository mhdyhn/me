import { describe, expect, it } from 'vitest';
import { ENGINE_SCHEMA_VERSION, validateExerciseConfig } from '../../src/engine';
import { appExerciseConfigs } from '../../src/engine/catalog';

const base = () => structuredClone(appExerciseConfigs()[0]!) as unknown as Record<string, unknown>;

const errorPaths = (input: unknown) =>
  validateExerciseConfig(input).issues.filter((issue) => issue.severity === 'error').map((issue) => issue.path);

describe('exercise schema', () => {
  it('accepts a complete configuration', () => {
    expect(validateExerciseConfig(base()).valid).toBe(true);
  });

  it('rejects non-objects', () => {
    expect(validateExerciseConfig(null).valid).toBe(false);
    expect(validateExerciseConfig('barbell-squat').valid).toBe(false);
  });

  it('reports every problem in one pass', () => {
    const broken = base();
    broken.id = 'Barbell Squat';
    broken.difficulty = 'expert';
    broken.playback = { defaultSpeed: 3, loop: 'yes' };
    expect(errorPaths(broken)).toEqual(expect.arrayContaining(['id', 'difficulty', 'playback.defaultSpeed', 'playback.loop']));
  });

  it('requires the schema version to match', () => {
    const input = base();
    input.schemaVersion = ENGINE_SCHEMA_VERSION + 1;
    expect(errorPaths(input)).toContain('schemaVersion');
  });

  it('requires a Persian and an English name', () => {
    const input = base();
    input.name = { en: 'Squat' };
    expect(errorPaths(input)).toContain('name.fa');
  });

  it('rejects an asset path that is not an absolute glb or gltf file', () => {
    const input = base();
    input.model = { asset: 'models/human.glb', rig: 'makehuman-cc0' };
    expect(errorPaths(input)).toContain('model.asset');
    input.model = { asset: '/models/human.png', rig: 'makehuman-cc0' };
    expect(errorPaths(input)).toContain('model.asset');
  });

  it('requires phases to start at 0 and increase strictly', () => {
    const input = base();
    input.phases = [
      { id: 'a', label: { fa: 'الف', en: 'A' }, at: 0.2 },
      { id: 'b', label: { fa: 'ب', en: 'B' }, at: 0.2 },
    ];
    const paths = errorPaths(input);
    expect(paths).toContain('phases[0].at');
    expect(paths).toContain('phases[1].at');
  });

  it('rejects duplicate phase ids', () => {
    const input = base();
    const phases = input.phases as Array<Record<string, unknown>>;
    phases[1]!.id = phases[0]!.id;
    expect(errorPaths(input)).toContain('phases[1].id');
  });

  it('rejects a validation status outside the agreed set', () => {
    const input = base();
    input.validation = { status: 'expert-approved', notes: '' };
    expect(errorPaths(input)).toContain('validation.status');
  });

  it('warns about unknown fields without rejecting the configuration', () => {
    const input = base();
    input.futureField = 42;
    const result = validateExerciseConfig(input);
    expect(result.valid).toBe(true);
    expect(result.issues).toContainEqual(expect.objectContaining({ path: 'futureField', severity: 'warning' }));
  });

  it('requires licence and attribution fields', () => {
    const input = base();
    input.license = { asset: '/models/human.glb', licence: '', attribution: 'x' };
    expect(errorPaths(input)).toContain('license.licence');
  });
});
