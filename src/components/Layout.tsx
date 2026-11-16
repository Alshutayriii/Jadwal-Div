import React, { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Menu, X, Moon, Sun, LogOut, Search, Keyboard, Command, ArrowLeft,
} from 'lucide-react';
import { useApp } from '../store';
import { cn, Modal } from './ui';
import { NAV } from '../nav';
import CommandPalette from './CommandPalette';
import Onboarding from './Onboarding';

const MOBILE_NAV = ['/', '/timetable', '/absence', '/duty', '/reports'];

const SHORTCUTS: Array<[string, string]> = [
  ['Ctrl / ⌘ + K', 'البحث الشامل عن صفحة أو معلم أو شعبة'],
  ['Ctrl + Z', 'تراجع عن آخر تعديل في الجدول'],
  ['Ctrl + Shift + Z أو Ctrl + Y', 'إعادة التعديل'],
  ['Esc', 'إلغاء السحب أو إغلاق النافذة'],
  ['؟ أو Shift + /', 'عرض هذه القائمة'],
];

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  return (
    <div className="no-print fixed bottom-24 left-4 z-[60] flex w-[min(92vw,22rem)] flex-col gap-2 lg:bottom-4">
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
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const dark = db.settings.theme === 'dark';

  useEffect(() => { setOpen(false); }, [location.pathname]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if (typing) return;
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) { e.preventDefault(); setHelp(true); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!session) return null;
  const items = NAV.filter((n) => perm(n.module, 'view'));
  const current = NAV.find((n) => n.to === location.pathname);
  const mobile = items.filter((n) => MOBILE_NAV.includes(n.to));

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
          <div className="flex items-center gap-2 px-3 py-3 sm:px-5">
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
              className="btn-ghost btn-sm hidden items-center gap-2 text-slate-500 sm:flex"
              onClick={() => window.dispatchEvent(new Event('stp:search'))}
              title="بحث شامل (Ctrl+K)"
            >
              <Search size={15} />
              <span className="hidden md:inline">بحث…</span>
              <kbd className="hidden items-center gap-0.5 rounded-md border border-slate-200 px-1 py-0.5 text-[10px] font-bold text-slate-400 dark:border-slate-700 md:flex">
                <Command size={9} /> K
              </kbd>
            </button>
            <button className="btn-ghost btn-sm sm:hidden" onClick={() => window.dispatchEvent(new Event('stp:search'))} aria-label="بحث">
              <Search size={17} />
            </button>
            <button className="btn-ghost btn-sm hidden sm:inline-flex" onClick={() => setHelp(true)} aria-label="الاختصارات" title="اختصارات لوحة المفاتيح">
              <Keyboard size={17} />
            </button>
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
        <main className="mx-auto w-full min-w-0 max-w-[1500px] flex-1 p-3 pb-24 sm:p-5 lg:pb-5">
          <Suspense fallback={(
            <div className="grid place-items-center py-16 text-center text-sm text-slate-400">
              <div className="mb-2 h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-brand-600" />
              جارٍ فتح الصفحة…
            </div>
          )}>
            <Outlet />
          </Suspense>
        </main>
        <footer className="no-print hidden border-t border-slate-200 px-4 py-3 text-center text-[11px] text-slate-400 dark:border-slate-800 sm:block">
          بيانات تجريبية محلية — لا يتصل التطبيق بأي خادم. الإصدار 1.1.0
        </footer>
      </div>

      {/* شريط التنقل السفلي للجوال */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {mobile.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => cn(
                'flex flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-bold transition',
                isActive ? 'text-brand-700 dark:text-brand-300' : 'text-slate-500 dark:text-slate-400',
              )}
            >
              <item.icon size={19} />
              <span className="truncate">{item.label.split(' ')[0]}</span>
            </NavLink>
          ))}
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>

      <CommandPalette />
      <Onboarding />
      <Modal open={help} onClose={() => setHelp(false)} title="اختصارات لوحة المفاتيح"
        footer={<button className="btn-ghost" onClick={() => setHelp(false)}>إغلاق</button>}>
        <div className="space-y-2">
          {SHORTCUTS.map(([keys, desc]) => (
            <div key={keys} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-xs dark:bg-slate-950">
              <span className="text-slate-600 dark:text-slate-300">{desc}</span>
              <kbd className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300" dir="ltr">{keys}</kbd>
            </div>
          ))}
        </div>
        <button
          className="btn-ghost btn-sm mt-3 w-full"
          onClick={() => { setHelp(false); window.dispatchEvent(new Event('stp:onboarding')); }}
        >
          <ArrowLeft size={14} /> إعادة الجولة التعريفية
        </button>
      </Modal>
      <Toasts />
    </div>
  );
}
