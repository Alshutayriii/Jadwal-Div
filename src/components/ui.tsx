import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Search, X } from 'lucide-react';

export const cn = (...args: any[]) => clsx(args);

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('card p-5', className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions, icon: Icon }: any) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        {Icon ? (
          <span className="mt-0.5 grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
            <Icon size={22} />
          </span>
        ) : null}
        <div>
          <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'brand' }: any) {
  const tones: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200',
    green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200',
    teal: 'bg-teal-50 text-teal-700 dark:bg-teal-900/40 dark:text-teal-200',
  };
  return (
    <div className="card flex items-center gap-4 p-4">
      {Icon ? <span className={cn('grid h-12 w-12 place-items-center rounded-2xl', tones[tone])}><Icon size={22} /></span> : null}
      <div className="min-w-0">
        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</div>
        <div className="text-2xl font-extrabold leading-tight">{value}</div>
        {hint ? <div className="truncate text-[11px] text-slate-400">{hint}</div> : null}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-slate-400">{hint}</span> : null}
    </label>
  );
}

export function Badge({ children, tone = 'slate' }: any) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
    green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
    rose: 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200',
    brand: 'bg-brand-100 text-brand-800 dark:bg-brand-900/50 dark:text-brand-200',
    teal: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200',
  };
  return <span className={cn('badge', tones[tone])}>{children}</span>;
}

export function Modal({ open, title, onClose, children, footer, wide }: any) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 sm:items-center" role="dialog" aria-modal="true">
      <div className={cn('card my-6 w-full p-0', wide ? 'max-w-4xl' : 'max-w-xl')}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <h2 className="text-base font-extrabold">{title}</h2>
          <button type="button" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={onClose} aria-label="إغلاق">
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">{footer}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, hint }: any) {
  return (
    <div className="grid place-items-center gap-2 rounded-2xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
      {Icon ? <Icon className="text-slate-400" size={30} /> : null}
      <div className="font-bold">{title}</div>
      {hint ? <div className="max-w-md text-sm text-slate-500 dark:text-slate-400">{hint}</div> : null}
    </div>
  );
}

export function DataTable({
  rows, columns, searchKeys = [], actions, empty = 'لا توجد بيانات', pageSize = 0, rowKey = 'id',
}: any) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r: any) => searchKeys.some((k: string) => String(r[k] ?? '').toLowerCase().includes(needle)));
  }, [rows, q, searchKeys]);

  const shown = useMemo(() => {
    if (!pageSize) return filtered;
    return filtered.slice(page * pageSize, page * pageSize + pageSize);
  }, [filtered, page, pageSize]);
  const pages = pageSize ? Math.max(1, Math.ceil(filtered.length / pageSize)) : 1;

  return (
    <div>
      {searchKeys.length ? (
        <div className="mb-3 flex items-center gap-2">
          <div className="relative max-w-sm flex-1">
            <Search size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pr-9" placeholder="بحث…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
          </div>
          <span className="text-xs text-slate-400">{filtered.length} سجل</span>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
          <thead className="bg-slate-50 dark:bg-slate-900/60">
            <tr>
              {columns.map((c: any) => <th key={c.key} className="table-th">{c.label}</th>)}
              {actions ? <th className="table-th">إجراءات</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {shown.map((row: any) => (
              <tr key={row[rowKey]} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                {columns.map((c: any) => (
                  <td key={c.key} className="table-td">{c.render ? c.render(row) : row[c.key] ?? '—'}</td>
                ))}
                {actions ? <td className="table-td">{actions(row)}</td> : null}
              </tr>
            ))}
            {!shown.length ? (
              <tr><td colSpan={columns.length + (actions ? 1 : 0)} className="px-3 py-8 text-center text-sm text-slate-400">{empty}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {pageSize && pages > 1 ? (
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <button className="btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>السابق</button>
          <span>صفحة {page + 1} من {pages}</span>
          <button className="btn-ghost btn-sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>التالي</button>
        </div>
      ) : null}
    </div>
  );
}
