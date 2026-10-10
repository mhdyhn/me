/**
 * Maps the muscle names an exercise lists onto the regions the figure can paint.
 *
 * This is an educational illustration of the muscles a movement works. It is not a
 * measurement of muscle activity, force or EMG output, and the UI must say so.
 */
import { muscleRegion, type MuscleRegionId } from '../motion/muscles';
import type { EngineExerciseConfig, LocalizedText } from './schema';

export interface MappedMuscle {
  label: LocalizedText;
  region: MuscleRegionId;
}

export interface MuscleMapping {
  primary: MappedMuscle[];
  secondary: MappedMuscle[];
  /** Names that could not be painted, so the reader is told rather than shown nothing. */
  unmapped: LocalizedText[];
}

/** A localised name resolves when either its English or its Persian form is known. */
function regionOf(text: LocalizedText): MuscleRegionId | null {
  return muscleRegion(text.en) ?? muscleRegion(text.fa);
}

export function mapMuscles(config: Pick<EngineExerciseConfig, 'muscles'>): MuscleMapping {
  const mapping: MuscleMapping = { primary: [], secondary: [], unmapped: [] };
  const seen = new Set<MuscleRegionId>();

  const place = (list: LocalizedText[], target: MappedMuscle[]) => {
    for (const label of list) {
      const region = regionOf(label);
      if (region === null) {
        mapping.unmapped.push(label);
      } else if (!seen.has(region)) {
        seen.add(region);
        target.push({ label, region });
      }
    }
  };

  // Primary first: a region named as both primary and secondary stays primary.
  place(config.muscles.primary, mapping.primary);
  place(config.muscles.secondary, mapping.secondary);
  return mapping;
}
