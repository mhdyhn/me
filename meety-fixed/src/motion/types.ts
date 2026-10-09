export interface JointRotation {
  /**
   * Rotation about the world X axis of the bone's rest frame, in degrees.
   * Positive tips the body's front downward: an up-pointing bone leans forward
   * while a down-pointing bone swings its free end backward.
   */
  x?: number;
  /** Rotation in degrees about the world Y axis of the rest frame (vertical twist). */
  y?: number;
  /** Rotation in degrees about the world Z axis of the rest frame; positive lifts the left side. */
  z?: number;
  /** Flexion about the joint's own hinge axis in degrees (positive = more bent). */
  hinge?: number;
  /** Rotation in degrees about the bone's own long axis. */
  twist?: number;
}

export type Pose = Record<string, JointRotation>;

export interface MotionKey {
  /** Position in the loop, 0–1, ascending. */
  t: number;
  /** Index into the exercise's movement phases, used to sync the written steps. */
  phase: number;
  /** Persian label shown while this part of the loop plays. */
  label: string;
  pose: Pose;
  /** Root translation in metres along world axes. */
  root?: [number, number, number];
}

export type MotionGrip = 'both-hands' | 'left-hand' | 'right-hand' | 'upper-back';

export interface MotionEquipment {
  kind: 'dumbbell' | 'barbell' | 'cable';
  grip: MotionGrip;
  /** Pulley anchor in metres for a cable, per side. */
  pulley?: { l?: [number, number, number]; r?: [number, number, number] };
  /** Bone and offset in metres for grips that rest on the body (bar across the upper back). */
  anchorBone?: string;
  offset?: [number, number, number];
}

/** One extra box of a fixture: a backrest, a seat, a chest pad, a upright frame. */
export interface FixturePart {
  /** Offset from the fixture's own centre, in metres, rotated with the fixture. */
  offset: [number, number, number];
  size: [number, number, number];
  /** Rotation around X, then Y, then Z in degrees, on top of the fixture's own. */
  rotation?: [number, number, number];
}

export interface MotionFixture {
  kind: 'bench' | 'machine' | 'pull-up-bar' | 'seat';
  position: [number, number, number];
  /** Rotation around X, Y and Z in degrees, applied in that order. */
  rotation?: [number, number, number];
  /** Box size in metres; the offline renderer falls back to a per-kind default. */
  size?: [number, number, number];
  /** Extra boxes: a seat backrest, a chest pad, and so on. */
  parts?: FixturePart[];
}

/** Ground contact kept fixed by the root solve. */
export type PlantBone = 'foot_l' | 'foot_r' | 'ball_l' | 'ball_r';

export interface MotionStandard {
  /** Persian name of the checkpoint (for example «کمر صاف»). */
  label: string;
  detail: string;
}

export interface MotionDefinition {
  id: string;
  /** Persian label for the movement. */
  name: string;
  /** One-line Persian description of what the loop shows. */
  summary: string;
  /** Seconds for one repetition. */
  durationSeconds: number;
  /** Contact bones whose position is solved so the figure does not slide. */
  plantBones: PlantBone[];
  equipment: MotionEquipment[];
  fixtures?: MotionFixture[];
  /** Form checkpoints verified by the tests and shown next to the viewer. */
  standards: MotionStandard[];
  keys: MotionKey[];
}
