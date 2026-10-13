import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { exercisePhotoIds } from './exerciseFigures';

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
});
