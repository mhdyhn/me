import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { exercises } from './exercises';
import { exercisePhotoIds, hasExerciseFigure, exerciseFigureSrc } from './exerciseFigures';

describe('exercise photos', () => {
  it('has a start and a main photo on disk for every listed photo movement', () => {
    for (const id of exercisePhotoIds) {
      for (const state of ['start', 'main']) {
        expect(fs.existsSync(path.join('public', 'exercise-photos', `${id}-${state}.jpg`)), `${id}-${state}`).toBe(true);
      }
    }
  });

  it('has no photo files for movements that are not listed', () => {
    const files = fs.readdirSync(path.join('public', 'exercise-photos'));
    const orphans = files.filter((file) => !exercisePhotoIds.has(file.replace(/-(start|main)\.jpg$/, '')));
    expect(orphans).toEqual([]);
  });

  it('provides visual instructional figures (photo or SVG) for every catalogue exercise', () => {
    for (const exercise of exercises) {
      expect(hasExerciseFigure(exercise.id), exercise.id).toBe(true);
      for (const state of ['start', 'main'] as const) {
        const src = exerciseFigureSrc(exercise.id, state);
        const diskPath = path.join('public', src.replace(/^\//, '').replace(/^exercise-/, 'exercise-'));
        expect(fs.existsSync(diskPath), `${exercise.id} ${state}: ${diskPath}`).toBe(true);
      }
    }
  });
});

