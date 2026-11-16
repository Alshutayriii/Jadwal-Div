import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useApp } from '../store';
import { DEMO_USERS } from '../lib/auth';
import { Card, Field, cn } from '../components/ui';

const ROLE_LABEL: Record<string, string> = {
  system_admin: 'مدير النظام',
  principal: 'مدير المدرسة',
  vice: 'وكيل المدرسة',
  scheduler: 'مسؤول الجدول',
  teacher: 'معلم',
};

export default function Login() {
  const { login, session, db, toast } = useApp();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/" replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await login(username, password);
    setBusy(false);
    if (!res.ok) setError(res.error || 'تعذّر الدخول');
    else toast('ok', 'مرحبًا بك في جدول المدرسة Pro');
  }

  return (
    <div className="grid min-h-screen bg-slate-50 dark:bg-slate-950 lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-brand-800 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-white/10" />
        <div className="absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-brand-500/30" />
        <div className="relative">
          <div className="mb-8 flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15 text-2xl font-black">ج</span>
            <div>
              <div className="text-lg font-extrabold">جدول المدرسة Pro</div>
              <div className="text-xs text-white/70">إدارة الجداول الدراسية</div>
            </div>
          </div>
          <h1 className="max-w-lg text-3xl font-black leading-snug">
            جدولٌ يُبنى بقيود صارمة، وتعارضاتٌ تُكشف قبل النشر.
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-7 text-white/80">
            توليد آلي، غياب وانتظار، إشراف بعدالة، 13 تقريرًا، وتصدير PDF وCSV وExcel عربي —
            يعمل دون إنترنت ويحفظ بياناتك على جهازك فقط.
          </p>
        </div>
        <div className="relative grid grid-cols-2 gap-3 text-sm">
          {[
            ['420', 'حصة أسبوعية جاهزة'],
            ['0', 'طلبات إنترنت'],
            ['12', 'تقريرًا'],
            ['5', 'أدوار صلاحيات'],
          ].map(([v, l]) => (
            <div key={l} className="rounded-2xl bg-white/10 p-4">
              <div className="text-2xl font-black">{v}</div>
              <div className="text-xs text-white/70">{l}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center p-4 sm:p-8">
        <Card className="w-full max-w-md">
          <div className="mb-6 text-center lg:text-right">
            <div className="text-xs font-bold text-brand-700 dark:text-brand-300">{db.school.name}</div>
            <h2 className="mt-1 text-2xl font-black">تسجيل الدخول</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              الدخول محلي بالكامل. لا تُرسل كلمة المرور إلى أي خادم.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <Field label="اسم المستخدم">
              <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
            </Field>
            <Field label="كلمة المرور">
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </Field>
            {error ? <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</div> : null}
            <button className="btn-primary w-full" disabled={busy}>{busy ? 'جارٍ التحقق…' : 'دخول'}</button>
          </form>

          <div className="mt-6">
            <div className="mb-2 text-xs font-bold text-slate-400">حسابات تجريبية — اضغط للتعبئة</div>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_USERS.map((u) => (
                <button
                  key={u.username}
                  type="button"
                  onClick={() => { setUsername(u.username); setPassword(u.password); setError(''); }}
                  className={cn('btn-ghost btn-sm justify-start', username === u.username && 'border-brand-500 text-brand-700 dark:text-brand-300')}
                >
                  <span className="truncate">{ROLE_LABEL[u.role]}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              بيانات تجريبية فقط. غيّر كلمات المرور من «المستخدمون» قبل الاستخدام الحقيقي. التقويم تقديري وليس رسميًا.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
