import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Database, Download, RotateCcw, Save, Settings as SettingsIcon, ShieldCheck, Upload } from 'lucide-react';
import { useApp, usePerm } from '../store';
import { Badge, Card, DataTable, Field, PageHeader } from '../components/ui';
import { downloadBlob } from '../lib/reports';

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

  async function doReset() {
    if (!confirm('إعادة كل البيانات إلى النسخة التجريبية؟ سيُحذف كل ما أضفته.')) return;
    await resetDemo();
    toast('ok', 'تمت إعادة البيانات التجريبية');
    navigate('/login');
  }

  const sessionUser = session?.user;

  return (
    <div>
      <PageHeader icon={SettingsIcon} title="الإعدادات" subtitle="الصلاحيات والسقوف والنسخ الاحتياطي وسجل التدقيق" />

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
              <button className="btn-ghost btn-sm w-full" onClick={doBackup}><Download size={14} /> تنزيل نسخة JSON</button>
              <label className="btn-ghost btn-sm w-full cursor-pointer"><Upload size={14} /> استعادة من ملف<input type="file" accept=".json,application/json" className="hidden" onChange={(e) => doRestore(e.target.files?.[0])} /></label>
              <button className="btn-ghost btn-sm w-full text-rose-600" onClick={doReset}><RotateCcw size={14} /> إعادة البيانات التجريبية</button>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-slate-400">
              البيانات محفوظة في localStorage لهذا المتصفح. مسح بيانات الموقع يحذفها — نزّل نسخة احتياطية دوريًا.
            </p>
          </Card>
        </div>
      </div>

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
              الإصدار 1.0.0 · React + Vite + PWA · يعمل دون إنترنت بعد التحميل الأول · لا خادم ولا تتبع.
              الحساب الحالي: <b>{sessionUser?.name}</b> ({sessionUser?.role}).
            </p>
          </div>
          <Badge tone="green">بياناتك على جهازك فقط</Badge>
        </div>
      </Card>
    </div>
  );
}
