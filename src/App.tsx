import { Suspense, lazy } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { RouteLoading } from './components/RouteLoading';
import { GymProvider } from './context/GymProvider';
import { SessionProvider } from './context/SessionContext';
import { ForRoles, RequireSignIn, homeFor } from './pages/account/AccountShell';
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
const StudentProgram = lazy(() => import('./pages/account/StudentProgram').then((module) => ({ default: module.StudentProgram })));

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

/** `/` is the personal home offline, the student's program when signed in, and the coach area for coaches and the admin. */
function Home() {
  const { user } = useSession();
  if (!user) return <Dashboard />;
  if (user.role === 'student') return <StudentProgram />;
  return <Navigate to={homeFor(user.role)} replace />;
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
              <Route index element={<Home />} />
              <Route path="my-program" element={<Navigate to="/" replace />} />
              <Route path="coach" element={<ForRoles roles={['coach', 'admin']}><CoachEntry /></ForRoles>} />
              <Route path="coach/programs/new" element={<ForRoles roles={['coach']}><ProgramPicker /></ForRoles>} />
              <Route path="coach/students/:studentId/program" element={<ForRoles roles={['coach']}><ProgramBuilder /></ForRoles>} />
              {/* Personal training screens: the offline build only. Signed-in users are sent to their own home. */}
              <Route path="program" element={<ForRoles roles={[]}><Program /></ForRoles>} />
              <Route path="program/edit" element={<ForRoles roles={[]}><ProgramEditor /></ForRoles>} />
              <Route path="exercises" element={<ForRoles roles={[]}><ExerciseLibrary /></ForRoles>} />
              <Route path="workout/:templateId" element={<ForRoles roles={[]}><Workout /></ForRoles>} />
              <Route path="exercise/:exerciseId" element={<ExerciseDetail />} />
              <Route path="progress" element={<ForRoles roles={['student']}><Progress /></ForRoles>} />
              <Route path="nutrition" element={<ForRoles roles={['student']}><Nutrition /></ForRoles>} />
              <Route path="settings" element={<ForRoles roles={['student']}><Settings /></ForRoles>} />
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
