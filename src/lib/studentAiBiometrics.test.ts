import { describe, expect, it } from 'vitest';
import {
  ALL_AI_MODULES,
  calculateHeartRateZones,
  calculateMaxHeartRate,
} from './studentAiBiometrics';

describe('Student AI Biometrics & Heart Rate Engine', () => {
  it('calculates Tanaka formula HR_max accurately: 208 - 0.7 * age', () => {
    // Age 20: 208 - 0.7 * 20 = 208 - 14 = 194
    expect(calculateMaxHeartRate(20, 'tanaka')).toBe(194);
    // Age 40: 208 - 0.7 * 40 = 208 - 28 = 180
    expect(calculateMaxHeartRate(40, 'tanaka')).toBe(180);
    // Age 30: 208 - 21 = 187
    expect(calculateMaxHeartRate(30, 'tanaka')).toBe(187);
  });

  it('calculates Fox formula HR_max accurately: 220 - age', () => {
    expect(calculateMaxHeartRate(25, 'fox')).toBe(195);
    expect(calculateMaxHeartRate(50, 'fox')).toBe(170);
  });

  it('uses custom peak HR when method is custom', () => {
    expect(calculateMaxHeartRate(30, 'custom', 202)).toBe(202);
  });

  it('calculates all 5 cardiovascular training zones with Karvonen HRR method', () => {
    // maxHr = 190, restingHr = 60 => HRR = 130
    const zones = calculateHeartRateZones(190, 60);
    expect(zones).toHaveLength(5);

    // Zone 1: 50% - 60% HRR + RHR => (130 * 0.5) + 60 = 125 to (130 * 0.6) + 60 = 138
    expect(zones[0]!.zone).toBe(1);
    expect(zones[0]!.minBpm).toBe(125);
    expect(zones[0]!.maxBpm).toBe(138);

    // Zone 2: 60% - 70% HRR + RHR => 138 to (130 * 0.7) + 60 = 151
    expect(zones[1]!.zone).toBe(2);
    expect(zones[1]!.minBpm).toBe(138);
    expect(zones[1]!.maxBpm).toBe(151);

    // Zone 5: 90% - 100% HRR + RHR => (130 * 0.9) + 60 = 177 to 190
    expect(zones[4]!.zone).toBe(5);
    expect(zones[4]!.minBpm).toBe(177);
    expect(zones[4]!.maxBpm).toBe(190);
  });

  it('calculates zones without resting HR using direct HR_max percentage', () => {
    const zones = calculateHeartRateZones(200, null);
    expect(zones[0]!.minBpm).toBe(100); // 50% of 200
    expect(zones[0]!.maxBpm).toBe(120); // 60% of 200
    expect(zones[4]!.maxBpm).toBe(200); // 100% of 200
  });

  it('has all 4 AI modules defined', () => {
    expect(ALL_AI_MODULES).toEqual(['recovery', 'muscles', 'hinge', 'noom']);
  });
});
