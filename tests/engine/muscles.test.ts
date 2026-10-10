import { describe, expect, it } from 'vitest';
import { appExerciseConfigs, buildConfig, mapMuscles } from '../../src/engine';
import { exerciseDefinitions } from '../../src/data/exercises';

describe('muscle mapping', () => {
  it('maps a known English and a known Persian name to the same region', () => {
    const config = appExerciseConfigs()[0]!;
    const mapping = mapMuscles({
      muscles: {
        primary: [{ en: 'Chest', fa: 'سینه' }],
        secondary: [{ en: 'Triceps', fa: 'پشت بازو' }],
      },
    });
    expect(mapping.primary[0]!.region).toBe('chest');
    expect(mapping.secondary[0]!.region).toBe('triceps');
    expect(config.id).toBeTruthy();
  });

  it('does not paint one region twice', () => {
    const mapping = mapMuscles({
      muscles: {
        primary: [{ en: 'Chest', fa: 'سینه' }],
        secondary: [{ en: 'Chest', fa: 'سینه' }],
      },
    });
    expect(mapping.primary).toHaveLength(1);
    expect(mapping.secondary).toHaveLength(0);
  });

  it('reports a name it cannot paint instead of dropping it silently', () => {
    const mapping = mapMuscles({
      muscles: { primary: [{ en: 'Chest', fa: 'سینه' }], secondary: [{ en: 'Unknown muscle', fa: 'عضلهٔ ناشناخته' }] },
    });
    expect(mapping.unmapped).toEqual([{ en: 'Unknown muscle', fa: 'عضلهٔ ناشناخته' }]);
  });

  it('keeps the English and Persian labels for the reader', () => {
    const definition = exerciseDefinitions[0]!;
    const config = buildConfig(definition);
    expect(config.muscles.primary[0]!.en).toBe(definition.primaryMuscles[0]);
    expect(config.muscles.primary[0]!.fa).not.toBe(config.muscles.primary[0]!.en);
  });
});
