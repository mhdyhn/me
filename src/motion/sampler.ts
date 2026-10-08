import { Matrix4, Quaternion, Vector3, type Object3D } from 'three';
import { hingeAxis, restDirection, type RestSkeleton } from './skeleton';
import type { JointRotation, MotionDefinition, MotionFixture, Pose } from './types';

const DEG = Math.PI / 180;

export interface BoneAxes {
  x: Vector3;
  y: Vector3;
  z: Vector3;
  hinge: Vector3 | null;
  twist: Vector3 | null;
}

/**
 * Hinge joints, signed so a positive angle bends the joint the way the movement
 * needs it: elbow flexion, knee flexion (heel travels back and up) and ankle
 * plantarflexion (toes press down, heel lifts). The convention tests pin the
 * signs down; see the motion notes for the flat-foot rule.
 */
const HINGE_JOINTS: { bone: string; parent: string; joint: string; child: string; sign: 1 | -1 }[] = [
  { bone: 'lowerarm_l', parent: 'upperarm_l', joint: 'lowerarm_l', child: 'hand_l', sign: 1 },
  { bone: 'lowerarm_r', parent: 'upperarm_r', joint: 'lowerarm_r', child: 'hand_r', sign: 1 },
  { bone: 'calf_l', parent: 'thigh_l', joint: 'calf_l', child: 'foot_l', sign: 1 },
  { bone: 'calf_r', parent: 'thigh_r', joint: 'calf_r', child: 'foot_r', sign: 1 },
  { bone: 'foot_l', parent: 'calf_l', joint: 'foot_l', child: 'ball_l', sign: -1 },
  { bone: 'foot_r', parent: 'calf_r', joint: 'foot_r', child: 'ball_r', sign: -1 },
];

/**
 * Finger chains. The three joints of a finger bend in one plane, so the axis is
 * derived once per finger from its own two segments and reused by the knuckle, the
 * middle joint and the tip; deriving it per segment would let a curl spiral.
 */
/**
 * Bones whose own long axis is an explicit channel. The forearm uses it for
 * pronation; the upper arm uses it for the humerus rotation that decides which
 * plane the elbow bends in, which keeps the shoulder angles small and readable.
 */
const TWIST_AXES: Record<string, string> = {
  lowerarm_l: 'hand_l',
  lowerarm_r: 'hand_r',
  upperarm_l: 'lowerarm_l',
  upperarm_r: 'lowerarm_r',
};

interface Frame {
  t: number;
  label: string;
  phase: number;
  root: Vector3;
  rotations: Map<string, Required<JointRotation>>;
}

export interface EquipmentPlacement {
  kind: 'dumbbell' | 'barbell' | 'cable';
  side: 'l' | 'r' | 'both';
  position: Vector3;
  quaternion: Quaternion;
  /** Cable attachment point: where the rope leaves the machine. */
  anchor?: Vector3;
}

export interface MotionState {
  motion: MotionDefinition;
  rest: RestSkeleton;
  frames: Frame[];
  axes: Map<string, BoneAxes>;
  rotation: Map<string, Required<JointRotation>>;
  delta: Map<string, Quaternion>;
  local: Map<string, Quaternion>;
  localPosition: Map<string, Vector3>;
  worldPosition: Map<string, Vector3>;
  worldQuaternion: Map<string, Quaternion>;
  rootOffset: Vector3;
  keyLabel: string;
  keyPhase: number;
  equipment: EquipmentPlacement[];
  /** Body-anchored equipment resolved per placement (bar across the upper back). */
  anchors: { bone: string; offset: Vector3 }[];
  fixtures: MotionFixture[];
  plantBones: string[];
  plantRest: Vector3[];
}

const IDENTITY = new Quaternion();

function fullRotation(pose: Pose, bone: string): Required<JointRotation> {
  const rotation = pose[bone];
  return {
    x: rotation?.x ?? 0,
    y: rotation?.y ?? 0,
    z: rotation?.z ?? 0,
    hinge: rotation?.hinge ?? 0,
    twist: rotation?.twist ?? 0,
  };
}

/**
 * Rotation axes of one bone. Every angle is applied in the world axes of the
 * rest pose: the delta is left-multiplied onto the bone's rest world rotation
 * and then transported by the parents, so no per-bone frame conversion happens
 * here. Hinge and twist axes come from the rig itself, so a joint always bends
 * around its own anatomical axis.
 */
export function boneAxes(rest: RestSkeleton, bone: string): BoneAxes {
  const data = rest.bones.get(bone);
  if (!data) throw new Error(`Unknown bone ${bone}`);
  const hinge = HINGE_JOINTS.find((joint) => joint.bone === bone);
  return {
    x: new Vector3(1, 0, 0),
    y: new Vector3(0, 1, 0),
    z: new Vector3(0, 0, 1),
    hinge: hinge ? hingeAxisFor(rest, hinge) : fingerAxis(rest, bone),
    twist: TWIST_AXES[bone] ? handAxis(rest, bone, TWIST_AXES[bone]!) : null,
  };
}

const leftOf = (name: string) => name.replace(/_r$/, '_l');

/** Mirrors a rotation axis taken from the left side onto the right side. */
const mirrorAxis = (axis: Vector3, side: 'l' | 'r') =>
  side === 'r' ? new Vector3(axis.x, -axis.y, -axis.z) : axis.clone();

/**
 * Hinge axis for one joint. Right-side joints reuse the left joint's axis,
 * mirrored, so a symmetric pose stays symmetric even though the rig's rest data
 * is a fraction of a degree away from a perfect mirror.
 */
/** Knuckle-to-tip bend axis of one finger, mirrored onto the right hand. */
function fingerAxis(rest: RestSkeleton, bone: string): Vector3 | null {
  const match = /^(index|middle|ring|pinky|thumb)_0[123]_[lr]$/.exec(bone);
  if (!match) return null;
  const finger = match[1]!;
  const side = bone.endsWith('_r') ? 'r' : 'l';
  const chain = [`${finger}_01_l`, `${finger}_02_l`, `${finger}_03_l`];
  const axis = hingeAxis(rest, chain[0]!, chain[1]!, chain[2]!, 1);
  return mirrorAxis(axis, side);
}

function hingeAxisFor(rest: RestSkeleton, joint: { parent: string; joint: string; child: string; sign: 1 | -1 }): Vector3 {
  const axis = hingeAxis(rest, leftOf(joint.parent), leftOf(joint.joint), leftOf(joint.child), joint.sign);
  // Knee and ankle are medio-lateral joints. The rig only bends them a few
  // degrees at rest, so the derived axis carries a tilt that would splay the
  // legs; snapping them to the world X axis keeps every sagittal pose exact.
  if (joint.joint.startsWith('calf_') || joint.joint.startsWith('foot_')) {
    return new Vector3(Math.sign(axis.x) || 1, 0, 0);
  }
  return mirrorAxis(axis, joint.joint.endsWith('_r') ? 'r' : 'l');
}

/** Long axis of a forearm, mirrored onto the right side. */
function handAxis(rest: RestSkeleton, bone: string, child: string): Vector3 {
  const axis = restDirection(rest, leftOf(bone), leftOf(child));
  return mirrorAxis(axis, bone.endsWith('_r') ? 'r' : 'l');
}

export function createMotionState(rest: RestSkeleton, motion: MotionDefinition): MotionState {
  // The hands close the same way in every key, so the grip is merged under the
  // authored pose rather than repeated in the movement data; a key may still
  // override a single finger by naming it.
  const grip = gripPose(motion);
  const keys = Object.keys(grip).length === 0
    ? motion.keys
    : motion.keys.map((key) => ({ ...key, pose: { ...grip, ...key.pose } }));
  const animatedBones = [...new Set(keys.flatMap((key) => Object.keys(key.pose)))];
  for (const bone of animatedBones) {
    if (!rest.bones.has(bone)) throw new Error(`Motion ${motion.id} animates unknown bone ${bone}`);
  }
  for (const name of motion.plantBones) {
    if (!rest.bones.has(name)) throw new Error(`Motion ${motion.id} plants unknown bone ${name}`);
  }

  const axes = new Map<string, BoneAxes>();
  for (const bone of animatedBones) {
    axes.set(bone, boneAxes(rest, bone));
  }

  const frames: Frame[] = keys.map((key) => ({
    t: key.t,
    label: key.label,
    phase: key.phase,
    root: new Vector3().fromArray(key.root ?? [0, 0, 0]),
    rotations: new Map(animatedBones.map((bone) => [bone, fullRotation(key.pose, bone)])),
  }));

  const rotation = new Map(animatedBones.map((bone) => [bone, fullRotation({}, bone)]));
  const delta = new Map<string, Quaternion>();
  const local = new Map<string, Quaternion>();
  const localPosition = new Map<string, Vector3>();
  const worldPosition = new Map<string, Vector3>();
  const worldQuaternion = new Map<string, Quaternion>();
  for (const name of rest.order) {
    delta.set(name, new Quaternion());
    local.set(name, new Quaternion().copy(rest.bones.get(name)!.localQuaternion));
    localPosition.set(name, new Vector3().copy(rest.bones.get(name)!.localPosition));
    worldPosition.set(name, new Vector3());
    worldQuaternion.set(name, new Quaternion());
  }

  const equipment: EquipmentPlacement[] = [];
  const equipmentAnchors: { bone: string; offset: Vector3 }[] = [];
  for (const item of motion.equipment) {
    if (item.kind === 'dumbbell' && item.grip === 'both-hands') {
      equipment.push(makePlacement('dumbbell', 'l'), makePlacement('dumbbell', 'r'));
    } else if (item.kind === 'cable' && item.grip === 'both-hands') {
      equipment.push(
        makePlacement('cable', 'l', item.pulley?.l),
        makePlacement('cable', 'r', item.pulley?.r),
      );
    } else if (item.kind === 'barbell' && item.grip === 'both-hands') {
      // One bar spanning both hands; the placement below reads the other hand's
      // grip frame, so a single entry is enough.
      equipment.push(makePlacement('barbell', 'l'));
    } else if (item.grip === 'left-hand') {
      equipment.push(makePlacement(item.kind, 'l', item.pulley?.l));
    } else if (item.grip === 'right-hand') {
      equipment.push(makePlacement(item.kind, 'r', item.pulley?.r));
    } else {
      equipment.push({ kind: item.kind, side: 'both', position: new Vector3(), quaternion: new Quaternion() });
      equipmentAnchors.push({
        bone: item.anchorBone ?? 'spine_03',
        offset: new Vector3().fromArray(item.offset ?? [0, 0, 0]),
      });
    }
  }

  const state: MotionState = {
    motion,
    rest,
    frames,
    axes,
    rotation,
    delta,
    local,
    localPosition,
    worldPosition,
    worldQuaternion,
    rootOffset: new Vector3(),
    keyLabel: frames[0]?.label ?? '',
    keyPhase: frames[0]?.phase ?? 0,
    equipment,
    anchors: equipmentAnchors,
    fixtures: motion.fixtures ?? [],
    plantBones: [...motion.plantBones],
    plantRest: motion.plantBones.map((name) => rest.bones.get(name)!.worldPosition.clone()),
  };
  return commit(state);
}

function makePlacement(kind: EquipmentPlacement['kind'], side: 'l' | 'r' | 'both', anchor?: [number, number, number]): EquipmentPlacement {
  return {
    kind,
    side,
    position: new Vector3(),
    quaternion: new Quaternion(),
    anchor: anchor ? new Vector3().fromArray(anchor) : undefined,
  };
}

export function sampleMotion(state: MotionState, phase: number): MotionState {
  const frames = state.frames;
  const count = frames.length;
  const wrapped = ((phase % 1) + 1) % 1;
  let index = count - 1;
  for (let i = 0; i < count; i += 1) {
    if (frames[i]!.t <= wrapped) index = i;
  }
  const from = frames[index]!;
  const to = frames[(index + 1) % count]!;
  const span = ((((to.t - from.t) % 1) + 1) % 1) || 1;
  const local = ((((wrapped - from.t) % 1) + 1) % 1) / span;
  const eased = local * local * (3 - 2 * local);

  for (const [bone, target] of state.rotation) {
    const a = from.rotations.get(bone)!;
    const b = to.rotations.get(bone)!;
    target.x = a.x + (b.x - a.x) * eased;
    target.y = a.y + (b.y - a.y) * eased;
    target.z = a.z + (b.z - a.z) * eased;
    target.hinge = a.hinge + (b.hinge - a.hinge) * eased;
    target.twist = a.twist + (b.twist - a.twist) * eased;
  }
  state.rootOffset.copy(from.root).lerp(to.root, eased);
  state.keyLabel = local < 0.5 ? from.label : to.label;
  state.keyPhase = local < 0.5 ? from.phase : to.phase;
  return commit(state);
}

/** Adds a bone that a one-off pose animates but the motion loop never touches. */
function ensureBone(state: MotionState, bone: string): void {
  if (state.rotation.has(bone)) return;
  if (!state.rest.bones.has(bone)) throw new Error(`Unknown bone ${bone}`);
  state.axes.set(bone, boneAxes(state.rest, bone));
  state.rotation.set(bone, fullRotation({}, bone));
}

/**
 * Applies one exact pose, without interpolation. Useful for a single frame and
 * for tests that pin down what each rotation axis does.
 */
export function applyPose(state: MotionState, pose: Pose, root?: [number, number, number]): MotionState {
  for (const bone of Object.keys(pose)) ensureBone(state, bone);
  for (const [bone, target] of state.rotation) {
    const source = fullRotation(pose, bone);
    target.x = source.x;
    target.y = source.y;
    target.z = source.z;
    target.hinge = source.hinge;
    target.twist = source.twist;
  }
  state.rootOffset.set(0, 0, 0);
  if (root) state.rootOffset.fromArray(root);
  return commit(state);
}

function commit(state: MotionState): MotionState {
  applyRotations(state);
  solveGripTwists(state);
  solveGroundContact(state);
  placeEquipment(state);
  return state;
}

/**
 * Direction a two-hand bar runs in: square to the shoulders, which is how a bar is
 * held and also how the squat's bar is already anchored. Taking it from the shoulders
 * instead of from the hands keeps the direction independent of the very wrist angle
 * the grip solve is about to change.
 */
function barDirection(state: MotionState): Vector3 {
  const left = state.worldPosition.get('upperarm_l') ?? state.worldPosition.get('clavicle_l');
  const right = state.worldPosition.get('upperarm_r') ?? state.worldPosition.get('clavicle_r');
  const axis = left && right ? new Vector3().subVectors(left, right) : new Vector3(1, 0, 0);
  if (axis.lengthSq() < 1e-8) axis.set(1, 0, 0);
  return axis.normalize();
}

/** World direction from the little-finger knuckle to the index knuckle: the palm line. */
function knuckleLine(state: MotionState, side: 'l' | 'r'): Vector3 {
  return new Vector3().subVectors(
    state.worldPosition.get(`index_01_${side}`)!,
    state.worldPosition.get(`pinky_01_${side}`)!,
  ).normalize();
}

/**
 * A handle held in both hands runs along the line that joins them, so each wrist rolls
 * until its palm line lies on that line. Without this the hand keeps the orientation
 * its shoulder happened to give it and the bar crosses the palm — the "open hand on a
 * bar" look that reads as a fake grip. Single-hand holds are left alone: there the
 * handle follows the hand, so any wrist reads as a grip.
 */
function solveGripTwists(state: MotionState): void {
  // Tools that need the raw authored wrists (the angle tables, the fitting scripts)
  // can switch the rule off with MOTION_NO_GRIP_SOLVE=1.
  if (process.env.MOTION_NO_GRIP_SOLVE === '1') return;
  // Only a barbell runs straight through both hands; a pair of dumbbells or two cable
  // handles each follow their own hand, so their wrists stay as the pose authored them.
  const holds = state.motion.equipment.some((item) => item.kind === 'barbell');
  if (!holds) return;
  for (let pass = 0; pass < 4; pass += 1) {
    const target = barDirection(state);

    let changed = false;
    for (const side of ['l', 'r'] as const) {
      const forearm = `lowerarm_${side}`;
      if (!state.rotation.has(forearm)) continue;
      const line = knuckleLine(state, side);
      const axis = new Vector3().subVectors(
        state.worldPosition.get(`hand_${side}`)!,
        state.worldPosition.get(forearm)!,
      );
      if (axis.lengthSq() < 1e-10) continue;
      axis.normalize();
      const lineFlat = line.clone().addScaledVector(axis, -line.dot(axis));
      const targetFlat = target.clone().addScaledVector(axis, -target.dot(axis));
      if (lineFlat.lengthSq() < 1e-6 || targetFlat.lengthSq() < 1e-6) continue;
      lineFlat.normalize();
      targetFlat.normalize();
      let angle = Math.atan2(
        new Vector3().crossVectors(lineFlat, targetFlat).dot(axis),
        lineFlat.dot(targetFlat),
      ) * (180 / Math.PI);
      if (angle > 90) angle -= 180;
      else if (angle < -90) angle += 180;
      if (Math.abs(angle) < 0.05) continue;
      const rotation = state.rotation.get(forearm)!;
      // The right side's twist axis is the mirrored rest direction, which reverses the
      // sense of the same world rotation, so its step is negated.
      rotation.twist = (rotation.twist ?? 0) + (side === 'l' ? angle : -angle);
      changed = true;
      void pass;
    }
    if (!changed) return;
    applyRotations(state);
  }
}

function applyRotations(state: MotionState): void {
  const scratch = new Vector3();
  for (const name of state.rest.order) {
    const bone = state.rest.bones.get(name)!;
    const parentDelta = bone.parent ? state.delta.get(bone.parent)! : IDENTITY;
    const delta = state.delta.get(name)!;
    const local = state.local.get(name)!;
    const axes = state.axes.get(name);

    if (axes) {
      const rotation = state.rotation.get(name)!;
      const composed = new Quaternion().identity();
      const steps: [Vector3 | null, number][] = [
        [axes.z, rotation.z],
        [axes.y, rotation.y],
        [axes.x, rotation.x],
        [axes.hinge, rotation.hinge],
        [axes.twist, rotation.twist],
      ];
      for (const [axis, degrees] of steps) {
        if (!axis || degrees === 0) continue;
        composed.multiply(new Quaternion().setFromAxisAngle(axis, degrees * DEG));
      }
      delta.copy(parentDelta).multiply(composed);
      local.copy(composed).multiply(bone.localQuaternion);
    } else {
      delta.copy(parentDelta);
      local.copy(bone.localQuaternion);
    }

    state.worldQuaternion.get(name)!.copy(delta).multiply(bone.worldQuaternion);

    const worldPosition = state.worldPosition.get(name)!;
    if (!bone.parent) {
      worldPosition.copy(bone.worldPosition).add(state.rootOffset);
      state.localPosition.get(name)!.copy(bone.localPosition).add(state.rootOffset);
    } else {
      const parentPosition = state.worldPosition.get(bone.parent)!;
      const parentQuaternion = state.worldQuaternion.get(bone.parent)!;
      scratch.copy(bone.localPosition).applyQuaternion(parentQuaternion);
      worldPosition.copy(parentPosition).add(scratch);
    }
  }
}

/** Solves the root shift that keeps the declared contact bones at their rest spot. */
function solveGroundContact(state: MotionState): void {
  if (state.plantBones.length === 0) return;
  const shift = new Vector3();
  state.plantBones.forEach((name, index) => {
    shift.add(new Vector3().subVectors(state.plantRest[index]!, state.worldPosition.get(name)!).multiplyScalar(1 / state.plantBones.length));
  });
  if (shift.lengthSq() < 1e-12) return;
  state.rootOffset.add(shift);
  for (const position of state.worldPosition.values()) position.add(shift);
  const root = state.rest.bones.get('Root');
  if (root) {
    const parentInverse = new Quaternion().setFromRotationMatrix(new Matrix4().makeRotationFromQuaternion(root.parentWorldQuaternion)).invert();
    state.localPosition.get('Root')!.add(shift.clone().applyQuaternion(parentInverse));
  }
}

/**
 * A handle is held in the palm, so the frame comes from the palm and not from the
 * splayed finger bases of the rest pose. Every number here is measured once on the
 * rest skeleton, in the hand bone's own frame, and then carried by the hand's posed
 * rotation; that way a relaxed rest hand still grips a bar square.
 */
interface PalmFrame {
  /** Point on the bone plane where the handle sits, relative to the hand bone. */
  seat: Vector3;
  /** Handle height already baked into `seat`; the caller adds the handle radius. */
  rise: number;
  /** The hand's long axis, from the wrist toward the knuckles. */
  forward: Vector3;
  /** Direction from the little finger toward the index finger: the handle's own axis. */
  handle: Vector3;
  /** Out of the palm, the side the fingers close onto. */
  palm: Vector3;
}

/**
 * Where the handle sits in the palm, and how thick the skin is over the bone plane.
 * Both are fitted against the shipped mesh by `tools/grip-fit.ts`; they are read on
 * every call so that tool can sweep them without recompiling the sampler.
 */
export const GRIP = {
  /** Fraction of the wrist-to-knuckle axis the handle sits at. */
  seat: 0.85,
  /** Skin over the bone plane, measured on the shipped mesh. */
  skin: 0.01,
};

/** Radius of the handle a hold wraps around. */
export function handleRadius(kind: 'barbell' | 'dumbbell' | 'cable'): number {
  if (kind === 'dumbbell') return 0.017;
  if (kind === 'cable') return 0.016;
  return 0.014;
}

const palmFrames = new WeakMap<RestSkeleton, Map<string, PalmFrame>>();

function restPalmFrame(state: MotionState, side: 'l' | 'r'): PalmFrame {
  let frames = palmFrames.get(state.rest);
  if (!frames) {
    frames = new Map();
    palmFrames.set(state.rest, frames);
  }
  // The seat is baked into the cached frame, so the cache key carries it: tools that
  // sweep the grip would otherwise keep reading the first seat they asked for.
  const key = `${side}@${GRIP.seat}`;
  const cached = frames.get(key);
  if (cached) return cached;

  const hand = state.rest.bones.get(`hand_${side}`)!;
  const index = state.rest.bones.get(`index_01_${side}`)!.worldPosition;
  const middle = state.rest.bones.get(`middle_01_${side}`)!.worldPosition;
  const pinky = state.rest.bones.get(`pinky_01_${side}`)!.worldPosition;
  const knuckles = new Vector3().addVectors(index, pinky).multiplyScalar(0.5).lerp(middle, 0.5);

  // The bar lies along the knuckles themselves — that is the line a real bar follows —
  // so the palm line is taken raw and the wrist-to-knuckle axis is squared up to it
  // instead.
  const handle = new Vector3().subVectors(index, pinky);
  if (handle.lengthSq() < 1e-10) handle.set(side === 'l' ? -1 : 1, 0, 0);
  handle.normalize();
  const forward = new Vector3().subVectors(knuckles, hand.worldPosition);
  forward.addScaledVector(handle, -forward.dot(handle));
  if (forward.lengthSq() < 1e-10) forward.set(0, 0, 1).addScaledVector(handle, -handle.z);
  forward.normalize();
  let palm = new Vector3().crossVectors(handle, forward).normalize();

  // The palm side is the side a fingertip travels to when its knuckle flexes, which the
  // rig answers with the knuckle's own hinge axis.
  const finger = new Vector3().subVectors(
    state.rest.bones.get(`index_02_${side}`)!.worldPosition,
    state.rest.bones.get(`index_01_${side}`)!.worldPosition,
  );
  const hinge = boneAxes(state.rest, `index_01_${side}`).hinge;
  if (hinge && finger.lengthSq() > 1e-10) {
    const curl = new Vector3().crossVectors(hinge, finger.normalize());
    if (curl.dot(palm) < 0) palm.negate();
  }

  const seat = new Vector3()
    .lerpVectors(hand.worldPosition, knuckles, GRIP.seat)
    .sub(hand.worldPosition);
  const frame: PalmFrame = { seat, rise: 0, forward, handle, palm };
  frames.set(key, frame);
  return frame;
}

/**
 * How a hand closes around a handle. The knuckle takes most of the bend, the middle
 * joint follows, and the tip tucks in behind the handle, which is what a real grip
 * looks like — an open hand resting on the bar is the giveaway of a fake one.
 */
export interface FingerCurl {
  mcp: number;
  pip: number;
  dip: number;
}

export const CURL: Record<'barbell' | 'dumbbell' | 'cable', Record<string, FingerCurl>> = {
  barbell: {
    index: { mcp: 30, pip: 75, dip: 0 },
    middle: { mcp: 30, pip: 85, dip: 0 },
    ring: { mcp: 20, pip: 85, dip: 0 },
    pinky: { mcp: 20, pip: 60, dip: 0 },
    thumb: { mcp: 20, pip: 50, dip: 0 },
  },
  dumbbell: {
    index: { mcp: 30, pip: 75, dip: 0 },
    middle: { mcp: 30, pip: 85, dip: 0 },
    ring: { mcp: 20, pip: 85, dip: 0 },
    pinky: { mcp: 20, pip: 60, dip: 0 },
    thumb: { mcp: 20, pip: 50, dip: 0 },
  },
  cable: {
    index: { mcp: 30, pip: 75, dip: 0 },
    middle: { mcp: 30, pip: 85, dip: 0 },
    ring: { mcp: 20, pip: 85, dip: 0 },
    pinky: { mcp: 20, pip: 60, dip: 0 },
    thumb: { mcp: 20, pip: 50, dip: 0 },
  },
};/**
 * Finger bend for every hand a movement loads. The bar on the upper back is still
 * held by both hands, so that grip closes as well; a push-up holds nothing and keeps
 * the rest hand.
 */
function gripPose(motion: MotionDefinition): Pose {
  const pose: Pose = {};
  for (const item of motion.equipment) {
    const sides: ('l' | 'r')[] =
      item.grip === 'left-hand' ? ['l'] : item.grip === 'right-hand' ? ['r'] : ['l', 'r'];
    for (const side of sides) {
      for (const [finger, curl] of Object.entries(CURL[item.kind])) {
        pose[`${finger}_01_${side}`] = { hinge: curl.mcp };
        pose[`${finger}_02_${side}`] = { hinge: curl.pip };
        pose[`${finger}_03_${side}`] = { hinge: curl.dip };
      }
    }
  }
  return pose;
}

/** World frame of one hand: where the handle sits, the axis it runs along, the palm side. */
export function handFrame(state: MotionState, side: 'l' | 'r', radius = 0.014): { position: Vector3; x: Vector3; y: Vector3 } {
  const frame = restPalmFrame(state, side);
  const rise = GRIP.skin + radius;
  const bone = `hand_${side}`;
  const rest = state.rest.bones.get(bone)!;
  // How far the hand has turned since the rest pose; the frame turns with it.
  const turn = state.worldQuaternion.get(bone)!.clone().multiply(rest.worldQuaternion.clone().invert());
  const position = frame.seat.clone().addScaledVector(frame.palm, rise - frame.rise)
    .applyQuaternion(turn).add(state.worldPosition.get(bone)!);
  const handle = frame.handle.clone().applyQuaternion(turn).normalize();
  const forward = frame.forward.clone().applyQuaternion(turn).normalize();
  return { position, x: handle, y: forward };
}

function placeEquipment(state: MotionState): void {
  let anchorIndex = 0;
  state.equipment.forEach((placement) => {
    const radius = handleRadius(placement.kind);
    if (placement.kind === 'barbell') {
      // One bar, and it runs through the two palms: whether the movement holds it in
      // front (a press, a curl) or lays it on the upper back (a squat), the hands are
      // what the bar is in, so the grip never has to be guessed from an offset.
      const left = handFrame(state, 'l', radius);
      const right = handFrame(state, 'r', radius);
      const axis = new Vector3().subVectors(left.position, right.position);
      if (axis.lengthSq() < 1e-8) axis.copy(barDirection(state));
      axis.normalize();
      const y = left.y.clone().addScaledVector(axis, -left.y.dot(axis));
      if (y.lengthSq() < 1e-6) y.set(0, 1, 0).addScaledVector(axis, -axis.y);
      y.normalize();
      placement.position.addVectors(left.position, right.position).multiplyScalar(0.5);
      placement.quaternion.setFromRotationMatrix(
        new Matrix4().makeBasis(axis, y, new Vector3().crossVectors(axis, y)),
      );
      return;
    }
    if (placement.side === 'both') {
      const anchor = state.anchors[anchorIndex++]!;
      const delta = state.delta.get(anchor.bone);
      const offset = anchor.offset.clone();
      if (delta) offset.applyQuaternion(delta);
      placement.position.copy(state.worldPosition.get(anchor.bone)!).add(offset);
      const axis = barDirection(state);
      const up = new Vector3().subVectors(state.worldPosition.get('spine_03')!, state.worldPosition.get('pelvis')!);
      const y = up.addScaledVector(axis, -up.dot(axis));
      if (y.lengthSq() < 1e-6) y.set(0, 1, 0).addScaledVector(axis, -axis.y);
      y.normalize();
      placement.quaternion.setFromRotationMatrix(
        new Matrix4().makeBasis(axis, y, new Vector3().crossVectors(axis, y)),
      );
      return;
    }

    const side = placement.side as 'l' | 'r';
    const frame = handFrame(state, side, radius);
    placement.position.copy(frame.position);
    placement.quaternion.setFromRotationMatrix(
      new Matrix4().makeBasis(frame.x, frame.y, new Vector3().crossVectors(frame.x, frame.y)),
    );
  });
}

/** Copies the sampled pose onto the live skeleton. */
/**
 * Writes the sampled loop onto a loaded skeleton.
 *
 * The sampler composes every joint around axes taken from the rest pose in world
 * space, so `worldQuaternion` is the value the tests, the offline renderer and
 * the joint tables all describe. Three.js instead applies a bone's quaternion
 * inside its parent's frame, so the world target has to be converted back with
 * the parent's posed rotation — copying the raw local rotation bends every joint
 * around the wrong axis as soon as its parent is not in its rest orientation.
 */
export function applyMotionToBones(state: MotionState, bones: Map<string, Object3D>): void {
  const parentWorld = new Quaternion();
  for (const name of state.rest.order) {
    const object = bones.get(name);
    if (!object) continue;
    const rest = state.rest.bones.get(name)!;
    const target = state.worldQuaternion.get(name)!;
    if (rest.parent) {
      parentWorld.copy(state.worldQuaternion.get(rest.parent)!);
      object.quaternion.copy(parentWorld.invert().multiply(target));
    } else {
      // A root bone answers to the model's armature, not to another bone.
      if (object.parent) object.parent.getWorldQuaternion(parentWorld);
      else parentWorld.identity();
      object.quaternion.copy(parentWorld.invert().multiply(target));
      object.position.copy(state.localPosition.get(name)!);
    }
  }
}

/** Restores the rest pose, so a figure never keeps a stale pose after unmount. */
export function resetBones(state: MotionState, bones: Map<string, Object3D>): void {
  for (const name of state.rest.order) {
    const object = bones.get(name);
    const rest = state.rest.bones.get(name);
    if (!object || !rest) continue;
    object.quaternion.copy(rest.localQuaternion);
    object.position.copy(rest.localPosition);
  }
}

/** Loop position of a movement phase, used to sync the written steps with the model. */
export function phaseToTime(state: MotionState, phase: number): number | null {
  const frame = state.frames.find((entry) => entry.phase === phase);
  return frame ? frame.t : null;
}
