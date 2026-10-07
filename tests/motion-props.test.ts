import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { buildSkeletonScene, readGlbJson } from '../src/motion/glbNodes';
import { buildMotionRig, poseRig } from '../src/motion/modelRig';
import { buildPropScene } from '../src/motion/props';
import { motions } from '../src/motion/library';

const scene = () => buildSkeletonScene(readGlbJson(new Uint8Array(readFileSync('public/models/human.glb')))).scene;
const rigFor = (id: string) => buildMotionRig(scene(), motions[id]!);

describe('viewer props', () => {
  it('builds one object per implement and follows the sampled pose', () => {
    const rig = rigFor('barbell-bench-press');
    const props = buildPropScene(rig.state);
    expect(rig.state.equipment).toHaveLength(1);
    // The bench is the fixture, so the barbell is the first prop; it is a shaft
    // plus two plates.
    expect(props.group.children).toHaveLength(2);
    expect(props.group.children[0]!.children).toHaveLength(3);

    const barbell = props.group.children[0]!;
    for (const phase of [0, 0.25, 0.5]) {
      poseRig(rig, phase);
      props.update();
      expect(barbell.position.distanceTo(rig.state.equipment[0]!.position)).toBeLessThan(1e-9);
    }
  });

  it('keeps the bar between the two hands', () => {
    const rig = rigFor('barbell-bench-press');
    const props = buildPropScene(rig.state);
    for (const phase of [0, 0.3, 0.5, 0.8]) {
      const state = poseRig(rig, phase);
      props.update();
      const bar = state.equipment[0]!.position;
      const left = state.worldPosition.get('index_01_l')!.clone().add(state.worldPosition.get('pinky_01_l')!).multiplyScalar(0.5);
      const right = state.worldPosition.get('index_01_r')!.clone().add(state.worldPosition.get('pinky_01_r')!).multiplyScalar(0.5);
      // Symmetric, and the hands sit just inside the plates rather than on the shaft ends.
      expect(Math.abs(left.distanceTo(bar) - right.distanceTo(bar))).toBeLessThan(1e-6);
      expect(left.distanceTo(bar)).toBeLessThan(0.45);
      expect(props.group.children[0]!.position.distanceTo(bar)).toBeLessThan(1e-9);
    }
  });

  it('draws a rope from the pulley to the hand', () => {
    const rig = rigFor('cable-fly');
    const props = buildPropScene(rig.state);
    expect(rig.state.equipment).toHaveLength(2);
    expect(props.group.children).toHaveLength(2);
    poseRig(rig, 0.4);
    props.update();
    rig.state.equipment.forEach((placement, index) => {
      const rope = props.group.children[index]!.children[0] as unknown as { geometry: { getAttribute: (name: string) => { getX: (i: number) => number; getY: (i: number) => number; getZ: (i: number) => number } } };
      const position = rope.geometry.getAttribute('position');
      const start = new Vector3(position.getX(0), position.getY(0), position.getZ(0));
      const end = new Vector3(position.getX(1), position.getY(1), position.getZ(1));
      // The line's vertices are float32, so a hair of rounding is expected.
      expect(start.distanceTo(placement.anchor!)).toBeLessThan(1e-6);
      expect(end.distanceTo(placement.position)).toBeLessThan(1e-6);
      expect(start.distanceTo(end)).toBeGreaterThan(0.3);
    });
  });

  it('draws the fixture of the movement where the pose expects it', () => {
    const rig = rigFor('hanging-leg-raise');
    const props = buildPropScene(rig.state);
    const bar = props.group.children[0]!;
    expect(bar.position.y).toBeCloseTo(2.71, 5);
    // The hands hold the bar instead of floating under it.
    poseRig(rig, 0);
    const hands = rig.state.worldPosition.get('index_01_l')!.clone().add(rig.state.worldPosition.get('pinky_01_l')!).multiplyScalar(0.5);
    expect(Math.abs(hands.y - bar.position.y)).toBeLessThan(0.05);
  });

  it('gives every movement its implements and every fixture its own box', () => {
    for (const motion of Object.values(motions)) {
      const rig = rigFor(motion.id);
      const props = buildPropScene(rig.state);
      const implements_ = rig.state.equipment.length;
      const fixtures = rig.state.fixtures.length;
      // A dumbbell pair is two placements, a barbell or cable pair one each.
      const expected = implements_ + fixtures;
      expect(props.group.children, motion.id).toHaveLength(expected);
      expect(expected, motion.id).toBeGreaterThan(0);
    }
  });
});
