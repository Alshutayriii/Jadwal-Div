import { lazy } from 'react';
import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useApp } from './store';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Timetable from './pages/Timetable';

const Portal = lazy(() => import('./pages/Portal'));
const School = lazy(() => import('./pages/School'));
const Teachers = lazy(() => import('./pages/Teachers'));
const Subjects = lazy(() => import('./pages/Subjects'));
const Sections = lazy(() => import('./pages/Sections'));
const CalendarPage = lazy(() => import('./pages/Calendar'));
const Exams = lazy(() => import('./pages/Exams'));
const DataPage = lazy(() => import('./pages/Data'));
const Absence = lazy(() => import('./pages/Absence'));
const Duty = lazy(() => import('./pages/Duty'));
const Reports = lazy(() => import('./pages/Reports'));
const Users = lazy(() => import('./pages/Users'));
const Settings = lazy(() => import('./pages/Settings'));
const Tv = lazy(() => import('./pages/Tv'));

function Splash() {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 dark:bg-slate-950">
      <div className="text-center">
        <div className="mx-auto mb-3 grid h-14 w-14 animate-pulse place-items-center rounded-3xl bg-brand-700 text-2xl font-black text-white">ج</div>
        <div className="text-sm font-bold">جارٍ تجهيز البيانات المحلية…</div>
        <div className="mt-1 text-xs text-slate-400">لا يتصل التطبيق بأي خادم</div>
      </div>
    </div>
  );
}

function RequireAuth() {
  const session = useApp((s) => s.session);
  const ready = useApp((s) => s.ready);
  if (!ready) return <Splash />;
  if (!session) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export default function App() {
  const ready = useApp((s) => s.ready);
  if (!ready) return <Splash />;
  return (
    <HashRouter>
      <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="portal" element={<Portal />} />
              <Route path="school" element={<School />} />
              <Route path="teachers" element={<Teachers />} />
              <Route path="subjects" element={<Subjects />} />
              <Route path="sections" element={<Sections />} />
              <Route path="calendar" element={<CalendarPage />} />
              <Route path="timetable" element={<Timetable />} />
              <Route path="exams" element={<Exams />} />
              <Route path="data" element={<DataPage />} />
              <Route path="absence" element={<Absence />} />
              <Route path="duty" element={<Duty />} />
              <Route path="reports" element={<Reports />} />
              <Route path="users" element={<Users />} />
              <Route path="settings" element={<Settings />} />
              <Route path="tv" element={<Tv />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
