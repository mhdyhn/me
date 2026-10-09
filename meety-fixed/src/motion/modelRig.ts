import type { Object3D } from 'three';
import { collectRestSkeleton, type RestSkeleton } from './skeleton';
import type { MotionDefinition } from './types';
import { applyMotionToBones, createMotionState, resetBones, sampleMotion, type MotionState } from './sampler';

/**
 * Browser-side rig: takes the loaded GLB scene and binds a movement loop to the
 * skeleton the model ships with. The offline tools (`tools/motion-report.ts`,
 * `tools/render_poses.py`) use the same rest skeleton and sampler, so what the
 * viewer plays is exactly what the tests pin down.
 */
export interface MotionRig {
  rest: RestSkeleton;
  bones: Map<string, Object3D>;
  state: MotionState;
}

export function buildMotionRig(scene: Object3D, motion: MotionDefinition): MotionRig {
  const rest = collectRestSkeleton(scene);
  const bones = new Map<string, Object3D>();
  scene.traverse((object) => {
    if ((object as { isBone?: boolean }).isBone) bones.set(object.name, object);
  });
  // Deforming meshes move outside their rest bounds, so the viewer must not cull them.
  scene.traverse((object) => {
    if ((object as { isMesh?: boolean }).isMesh) object.frustumCulled = false;
  });
  return { rest, bones, state: createMotionState(rest, motion) };
}

/** Samples the loop and writes it onto the live skeleton. */
export function poseRig(rig: MotionRig, phase: number): MotionState {
  const state = sampleMotion(rig.state, phase);
  applyMotionToBones(state, rig.bones);
  return state;
}

/** Puts the skeleton back into its rest pose. */
export function restRig(rig: MotionRig): void {
  resetBones(rig.state, rig.bones);
}

/**
 * Bounding sphere of a loop, so the camera can frame a standing press and a
 * lying press with the same code.
 */
export function motionBounds(rig: MotionRig): { centre: [number, number, number]; radius: number } {
  let count = 0;
  const centre = { x: 0, y: 0, z: 0 };
  const samples = 12;
  for (let step = 0; step < samples; step += 1) {
    poseRig(rig, step / samples);
    for (const position of rig.state.worldPosition.values()) {
      centre.x += position.x;
      centre.y += position.y;
      centre.z += position.z;
      count += 1;
    }
  }
  centre.x /= count;
  centre.y /= count;
  centre.z /= count;
  let radius = 0.5;
  for (let step = 0; step < samples; step += 1) {
    poseRig(rig, step / samples);
    for (const position of rig.state.worldPosition.values()) {
      radius = Math.max(radius, Math.hypot(position.x - centre.x, position.y - centre.y, position.z - centre.z));
    }
  }
  poseRig(rig, 0);
  return { centre: [centre.x, centre.y, centre.z], radius };
}
