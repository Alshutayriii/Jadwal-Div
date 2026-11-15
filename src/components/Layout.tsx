import React, { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, UserRound, Building2, Users, BookOpen, Layers, CalendarDays, Grid3X3,
  UserMinus, ShieldCheck, FileText, UserCog, Settings, Monitor, Menu, X, Moon, Sun, LogOut,
} from 'lucide-react';
import { useApp } from '../store';
import { cn } from './ui';

const NAV = [
  { to: '/', label: 'لوحة التحكم', icon: LayoutDashboard, module: 'dashboard' },
  { to: '/portal', label: 'بوابة المعلم', icon: UserRound, module: 'portal' },
  { to: '/school', label: 'بيانات المدرسة', icon: Building2, module: 'school' },
  { to: '/teachers', label: 'المعلمون', icon: Users, module: 'teachers' },
  { to: '/subjects', label: 'المواد', icon: BookOpen, module: 'subjects' },
  { to: '/sections', label: 'الصفوف والشعب', icon: Layers, module: 'sections' },
  { to: '/calendar', label: 'التقويم', icon: CalendarDays, module: 'calendar' },
  { to: '/timetable', label: 'الجدول الدراسي', icon: Grid3X3, module: 'timetable' },
  { to: '/absence', label: 'الغياب والانتظار', icon: UserMinus, module: 'absence' },
  { to: '/duty', label: 'الإشراف والمناوبة', icon: ShieldCheck, module: 'duty' },
  { to: '/reports', label: 'التقارير', icon: FileText, module: 'reports' },
  { to: '/users', label: 'المستخدمون', icon: UserCog, module: 'users' },
  { to: '/settings', label: 'الإعدادات', icon: Settings, module: 'settings' },
  { to: '/tv', label: 'شاشة العرض', icon: Monitor, module: 'dashboard' },
];

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  return (
    <div className="no-print fixed bottom-4 left-4 z-[60] flex w-[min(92vw,22rem)] flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={cn(
            'rounded-xl px-4 py-3 text-right text-sm font-semibold text-white shadow-lg',
            t.kind === 'ok' && 'bg-emerald-600',
            t.kind === 'err' && 'bg-rose-600',
            t.kind === 'info' && 'bg-slate-800',
          )}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}

export default function Layout() {
  const { db, session, logout, perm, setSetting } = useApp();
  const [open, setOpen] = React.useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const dark = db.settings.theme === 'dark';

  useEffect(() => { setOpen(false); }, [location.pathname]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  if (!session) return null;
  const items = NAV.filter((n) => perm(n.module, 'view'));
  const current = NAV.find((n) => n.to === location.pathname);

  const sidebar = (
    <aside className="flex h-full w-64 shrink-0 flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-4 dark:border-slate-800">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-700 text-lg font-black text-white">ج</span>
        <div className="min-w-0">
          <div className="truncate text-sm font-extrabold">جدول المدرسة Pro</div>
          <div className="truncate text-[11px] text-slate-400">{db.school.name}</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => cn('nav-link', isActive && 'nav-link-active')}
          >
            <item.icon size={18} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-200 p-3 dark:border-slate-800">
        <div className="rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-950">
          <div className="font-bold">{session.user.name}</div>
          <div className="text-slate-400">{session.user.username}</div>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="flex h-full min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="no-print hidden lg:block">{sidebar}</div>

      {open ? (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-950/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 shadow-2xl">{sidebar}</div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-900/85">
          <div className="flex items-center gap-3 px-3 py-3 sm:px-5">
            <button className="btn-ghost btn-sm lg:hidden" onClick={() => setOpen(true)} aria-label="فتح القائمة">
              <Menu size={18} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-extrabold">{current?.label || 'جدول المدرسة'}</div>
              <div className="truncate text-[11px] text-slate-400">
                {db.school.academic_year} · {db.school.term}
              </div>
            </div>
            <button
              className="btn-ghost btn-sm"
              onClick={() => setSetting('theme', dark ? 'light' : 'dark')}
              aria-label={dark ? 'الوضع الفاتح' : 'الوضع الداكن'}
            >
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button
              className="btn-ghost btn-sm"
              onClick={() => { logout(); navigate('/login'); }}
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">خروج</span>
            </button>
          </div>
        </header>
        <main className="mx-auto w-full min-w-0 max-w-[1500px] flex-1 p-3 sm:p-5">
          <Outlet />
        </main>
        <footer className="no-print border-t border-slate-200 px-4 py-3 text-center text-[11px] text-slate-400 dark:border-slate-800">
          بيانات تجريبية محلية — لا يتصل التطبيق بأي خادم. الإصدار 1.0.0
        </footer>
      </div>
      <Toasts />
    </div>
  );
}
