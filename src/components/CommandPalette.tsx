import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, FolderTree, Grid3X3, Search, UserRound, Users, X, Command,
} from 'lucide-react';
import { useApp } from '../store';
import { NAV } from '../nav';
import { cn } from './ui';

interface ResultItem {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: any;
  to: string;
  state?: any;
}

const norm = (value: unknown) => String(value ?? '').toLowerCase()
  .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
  .replace(/[أإآ]/g, 'ا')
  .replace(/ى/g, 'ي')
  .replace(/ة/g, 'ه')
  .trim();

export default function CommandPalette() {
  const { db, session, perm } = useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onOpen() { setOpen(true); setQ(''); setActive(0); }
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
        setQ('');
        setActive(0);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('stp:search', onOpen as any);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('stp:search', onOpen as any);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  const items = useMemo<ResultItem[]>(() => {
    if (!session) return [];
    const pages: ResultItem[] = NAV.filter((n) => perm(n.module, 'view')).map((n) => ({
      id: `page-${n.to}`, label: n.label, hint: n.keywords, group: 'الصفحات', icon: n.icon, to: n.to,
    }));
    const teachers: ResultItem[] = db.teachers.filter((t) => t.active !== 0).map((t) => ({
      id: `teacher-${t.id}`, label: t.name, hint: `${t.specialty || ''}${t.employee_no ? ` · ${t.employee_no}` : ''}`,
      group: 'المعلمون', icon: UserRound, to: `/reports?type=teacher_schedule&teacher=${t.id}`,
    }));
    const sections: ResultItem[] = db.sections.filter((s) => s.active !== 0).map((s) => {
      const grade = db.grades.find((g) => g.id === s.grade_id)?.name || '';
      return {
        id: `section-${s.id}`, label: `${grade} — شعبة ${s.name}`, hint: `${s.students || 0} طالبًا`,
        group: 'الشعب', icon: FolderTree, to: `/timetable?section=${s.id}`,
      };
    });
    const subjects: ResultItem[] = db.subjects.filter((s) => s.active !== 0).map((s) => ({
      id: `subject-${s.id}`, label: s.name, hint: `${s.weekly_periods} حصة أسبوعيًا`,
      group: 'المواد', icon: BookOpen, to: `/subjects?q=${encodeURIComponent(s.name)}`,
    }));
    return [...pages, ...sections, ...teachers, ...subjects];
  }, [db, session, perm]);

  const filtered = useMemo(() => {
    const needle = norm(q);
    if (!needle) return items.slice(0, 12);
    return items.filter((i) => norm(i.label).includes(needle) || norm(i.hint).includes(needle)
      || norm(i.group).includes(needle)).slice(0, 30);
  }, [items, q]);

  useEffect(() => { setActive(0); }, [q]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function choose(item?: ResultItem) {
    const target = item || filtered[active];
    if (!target) return;
    setOpen(false);
    navigate(target.to);
  }

  if (!open) return null;

  const groups = filtered.reduce((acc: Record<string, Array<ResultItem & { idx: number }>>, item) => {
    const idx = filtered.indexOf(item);
    (acc[item.group] ||= []).push({ ...item, idx });
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-950/50 p-4 pt-[10vh]" onMouseDown={() => setOpen(false)} role="dialog" aria-modal="true" aria-label="البحث الشامل">
      <div className="card w-full max-w-2xl overflow-hidden p-0" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <Search size={18} className="shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(filtered.length - 1, a + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              if (e.key === 'Enter') { e.preventDefault(); choose(); }
              if (e.key === 'Escape') setOpen(false);
            }}
            placeholder="ابحث عن صفحة، معلم، شعبة، مادة…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
          <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="إغلاق"><X size={17} /></button>
        </div>
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-2">
          {filtered.length ? Object.entries(groups).map(([group, rows]) => (
            <div key={group} className="mb-1">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{group}</div>
              {rows.map((item) => (
                <button
                  key={item.id}
                  data-idx={item.idx}
                  onClick={() => choose(item)}
                  onMouseEnter={() => setActive(item.idx)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-right text-sm transition',
                    active === item.idx ? 'bg-brand-50 text-brand-900 dark:bg-brand-900/40 dark:text-brand-100' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60',
                  )}
                >
                  <item.icon size={16} className="shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{item.label}</span>
                    {item.hint ? <span className="block truncate text-[11px] text-slate-400">{item.hint}</span> : null}
                  </span>
                  <ArrowLeft size={14} className="shrink-0 text-slate-300" />
                </button>
              ))}
            </div>
          )) : (
            <div className="grid place-items-center gap-1 py-10 text-center text-sm text-slate-400">
              <Grid3X3 size={26} />
              لا نتائج مطابقة
            </div>
          )}
        </div>
        <div className="hidden items-center justify-between border-t border-slate-200 px-4 py-2 text-[10px] text-slate-400 dark:border-slate-800 sm:flex">
          <span className="flex items-center gap-1"><Command size={11} /> K للفتح في أي وقت</span>
          <span>↑ ↓ للتنقل · Enter للفتح · Esc للإغلاق</span>
        </div>
      </div>
    </div>
  );
}
