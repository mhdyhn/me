import { useEffect } from 'react';
import { useGym } from '../context/GymProvider';
import { useSession } from '../context/SessionContext';
import { uploadSessionSummaries } from '../lib/sessionSync';

/** Keeps the coach's copy of a student's workouts current. It runs only for a signed-in student. */
export function SessionSync() {
  const { user } = useSession();
  const { sessions, loading } = useGym();
  const studentId = user?.role === 'student' && !user.mustChangePassword ? user.id : null;

  useEffect(() => {
    if (loading || studentId === null || sessions.length === 0) return;
    // A short pause groups the saves made while a set is being logged.
    const timer = window.setTimeout(() => {
      uploadSessionSummaries(sessions).catch((error: unknown) => {
        console.warn('Meety could not send workout summaries yet.', error);
      });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [sessions, loading, studentId]);

  return null;
}
