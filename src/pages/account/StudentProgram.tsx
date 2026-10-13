import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { api, type Programme } from '../../lib/api';

/** Opens a movement's guide only when it is part of the student's own programme. */
export function AssignedMovementGate({ children }: { children: ReactNode }) {
  const { exerciseId = '' } = useParams();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    api<{ program: Programme | null }>('GET', '/me/program')
      .then((state) => setAllowed(Boolean(state.program?.days.some((day) => day.exercises.some((item) => item.exerciseId === exerciseId)))))
      .catch(() => setAllowed(false));
  }, [exerciseId]);

  if (allowed === null) return <p className="account-muted">در حال بارگذاری…</p>;
  if (!allowed) return <Navigate to="/exercises" replace />;
  return <>{children}</>;
}
