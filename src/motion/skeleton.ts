import { Quaternion, Vector3, type Object3D } from 'three';

/** Rest-pose data for one bone, captured before any animation is applied. */
export interface BoneRest {
  name: string;
  parent: string | null;
  /** Rest rotation of the parent bone in world space (identity for a root bone). */
  parentWorldQuaternion: Quaternion;
  localPosition: Vector3;
  localQuaternion: Quaternion;
  worldPosition: Vector3;
  worldQuaternion: Quaternion;
}

export interface RestSkeleton {
  bones: Map<string, BoneRest>;
  /** Bone names ordered so that every parent precedes its children. */
  order: string[];
}

const isBone = (object: Object3D | null): object is Object3D =>
  Boolean(object && (object as { isBone?: boolean }).isBone);

/**
 * Reads the rest pose of a loaded GLTF scene. Call this before any pose is applied,
 * otherwise the captured rest transforms are already animated.
 */
export function collectRestSkeleton(root: Object3D): RestSkeleton {
  root.updateMatrixWorld(true);
  const boneObjects: Object3D[] = [];
  root.traverse((object) => {
    if (isBone(object)) boneObjects.push(object);
  });

  const bones = new Map<string, BoneRest>();
  for (const bone of boneObjects) {
    const parent = isBone(bone.parent) ? bone.parent : null;
    bones.set(bone.name, {
      name: bone.name,
      parent: parent?.name ?? null,
      parentWorldQuaternion: parent
        ? new Quaternion().setFromRotationMatrix(parent.matrixWorld)
        : new Quaternion(),
      localPosition: bone.position.clone(),
      localQuaternion: bone.quaternion.clone(),
      worldPosition: new Vector3().setFromMatrixPosition(bone.matrixWorld),
      worldQuaternion: new Quaternion().setFromRotationMatrix(bone.matrixWorld),
    });
  }

  const order: string[] = [];
  const visit = (name: string) => {
    order.push(name);
    for (const bone of boneObjects) {
      if (bone.parent?.name === name && isBone(bone.parent)) visit(bone.name);
    }
  };
  for (const bone of boneObjects) {
    if (!isBone(bone.parent)) visit(bone.name);
  }

  return { bones, order };
}

/** Unit vector from `from` to `to` in the rest pose. */
export function restDirection(rest: RestSkeleton, from: string, to: string): Vector3 {
  const a = rest.bones.get(from);
  const b = rest.bones.get(to);
  if (!a || !b) throw new Error(`Unknown bone in rest skeleton: ${from} → ${to}`);
  return b.worldPosition.clone().sub(a.worldPosition).normalize();
}

/**
 * Hinge axis of a joint, expressed in world space at rest and oriented so that a
 * positive angle bends the joint the way the movement wants it.
 */
export function hingeAxis(rest: RestSkeleton, parent: string, joint: string, child: string, sign: 1 | -1): Vector3 {
  const upper = restDirection(rest, parent, joint);
  const lower = restDirection(rest, joint, child);
  const axis = new Vector3().crossVectors(upper, lower);
  if (axis.lengthSq() < 1e-10) throw new Error(`Degenerate hinge axis for ${joint}`);
  return axis.normalize().multiplyScalar(sign);
}
