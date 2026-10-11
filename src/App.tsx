import { Suspense, lazy } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { RouteLoading } from './components/RouteLoading';
import { GymProvider } from './context/GymProvider';
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

function NotFound() {
  return <div className="not-found"><span className="eyebrow">صفحه پیدا نشد</span><h2>این مسیر در برنامه نیست.</h2><p>ممکن است صفحه جابه‌جا شده باشد، اما اطلاعات ثبت‌شدهٔ شما همچنان محفوظ است.</p><Link className="button button--primary" to="/">بازگشت به خانه</Link></div>;
}

export function App() {
  return (
    <ErrorBoundary>
      <GymProvider>
        <BrowserRouter>
          <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="program" element={<Program />} />
              <Route path="program/edit" element={<ProgramEditor />} />
              <Route path="exercises" element={<ExerciseLibrary />} />
              <Route path="exercise/:exerciseId" element={<ExerciseDetail />} />
              <Route path="workout/:templateId" element={<Workout />} />
              <Route path="progress" element={<Progress />} />
              <Route path="nutrition" element={<Nutrition />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
          </Suspense>
        </BrowserRouter>
      </GymProvider>
    </ErrorBoundary>
  );
}
