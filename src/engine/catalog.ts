/**
 * Builds engine configurations from the app's exercise content and movement library.
 *
 * The content stays where it is (src/data, src/motion). This adapter only reshapes it
 * into the engine schema, so there is one source of truth for each exercise.
 */
import { exerciseDefinitions } from '../data/exercises';
import { persianExerciseTranslations } from '../data/exercisePersian';
import { motions } from '../motion/library';
import type { ExerciseDefinition } from '../types';
import { ENGINE_SCHEMA_VERSION, type EngineExerciseConfig, type EnginePhase, type LocalizedText } from './schema';

const RIG = 'makehuman-cc0';
const MODEL_ASSET = '/models/human.glb';
const LICENCE_NOTE = 'MakeHuman graphical assets, CC0 1.0 Universal (public domain dedication).';

/** Loop position of each written step, matching the five keys in the movement library. */
const PHASE_LAYOUT = [
  { id: 'start', at: 0, fa: 'شروع', en: 'Start' },
  { id: 'eccentric', at: 0.25, fa: 'پایین‌آمدن', en: 'Lowering' },
  { id: 'main', at: 0.5, fa: 'وضعیت اصلی', en: 'Main position' },
  { id: 'concentric', at: 0.75, fa: 'بازگشت', en: 'Return' },
] as const;

const DIFFICULTY: Record<ExerciseDefinition['difficulty'], EngineExerciseConfig['difficulty']> = {
  Beginner: 'beginner',
  Intermediate: 'intermediate',
};

/** Pairs an English string with its Persian counterpart; falls back to English if none. */
const pair = (en: string, fa?: string): LocalizedText => ({ en, fa: fa && fa.trim() ? fa : en });

function pairList(en: string[], fa: string[] | undefined): LocalizedText[] {
  return en.map((text, index) => pair(text, fa?.[index]));
}

export function buildConfig(definition: ExerciseDefinition): EngineExerciseConfig {
  const fa = persianExerciseTranslations[definition.id];
  const motionId = definition.motionId ?? definition.id;
  const motion = motions[motionId];
  if (!motion) throw new Error(`exercise ${definition.id} has no movement loop named ${motionId}`);

  const phases: EnginePhase[] = PHASE_LAYOUT.map((layout, index) => {
    const instruction = index === 0
      ? pair(definition.startPosition, fa?.startPosition)
      : index <= 3
        ? pair(definition.execution[index - 1] ?? definition.execution[0]!, fa?.execution?.[index - 1])
        : undefined;
    return {
      id: layout.id,
      label: { fa: layout.fa, en: layout.en },
      at: layout.at,
      instruction,
    };
  });

  return {
    schemaVersion: ENGINE_SCHEMA_VERSION,
    id: definition.id,
    name: pair(definition.name, fa?.name),
    alternativeNames: [],
    equipment: pairList(definition.equipment, fa?.equipment),
    difficulty: DIFFICULTY[definition.difficulty],
    muscles: {
      primary: pairList(definition.primaryMuscles, fa?.primaryMuscles),
      secondary: pairList(definition.secondaryMuscles, fa?.secondaryMuscles),
    },
    instructions: {
      setup: pair(definition.setup, fa?.setup),
      start: pair(definition.startPosition, fa?.startPosition),
      execution: pairList(definition.execution, fa?.execution),
      finish: pair(definition.finishPosition, fa?.finishPosition),
      breathing: pair(definition.breathing, fa?.breathing),
      tempo: pair(definition.tempo, fa?.tempo),
    },
    commonMistakes: pairList(definition.commonMistakes, fa?.commonMistakes),
    safetyNotes: pairList(definition.safetyCues, fa?.safetyCues),
    motion: { id: motionId, durationSeconds: motion.durationSeconds },
    phases,
    model: { asset: MODEL_ASSET, rig: RIG },
    camera: { defaultView: 'front', recommendedViews: ['front', 'side', 'rear', 'free'] },
    playback: { defaultSpeed: 1, loop: true },
    validation: {
      status: 'unverified',
      notes: 'Movement drawn procedurally on the CC0 rig. No visual review of these frames is recorded yet.',
    },
    sources: [
      { title: 'MakeHuman (CC0 graphical assets)', url: 'https://static.makehumancommunity.org/about/license.html' },
    ],
    license: {
      asset: MODEL_ASSET,
      licence: 'CC0-1.0',
      attribution: LICENCE_NOTE,
    },
  };
}

/** Configurations for every exercise the app defines. Built once, on first use. */
let cached: EngineExerciseConfig[] | null = null;
export function appExerciseConfigs(): EngineExerciseConfig[] {
  cached ??= exerciseDefinitions.map(buildConfig);
  return cached;
}

/** Ids of the movement loops the library provides. */
export const appMotionIds = (): ReadonlySet<string> => new Set(Object.keys(motions));
