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
    hinge: hinge ? hingeAxisFor(rest, hinge) : null,
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
  const animatedBones = [...new Set(motion.keys.flatMap((key) => Object.keys(key.pose)))];
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

  const frames: Frame[] = motion.keys.map((key) => ({
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
  solveGroundContact(state);
  placeEquipment(state);
  return state;
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

/** World axes of the palm line and the forearm direction for one hand. */
function handFrame(state: MotionState, side: 'l' | 'r'): { position: Vector3; x: Vector3; y: Vector3 } {
  const index = state.worldPosition.get(`index_01_${side}`)!;
  const pinky = state.worldPosition.get(`pinky_01_${side}`)!;
  const hand = state.worldPosition.get(`hand_${side}`)!;
  const wrist = state.worldPosition.get(`lowerarm_${side}`)!;

  const handle = new Vector3().subVectors(index, pinky);
  if (handle.lengthSq() < 1e-8) handle.set(side === 'l' ? 1 : -1, 0.2, 0);
  handle.normalize();

  const forearm = new Vector3().subVectors(hand, wrist).normalize();
  const forward = forearm.clone().addScaledVector(handle, -forearm.dot(handle));
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, 1).addScaledVector(handle, -handle.z);
  forward.normalize();

  return {
    position: new Vector3().addVectors(index, pinky).multiplyScalar(0.5),
    x: handle,
    y: forward,
  };
}

function placeEquipment(state: MotionState): void {
  let anchorIndex = 0;
  state.equipment.forEach((placement) => {
    if (placement.side === 'both') {
      const anchor = state.anchors[anchorIndex++]!;
      const delta = state.delta.get(anchor.bone);
      const offset = anchor.offset.clone();
      if (delta) offset.applyQuaternion(delta);
      placement.position.copy(state.worldPosition.get(anchor.bone)!).add(offset);
      const shoulderLeft = state.worldPosition.get('upperarm_l') ?? state.worldPosition.get('clavicle_l')!;
      const shoulderRight = state.worldPosition.get('upperarm_r') ?? state.worldPosition.get('clavicle_r')!;
      const axis = new Vector3().subVectors(shoulderLeft, shoulderRight);
      if (axis.lengthSq() < 1e-8) axis.set(1, 0, 0);
      axis.normalize();
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
    const frame = handFrame(state, side);
    if (placement.kind === 'barbell') {
      const other = handFrame(state, side === 'l' ? 'r' : 'l');
      const axis = new Vector3().subVectors(frame.position, other.position);
      if (axis.lengthSq() < 1e-8) axis.set(1, 0, 0);
      axis.normalize();
      const y = frame.y.clone().addScaledVector(axis, -frame.y.dot(axis));
      if (y.lengthSq() < 1e-6) y.set(0, 1, 0).addScaledVector(axis, -axis.y);
      y.normalize();
      placement.position.addVectors(frame.position, other.position).multiplyScalar(0.5);
      placement.quaternion.setFromRotationMatrix(
        new Matrix4().makeBasis(axis, y, new Vector3().crossVectors(axis, y)),
      );
      return;
    }

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
