export interface ExercisePrescription {
  sets: number;
  minReps: number;
  maxReps: number;
  targetRirLabel: string;
  minimumRir: number;
  restSeconds: number;
  note?: string;
}

export interface WorkoutExercise {
  exerciseId: string;
  /** Persian name from the programme. Shown even when the movement has no 3D catalogue entry. */
  name: string;
  prescription: ExercisePrescription;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  dayLabel: string;
  focus: string;
  durationMinutes: number;
  optional?: boolean;
  description: string;
  exercises: WorkoutExercise[];
}

export interface MovementPhase {
  label: string;
  instruction: string;
}

export interface ExerciseDefinition {
  id: string;
  name: string;
  englishName?: string;
  category: 'Push' | 'Pull' | 'Legs' | 'Core';
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  difficulty: 'Beginner' | 'Intermediate';
  setup: string;
  startPosition: string;
  execution: string[];
  finishPosition: string;
  breathing: string;
  tempo: string;
  commonMistakes: string[];
  safetyCues: string[];
  movementPhases: MovementPhase[];
  machineSetup?: { title: string; points: string[] };
  referenceWeightKg?: number;
  referenceNote?: string;
}

export interface LoggedSet {
  setNumber: number;
  weightKg: number;
  reps: number;
  rir: number;
  notes?: string;
  doneAt: string;
}

export interface SessionExercise {
  exerciseId: string;
  sets: LoggedSet[];
}

export interface RestTimerState {
  endsAt: number | null;
  pausedRemainingSeconds: number | null;
}

export interface WorkoutSession {
  id: string;
  templateId: string;
  name: string;
  startedAt: string;
  completedAt?: string;
  status: 'active' | 'completed' | 'abandoned';
  notes: string;
  exercises: SessionExercise[];
  currentExerciseIndex: number;
  currentSetIndex: number;
  restTimer?: RestTimerState;
}

export interface BodyweightEntry {
  id: string;
  date: string;
  weightKg: number;
  notes?: string;
}

export interface NutritionDay {
  id: string;
  date: string;
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatsG?: number;
  notes: string;
}

export interface WorkingWeightReference {
  label: string;
  weightKg: number;
  note: string;
}

export interface UserProfile {
  age: number;
  sex: string;
  heightCm: number;
  weightKg: number;
  primaryGoal: string;
  secondaryGoal: string;
  trainingExperience: string;
  trainingDays: number;
  sessionMinutes: number;
  dailyActivity: string;
  sleepHours: string;
  stressLevel: number;
  injuries: string;
  equipment: string;
  workingWeightReferences: WorkingWeightReference[];
}

export interface NutritionGoals {
  dailyCalories?: number;
  proteinG: number;
  carbsG?: number;
  fatsG?: number;
}

export interface PreferenceRecord<T = unknown> {
  key: string;
  value: T;
}
