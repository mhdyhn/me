import { describe, expect, it } from 'vitest';
import type { WorkoutSession, WorkoutTemplate } from '../types';
import { workoutSessionTemplate } from './workoutSessionTemplate';
import type { AssignedMeta } from './programStore';

const day: WorkoutTemplate = { id: 'assigned-day-1', name: 'روز اول', focus: '', dayLabel: 'اول', durationMinutes: 40, description: '', exercises: [{ exerciseId: 'push-up', name: 'شنا', prescription: { sets: 3, minReps: 8, maxReps: 12, minimumRir: 0, targetRirLabel: '۲', restSeconds: 60, note: '' } }] };
const session: WorkoutSession = { id: 's1', templateId: day.id, name: day.name, startedAt: '2026-10-29T00:00:00Z', status: 'active', notes: '', currentExerciseIndex: 0, currentSetIndex: 0, exercises: [{ exerciseId: 'push-up', sets: [] }] };
const trial: AssignedMeta = { id: 'offer-a', version: 3, title: 'برنامه', priceTomans: 100, coachName: 'مربی', isPaid: false, isTestPurchase: true, testPurchaseExpiresAt: '2999-01-01T00:00:00Z' };
const trialSession: WorkoutSession = { ...session, templateReference: { programmeId: trial.id, version: trial.version } };

describe('session programme snapshots', () => {
  it('prefers the snapshot even if another device changed or removed the programme', () => {
    const withSnapshot = { ...session, templateSnapshot: day };
    expect(workoutSessionTemplate(withSnapshot)).toEqual(day);
    expect(workoutSessionTemplate(withSnapshot, { ...day, name: 'برنامهٔ جدید' })).toEqual(day);
  });
  it('does not guess a legacy prescription even if the name and exercises match', () => {
    expect(workoutSessionTemplate(session, day, trial)).toBeUndefined();
    expect(workoutSessionTemplate(session)).toBeUndefined();
  });
  it('continues a temporary workout only with the same version and valid entitlement', () => {
    expect(workoutSessionTemplate(trialSession, day, trial)).toEqual(day);
    expect(workoutSessionTemplate(trialSession, day, { ...trial, isPaid: true, isTestPurchase: false })).toEqual(day);
    expect(workoutSessionTemplate(trialSession, day, { ...trial, version: 4 })).toBeUndefined();
    expect(workoutSessionTemplate(trialSession, day, { ...trial, id: 'other-offer' })).toBeUndefined();
    expect(workoutSessionTemplate(trialSession, day, { ...trial, testPurchaseExpiresAt: '2000-01-01T00:00:00Z' })).toBeUndefined();
    expect(workoutSessionTemplate(trialSession, day, { ...trial, isTestPurchase: false })).toBeUndefined();
    expect(workoutSessionTemplate(trialSession, { ...day, exercises: [{ ...day.exercises[0]!, exerciseId: 'squat' }] }, trial)).toBeUndefined();
    expect(workoutSessionTemplate(trialSession, day)).toBeUndefined();
  });
});
