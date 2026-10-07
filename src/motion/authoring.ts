import type {
  JointRotation,
  MotionDefinition,
  MotionEquipment,
  MotionFixture,
  MotionKey,
  MotionStandard,
  PlantBone,
  Pose,
} from './types';

/**
 * Authoring helpers.
 *
 * Every angle is in degrees and acts around a world axis of the model's rest
 * pose, then the parents transport it. The convention tests pin the signs:
 *   x   positive tips the body's front down: an up-pointing bone leans forward,
 *       a hanging bone swings its free end backward.
 *   y   positive turns the figure to its own left.
 *   z   positive lifts the left side, so a limb abducts on the left.
 *   hinge  positive keeps bending what the rig already bends at rest: elbow and
 *       knee flexion, ankle plantarflexion (toes press down, heel lifts).
 *   twist  positive turns the bone about its own long axis.
 */

export const mirror = (rotation: JointRotation): JointRotation => ({
  x: rotation.x,
  y: rotation.y === undefined ? undefined : -rotation.y,
  z: rotation.z === undefined ? undefined : -rotation.z,
  hinge: rotation.hinge,
  twist: rotation.twist === undefined ? undefined : -rotation.twist,
});

/** Adds one bone rotation to a pose. */
export function joint(pose: Pose, bone: string, rotation: JointRotation): Pose {
  pose[bone] = rotation;
  return pose;
}

/** Adds a pair of mirrored limbs: the values describe the left side. */
export function pair(pose: Pose, bone: string, rotation: JointRotation): Pose {
  pose[`${bone}_l`] = rotation;
  pose[`${bone}_r`] = mirror(rotation);
  return pose;
}

/**
 * Ankle angle that keeps the sole flat: it cancels the sagittal rotations the
 * leg inherits (root tilt, pelvis, hip and knee), all of which sit on the world
 * X axis for the knee and ankle, so the sign is the opposite of the chain.
 */
export const flatFoot = (chain: number): number => -chain;

export interface LegAngles {
  pelvis?: number;
  thigh?: number;
  knee?: number;
  /** Stance width and rotation, applied about the world axes on both hips. */
  thighY?: number;
  thighZ?: number;
  /** Extra ankle angle on top of the flat-foot solution. */
  ankle?: number;
}

export interface PoseInputs {
  /** Root pitch: 0 standing, -90 lying on the back, -45 reclined. */
  rootRot?: number;
  legs?: LegAngles;
  /** Total forward lean of the trunk, spread over the three spine bones. */
  torso?: number;
  /** Where the head looks: defaults to cancelling the trunk lean. */
  head?: number;
  arms?: { clavicle?: JointRotation; upperarm?: JointRotation; lowerarm?: JointRotation };
  extra?: Pose;
}

/** Builds one pose from body-relative inputs. */
export function buildPose({ rootRot = 0, legs = {}, torso = 0, head, arms = {}, extra }: PoseInputs): Pose {
  const pose: Pose = {};
  if (rootRot) joint(pose, 'Root', { x: rootRot });
  const pelvis = legs.pelvis ?? 0;
  if (pelvis) joint(pose, 'pelvis', { x: pelvis });
  const thigh = legs.thigh ?? 0;
  const thighRotation: JointRotation = { x: thigh };
  if (legs.thighY) thighRotation.y = legs.thighY;
  if (legs.thighZ) thighRotation.z = legs.thighZ;
  pair(pose, 'thigh', thighRotation);
  const knee = legs.knee ?? 0;
  pair(pose, 'calf', { hinge: knee });
  pair(pose, 'foot', { hinge: flatFoot(rootRot + pelvis + thigh + knee) + (legs.ankle ?? 0) });
  if (torso) {
    const share = torso / 3;
    joint(pose, 'spine_01', { x: share });
    joint(pose, 'spine_02', { x: share });
    joint(pose, 'spine_03', { x: share });
  }
  const headAngle = head ?? -torso;
  if (headAngle) {
    joint(pose, 'neck_01', { x: headAngle * 0.4 });
    joint(pose, 'head', { x: headAngle * 0.6 });
  }
  if (arms.clavicle) pair(pose, 'clavicle', arms.clavicle);
  if (arms.upperarm) pair(pose, 'upperarm', arms.upperarm);
  if (arms.lowerarm) pair(pose, 'lowerarm', arms.lowerarm);
  return extra ? { ...pose, ...extra } : pose;
}

/** Bar across the upper back, behind the shoulders. */
export const backBar = (): MotionEquipment => ({
  kind: 'barbell',
  grip: 'upper-back',
  anchorBone: 'spine_03',
  offset: [0, 0.29, -0.16],
});

export const dumbbells = (): MotionEquipment => ({ kind: 'dumbbell', grip: 'both-hands' });
export const dumbbellLeft = (): MotionEquipment => ({ kind: 'dumbbell', grip: 'left-hand' });
export const barbell = (): MotionEquipment => ({ kind: 'barbell', grip: 'both-hands' });
export const cable = (
  grip: MotionEquipment['grip'],
  pulley: { l?: [number, number, number]; r?: [number, number, number] },
): MotionEquipment => ({ kind: 'cable', grip, pulley });

export const benchFixture = (
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
  size?: [number, number, number],
): MotionFixture => ({ kind: 'bench', position, rotation, size });

export interface MotionSpec {
  id: string;
  name: string;
  summary: string;
  durationSeconds: number;
  plantBones: PlantBone[];
  equipment?: MotionEquipment[];
  fixtures?: MotionFixture[];
  standards: MotionStandard[];
  keys: MotionKey[];
}

export function createMotion(spec: MotionSpec): MotionDefinition {
  const keys = [...spec.keys].sort((a, b) => a.t - b.t);
  if (keys.length < 3) throw new Error(`Motion ${spec.id} needs at least three keys`);
  if (keys[0]!.t !== 0) throw new Error(`Motion ${spec.id} must start at t=0`);
  if (keys[keys.length - 1]!.t !== 1) throw new Error(`Motion ${spec.id} must close the loop at t=1`);
  return {
    id: spec.id,
    name: spec.name,
    summary: spec.summary,
    durationSeconds: spec.durationSeconds,
    plantBones: spec.plantBones,
    equipment: spec.equipment ?? [],
    fixtures: spec.fixtures ?? [],
    standards: spec.standards,
    keys,
  };
}

/** Five-key loop: start, first half, turning point, second half, back to start. */
export function loop(start: MotionKey, mid: MotionKey, turn: MotionKey, back: MotionKey): MotionKey[] {
  return [
    { ...start, t: 0, phase: 0 },
    { ...mid, t: 0.25, phase: 1 },
    { ...turn, t: 0.5, phase: 2 },
    { ...back, t: 0.75, phase: 3 },
    // The loop closes on the pose it started from, but the label says so out
    // loud: the closing key is the return, not the start position again.
    { ...start, t: 1, phase: 4, label: `بازگشت به ${start.label}` },
  ];
}

export const STAND_FEET: PlantBone[] = ['ball_l', 'ball_r'];
