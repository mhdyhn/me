import { describe, expect, it } from 'vitest';
import { createRegistry, normaliseExerciseId } from '../../src/engine';
import { appExerciseConfigs, appMotionIds } from '../../src/engine/catalog';
import type { EngineExerciseConfig } from '../../src/engine';

const sample = (): EngineExerciseConfig => structuredClone(appExerciseConfigs()[0]!);

describe('exercise id normalisation', () => {
  it('accepts underscores and mixed case', () => {
    expect(normaliseExerciseId(' Barbell_Bench_Press ')).toBe('barbell-bench-press');
  });
  it('rejects values that cannot be an id', () => {
    expect(normaliseExerciseId('')).toBeNull();
    expect(normaliseExerciseId('   ')).toBeNull();
    expect(normaliseExerciseId(42)).toBeNull();
    expect(normaliseExerciseId(undefined)).toBeNull();
  });
});

describe('registry lookup', () => {
  const registry = createRegistry(appExerciseConfigs(), { motionIds: appMotionIds() });

  it('resolves an exercise by its id', () => {
    const id = appExerciseConfigs()[0]!.id;
    const result = registry.open(id);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.id).toBe(id);
  });

  it('resolves the underscore form the integration guide uses', () => {
    const id = appExerciseConfigs()[0]!.id;
    expect(registry.open(id.replace(/-/g, '_')).ok).toBe(true);
  });

  it('reports an unknown id as invalid-exercise-id', () => {
    const result = registry.open('no-such-exercise');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid-exercise-id');
  });

  it('reports an unusable id as invalid-exercise-id', () => {
    const result = registry.open(null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid-exercise-id');
  });

  it('returns a message in both languages for every error', () => {
    const result = registry.open('missing');
    if (result.ok) throw new Error('expected a failure');
    expect(result.error.message.fa.length).toBeGreaterThan(0);
    expect(result.error.message.en.length).toBeGreaterThan(0);
  });
});

describe('registry validation at registration', () => {
  it('keeps an invalid configuration out and names it in the report', () => {
    const broken = sample();
    (broken as unknown as Record<string, unknown>).difficulty = 'expert';
    const good = appExerciseConfigs()[1]!;
    const registry = createRegistry([broken, good], { motionIds: appMotionIds() });
    expect(registry.report.accepted).toEqual([good.id]);
    expect(registry.report.rejected[0]!.id).toBe(broken.id);
    expect(registry.has(broken.id)).toBe(false);
  });

  it('rejects a configuration whose movement loop does not exist', () => {
    const orphan = sample();
    orphan.motion = { ...orphan.motion, id: 'missing-loop' };
    const registry = createRegistry([orphan], { motionIds: appMotionIds() });
    expect(registry.report.rejected[0]!.issues.map((issue) => issue.path)).toContain('motion.id');
    expect(registry.list()).toHaveLength(0);
  });

  it('rejects a configuration on a rig the viewer cannot drive', () => {
    const other = sample();
    other.model = { ...other.model, rig: 'mixamo-like' };
    const registry = createRegistry([other], { motionIds: appMotionIds() });
    expect(registry.report.rejected[0]!.issues.map((issue) => issue.path)).toContain('model.rig');
  });

  it('rejects a duplicate id, keeping the first copy', () => {
    const first = sample();
    const second = sample();
    const registry = createRegistry([first, second]);
    expect(registry.list()).toHaveLength(1);
    expect(registry.report.rejected).toHaveLength(1);
  });

  it('without a loop list, the movement reference is not checked at registration', () => {
    const registry = createRegistry([sample()]);
    expect(registry.has(sample().id)).toBe(true);
  });

  it('a configuration whose movement is missing never reaches the registry', () => {
    const registry = createRegistry([sample()], { motionIds: new Set<string>() });
    expect(registry.has(sample().id)).toBe(false);
    expect(registry.report.rejected[0]!.issues.map((issue) => issue.path)).toContain('motion.id');
  });
});
