import { useState } from 'react';
import { CalendarDays, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { useApp, usePerm } from '../store';
import { parseCalendarCsv } from '../lib/calendar-import';
import { Badge, DataTable, Field, Modal, PageHeader } from '../components/ui';

const TYPES = [
  { value: 'holiday', label: 'إجازة رسمية' }, { value: 'school_holiday', label: 'إجازة مدرسية' },
  { value: 'exam', label: 'اختبارات' }, { value: 'event', label: 'فعالية' }, { value: 'other', label: 'أخرى' },
];
const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.value, t.label]));

const SAMPLE = `العنوان,النوع,من تاريخ,إلى تاريخ,ملاحظات
إجازة اليوم الوطني,holiday,2026-09-23,2026-09-23,عطلة رسمية
اختبارات منتصف الفصل,exam,2026-10-11,2026-10-15,تقديري`;

export default function Calendar() {
  const { db, saveEntity, deleteEntity, importCalendar, toast } = useApp();
  const canEdit = usePerm('calendar', 'edit');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ title: '', type: 'event', start_date: '', end_date: '', note: '' });
  const [editing, setEditing] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<any>(null);

  function start(row?: any) {
    setEditing(row?.id ?? null);
    setForm(row ? { ...row } : { title: '', type: 'event', start_date: '', end_date: '', note: '' });
    setOpen(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      saveEntity('calendar_events', { ...form, end_date: form.end_date || form.start_date }, editing);
      toast('ok', 'تم حفظ الحدث');
      setOpen(false);
    } catch (err: any) { toast('err', err.message); }
  }

  function remove(row: any) {
    if (!confirm(`حذف «${row.title}»؟`)) return;
    try { deleteEntity('calendar_events', row.id); toast('ok', 'تم الحذف'); }
    catch (err: any) { toast('err', err.message); }
  }

  function parse(text: string) {
    try {
      const res = parseCalendarCsv(text);
      setPreview(res);
    } catch (err: any) {
      setPreview({ events: [], errors: [err.message], hasHeader: false });
    }
  }

  function doImport() {
    if (!preview?.events?.length) return;
    const res = importCalendar(preview.events);
    toast('ok', `أُضيف ${res.added} حدثًا، وتُجاوز ${res.skipped} مكررًا`);
    setImportOpen(false); setCsv(''); setPreview(null);
  }

  return (
    <div>
      <PageHeader
        icon={CalendarDays}
        title="التقويم الدراسي"
        subtitle="أحداث وإجازات واختبارات — مع استيراد CSV عربي/إنجليزي"
        actions={canEdit ? (
          <>
            <button className="btn-ghost" onClick={() => { setImportOpen(true); setCsv(''); setPreview(null); }}><Upload size={16} /> استيراد CSV</button>
            <button className="btn-primary" onClick={() => start()}><Plus size={16} /> حدث جديد</button>
          </>
        ) : null}
      />

      <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        التواريخ التجريبية تقديرية وليست تقويمًا رسميًا. أدخل التواريخ المعتمدة من جهتك.
      </div>

      <DataTable
        rows={db.calendar_events}
        searchKeys={['title', 'type']}
        pageSize={12}
        columns={[
          { key: 'title', label: 'الحدث', render: (r: any) => <span className="font-semibold">{r.title}</span> },
          { key: 'type', label: 'النوع', render: (r: any) => <Badge tone={r.type === 'holiday' ? 'rose' : r.type === 'exam' ? 'amber' : 'teal'}>{TYPE_LABEL[r.type] || r.type}</Badge> },
          { key: 'start_date', label: 'من' },
          { key: 'end_date', label: 'إلى' },
          { key: 'note', label: 'ملاحظات' },
        ]}
        actions={(r: any) => (
          <div className="flex gap-1">
            <button className="btn-ghost btn-sm" onClick={() => start(r)} disabled={!canEdit}><Pencil size={14} /></button>
            <button className="btn-ghost btn-sm text-rose-600" onClick={() => remove(r)} disabled={!canEdit}><Trash2 size={14} /></button>
          </div>
        )}
      />

      <Modal
        open={open} onClose={() => setOpen(false)} title={editing ? 'تعديل حدث' : 'إضافة حدث'}
        footer={<><button className="btn-ghost" onClick={() => setOpen(false)}>إلغاء</button><button className="btn-primary" form="event-form">حفظ</button></>}
      >
        <form id="event-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="عنوان الحدث"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></Field></div>
          <Field label="النوع">
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="ملاحظات"><input className="input" value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
          <Field label="من تاريخ"><input className="input" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required /></Field>
          <Field label="إلى تاريخ"><input className="input" type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></Field>
        </form>
      </Modal>

      <Modal
        open={importOpen} onClose={() => setImportOpen(false)} title="استيراد التقويم من CSV" wide
        footer={<>
          <button className="btn-ghost" onClick={() => parse(SAMPLE)}>تجربة نموذج</button>
          <button className="btn-primary" onClick={doImport} disabled={!preview?.events?.length}>استيراد {preview?.events?.length || 0} حدثًا</button>
        </>}
      >
        <div className="space-y-3">
          <Field label="ملف CSV" hint="الرؤوس المقبولة: العنوان/Title، النوع/Type، من تاريخ/Start، إلى تاريخ/End، ملاحظات/Notes. يفصل بينها فاصلة أو فاصلة منقوطة أو Tab.">
            <input
              className="input" type="file" accept=".csv,text/csv,.txt"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => { const text = String(reader.result); setCsv(text); parse(text); };
                reader.readAsText(file, 'utf-8');
              }}
            />
          </Field>
          <Field label="أو الصق المحتوى"><textarea className="input min-h-40 font-mono text-xs" dir="ltr" value={csv} onChange={(e) => { setCsv(e.target.value); if (e.target.value.trim()) parse(e.target.value); }} placeholder={SAMPLE} /></Field>
          {preview ? (
            <div className="space-y-2">
              <div className="flex gap-2 text-xs">
                <Badge tone="green">صالح: {preview.events.length}</Badge>
                <Badge tone={preview.errors.length ? 'rose' : 'slate'}>أخطاء: {preview.errors.length}</Badge>
                <Badge tone="slate">{preview.hasHeader ? 'برؤوس' : 'بلا رؤوس'}</Badge>
              </div>
              {preview.errors.length ? <ul className="max-h-28 overflow-y-auto rounded-xl bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">{preview.errors.map((e: string, i: number) => <li key={i}>• {e}</li>)}</ul> : null}
              {preview.events.length ? (
                <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 text-xs dark:border-slate-800">
                  <table className="min-w-full"><thead className="bg-slate-50 dark:bg-slate-900"><tr><th className="table-th">العنوان</th><th className="table-th">النوع</th><th className="table-th">من</th><th className="table-th">إلى</th></tr></thead>
                    <tbody>{preview.events.map((e: any, i: number) => <tr key={i}><td className="table-td">{e.title}</td><td className="table-td">{TYPE_LABEL[e.type] || e.type}</td><td className="table-td">{e.start_date}</td><td className="table-td">{e.end_date}</td></tr>)}</tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
