import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { GymProvider } from './context/GymProvider';
import { Dashboard } from './pages/Dashboard';
import { ExerciseDetail } from './pages/ExerciseDetail';
import { ExerciseLibrary } from './pages/ExerciseLibrary';
import { Nutrition } from './pages/Nutrition';
import { Program } from './pages/Program';
import { Progress } from './pages/Progress';
import { Settings } from './pages/Settings';
import { Workout } from './pages/Workout';

function NotFound() {
  return <div className="not-found"><span className="eyebrow">صفحه پیدا نشد</span><h2>این مسیر در برنامه نیست.</h2><p>ممکن است صفحه جابه‌جا شده باشد، اما اطلاعات ثبت‌شدهٔ شما همچنان محفوظ است.</p><Link className="button button--primary" to="/">بازگشت به خانه</Link></div>;
}

export function App() {
  return (
    <ErrorBoundary>
      <GymProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="program" element={<Program />} />
              <Route path="exercises" element={<ExerciseLibrary />} />
              <Route path="exercise/:exerciseId" element={<ExerciseDetail />} />
              <Route path="workout/:templateId" element={<Workout />} />
              <Route path="progress" element={<Progress />} />
              <Route path="nutrition" element={<Nutrition />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </GymProvider>
    </ErrorBoundary>
  );
}
