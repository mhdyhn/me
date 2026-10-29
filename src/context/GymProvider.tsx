import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { blankNutritionGoals, blankProfile, defaultNutritionGoals, defaultProfile, localizeKnownProfileCopy } from '../data/profile';
import { db } from '../lib/db';
import { usesOwnerData } from '../lib/accountScope';
import { PERSONAL_DATA_APPLIED, notifyPersonalDataApplied, notifyPersonalDataChanged } from '../lib/personalSyncEvents';
import { DraftChangedError, requireUnchanged } from '../lib/draftGuard';
import { getAssignedMeta, getWorkoutTemplate, isProgramReadOnly } from '../lib/programStore';
import { dateInputValue } from '../lib/format';
import type { BodyweightEntry, NutritionDay, NutritionGoals, UserProfile, WorkoutSession } from '../types';

interface GymContextValue {
  sessions: WorkoutSession[];
  bodyweights: BodyweightEntry[];
  nutritionDays: NutritionDay[];
  profile: UserProfile;
  nutritionGoals: NutritionGoals;
  loading: boolean;
  storageWarning: string | null;
  activeSession: WorkoutSession | null;
  saveSession: (session: WorkoutSession, expected?: WorkoutSession) => Promise<boolean>;
  startWorkout: (templateId: string) => Promise<WorkoutSession | null>;
  saveProfile: (profile: UserProfile, expected?: UserProfile) => Promise<boolean>;
  saveNutritionGoals: (goals: NutritionGoals, expected?: NutritionGoals) => Promise<boolean>;
  addBodyweight: (entry: Omit<BodyweightEntry, 'id'>) => Promise<boolean>;
  deleteBodyweight: (id: string, expected?: BodyweightEntry) => Promise<boolean>;
  saveNutritionDay: (day: Omit<NutritionDay, 'id'>, expected?: NutritionDay | null) => Promise<boolean>;
  deleteNutritionDay: (id: string) => Promise<void>;
  deleteSession: (id: string, expected?: WorkoutSession) => Promise<boolean>;
  completeActiveSession: (id: string) => Promise<boolean>;
}

const GymContext = createContext<GymContextValue | null>(null);
const newId = () => globalThis.crypto?.randomUUID?.() ?? `meety-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export function GymProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [bodyweights, setBodyweights] = useState<BodyweightEntry[]>([]);
  const [nutritionDays, setNutritionDays] = useState<NutritionDay[]>([]);
  // Only the developer's own account starts with their details; everyone else starts blank.
  const [profile, setProfile] = useState<UserProfile>(() => (usesOwnerData() ? defaultProfile : blankProfile));
  const [nutritionGoals, setNutritionGoals] = useState<NutritionGoals>(() => (usesOwnerData() ? defaultNutritionGoals : blankNutritionGoals));
  const [loading, setLoading] = useState(true);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const startingRef = useRef<Promise<WorkoutSession | null> | null>(null);
  const loadGeneration = useRef(0);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const generation = ++loadGeneration.current;
      try {
        const [storedSessions, storedBodyweights, storedNutrition, storedProfile, storedGoals] = await Promise.all([
          db.sessions.toArray(),
          db.bodyweights.toArray(),
          db.nutritionDays.toArray(),
          db.preferences.get('profile'),
          db.preferences.get('nutritionGoals'),
        ]);
        if (!mounted || generation !== loadGeneration.current) return;
        setSessions(storedSessions.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()));
        setBodyweights(storedBodyweights.sort((a, b) => b.date.localeCompare(a.date)));
        setNutritionDays(storedNutrition.sort((a, b) => b.date.localeCompare(a.date)));
        const nextProfile = storedProfile?.value ? localizeKnownProfileCopy(storedProfile.value as UserProfile) : (usesOwnerData() ? defaultProfile : blankProfile);
        const nextGoals = storedGoals?.value ? storedGoals.value as NutritionGoals : (usesOwnerData() ? defaultNutritionGoals : blankNutritionGoals);
        setProfile((current) => JSON.stringify(current) === JSON.stringify(nextProfile) ? current : nextProfile);
        setNutritionGoals((current) => JSON.stringify(current) === JSON.stringify(nextGoals) ? current : nextGoals);
      } catch (error) {
        console.error('Meety could not read local data.', error);
        if (mounted && generation === loadGeneration.current) setStorageWarning('فضای ذخیره‌سازی محلی باز نشد. می‌توانی در همین زبانه از برنامه استفاده کنی، اما تغییرات ممکن است پس از بارگذاری دوباره باقی نمانند.');
      } finally {
        if (mounted && generation === loadGeneration.current) setLoading(false);
      }
    };
    void load();
    const refresh = () => { void load(); };
    window.addEventListener(PERSONAL_DATA_APPLIED, refresh);
    return () => { mounted = false; window.removeEventListener(PERSONAL_DATA_APPLIED, refresh); };
  }, []);

  const persist = useCallback(async (action: () => Promise<unknown>) => {
    try {
      await action();
      loadGeneration.current++;
      notifyPersonalDataChanged();
      return true;
    } catch (error) {
      if (error instanceof DraftChangedError) { notifyPersonalDataApplied(); throw error; }
      console.error('Meety could not save local data.', error);
      setStorageWarning('ذخیرهٔ محلی یکی از تغییرات ناموفق بود. پیش از اتکا به اطلاعات پس از بارگذاری دوباره، مجوز ذخیره‌سازی مرورگر را بررسی کن.');
      return false;
    }
  }, []);

  const saveSession = useCallback(async (session: WorkoutSession, expected?: WorkoutSession) => {
    const stored = await persist(() => db.transaction('rw', db.sessions, db.syncDeleted, async () => {
      if (expected !== undefined) requireUnchanged((await db.sessions.get(session.id)) ?? null, expected);
      await db.sessions.put(session);
      await db.syncDeleted.delete(`session:${session.id}`);
    }));
    if (stored) setSessions((current) => {
      const next = current.filter((item) => item.id !== session.id);
      next.push(session);
      return next.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    });
    return stored;
  }, [persist]);

  const startWorkout = useCallback(async (templateId: string) => {
    const existing = sessions.find((session) => session.status === 'active');
    if (existing) return existing;
    if (startingRef.current) return startingRef.current;
    const template = getWorkoutTemplate(templateId);
    if (!template) return null;

    const assigned = isProgramReadOnly() ? getAssignedMeta() : null;
    const session: WorkoutSession = {
      id: newId(),
      templateId,
      // A temporary test keeps only the offer/version, not a permanent paid prescription.
      ...(assigned?.isTestPurchase
        ? { templateReference: { programmeId: assigned.id, version: assigned.version } }
        : { templateSnapshot: structuredClone(template) }),
      name: template.name,
      startedAt: new Date().toISOString(),
      status: 'active',
      notes: '',
      exercises: template.exercises.map(({ exerciseId }) => ({ exerciseId, sets: [] })),
      currentExerciseIndex: 0,
      currentSetIndex: 0,
    };
    let result: WorkoutSession | null = null;
    const pending = persist(() => db.transaction('rw', db.sessions, db.syncDeleted, async () => {
      // A remote session may have reached IndexedDB before React refreshed its state.
      result = (await db.sessions.toArray()).find((item) => item.status === 'active') ?? null;
      if (result) return;
      await db.sessions.put(session);
      await db.syncDeleted.delete(`session:${session.id}`);
      result = session;
    })).then((stored) => {
      if (!stored || !result) return null;
      const actual: WorkoutSession = result;
      setSessions((current) => [actual, ...current.filter((item) => item.id !== actual.id)]);
      return actual;
    });
    startingRef.current = pending;
    try {
      return await pending;
    } finally {
      startingRef.current = null;
    }
  }, [persist, sessions]);

  const saveProfile = useCallback(async (nextProfile: UserProfile, expected?: UserProfile) => {
    const stored = await persist(() => db.transaction('rw', db.preferences, async () => {
      if (expected !== undefined) {
        const row = await db.preferences.get('profile');
        const current = row?.value ? localizeKnownProfileCopy(row.value as UserProfile) : (usesOwnerData() ? defaultProfile : blankProfile);
        requireUnchanged(current, expected);
      }
      await db.preferences.put({ key: 'profile', value: nextProfile });
    }));
    if (stored) setProfile(nextProfile);
    return stored;
  }, [persist]);

  const saveGoals = useCallback(async (goals: NutritionGoals, expected?: NutritionGoals) => {
    const stored = await persist(() => db.transaction('rw', db.preferences, async () => {
      if (expected !== undefined) {
        const row = await db.preferences.get('nutritionGoals');
        requireUnchanged(row?.value ?? (usesOwnerData() ? defaultNutritionGoals : blankNutritionGoals), expected);
      }
      await db.preferences.put({ key: 'nutritionGoals', value: goals });
    }));
    if (stored) setNutritionGoals(goals);
    return stored;
  }, [persist]);

  const addBodyweight = useCallback(async (entry: Omit<BodyweightEntry, 'id'>) => {
    const fullEntry: BodyweightEntry = { ...entry, id: newId() };
    setBodyweights((current) => [fullEntry, ...current].sort((a, b) => b.date.localeCompare(a.date)));
    return persist(() => db.transaction('rw', db.bodyweights, db.syncDeleted, async () => { await db.bodyweights.put(fullEntry); await db.syncDeleted.delete(`bodyweight:${fullEntry.id}`); }));
  }, [persist]);

  const deleteBodyweight = useCallback(async (id: string, expected?: BodyweightEntry) => {
    const stored = await persist(() => db.transaction('rw', db.bodyweights, db.syncDeleted, async () => {
      if (expected !== undefined) requireUnchanged((await db.bodyweights.get(id)) ?? null, expected);
      await db.bodyweights.delete(id);
      await db.syncDeleted.put({ id: `bodyweight:${id}`, kind: 'bodyweight', key: id });
    }));
    if (stored) setBodyweights((current) => current.filter((entry) => entry.id !== id));
    return stored;
  }, [persist]);

  const deleteSession = useCallback(async (id: string, expected?: WorkoutSession) => {
    const stored = await persist(() => db.transaction('rw', db.sessions, db.syncDeleted, async () => {
      if (expected !== undefined) requireUnchanged((await db.sessions.get(id)) ?? null, expected);
      await db.sessions.delete(id);
      await db.syncDeleted.put({ id: `session:${id}`, kind: 'session', key: id });
    }));
    if (stored) setSessions((current) => current.filter((session) => session.id !== id));
    return stored;
  }, [persist]);

  const completeActiveSession = useCallback(async (id: string) => {
    const target = sessions.find((session) => session.id === id);
    if (!target) return false;
    const completed: WorkoutSession = {
      ...target,
      status: 'completed',
      completedAt: new Date().toISOString(),
      restTimer: undefined,
    };
    return saveSession(completed, target);
  }, [sessions, saveSession]);

  const saveNutritionDay = useCallback(async (day: Omit<NutritionDay, 'id'>, expected?: NutritionDay | null) => {
    const fullDay: NutritionDay = { ...day, id: day.date || dateInputValue() };
    const stored = await persist(() => db.transaction('rw', db.nutritionDays, db.syncDeleted, async () => {
      if (expected !== undefined) requireUnchanged((await db.nutritionDays.get(fullDay.id)) ?? null, expected);
      await db.nutritionDays.put(fullDay);
      await db.syncDeleted.delete(`nutritionDay:${fullDay.id}`);
    }));
    if (stored) setNutritionDays((current) => [fullDay, ...current.filter((item) => item.id !== fullDay.id)].sort((a, b) => b.date.localeCompare(a.date)));
    return stored;
  }, [persist]);

  const deleteNutritionDay = useCallback(async (id: string) => {
    setNutritionDays((current) => current.filter((day) => day.id !== id));
    await persist(() => db.transaction('rw', db.nutritionDays, db.syncDeleted, async () => { await db.nutritionDays.delete(id); await db.syncDeleted.put({ id: `nutritionDay:${id}`, kind: 'nutritionDay', key: id }); }));
  }, [persist]);

  const activeSession = sessions.find((session) => session.status === 'active') ?? null;
  const value = useMemo<GymContextValue>(() => ({
    sessions, bodyweights, nutritionDays, profile, nutritionGoals, loading, storageWarning, activeSession,
    saveSession, deleteSession, completeActiveSession, startWorkout, saveProfile, saveNutritionGoals: saveGoals,
    addBodyweight, deleteBodyweight, saveNutritionDay, deleteNutritionDay,
  }), [sessions, bodyweights, nutritionDays, profile, nutritionGoals, loading, storageWarning, activeSession,
      saveSession, deleteSession, completeActiveSession, startWorkout, saveProfile, saveGoals,
      addBodyweight, deleteBodyweight, saveNutritionDay, deleteNutritionDay]);

  return <GymContext.Provider value={value}>{children}</GymContext.Provider>;
}

export const useGym = () => {
  const context = useContext(GymContext);
  if (!context) throw new Error('useGym must be used inside GymProvider');
  return context;
};
