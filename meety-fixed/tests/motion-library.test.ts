import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { motions } from '../src/motion/library';
import { createMotionState, phaseToTime, sampleMotion } from '../src/motion/sampler';
import { loadRig, dumpJson, roundVector } from './helpers/motionRig';

const SAMPLES = 8;
const PHASE_LABELS = ['شروع', 'پایین‌بردن', 'مکث', 'بالاآوردن', 'پایان'];

const entries = Object.values(motions);

describe('motion library', () => {
  it('covers the exercises with at least one loop', () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const motion of entries) {
      expect(motion.keys).toHaveLength(5);
      expect(motion.keys.map((key) => key.phase)).toEqual([0, 1, 2, 3, 4]);
      expect(motion.durationSeconds).toBeGreaterThan(1);
      expect(motion.standards.length).toBeGreaterThan(2);
      expect(motion.name).toMatch(/[\u0600-\u06FF]/);
      expect(motion.summary).toMatch(/[\u0600-\u06FF]/);
    }
  });

  for (const motion of entries) {
    describe(motion.id, () => {
      it('animates real bones and keeps every transform finite', () => {
        const { rest } = loadRig();
        const state = createMotionState(rest, motion);
        for (let step = 0; step < SAMPLES; step += 1) {
          sampleMotion(state, step / SAMPLES);
          for (const name of rest.order) {
            const position = state.worldPosition.get(name)!;
            expect(Number.isFinite(position.x + position.y + position.z), `${name} at ${step}`).toBe(true);
            expect(position.length(), `${name} at ${step}`).toBeLessThan(3);
            expect(Number.isFinite(state.worldPosition.get(name)!.y)).toBe(true);
          }
          for (const placement of state.equipment) {
            expect(Number.isFinite(placement.position.length())).toBe(true);
            expect(placement.quaternion.length()).toBeCloseTo(1, 5);
          }
        }
      });

      it('holds the declared ground contact and exposes every movement phase', () => {
        const { rest } = loadRig();
        const state = createMotionState(rest, motion);
        const restContacts = motion.plantBones.map((name) => rest.bones.get(name)!.worldPosition.clone());
        for (let step = 0; step < SAMPLES; step += 1) {
          sampleMotion(state, step / SAMPLES);
          const average = new Vector3();
          motion.plantBones.forEach((name, index) => {
            const shift = state.worldPosition.get(name)!.clone().sub(restContacts[index]!);
            average.add(shift);
            // Per-foot drift stays under a centimetre: the hinge axes are taken
            // from the rig, so they are not perfectly mirrored.
            expect(shift.length(), `${name} at ${step}`).toBeLessThan(0.012);
          });
          expect(average.length(), `average contact at ${step}`).toBeLessThan(1e-6);
          for (const name of motion.plantBones) expect(state.worldPosition.get(name)!.y).toBeLessThan(0.25);
        }
        for (let phase = 0; phase < 5; phase += 1) {
          const time = phaseToTime(state, phase);
          expect(time, `phase ${phase}`).not.toBeNull();
          expect(time!).toBeGreaterThanOrEqual(0);
          expect(time!).toBeLessThanOrEqual(1);
          expect(motion.keys.find((key) => key.phase === phase)?.label).toBeTruthy();
        }
        expect(PHASE_LABELS).toHaveLength(5);
      });

      it('dumps loop frames for the offline preview renderer', () => {
        const { rest } = loadRig();
        const state = createMotionState(rest, motion);
        const frames = [];
        for (let step = 0; step < SAMPLES; step += 1) {
          sampleMotion(state, step / SAMPLES);
          frames.push({
            t: step / SAMPLES,
            label: state.keyLabel,
            phase: state.keyPhase,
            bones: Object.fromEntries(rest.order.map((name) => [name, roundVector(state.worldPosition.get(name)!)])),
            equipment: state.equipment.map((placement) => ({
              kind: placement.kind,
              side: placement.side,
              position: roundVector(placement.position),
              quaternion: placement.quaternion.toArray().map((value) => Math.round(value * 1000) / 1000),
              anchor: placement.anchor ? roundVector(placement.anchor) : null,
            })),
          });
        }
        dumpJson(`motion-${motion.id}`, {
          id: motion.id,
          name: motion.name,
          plantBones: motion.plantBones,
          fixtures: motion.fixtures ?? [],
          keys: motion.keys.map((key) => ({ t: key.t, phase: key.phase, label: key.label })),
          frames,
        });
        expect(frames).toHaveLength(SAMPLES);
      });
    });
  }
});
