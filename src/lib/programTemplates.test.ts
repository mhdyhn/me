import { describe, expect, it } from 'vitest';
import { presetTemplates } from './programTemplates';
import { validateProgram } from './programRules';
import { exerciseById } from '../data/exercises';

describe('preset workout templates', () => {
  it('provides all standard preset templates', () => {
    const ids = presetTemplates.map((t) => t.id);
    expect(ids).toContain('fullbody-3day');
    expect(ids).toContain('upper-lower-4day');
    expect(ids).toContain('ppl-5day');
    expect(ids).toContain('rage-6day');
    expect(ids).toContain('blank');
  });

  it('builds valid workout templates that pass program validation', () => {
    for (const template of presetTemplates) {
      const workouts = template.buildWorkoutTemplates();
      expect(workouts.length).toBeGreaterThanOrEqual(1);
      if (template.id !== 'blank') {
        const errors = validateProgram(workouts);
        expect(errors).toEqual([]);
      } else {
        // Blank template must start with 0 exercises so the user can define their own
        expect(workouts[0]!.exercises).toHaveLength(0);
      }
    }
  });

  it('ensures every exercise in the templates references a valid catalogue movement', () => {
    for (const template of presetTemplates) {
      const workouts = template.buildWorkoutTemplates();
      for (const day of workouts) {
        for (const item of day.exercises) {
          const found = exerciseById(item.exerciseId);
          expect(found, `Movement ${item.exerciseId} in template ${template.id} should exist in catalog`).toBeDefined();
        }
      }
    }
  });

  it('builds valid coach program days for backend syncing', () => {
    for (const template of presetTemplates) {
      const days = template.buildProgramDays();
      expect(days.length).toBe(template.daysCount);
      for (const day of days) {
        expect(day.name.length).toBeGreaterThan(0);
        if (template.id !== 'blank') {
          expect(day.exercises.length).toBeGreaterThan(0);
          for (const item of day.exercises) {
            expect(item.sets).toBeGreaterThanOrEqual(1);
            expect(item.sets).toBeLessThanOrEqual(10);
            expect(item.restSeconds).toBeGreaterThanOrEqual(0);
          }
        } else {
          expect(day.exercises).toHaveLength(0);
        }
      }
    }
  });
});
