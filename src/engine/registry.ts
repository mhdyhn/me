/**
 * Exercise registry: validates configurations once, when they are registered, and then
 * answers lookups. A configuration that fails validation is kept out of the registry and
 * reported, so the viewer never receives half-formed content.
 */
import { describeError, EngineError, type EngineErrorInfo } from './errors';
import { validateExerciseConfig, type ConfigIssue, type EngineExerciseConfig } from './schema';

export interface RegistryOptions {
  /** Movement loop ids that exist. A configuration pointing elsewhere is rejected. */
  motionIds?: ReadonlySet<string>;
  /** Rig standards the viewer can drive. Configurations on other rigs are rejected. */
  supportedRigs?: readonly string[];
}

export interface RejectedConfig {
  /** Best-effort id, so the report can name the file. */
  id: string;
  issues: ConfigIssue[];
}

export interface RegistryReport {
  accepted: string[];
  rejected: RejectedConfig[];
}

export type OpenResult =
  | { ok: true; config: EngineExerciseConfig }
  | { ok: false; error: EngineErrorInfo; detail: string };

/**
 * Normalises a caller-supplied id: trims, lowercases and accepts underscores, so
 * `barbell_bench_press` and `barbell-bench-press` both resolve. Returns null for input
 * that cannot be an id at all.
 */
export function normaliseExerciseId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const id = raw.trim().toLowerCase().replace(/_/g, '-');
  return id.length > 0 ? id : null;
}

export interface ExerciseRegistry {
  readonly report: RegistryReport;
  list(): EngineExerciseConfig[];
  has(id: string): boolean;
  get(id: string): EngineExerciseConfig | undefined;
  open(id: unknown): OpenResult;
}

export function createRegistry(inputs: readonly unknown[], options: RegistryOptions = {}): ExerciseRegistry {
  const configs = new Map<string, EngineExerciseConfig>();
  const report: RegistryReport = { accepted: [], rejected: [] };
  const rigs = options.supportedRigs ?? ['makehuman-cc0'];

  for (const input of inputs) {
    const claimed = typeof input === 'object' && input !== null && 'id' in input ? String((input as { id: unknown }).id) : '';
    const result = validateExerciseConfig(input);
    const issues = [...result.issues];
    const config = input as EngineExerciseConfig;

    if (result.valid) {
      if (configs.has(config.id)) {
        issues.push({ path: 'id', message: `duplicate id ${config.id}`, severity: 'error' });
      }
      if (!rigs.includes(config.model.rig)) {
        issues.push({ path: 'model.rig', message: `rig ${config.model.rig} is not supported`, severity: 'error' });
      }
      if (options.motionIds && !options.motionIds.has(config.motion.id)) {
        issues.push({ path: 'motion.id', message: `movement ${config.motion.id} is not in the library`, severity: 'error' });
      }
    }

    if (issues.some((issue) => issue.severity === 'error')) {
      report.rejected.push({ id: claimed, issues });
      continue;
    }
    configs.set(config.id, config);
    report.accepted.push(config.id);
  }

  const get = (id: string) => configs.get(id);

  return {
    report,
    list: () => [...configs.values()],
    has: (id) => configs.has(id),
    get,
    open(raw) {
      const id = normaliseExerciseId(raw);
      if (!id) {
        const error = describeError('invalid-exercise-id');
        return { ok: false, error, detail: `not a usable id: ${JSON.stringify(raw)}` };
      }
      const config = configs.get(id);
      if (!config) {
        return { ok: false, error: describeError('invalid-exercise-id'), detail: `no exercise called ${id}` };
      }
      return { ok: true, config };
    },
  };
}

/** Throws an EngineError for callers that prefer exceptions to result objects. */
export function requireExercise(registry: ExerciseRegistry, raw: unknown): EngineExerciseConfig {
  const result = registry.open(raw);
  if (!result.ok) throw new EngineError(result.error.code, result.detail);
  return result.config;
}
