import { Suspense, lazy } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { RouteLoading } from './components/RouteLoading';
import { GymProvider } from './context/GymProvider';
import { isProgramReadOnly } from './lib/programStore';
import { SessionProvider } from './context/SessionContext';
import { ForRoles, RequireSignIn } from './pages/account/AccountShell';
import { useSession } from './context/SessionContext';
import type { ReactElement } from 'react';
import { Dashboard } from './pages/Dashboard';

/**
 * Only the dashboard ships with the shell: it is the page the app opens on. Every
 * other route — and the whole exercise database and 3D viewer behind them — is
 * fetched when it is first opened, so a phone downloads a few kilobytes to show
 * the plan instead of the entire catalogue.
 */
const ExerciseDetail = lazy(() => import('./pages/ExerciseDetail').then((module) => ({ default: module.ExerciseDetail })));
const ExerciseLibrary = lazy(() => import('./pages/ExerciseLibrary').then((module) => ({ default: module.ExerciseLibrary })));
const Nutrition = lazy(() => import('./pages/Nutrition').then((module) => ({ default: module.Nutrition })));
const Program = lazy(() => import('./pages/Program').then((module) => ({ default: module.Program })));
const ProgramEditor = lazy(() => import('./pages/ProgramEditor').then((module) => ({ default: module.ProgramEditor })));
const Progress = lazy(() => import('./pages/Progress').then((module) => ({ default: module.Progress })));
const Settings = lazy(() => import('./pages/Settings').then((module) => ({ default: module.Settings })));
const Workout = lazy(() => import('./pages/Workout').then((module) => ({ default: module.Workout })));
const Login = lazy(() => import('./pages/account/Login').then((module) => ({ default: module.Login })));
const ChangePassword = lazy(() => import('./pages/account/ChangePassword').then((module) => ({ default: module.ChangePassword })));
const CoachEntry = lazy(() => import('./pages/account/CoachHome').then((module) => ({ default: module.CoachEntry })));
const ProgramPicker = lazy(() => import('./pages/account/CoachHome').then((module) => ({ default: module.ProgramPicker })));
const ProgramBuilder = lazy(() => import('./pages/account/ProgramBuilder').then((module) => ({ default: module.ProgramBuilder })));
const NutritionEditor = lazy(() => import('./pages/account/NutritionEditor').then((module) => ({ default: module.NutritionEditor })));
const StudentChat = lazy(() => import('./pages/account/Chat').then((module) => ({ default: module.StudentChat })));
const CoachChat = lazy(() => import('./pages/account/Chat').then((module) => ({ default: module.CoachChat })));
const AssignedMovementGate = lazy(() => import('./pages/account/StudentProgram').then((module) => ({ default: module.AssignedMovementGate })));

function NotFound() {
  return <div className="not-found"><span className="eyebrow">صفحه پیدا نشد</span><h2>این مسیر در برنامه نیست.</h2><p>ممکن است صفحه جابه‌جا شده باشد، اما اطلاعات ثبت‌شدهٔ شما همچنان محفوظ است.</p><Link className="button button--primary" to="/">بازگشت به خانه</Link></div>;
}

/**
 * Sign-in comes first: the whole app sits behind it. The offline single-file build has no
 * server, so it opens directly.
 */
function signedIn(element: ReactElement): ReactElement {
  if (import.meta.env.MODE === 'offline') return element;
  return <RequireSignIn>{element}</RequireSignIn>;
}

/** The programme editor is closed for students: their programme comes from the coach. */
function ProgramEditorRoute() {
  return isProgramReadOnly() ? <Navigate to="/program" replace /> : <ProgramEditor />;
}

/** A movement's guide: a student can open only movements in the coach's program. */
function ExerciseRoute() {
  const { user } = useSession();
  return user?.role === 'student' ? (
    <AssignedMovementGate>
      <ExerciseDetail />
    </AssignedMovementGate>
  ) : (
    <ExerciseDetail />
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <GymProvider>
        <SessionProvider>
        <BrowserRouter>
          <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="login" element={<Login />} />
            <Route path="account/change-password" element={<ChangePassword />} />
            <Route element={signedIn(<Layout />)}>
              <Route index element={<Dashboard />} />
              <Route path="my-program" element={<Navigate to="/program" replace />} />
              <Route path="program" element={<Program />} />
              <Route path="program/edit" element={<ProgramEditorRoute />} />
              <Route path="exercises" element={<ExerciseLibrary />} />
              <Route path="exercise/:exerciseId" element={<ExerciseRoute />} />
              <Route path="workout/:templateId" element={<Workout />} />
              <Route path="progress" element={<Progress />} />
              <Route path="nutrition" element={<Nutrition />} />
              <Route path="settings" element={<Settings />} />
              <Route path="coach" element={<ForRoles roles={['coach', 'admin']}><CoachEntry /></ForRoles>} />
              <Route path="coach/programs/new" element={<ForRoles roles={['coach']}><ProgramPicker /></ForRoles>} />
              <Route path="coach/students/:studentId/program" element={<ForRoles roles={['coach']}><ProgramBuilder /></ForRoles>} />
              <Route path="coach/students/:studentId/nutrition" element={<ForRoles roles={['coach']}><NutritionEditor /></ForRoles>} />
              <Route path="chat" element={<ForRoles roles={['student']}><StudentChat /></ForRoles>} />
              <Route path="coach/students/:studentId/chat" element={<ForRoles roles={['coach']}><CoachChat /></ForRoles>} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
          </Suspense>
        </BrowserRouter>
        </SessionProvider>
      </GymProvider>
    </ErrorBoundary>
  );
}
