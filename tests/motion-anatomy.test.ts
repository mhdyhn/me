import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { buildSkeletonScene, readGlbJson } from '../src/motion/glbNodes';
import { collectRestSkeleton } from '../src/motion/skeleton';
import { createMotionState } from '../src/motion/sampler';
import { jointRanges, neckAngle, REST_NECK_ANGLE, type JointRange } from '../tools/motion-angles';
import { sampleMotion } from '../src/motion/sampler';
import { motions } from '../src/motion/library';

const { scene } = buildSkeletonScene(readGlbJson(new Uint8Array(readFileSync('public/models/human.glb'))));
const rest = collectRestSkeleton(scene);

const distanceToSegment = (point: Vector3, from: Vector3, to: Vector3) => {
  const span = to.clone().sub(from);
  const along = Math.max(0, Math.min(1, point.clone().sub(from).dot(span) / span.lengthSq()));
  return point.distanceTo(from.clone().addScaledVector(span, along));
};

/**
 * The written form checkpoints only mean something if the loop actually moves
 * the joint that way. These bounds are deliberately wide: they catch a reversed
 * or hyper-extended joint, not a matter of taste.
 */
describe('movement anatomy', () => {
  for (const motion of Object.values(motions)) {
    it(`${motion.id} keeps the neck in line with the trunk`, () => {
      const state = createMotionState(rest, motion);
      for (let step = 0; step < 8; step += 1) {
        sampleMotion(state, step / 8);
        const angle = neckAngle(state);
        // Neutral to tucked only: a bent-over row must not crane the head up,
        // and a crunch may round the neck but never fold it past 30°.
        expect(angle, `${motion.id} at ${step}`).toBeGreaterThan(REST_NECK_ANGLE - 3);
        expect(angle, `${motion.id} at ${step}`).toBeLessThan(REST_NECK_ANGLE + 16);
      }
    });
  }

  for (const motion of Object.values(motions)) {
    it(`${motion.id} moves every joint in a human direction`, () => {
      const ranges = jointRanges(createMotionState(rest, motion));
      const report = (joint: string, range: JointRange) => `${motion.id} ${joint} ${range[0].toFixed(1)}–${range[1].toFixed(1)}`;

      // Knees and elbows bend a lot and never open past straight.
      expect(ranges.knee[1], report('knee', ranges.knee)).toBeLessThan(183);
      expect(ranges.knee[0], report('knee', ranges.knee)).toBeGreaterThan(25);
      expect(ranges.elbow[1], report('elbow', ranges.elbow)).toBeLessThan(183);
      expect(ranges.elbow[0], report('elbow', ranges.elbow)).toBeGreaterThan(15);
      // A hip never folds flatter than a deep squat.
      expect(ranges.hip[0], report('hip', ranges.hip)).toBeGreaterThan(60);
      // The trunk stays inside a hunched-to-tall range, with no neck thrown back.
      expect(ranges.trunk[0], report('trunk', ranges.trunk)).toBeGreaterThan(100);
      expect(ranges.trunk[1], report('trunk', ranges.trunk)).toBeLessThan(185);
    });
  }

  /**
   * A pad only helps if the body really rests on it: a seat has to hold the hips
   * at a steady height for the whole loop, and a chest pad has to stay in front of
   * the chest. Both are measured values, so a pose that drifts off its machine or
   * a pad left behind by an edit fails here instead of in the viewer.
   */
  for (const motion of Object.values(motions)) {
    const seat = motion.fixtures?.find((fixture) => fixture.kind === 'seat');
    const pad = motion.fixtures?.find((fixture) => (fixture.parts?.length ?? 0) > 0);
    if (!seat && !pad) continue;
    it(`${motion.id} rests on the pad of its machine`, () => {
      const state = createMotionState(rest, motion);
      for (let step = 0; step < 8; step += 1) {
        sampleMotion(state, step / 8);
        const pelvis = state.worldPosition.get('pelvis')!;
        const chest = state.worldPosition.get('spine_03')!;
        if (seat) {
          const top = seat.position[1] + (seat.size?.[1] ?? 0.11) / 2;
          const gap = top - pelvis.y;
          // Hips just above the pad, and on the same pad for every phase.
          expect(gap, `${motion.id} hips at ${step}`).toBeGreaterThan(-0.08);
          expect(gap, `${motion.id} hips at ${step}`).toBeLessThan(-0.04);
          const backrest = seat.parts?.[0];
          if (backrest) {
            const centre = new Vector3(...seat.position).add(new Vector3(...backrest.offset));
            expect(distanceToSegment(centre, pelvis, chest), `${motion.id} at ${step}`).toBeLessThan(0.25);
          }
        } else if (pad) {
          const centre = new Vector3(...pad.position).add(new Vector3(...pad.parts![0]!.offset));
          expect(centre.distanceTo(chest), `${motion.id} at ${step}`).toBeLessThan(0.25);
          // In front of the chest, never through it.
          expect(centre.z - chest.z, `${motion.id} at ${step}`).toBeGreaterThan(0);
        }
      }
    });
  }
});

/**
 * The two deep-reviewed movements pin their real form here, so a later edit
 * that lifts the bar off the chest, bends the deadlift's arms or shoves its
 * knees forward fails in CI instead of in the viewer.
 */
describe('movement form', () => {
  /** Anatomical angle at a joint: 180° is straight. */
  const angleAt = (state: ReturnType<typeof createMotionState>, joint: string, a: string, b: string) => {
    const j = state.worldPosition.get(joint)!;
    const toA = state.worldPosition.get(a)!.clone().sub(j).normalize();
    const toB = state.worldPosition.get(b)!.clone().sub(j).normalize();
    return (Math.acos(Math.max(-1, Math.min(1, toA.dot(toB)))) * 180) / Math.PI;
  };
  const elbowAngle = (state: ReturnType<typeof createMotionState>) =>
    angleAt(state, 'lowerarm_l', 'upperarm_l', 'hand_l');

  it('barbell-bench-press touches the chest and holds one grip width', () => {
    const motion = motions['barbell-bench-press']!;
    const state = createMotionState(rest, motion);
    const samples = [0, 0.25, 0.5, 0.75, 1].map((phase) => {
      sampleMotion(state, phase);
      return {
        phase,
        wristX: state.worldPosition.get('hand_l')!.x,
        elbow: elbowAngle(state),
        bar: state.equipment[0]!.position.clone(),
        chest: state.worldPosition.get('spine_03')!.clone(),
      };
    });
    // Lockout: arms straight, bar a full reach above the shoulders.
    expect(samples[0]!.elbow, 'lockout elbow').toBeGreaterThan(170);
    // Touch: the bar rests ON the chest. Lying down, the pad of the chest sits
    // 0.132 m above the spine_03 joint, and the bar is 0.014 m thick.
    const touch = samples[2]!;
    const chestSurface = touch.chest.y + 0.132;
    expect(Math.abs(touch.bar.y - 0.014 - chestSurface), 'bar on the chest').toBeLessThan(0.03);
    // The hands never slide along the bar: one grip width for the whole loop.
    for (const sample of samples) {
      expect(sample.wristX, `grip at ${sample.phase}`).toBeGreaterThan(0.24);
      expect(sample.wristX, `grip at ${sample.phase}`).toBeLessThan(0.38);
    }
  });

  it('romanian-deadlift hinges with straight arms and still knees', () => {
    const motion = motions['romanian-deadlift']!;
    const state = createMotionState(rest, motion);
    const samples = [0, 0.25, 0.5, 0.75, 1].map((phase) => {
      sampleMotion(state, phase);
      return {
        phase,
        elbow: elbowAngle(state),
        pelvis: state.worldPosition.get('pelvis')!.clone(),
        knee: state.worldPosition.get('calf_l')!.clone(),
        ankle: state.worldPosition.get('foot_l')!.clone(),
        shoulder: state.worldPosition.get('upperarm_l')!.clone(),
        bar: state.equipment[0]!.position.clone(),
      };
    });
    for (const sample of samples) {
      // A deadlift never bends its elbows.
      expect(sample.elbow, `elbow at ${sample.phase}`).toBeGreaterThan(165);
      // The knees stay over the ankles instead of shoving forward.
      expect(Math.abs(sample.knee.z - sample.ankle.z), `knee at ${sample.phase}`).toBeLessThan(0.1);
      // The arms hang plumb: the bar rides the vertical line under the shoulders.
      expect(Math.abs(sample.bar.z - sample.shoulder.z), `bar at ${sample.phase}`).toBeLessThan(0.08);
      const reach = sample.shoulder.y - sample.bar.y;
      expect(reach, `reach at ${sample.phase}`).toBeGreaterThan(0.55);
      expect(reach, `reach at ${sample.phase}`).toBeLessThan(0.7);
    }
    // The hinge sends the hips back and drops the bar along the legs.
    expect(samples[2]!.pelvis.z, 'hips travel back').toBeLessThan(samples[0]!.pelvis.z - 0.2);
    expect(samples[2]!.bar.y, 'bar descends').toBeLessThan(samples[0]!.bar.y - 0.3);
    // ... and the trunk really leans: shoulders well past upright at the bottom.
    const bottom = samples[2]!;
    const lean =
      (Math.atan2(
        Math.hypot(bottom.shoulder.x - bottom.pelvis.x, bottom.shoulder.z - bottom.pelvis.z),
        bottom.shoulder.y - bottom.pelvis.y,
      ) *
        180) /
      Math.PI;
    expect(lean, 'trunk lean').toBeGreaterThan(50);
    expect(lean, 'trunk lean').toBeLessThan(72);
  });
});
