import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Database, Download, GitCompare, KeyRound, Loader2, Lock, RotateCcw, Save, Settings as SettingsIcon,
  ShieldCheck, Sparkles, Trash2, Upload, Camera,
} from 'lucide-react';
import { useApp, usePerm } from '../store';
import { Badge, Card, DataTable, Field, PageHeader, cn } from '../components/ui';
import { downloadBlob } from '../lib/reports';
import { decryptText, encryptText, isEncryptedBackup } from '../lib/crypto';
import {
  createSnapshot, deleteSnapshot, diffSnapshots, listSnapshots, snapshotToBackup,
} from '../lib/snapshots';

const MODULES = [
  ['dashboard', 'لوحة التحكم'], ['portal', 'بوابة المعلم'], ['school', 'بيانات المدرسة'],
  ['teachers', 'المعلمون'], ['subjects', 'المواد'], ['sections', 'الصفوف والشعب'],
  ['timetable', 'الجدول'], ['absence', 'الغياب'], ['duty', 'الإشراف'],
  ['calendar', 'التقويم'], ['reports', 'التقارير'], ['users', 'المستخدمون'], ['settings', 'الإعدادات'],
];
const ROLES = [
  ['system_admin', 'مدير النظام'], ['principal', 'مدير المدرسة'], ['vice', 'الوكيل'],
  ['scheduler', 'مسؤول الجدول'], ['teacher', 'معلم'],
];
const LEVELS = [['none', 'لا شيء'], ['view', 'عرض'], ['edit', 'تعديل']];

export default function Settings() {
  const { db, session, setPermission, setSetting, backup, restore, resetDemo, toast } = useApp();
  const canEdit = usePerm('settings', 'edit');
  const navigate = useNavigate();
  const [cover, setCover] = useState(() => { try { return JSON.parse(db.settings.cover_settings || '{}'); } catch { return {}; } });
  const [duty, setDuty] = useState(() => { try { return JSON.parse(db.settings.duty_settings || '{}'); } catch { return {}; } });
  const [encPass, setEncPass] = useState('');
  const [encPass2, setEncPass2] = useState('');
  const [restorePass, setRestorePass] = useState('');
  const [busy, setBusy] = useState(false);
  const [snaps, setSnaps] = useState(() => listSnapshots());
  const [diffPair, setDiffPair] = useState<{ a?: string; b?: string }>({});
  const encFileRef = useRef<HTMLInputElement | null>(null);

  const diff = useMemo(() => {
    const a = snaps.find((s) => s.id === diffPair.a);
    const b = snaps.find((s) => s.id === diffPair.b);
    if (!a || !b) return null;
    return { a, b, result: diffSnapshots(a, b) };
  }, [snaps, diffPair]);

  function saveCover() {
    try {
      setSetting('cover_settings', JSON.stringify({
        maxPerDay: Number(cover.maxPerDay || 2), maxPerWeek: Number(cover.maxPerWeek || 5),
      }));
      toast('ok', 'تم حفظ سقوف الانتظار');
    } catch (err: any) { toast('err', err.message); }
  }

  function saveDuty() {
    setSetting('duty_settings', JSON.stringify({
      maxPerDay: Number(duty.maxPerDay || 2), avoidConsecutiveDays: duty.avoidConsecutiveDays !== false,
    }));
    toast('ok', 'تم حفظ إعدادات الإشراف');
  }

  function doBackup() {
    downloadBlob(`نسخة-جدول-المدرسة-${new Date().toISOString().slice(0, 10)}.json`, new Blob([backup()], { type: 'application/json' }));
    toast('ok', 'تم تنزيل النسخة الاحتياطية');
  }

  function doRestore(file?: File) {
    if (!file) return;
    if (!confirm('استعادة النسخة ستستبدل كل البيانات الحالية. متابعة؟')) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        restore(String(reader.result));
        toast('ok', 'تمت الاستعادة بنجاح');
      } catch (err: any) { toast('err', err.message); }
    };
    reader.readAsText(file, 'utf-8');
  }

  async function doEncryptedBackup() {
    if (encPass.length < 6) { toast('err', 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.'); return; }
    if (encPass !== encPass2) { toast('err', 'كلمتا المرور غير متطابقتين.'); return; }
    setBusy(true);
    try {
      const text = await encryptText(backup(), encPass);
      downloadBlob(`نسخة-مشفرة-${new Date().toISOString().slice(0, 10)}.json`, new Blob([text], { type: 'application/json' }));
      setEncPass('');
      setEncPass2('');
      toast('ok', 'تم إنشاء النسخة المشفّرة (AES-256-GCM)');
    } catch (err: any) { toast('err', err.message); }
    finally { setBusy(false); }
  }

  async function doEncryptedRestore(file?: File) {
    if (!file) return;
    if (!restorePass) { toast('err', 'أدخل كلمة مرور النسخة المشفّرة أولًا.'); return; }
    setBusy(true);
    try {
      const raw = await file.text();
      if (!isEncryptedBackup(raw)) throw new Error('الملف ليس نسخة مشفّرة صالحة.');
      const plain = await decryptText(raw, restorePass);
      if (!confirm('فك التشفير ناجح. استعادة هذه النسخة ستستبدل البيانات الحالية. متابعة؟')) return;
      restore(plain);
      setRestorePass('');
      toast('ok', 'تم فك التشفير والاستعادة بنجاح');
    } catch (err: any) { toast('err', err.message); }
    finally { setBusy(false); if (encFileRef.current) encFileRef.current.value = ''; }
  }

  function doSnapshot() {
    try {
      const snap = createSnapshot(db);
      setSnaps(listSnapshots());
      toast('ok', `تم إنشاء لقطة (${snap.lessons} حصة)`);
    } catch (err: any) { toast('err', err.message); }
  }

  function doRestoreSnapshot(id: string) {
    const snap = snaps.find((s) => s.id === id);
    if (!snap) return;
    if (!confirm(`استعادة «${snap.label}» ستستبدل البيانات الحالية. متابعة؟`)) return;
    try {
      restore(snapshotToBackup(snap));
      toast('ok', 'تمت استعادة اللقطة');
    } catch (err: any) { toast('err', err.message); }
  }

  function doDeleteSnapshot(id: string) {
    if (!confirm('حذف هذه اللقطة؟')) return;
    deleteSnapshot(id);
    setSnaps(listSnapshots());
    setDiffPair((p) => ({ a: p.a === id ? undefined : p.a, b: p.b === id ? undefined : p.b }));
    toast('ok', 'تم حذف اللقطة');
  }

  async function doReset() {
    if (!confirm('إعادة كل البيانات إلى النسخة التجريبية؟ سيُحذف كل ما أضفته.')) return;
    await resetDemo();
    toast('ok', 'تمت إعادة البيانات التجريبية');
    navigate('/login');
  }

  const sessionUser = session?.user;

  return (
    <div>
      <PageHeader icon={SettingsIcon} title="الإعدادات" subtitle="الصلاحيات والسقوف والنسخ الاحتياطي المشفّر واللقطات وسجل التدقيق" />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2">
          <h2 className="mb-1 font-extrabold">مصفوفة الصلاحيات</h2>
          <p className="mb-3 text-xs text-slate-400">تُفحص الصلاحية عند تنفيذ العملية لا في الأزرار فقط.</p>
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="min-w-full divide-y divide-slate-200 text-xs dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-900"><tr><th className="table-th">الوحدة</th>{ROLES.map(([r, l]) => <th key={r} className="table-th">{l}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {MODULES.map(([m, label]) => (
                  <tr key={m}>
                    <td className="table-td font-semibold">{label}</td>
                    {ROLES.map(([r]) => (
                      <td key={r} className="table-td">
                        <select
                          className="input py-1 text-xs" value={db.permissions?.[r]?.[m] || 'none'}
                          onChange={(e) => setPermission(r, m, e.target.value)} disabled={!canEdit}
                        >
                          {LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 flex items-center gap-2 font-extrabold"><ShieldCheck size={17} /> سقوف الانتظار</h2>
            <div className="grid grid-cols-2 gap-2">
              <Field label="يوميًا"><input className="input" type="number" min={1} max={6} value={cover.maxPerDay ?? 2} onChange={(e) => setCover({ ...cover, maxPerDay: e.target.value })} disabled={!canEdit} /></Field>
              <Field label="أسبوعيًا"><input className="input" type="number" min={1} max={20} value={cover.maxPerWeek ?? 5} onChange={(e) => setCover({ ...cover, maxPerWeek: e.target.value })} disabled={!canEdit} /></Field>
            </div>
            <button className="btn-ghost btn-sm mt-3 w-full" onClick={saveCover} disabled={!canEdit}><Save size={14} /> حفظ</button>
          </Card>

          <Card>
            <h2 className="mb-3 flex items-center gap-2 font-extrabold"><ShieldCheck size={17} /> إعدادات الإشراف</h2>
            <Field label="الحد اليومي للمناوبات"><input className="input" type="number" min={1} max={5} value={duty.maxPerDay ?? 2} onChange={(e) => setDuty({ ...duty, maxPerDay: e.target.value })} disabled={!canEdit} /></Field>
            <label className="mt-2 flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={duty.avoidConsecutiveDays !== false} onChange={(e) => setDuty({ ...duty, avoidConsecutiveDays: e.target.checked })} disabled={!canEdit} /> تفضيل عدم التكرار في أيام متتالية</label>
            <button className="btn-ghost btn-sm mt-3 w-full" onClick={saveDuty} disabled={!canEdit}><Save size={14} /> حفظ</button>
          </Card>

          <Card>
            <h2 className="mb-2 flex items-center gap-2 font-extrabold"><Database size={17} /> النسخ الاحتياطي</h2>
            <div className="space-y-2">
              <button className="btn-ghost btn-sm w-full" onClick={doBackup}><Download size={14} /> تنزيل نسخة JSON عادية</button>
              <label className="btn-ghost btn-sm w-full cursor-pointer"><Upload size={14} /> استعادة من ملف JSON<input type="file" accept=".json,application/json" className="hidden" onChange={(e) => doRestore(e.target.files?.[0])} /></label>
              <button className="btn-ghost btn-sm w-full text-rose-600" onClick={doReset}><RotateCcw size={14} /> إعادة البيانات التجريبية</button>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-slate-400">
              البيانات محفوظة في localStorage لهذا المتصفح. مسح بيانات الموقع يحذفها — نزّل نسخة احتياطية دوريًا.
            </p>
          </Card>

          <Card>
            <h2 className="mb-2 flex items-center gap-2 font-extrabold"><Lock size={17} /> نسخة مشفّرة</h2>
            <p className="mb-2 text-[11px] leading-5 text-slate-400">تشفير AES-256-GCM بمفتاح مشتق من كلمة المرور (PBKDF2). لا يمكن فتحها دون الكلمة.</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="كلمة المرور"><input className="input" type="password" value={encPass} onChange={(e) => setEncPass(e.target.value)} autoComplete="new-password" /></Field>
              <Field label="تأكيد الكلمة"><input className="input" type="password" value={encPass2} onChange={(e) => setEncPass2(e.target.value)} autoComplete="new-password" /></Field>
            </div>
            <button className="btn-primary btn-sm mt-3 w-full" onClick={doEncryptedBackup} disabled={busy}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />} إنشاء نسخة مشفّرة
            </button>
            <Field label="كلمة مرور الاستعادة"><input className="input mt-2" type="password" value={restorePass} onChange={(e) => setRestorePass(e.target.value)} autoComplete="current-password" /></Field>
            <label className={cn('btn-ghost btn-sm mt-2 w-full cursor-pointer', busy && 'pointer-events-none opacity-50')}>
              <Upload size={14} /> استعادة نسخة مشفّرة
              <input ref={encFileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => doEncryptedRestore(e.target.files?.[0])} />
            </label>
          </Card>
        </div>
      </div>

      <Card className="mt-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 font-extrabold"><Camera size={17} /> لقطات الجدول (نسخ سريعة)</h2>
            <p className="mt-1 text-[11px] text-slate-400">تُحفظ محليًا حتى 8 لقطات، ويمكن مقارنة أي لقطتين قبل الاستعادة.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost btn-sm" onClick={doSnapshot}><Sparkles size={14} /> لقطة الآن</button>
          </div>
        </div>
        {snaps.length ? (
          <>
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="min-w-full divide-y divide-slate-200 text-xs dark:divide-slate-800">
                <thead className="bg-slate-50 dark:bg-slate-900">
                  <tr>
                    <th className="table-th">اللقطة</th><th className="table-th">الوقت</th>
                    <th className="table-th">الجدول</th><th className="table-th">حصص</th>
                    <th className="table-th">الحجم</th><th className="table-th">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {snaps.map((s) => (
                    <tr key={s.id}>
                      <td className="table-td font-semibold">{s.label}</td>
                      <td className="table-td text-slate-400">{new Date(s.at).toLocaleString('ar-SA')}</td>
                      <td className="table-td">{s.scheduleName}</td>
                      <td className="table-td">{s.lessons}</td>
                      <td className="table-td">{Math.round(s.size / 1024)} ك.ب</td>
                      <td className="table-td">
                        <div className="flex gap-1">
                          <button className="btn-ghost btn-sm" onClick={() => doRestoreSnapshot(s.id)}>استعادة</button>
                          <button className="btn-ghost btn-sm" onClick={() => setDiffPair((p) => ({ ...p, a: s.id }))} title="اختيار للمقارنة">A</button>
                          <button className="btn-ghost btn-sm" onClick={() => setDiffPair((p) => ({ ...p, b: s.id }))} title="اختيار للمقارنة">B</button>
                          <button className="btn-ghost btn-sm text-rose-600" onClick={() => doDeleteSnapshot(s.id)}><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[150px] flex-1">
                  <Field label="اللقطة A">
                    <select className="input" value={diffPair.a || ''} onChange={(e) => setDiffPair((p) => ({ ...p, a: e.target.value || undefined }))}>
                      <option value="">اختر…</option>
                      {snaps.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="min-w-[150px] flex-1">
                  <Field label="اللقطة B">
                    <select className="input" value={diffPair.b || ''} onChange={(e) => setDiffPair((p) => ({ ...p, b: e.target.value || undefined }))}>
                      <option value="">اختر…</option>
                      {snaps.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </Field>
                </div>
                <Badge tone={diff ? 'brand' : 'slate'}><GitCompare size={13} className="ml-1" /> {diff ? 'مقارنة جاهزة' : 'اختر لقطتين'}</Badge>
              </div>
              {diff ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-xl bg-white p-2.5 text-center text-xs dark:bg-slate-900">
                    <div className="text-slate-400">حُصص تغيّر وقتها/معلمها</div><div className="text-lg font-extrabold">{diff.result.changedLessons}</div>
                  </div>
                  <div className="rounded-xl bg-white p-2.5 text-center text-xs dark:bg-slate-900">
                    <div className="text-slate-400">حصص مضافة / محذوفة</div><div className="text-lg font-extrabold">{diff.result.addedLessons} / {diff.result.removedLessons}</div>
                  </div>
                  <div className="rounded-xl bg-white p-2.5 text-center text-xs dark:bg-slate-900">
                    <div className="text-slate-400">بيانات المدرسة</div><div className="text-lg font-extrabold">{diff.result.schoolsDiffer ? 'مختلفة' : 'متطابقة'}</div>
                  </div>
                  <div className="sm:col-span-3 overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead><tr><th className="table-th">العنصر</th><th className="table-th">A</th><th className="table-th">B</th><th className="table-th">الفرق</th></tr></thead>
                      <tbody>
                        {diff.result.counts.filter((c) => c.before || c.after).map((c) => (
                          <tr key={c.key}>
                            <td className="table-td">{c.label}</td>
                            <td className="table-td">{c.before}</td>
                            <td className="table-td">{c.after}</td>
                            <td className={cn('table-td font-bold', c.delta > 0 ? 'text-emerald-600' : c.delta < 0 ? 'text-rose-600' : 'text-slate-400')}>
                              {c.delta > 0 ? `+${c.delta}` : c.delta}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400 dark:border-slate-700">
            لا لقطات بعد. اضغط «لقطة الآن» قبل أي تجربة كبيرة لتعود إليها فورًا.
          </p>
        )}
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 font-extrabold">سجل التدقيق</h2>
        <DataTable
          rows={db.audit_log}
          pageSize={10}
          columns={[
            { key: 'created_at', label: 'الوقت', render: (r: any) => new Date(r.created_at).toLocaleString('ar-SA') },
            { key: 'username', label: 'المستخدم' },
            { key: 'action', label: 'العملية' },
            { key: 'entity', label: 'الوحدة' },
            { key: 'details', label: 'التفاصيل' },
          ]}
        />
      </Card>

      <Card className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-extrabold">حول البرنامج</h2>
            <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
              الإصدار 1.1.0 · React + Vite + PWA · يعمل دون إنترنت بعد التحميل الأول · لا خادم ولا تتبع.
              الحساب الحالي: <b>{sessionUser?.name}</b> ({sessionUser?.role}).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-ghost btn-sm" onClick={() => window.dispatchEvent(new Event('stp:onboarding'))}>
              <Sparkles size={14} /> إعادة الجولة التعريفية
            </button>
            <Badge tone="green">بياناتك على جهازك فقط</Badge>
          </div>
        </div>
      </Card>
    </div>
  );
}
