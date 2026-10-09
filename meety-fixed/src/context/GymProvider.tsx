import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { defaultNutritionGoals, defaultProfile, localizeKnownProfileCopy } from '../data/profile';
import { getWorkoutTemplate } from '../data/workouts';
import { db } from '../lib/db';
import { dateInputValue } from '../lib/format';
import type { BodyweightEntry, NutritionDay, NutritionGoals, UserProfile, WorkoutSession } from '../types';
import { getProgramWeek } from '../lib/program';

interface GymContextValue {
  sessions: WorkoutSession[];
  bodyweights: BodyweightEntry[];
  nutritionDays: NutritionDay[];
  profile: UserProfile;
  nutritionGoals: NutritionGoals;
  loading: boolean;
  storageWarning: string | null;
  activeSession: WorkoutSession | null;
  saveSession: (session: WorkoutSession) => Promise<void>;
  startWorkout: (templateId: string) => Promise<WorkoutSession | null>;
  saveProfile: (profile: UserProfile) => Promise<void>;
  saveNutritionGoals: (goals: NutritionGoals) => Promise<void>;
  addBodyweight: (entry: Omit<BodyweightEntry, 'id'>) => Promise<void>;
  saveNutritionDay: (day: Omit<NutritionDay, 'id'>) => Promise<void>;
  resetAllData: () => Promise<void>;
  runStorageHealthCheck: () => Promise<boolean>;
}

const GymContext = createContext<GymContextValue | null>(null);
const newId = () => globalThis.crypto?.randomUUID?.() ?? `meety-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export function GymProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [bodyweights, setBodyweights] = useState<BodyweightEntry[]>([]);
  const [nutritionDays, setNutritionDays] = useState<NutritionDay[]>([]);
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [nutritionGoals, setNutritionGoals] = useState<NutritionGoals>(defaultNutritionGoals);
  const [loading, setLoading] = useState(true);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const startingRef = useRef<Promise<WorkoutSession | null> | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [storedSessions, storedBodyweights, storedNutrition, storedProfile, storedGoals] = await Promise.all([
          db.sessions.toArray(),
          db.bodyweights.toArray(),
          db.nutritionDays.toArray(),
          db.preferences.get('profile'),
          db.preferences.get('nutritionGoals'),
        ]);
        if (!mounted) return;
        setSessions(storedSessions.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()));
        setBodyweights(storedBodyweights.sort((a, b) => b.date.localeCompare(a.date)));
        setNutritionDays(storedNutrition.sort((a, b) => b.date.localeCompare(a.date)));
        if (storedProfile?.value) setProfile(localizeKnownProfileCopy(storedProfile.value as UserProfile));
        if (storedGoals?.value) setNutritionGoals(storedGoals.value as NutritionGoals);
      } catch (error) {
        console.error('Meety could not read local data.', error);
        if (mounted) setStorageWarning('فضای ذخیره‌سازی محلی باز نشد. می‌توانی در همین زبانه از برنامه استفاده کنی، اما تغییرات ممکن است پس از بارگذاری دوباره باقی نمانند.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => { mounted = false; };
  }, []);

  const persist = useCallback(async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      console.error('Meety could not save local data.', error);
      setStorageWarning('ذخیرهٔ محلی یکی از تغییرات ناموفق بود. پیش از اتکا به اطلاعات پس از بارگذاری دوباره، مجوز ذخیره‌سازی مرورگر را بررسی کن.');
    }
  }, []);

  const saveSession = useCallback(async (session: WorkoutSession) => {
    setSessions((current) => {
      const next = current.filter((item) => item.id !== session.id);
      next.push(session);
      return next.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    });
    await persist(() => db.sessions.put(session));
  }, [persist]);

  const startWorkout = useCallback(async (templateId: string) => {
    const existing = sessions.find((session) => session.status === 'active');
    if (existing) return existing;
    if (startingRef.current) return startingRef.current;
    const template = getWorkoutTemplate(templateId);
    if (!template) return null;

    const session: WorkoutSession = {
      id: newId(),
      templateId,
      name: template.name,
      startedAt: new Date().toISOString(),
      status: 'active',
      notes: '',
      exercises: template.exercises.map(({ exerciseId }) => ({ exerciseId, sets: [] })),
      currentExerciseIndex: 0,
      currentSetIndex: 0,
      programWeek: getProgramWeek(sessions),
      warmupCompleted: false,
    };
    setSessions((current) => [session, ...current]);
    const pending = persist(() => db.sessions.put(session)).then(() => session);
    startingRef.current = pending;
    try {
      return await pending;
    } finally {
      startingRef.current = null;
    }
  }, [persist, sessions]);

  const saveProfile = useCallback(async (nextProfile: UserProfile) => {
    setProfile(nextProfile);
    await persist(() => db.preferences.put({ key: 'profile', value: nextProfile }));
  }, [persist]);

  const saveGoals = useCallback(async (goals: NutritionGoals) => {
    setNutritionGoals(goals);
    await persist(() => db.preferences.put({ key: 'nutritionGoals', value: goals }));
  }, [persist]);

  const addBodyweight = useCallback(async (entry: Omit<BodyweightEntry, 'id'>) => {
    const fullEntry: BodyweightEntry = { ...entry, id: newId() };
    setBodyweights((current) => [fullEntry, ...current].sort((a, b) => b.date.localeCompare(a.date)));
    await persist(() => db.bodyweights.put(fullEntry));
  }, [persist]);

  const saveNutritionDay = useCallback(async (day: Omit<NutritionDay, 'id'>) => {
    const fullDay: NutritionDay = { ...day, id: day.date || dateInputValue() };
    setNutritionDays((current) => [fullDay, ...current.filter((item) => item.id !== fullDay.id)].sort((a, b) => b.date.localeCompare(a.date)));
    await persist(() => db.nutritionDays.put(fullDay));
  }, [persist]);


  const resetAllData = useCallback(async () => {
    await persist(async () => {
      await db.sessions.clear();
      await db.bodyweights.clear();
      await db.nutritionDays.clear();
      await db.preferences.clear();
      setSessions([]);
      setBodyweights([]);
      setNutritionDays([]);
      setProfile(defaultProfile);
      setNutritionGoals(defaultNutritionGoals);
    });
  }, [persist]);

  const runStorageHealthCheck = useCallback(async () => {
    const key = '__storage_health__';
    const token = newId();
    try {
      await db.preferences.put({ key, value: token });
      const stored = await db.preferences.get(key);
      await db.preferences.delete(key);
      return stored?.value === token;
    } catch (error) {
      console.error('Meety storage health check failed.', error);
      return false;
    }
  }, []);

  const activeSession = sessions.find((session) => session.status === 'active') ?? null;
  const value = useMemo<GymContextValue>(() => ({
    sessions, bodyweights, nutritionDays, profile, nutritionGoals, loading, storageWarning, activeSession,
    saveSession, startWorkout, saveProfile, saveNutritionGoals: saveGoals, addBodyweight, saveNutritionDay, resetAllData, runStorageHealthCheck,
  }), [sessions, bodyweights, nutritionDays, profile, nutritionGoals, loading, storageWarning, activeSession, saveSession, startWorkout, saveProfile, saveGoals, addBodyweight, saveNutritionDay, resetAllData, runStorageHealthCheck]);

  return <GymContext.Provider value={value}>{children}</GymContext.Provider>;
}

export const useGym = () => {
  const context = useContext(GymContext);
  if (!context) throw new Error('useGym must be used inside GymProvider');
  return context;
};
