import { describe, expect, it } from 'vitest';
import { suggestProgram, type SuggestionAnswers } from './suggestedProgram';

const base: SuggestionAnswers = {
  goal: 'general',
  level: 'intermediate',
  daysPerWeek: 3,
  equipment: 'gym',
  limit: 'none',
};

const idsOf = (days: { exercises: { exerciseId: string }[] }[]) => days.flatMap((day) => day.exercises.map((item) => item.exerciseId));

describe('the suggested programme', () => {
  it('picks a full body programme for three days', () => {
    const suggestion = suggestProgram(base);
    expect(suggestion.templateId).toBe('fullbody-3day');
    expect(suggestion.days).toHaveLength(3);
    expect(suggestion.reasons.length).toBeGreaterThan(0);
  });

  it('picks the upper and lower programme for four days and the split one for five', () => {
    expect(suggestProgram({ ...base, daysPerWeek: 4 }).templateId).toBe('upper-lower-4day');
    expect(suggestProgram({ ...base, daysPerWeek: 5 }).templateId).toBe('ppl-5day');
  });

  it('keeps the template volume for an intermediate student', () => {
    const suggestion = suggestProgram(base);
    const first = suggestion.days[0]!.exercises[0]!;
    expect(first.prescription.sets).toBe(3);
    expect(first.prescription.restSeconds).toBe(120);
  });

  it('lowers the volume and adds rest for a beginner', () => {
    const suggestion = suggestProgram({ ...base, level: 'beginner' });
    const first = suggestion.days[0]!.exercises[0]!;
    expect(first.prescription.sets).toBe(2);
    expect(first.prescription.restSeconds).toBe(150);
    expect(first.prescription.minimumRir).toBe(2);
    expect(suggestion.reasons.some((reason) => reason.includes('کم شده'))).toBe(true);
  });

  it('adds a set to the main lift for an advanced student', () => {
    const suggestion = suggestProgram({ ...base, level: 'advanced' });
    const main = suggestion.days[0]!.exercises[0]!;
    const accessory = suggestion.days[0]!.exercises[1]!;
    expect(main.prescription.sets).toBe(4);
    expect(accessory.prescription.sets).toBe(3);
  });

  it('adds reps for muscle and trims the accessories for strength', () => {
    const muscle = suggestProgram({ ...base, goal: 'muscle' });
    expect(muscle.days[0]!.exercises[1]!.prescription.minReps).toBe(7);
    const strength = suggestProgram({ ...base, goal: 'strength' });
    expect(strength.days[0]!.exercises[1]!.prescription.sets).toBe(2);
  });

  it('asks for three days when the goal is losing weight', () => {
    const suggestion = suggestProgram({ ...base, goal: 'fatloss', daysPerWeek: 2 });
    expect(suggestion.days).toHaveLength(3);
    expect(suggestion.warnings.some((warning) => warning.includes('کاهش چربی'))).toBe(true);
  });

  it('swaps the machine movements for home movements', () => {
    const suggestion = suggestProgram({ ...base, equipment: 'home' });
    const ids = idsOf(suggestion.days);
    expect(ids).not.toContain('barbell-squat');
    expect(ids).not.toContain('lat-pulldown');
    expect(ids).toContain('goblet-squat');
    expect(suggestion.reasons.some((reason) => reason.includes('دمبل یا وزن بدن'))).toBe(true);
  });

  it('keeps the joint out of the programme', () => {
    const knee = suggestProgram({ ...base, limit: 'knee' });
    expect(idsOf(knee.days)).not.toContain('barbell-squat');
    expect(idsOf(knee.days)).toContain('barbell-hip-thrust');
    const shoulder = suggestProgram({ ...base, limit: 'shoulder', daysPerWeek: 5 });
    expect(idsOf(shoulder.days)).not.toContain('shoulder-press');
    const back = suggestProgram({ ...base, limit: 'back' });
    expect(idsOf(back.days)).not.toContain('romanian-deadlift');
  });

  it('keeps the joint safe even when the equipment is a home one', () => {
    const suggestion = suggestProgram({ ...base, limit: 'knee', equipment: 'home' });
    expect(idsOf(suggestion.days)).not.toContain('goblet-squat');
    expect(idsOf(suggestion.days)).toContain('glute-bridge');
  });

  it('numbers the days from the first one', () => {
    const suggestion = suggestProgram({ ...base, daysPerWeek: 2 });
    expect(suggestion.days[0]!.dayLabel).toBe('روز ۰۱');
    expect(suggestion.days[1]!.dayLabel).toBe('روز ۰۲');
    expect(suggestion.days[0]!.name.startsWith('روز ۱:')).toBe(true);
  });
});
