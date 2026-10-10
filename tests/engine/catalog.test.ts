import { describe, expect, it } from 'vitest';
import { exercises } from '../../src/data/exercises';
import { persianExerciseTranslations } from '../../src/data/exercisePersian';
import { motions } from '../../src/motion/library';
import { appExerciseConfigs, appMotionIds, engineRegistry, mapMuscles, validateExerciseConfig } from '../../src/engine';

describe('app catalogue through the engine', () => {
  const configs = appExerciseConfigs();

  it('builds one configuration per app exercise', () => {
    expect(configs).toHaveLength(exercises.length);
    expect(new Set(configs.map((config) => config.id)).size).toBe(configs.length);
  });

  it('every configuration passes the schema with no errors', () => {
    for (const config of configs) {
      const result = validateExerciseConfig(config);
      const errors = result.issues.filter((issue) => issue.severity === 'error');
      expect(errors, config.id).toEqual([]);
    }
  });

  it('every exercise has a Persian translation', () => {
    for (const config of configs) {
      expect(persianExerciseTranslations[config.id], config.id).toBeDefined();
      expect(config.name.fa, config.id).not.toBe(config.name.en);
    }
  });

  it('every movement loop referenced by an exercise exists in the library', () => {
    const ids = appMotionIds();
    for (const config of configs) {
      expect(ids.has(config.motion.id), config.id).toBe(true);
      expect(motions[config.motion.id]?.durationSeconds).toBe(config.motion.durationSeconds);
    }
  });

  it('the registry accepts every app exercise', () => {
    const registry = engineRegistry();
    expect(registry.report.rejected).toEqual([]);
    expect(registry.report.accepted).toHaveLength(configs.length);
  });

  it('phases start at 0 and stay in order inside one loop', () => {
    for (const config of configs) {
      const at = config.phases.map((phase) => phase.at);
      expect(at[0], config.id).toBe(0);
      expect([...at].sort((a, b) => a - b), config.id).toEqual(at);
      expect(at.every((value) => value >= 0 && value < 1), config.id).toBe(true);
    }
  });

  it('every muscle a movement lists can be painted, or is reported', () => {
    for (const config of configs) {
      const mapping = mapMuscles(config);
      const listed = config.muscles.primary.length + config.muscles.secondary.length;
      expect(mapping.primary.length + mapping.secondary.length + mapping.unmapped.length, config.id).toBeLessThanOrEqual(listed);
      expect(mapping.primary.length, `${config.id} has no paintable primary muscle`).toBeGreaterThan(0);
    }
  });

  it('no exercise claims a validation status above unverified without evidence', () => {
    for (const config of configs) {
      expect(config.validation.status, config.id).toBe('unverified');
    }
  });
});
