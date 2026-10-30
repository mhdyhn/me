import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GymProvider, useGym } from '../src/context/GymProvider';
import { blankNutritionGoals, blankProfile } from '../src/data/profile';
import { db } from '../src/lib/db';
import { sampleNutritionGoals, sampleProfile } from './fixtures/profile';

function ProfileProbe() {
  const { profile, nutritionGoals, loading } = useGym();
  if (loading) return <p>loading</p>;
  return <output data-testid="profile">{JSON.stringify({ profile, nutritionGoals })}</output>;
}

beforeEach(async () => { await db.preferences.clear(); });
afterEach(cleanup);

describe('profile defaults and stored values', () => {
  it('does not seed an owner-scope account or persist bundled information', async () => {
    render(<GymProvider><ProfileProbe /></GymProvider>);
    expect(JSON.parse((await screen.findByTestId('profile')).textContent!)).toEqual({ profile: blankProfile, nutritionGoals: blankNutritionGoals });
    expect(await db.preferences.get('profile')).toBeUndefined();
    expect(await db.preferences.get('nutritionGoals')).toBeUndefined();
  });

  it('displays missing legacy fields as empty without rewriting a saved profile', async () => {
    const legacy = { age: 32, sex: 'زن', primaryGoal: 'هدف من' };
    await db.preferences.put({ key: 'profile', value: legacy });
    render(<GymProvider><ProfileProbe /></GymProvider>);
    const displayed = JSON.parse((await screen.findByTestId('profile')).textContent!).profile;
    expect(displayed).toMatchObject({ age: 32, sex: 'زن', primaryGoal: 'هدف من', equipment: '', workingWeightReferences: [] });
    expect((await db.preferences.get('profile'))?.value).toEqual(legacy);
  });

  it('preserves user-saved data on remount instead of clearing it', async () => {
    await db.preferences.put({ key: 'profile', value: sampleProfile });
    await db.preferences.put({ key: 'nutritionGoals', value: sampleNutritionGoals });
    render(<GymProvider><ProfileProbe /></GymProvider>);
    expect(JSON.parse((await screen.findByTestId('profile')).textContent!)).toEqual({ profile: sampleProfile, nutritionGoals: sampleNutritionGoals });
    expect((await db.preferences.get('profile'))?.value).toEqual(sampleProfile);
  });
});
