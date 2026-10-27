import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { personalStorageKey } from './accountScope';
import {
  DEFAULT_HEALTH_METRICS, getStoredHealthMetrics, getStoredJointConcerns, getStoredMindfulLogs,
  saveHealthMetrics, saveMindfulLog, saveStoredJointConcerns, simulateTrackerSync,
} from './aiHealthEngine';
import { getLocalFallbackBiometrics, saveLocalFallbackBiometrics } from './studentAiBiometrics';

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem('meety.account-scope', 'user-1');
});
afterEach(() => window.localStorage.clear());

describe('per-account health data', () => {
  it('isolates metrics, joint concerns, mindful logs and student cache across accounts', () => {
    saveHealthMetrics({ sleepHours: 6, sleepQualityScore: 0, restingHeartRate: 60, heartRateVariability: 65, source: 'manual' });
    saveStoredJointConcerns(['knees']);
    saveMindfulLog({ foodName: 'غذای خصوصی', trigger: 'physical_hunger', category: 'green' });
    const biometric = { ...getLocalFallbackBiometrics(42), age: 33, limitations: 'اطلاعات محرمانه' };
    saveLocalFallbackBiometrics(biometric);

    window.localStorage.setItem('meety.account-scope', 'user-2');
    expect(getStoredHealthMetrics()).toEqual(DEFAULT_HEALTH_METRICS);
    expect(getStoredJointConcerns()).toEqual([]);
    expect(getStoredMindfulLogs()).toEqual([]);
    expect(getLocalFallbackBiometrics(42).age).toBeNull();

    window.localStorage.setItem('meety.account-scope', 'user-1');
    expect(getStoredHealthMetrics()).toMatchObject({ sleepHours: 6, sleepQualityScore: 0, isSample: false });
    expect(getStoredJointConcerns()).toEqual(['knees']);
    expect(getStoredMindfulLogs()[0]?.foodName).toBe('غذای خصوصی');
    expect(getLocalFallbackBiometrics(42).limitations).toBe('اطلاعات محرمانه');
  });

  it('keeps unscoped legacy records untouched instead of attributing them to the wrong person', () => {
    const legacy = JSON.stringify({ sleepHours: 4, source: 'manual' });
    window.localStorage.setItem('meety_ai_health_metrics_v1', legacy);
    expect(getStoredHealthMetrics()).toEqual(DEFAULT_HEALTH_METRICS);
    expect(window.localStorage.getItem('meety_ai_health_metrics_v1')).toBe(legacy);
  });

  it('marks defaults and device simulations as examples, but manual values as real inputs', () => {
    expect(getStoredHealthMetrics().isSample).toBe(true);
    expect(simulateTrackerSync('whoop')).toMatchObject({ source: 'whoop', isSample: true });
    expect(saveHealthMetrics({ sleepQualityScore: 0, source: 'manual' })).toMatchObject({ sleepQualityScore: 0, isSample: true });
    expect(saveHealthMetrics({ sleepHours: 7, sleepQualityScore: 0, restingHeartRate: 60, heartRateVariability: 50, source: 'manual' })).toMatchObject({ sleepQualityScore: 0, isSample: false });
  });

  it('reports storage write failures rather than returning a fabricated success', () => {
    const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => saveHealthMetrics({ sleepHours: 6 })).toThrow(/ذخیرهٔ دادهٔ سلامت/);
    expect(() => saveStoredJointConcerns(['knees'])).toThrow(/ذخیرهٔ دادهٔ سلامت/);
    expect(() => saveMindfulLog({ foodName: 'سیب', trigger: 'physical_hunger', category: 'green' })).toThrow(/ذخیرهٔ دادهٔ سلامت/);
    blocked.mockRestore();
  });

  it('handles damaged JSON, invalid dates and a large log safely', () => {
    localStorage.setItem(personalStorageKey('meety_ai_health_metrics_v1'), '{bad');
    expect(getStoredHealthMetrics()).toEqual(DEFAULT_HEALTH_METRICS);
    localStorage.setItem(personalStorageKey('meety_ai_health_metrics_v1'), JSON.stringify({ sleepHours: -900, lastSyncedAt: 'not-a-date' }));
    expect(getStoredHealthMetrics()).toMatchObject({ sleepHours: DEFAULT_HEALTH_METRICS.sleepHours, lastSyncedAt: DEFAULT_HEALTH_METRICS.lastSyncedAt, isSample: true });
    localStorage.setItem(personalStorageKey('meety_ai_joint_status_v1'), JSON.stringify(['knees', 'unknown', 'knees']));
    expect(getStoredJointConcerns()).toEqual(['knees']);
    const entries = Array.from({ length: 1000 }, (_, index) => ({ id: String(index), timestamp: '2026-10-20T10:00:00Z', foodName: 'سیب', trigger: 'physical_hunger', category: 'green' }));
    entries.unshift({ id: 'broken', timestamp: 'bad', foodName: 'bad', trigger: 'unknown', category: 'bad' });
    localStorage.setItem(personalStorageKey('meety_ai_mindful_logs_v1'), JSON.stringify(entries));
    expect(getStoredMindfulLogs()).toHaveLength(100);
    expect(getStoredMindfulLogs()[0]?.id).toBe('0');
  });
});
