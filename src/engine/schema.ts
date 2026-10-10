/**
 * Exercise configuration schema.
 *
 * A configuration is the content of one exercise: names, instructions, muscles,
 * equipment, the movement loop it plays, camera defaults and provenance. It is plain
 * data, so it can be validated, serialised and localised without touching the renderer.
 *
 * Every reader-facing string is localised (Persian and English). Unknown fields are
 * reported as warnings, so newer content does not break an older engine.
 */

export const ENGINE_SCHEMA_VERSION = 1;

/** Playback speeds the viewer offers. Anything else is rejected. */
export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

export const CAMERA_VIEWS = ['front', 'side', 'rear', 'free'] as const;
export type CameraView = (typeof CAMERA_VIEWS)[number];

/**
 * How far a movement has been checked. `unverified` is the default. An automated check
 * can raise a loop to `numeric-checked`; only a written visual review of its frames can
 * raise it to `visually-reviewed`.
 */
export const VALIDATION_STATUSES = ['unverified', 'numeric-checked', 'visually-reviewed'] as const;
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];

export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export interface LocalizedText {
  fa: string;
  en: string;
}

export interface EngineSource {
  title: string;
  url: string;
}

export interface EnginePhase {
  /** Stable id inside the exercise, e.g. `start`, `eccentric`, `main`, `concentric`. */
  id: string;
  label: LocalizedText;
  /** Loop position in [0, 1). The first phase starts at 0; the loop closes at 1. */
  at: number;
  /** What the reader does in this phase. */
  instruction?: LocalizedText;
}

export interface EngineExerciseConfig {
  schemaVersion: typeof ENGINE_SCHEMA_VERSION;
  /** Kebab-case, unique across the registry. */
  id: string;
  name: LocalizedText;
  alternativeNames: LocalizedText[];
  equipment: LocalizedText[];
  difficulty: Difficulty;
  muscles: {
    primary: LocalizedText[];
    secondary: LocalizedText[];
  };
  instructions: {
    setup: LocalizedText;
    start: LocalizedText;
    /** Execution steps in order: lowering, main position, return. */
    execution: LocalizedText[];
    finish: LocalizedText;
    breathing: LocalizedText;
    tempo: LocalizedText;
  };
  commonMistakes: LocalizedText[];
  safetyNotes: LocalizedText[];
  motion: {
    /** Id of the loop in the movement library. */
    id: string;
    /** Duration of one full loop at 1x speed. */
    durationSeconds: number;
  };
  phases: EnginePhase[];
  model: {
    /** Path under the public folder, e.g. `/models/human.glb`. */
    asset: string;
    /** Rig standard the movement was written for. */
    rig: string;
  };
  camera: {
    defaultView: CameraView;
    recommendedViews: CameraView[];
  };
  playback: {
    defaultSpeed: PlaybackSpeed;
    loop: boolean;
  };
  validation: {
    status: ValidationStatus;
    notes: string;
  };
  sources: EngineSource[];
  license: {
    asset: string;
    licence: string;
    attribution: string;
  };
}

export interface ConfigIssue {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  issues: ConfigIssue[];
}

const KNOWN_KEYS = new Set<string>([
  'schemaVersion', 'id', 'name', 'alternativeNames', 'equipment', 'difficulty', 'muscles',
  'instructions', 'commonMistakes', 'safetyNotes', 'motion', 'phases', 'model', 'camera',
  'playback', 'validation', 'sources', 'license',
]);

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RIG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const ASSET_PATTERN = /^\/[^\s]+\.(glb|gltf)$/i;

type Issues = ConfigIssue[];

const error = (issues: Issues, path: string, message: string) => issues.push({ path, message, severity: 'error' });
const warn = (issues: Issues, path: string, message: string) => issues.push({ path, message, severity: 'warning' });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

function checkLocalized(issues: Issues, path: string, value: unknown): boolean {
  if (!isRecord(value)) {
    error(issues, path, 'must be an object with fa and en text');
    return false;
  }
  let ok = true;
  if (!isNonEmptyString(value.fa)) {
    error(issues, `${path}.fa`, 'Persian text is required');
    ok = false;
  }
  if (!isNonEmptyString(value.en)) {
    error(issues, `${path}.en`, 'English text is required');
    ok = false;
  }
  return ok;
}

function checkLocalizedList(issues: Issues, path: string, value: unknown, minimum = 0): void {
  if (!Array.isArray(value)) {
    error(issues, path, 'must be a list');
    return;
  }
  if (value.length < minimum) error(issues, path, `needs at least ${minimum} item(s)`);
  value.forEach((item, index) => checkLocalized(issues, `${path}[${index}]`, item));
}

/**
 * Checks a configuration against the schema. Returns every problem found, not just the
 * first, so a content author can fix a file in one pass.
 */
export function validateExerciseConfig(input: unknown): ValidationResult {
  const issues: Issues = [];
  if (!isRecord(input)) {
    error(issues, '', 'configuration must be an object');
    return { valid: false, issues };
  }

  for (const key of Object.keys(input)) {
    if (!KNOWN_KEYS.has(key)) warn(issues, key, 'unknown field is ignored by this engine version');
  }

  if (input.schemaVersion !== ENGINE_SCHEMA_VERSION) {
    error(issues, 'schemaVersion', `must be ${ENGINE_SCHEMA_VERSION}`);
  }

  if (!isNonEmptyString(input.id) || !ID_PATTERN.test(input.id)) {
    error(issues, 'id', 'must be kebab-case (lowercase letters, digits and single hyphens)');
  }

  checkLocalized(issues, 'name', input.name);
  checkLocalizedList(issues, 'alternativeNames', input.alternativeNames ?? []);
  checkLocalizedList(issues, 'equipment', input.equipment, 1);

  if (!DIFFICULTIES.includes(input.difficulty as Difficulty)) {
    error(issues, 'difficulty', `must be one of ${DIFFICULTIES.join(', ')}`);
  }

  if (!isRecord(input.muscles)) {
    error(issues, 'muscles', 'must contain primary and secondary lists');
  } else {
    checkLocalizedList(issues, 'muscles.primary', input.muscles.primary, 1);
    checkLocalizedList(issues, 'muscles.secondary', input.muscles.secondary);
  }

  if (!isRecord(input.instructions)) {
    error(issues, 'instructions', 'must be an object');
  } else {
    for (const field of ['setup', 'start', 'finish', 'breathing', 'tempo'] as const) {
      checkLocalized(issues, `instructions.${field}`, input.instructions[field]);
    }
    checkLocalizedList(issues, 'instructions.execution', input.instructions.execution, 1);
  }

  checkLocalizedList(issues, 'commonMistakes', input.commonMistakes ?? []);
  checkLocalizedList(issues, 'safetyNotes', input.safetyNotes ?? []);

  if (!isRecord(input.motion)) {
    error(issues, 'motion', 'must reference a movement loop');
  } else {
    if (!isNonEmptyString(input.motion.id)) error(issues, 'motion.id', 'is required');
    const duration = input.motion.durationSeconds;
    if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) {
      error(issues, 'motion.durationSeconds', 'must be a positive number');
    }
  }

  checkPhases(issues, input.phases);

  if (!isRecord(input.model)) {
    error(issues, 'model', 'must describe the model asset and its rig');
  } else {
    if (typeof input.model.asset !== 'string' || !ASSET_PATTERN.test(input.model.asset)) {
      error(issues, 'model.asset', 'must be an absolute path to a .glb or .gltf file');
    }
    if (!isNonEmptyString(input.model.rig) || !RIG_PATTERN.test(input.model.rig)) {
      error(issues, 'model.rig', 'must name the rig standard, e.g. makehuman-cc0');
    }
  }

  if (!isRecord(input.camera)) {
    error(issues, 'camera', 'must define a default view');
  } else {
    if (!CAMERA_VIEWS.includes(input.camera.defaultView as CameraView)) {
      error(issues, 'camera.defaultView', `must be one of ${CAMERA_VIEWS.join(', ')}`);
    }
    const recommended = input.camera.recommendedViews;
    if (!Array.isArray(recommended) || !recommended.every((view) => CAMERA_VIEWS.includes(view as CameraView))) {
      error(issues, 'camera.recommendedViews', 'must list only known camera views');
    }
  }

  if (!isRecord(input.playback)) {
    error(issues, 'playback', 'must define a default speed and loop flag');
  } else {
    if (!PLAYBACK_SPEEDS.includes(input.playback.defaultSpeed as PlaybackSpeed)) {
      error(issues, 'playback.defaultSpeed', `must be one of ${PLAYBACK_SPEEDS.join(', ')}`);
    }
    if (typeof input.playback.loop !== 'boolean') error(issues, 'playback.loop', 'must be true or false');
  }

  if (!isRecord(input.validation)) {
    error(issues, 'validation', 'must state the validation status');
  } else {
    if (!VALIDATION_STATUSES.includes(input.validation.status as ValidationStatus)) {
      error(issues, 'validation.status', `must be one of ${VALIDATION_STATUSES.join(', ')}`);
    }
    if (typeof input.validation.notes !== 'string') error(issues, 'validation.notes', 'must be text');
  }

  if (!Array.isArray(input.sources)) {
    error(issues, 'sources', 'must be a list');
  } else {
    input.sources.forEach((source, index) => {
      if (!isRecord(source) || !isNonEmptyString(source.title) || !isNonEmptyString(source.url)) {
        error(issues, `sources[${index}]`, 'needs a title and a URL');
      }
    });
  }

  if (!isRecord(input.license)) {
    error(issues, 'license', 'must record the asset licence and attribution');
  } else {
    for (const field of ['asset', 'licence', 'attribution'] as const) {
      if (!isNonEmptyString(input.license[field])) error(issues, `license.${field}`, 'is required');
    }
  }

  return { valid: !issues.some((issue) => issue.severity === 'error'), issues };
}

function checkPhases(issues: Issues, phases: unknown): void {
  if (!Array.isArray(phases) || phases.length === 0) {
    error(issues, 'phases', 'needs at least one phase');
    return;
  }
  const seen = new Set<string>();
  let previous = -Infinity;
  phases.forEach((phase, index) => {
    const path = `phases[${index}]`;
    if (!isRecord(phase)) {
      error(issues, path, 'must be an object');
      return;
    }
    if (!isNonEmptyString(phase.id)) error(issues, `${path}.id`, 'is required');
    else if (seen.has(phase.id)) error(issues, `${path}.id`, `duplicate phase id ${phase.id}`);
    else seen.add(phase.id);
    checkLocalized(issues, `${path}.label`, phase.label);
    if (phase.instruction !== undefined) checkLocalized(issues, `${path}.instruction`, phase.instruction);
    const at = phase.at;
    if (typeof at !== 'number' || !Number.isFinite(at) || at < 0 || at >= 1) {
      error(issues, `${path}.at`, 'must be a number from 0 up to, not including, 1');
    } else if (at <= previous) {
      error(issues, `${path}.at`, 'phases must be strictly increasing');
    } else {
      previous = at;
    }
  });
  const first = phases[0];
  if (isRecord(first) && first.at !== 0) error(issues, 'phases[0].at', 'the first phase must start at 0');
}
