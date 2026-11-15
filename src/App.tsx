import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useApp } from './store';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Teachers from './pages/Teachers';
import Subjects from './pages/Subjects';
import Sections from './pages/Sections';
import School from './pages/School';
import CalendarPage from './pages/Calendar';
import Timetable from './pages/Timetable';
import Absence from './pages/Absence';
import Duty from './pages/Duty';
import Reports from './pages/Reports';
import Users from './pages/Users';
import Settings from './pages/Settings';
import Portal from './pages/Portal';
import Tv from './pages/Tv';

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
