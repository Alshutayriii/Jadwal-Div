import { useState } from 'react';
import { Building2, Clock, ImagePlus, Save, Trash2 } from 'lucide-react';
import { useApp, usePerm } from '../store';
import { Badge, Card, Field, PageHeader } from '../components/ui';

export default function School() {
  const { db, saveSchool, setDayActive, setPeriodActive, toast } = useApp();
  const canEdit = usePerm('school', 'edit');
  const [form, setForm] = useState({ ...db.school });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      saveSchool({
        ...form,
        max_daily_section: Number(form.max_daily_section),
      });
      toast('ok', 'تم حفظ بيانات المدرسة');
    } catch (err: any) { toast('err', err.message); }
  }

  function uploadLogo(file?: File) {
    if (!file) return;
    if (file.size > 1024 * 1024) { toast('err', 'حجم الشعار يجب أن يكون أقل من 1 ميجابايت'); return; }
    const reader = new FileReader();
    reader.onload = () => setForm({ ...form, logo: String(reader.result) });
    reader.readAsDataURL(file);
  }

  return (
    <div>
      <PageHeader icon={Building2} title="بيانات المدرسة" subtitle="الاسم والعام الدراسي والشعار والأيام والحصص" />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="اسم المدرسة"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!canEdit} required /></Field></div>
            <Field label="المرحلة">
              <select className="input" value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} disabled={!canEdit}>
                {['ابتدائي', 'متوسط', 'ثانوي'].map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="الفئة"><input className="input" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} disabled={!canEdit} /></Field>
            <Field label="العام الدراسي"><input className="input" value={form.academic_year} onChange={(e) => setForm({ ...form, academic_year: e.target.value })} disabled={!canEdit} /></Field>
            <Field label="الفصل الدراسي"><input className="input" value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} disabled={!canEdit} /></Field>
            <Field label="مدير المدرسة"><input className="input" value={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.value })} disabled={!canEdit} /></Field>
            <Field label="الجوال"><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={!canEdit} /></Field>
            <Field label="البريد"><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!canEdit} /></Field>
            <Field label="سقف الحصص اليومي للشعبة"><input className="input" type="number" min={1} max={12} value={form.max_daily_section} onChange={(e) => setForm({ ...form, max_daily_section: Number(e.target.value) })} disabled={!canEdit} /></Field>
            <div className="sm:col-span-2"><Field label="العنوان"><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} disabled={!canEdit} /></Field></div>
            <div className="sm:col-span-2"><Field label="الشعار (يظهر في ترويسة الطباعة)"><input className="input" value={form.motto} onChange={(e) => setForm({ ...form, motto: e.target.value })} disabled={!canEdit} /></Field></div>
            <div className="sm:col-span-2 flex justify-end"><button className="btn-primary" disabled={!canEdit}><Save size={16} /> حفظ البيانات</button></div>
          </form>
        </Card>

        <Card>
          <h2 className="mb-3 font-extrabold">شعار المدرسة</h2>
          <div className="grid place-items-center rounded-2xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
            {form.logo ? (
              <img src={form.logo} alt="شعار المدرسة" className="max-h-32 max-w-full object-contain" />
            ) : (
              <div className="py-6 text-center text-xs text-slate-400"><ImagePlus className="mx-auto mb-2" /> لا شعار — يمكنك رفع صورة PNG/JPG</div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="btn-ghost btn-sm cursor-pointer">
              رفع شعار
              <input type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden" onChange={(e) => uploadLogo(e.target.files?.[0])} disabled={!canEdit} />
            </label>
            {form.logo ? <button className="btn-ghost btn-sm text-rose-600" onClick={() => setForm({ ...form, logo: null })} disabled={!canEdit}><Trash2 size={14} /> إزالة</button> : null}
          </div>
          <p className="mt-3 text-[11px] leading-5 text-slate-400">يُحفظ الشعار داخل بياناتك المحلية فقط، ويُستخدم عند طباعة التقارير.</p>

          <h2 className="mb-2 mt-5 flex items-center gap-2 font-extrabold"><Clock size={17} /> الفصول الدراسية</h2>
          <div className="space-y-1 text-xs">
            {db.terms.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-2 py-1.5 dark:border-slate-800">
                <span>{t.name}</span><span className="text-slate-400">{t.start_date} → {t.end_date}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">تواريخ تجريبية تقديرية، وليست تقويمًا رسميًا معتمدًا.</p>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-extrabold">أيام الدراسة</h2>
          <div className="space-y-2">
            {db.days.slice().sort((a, b) => a.idx - b.idx).map((d) => (
              <label key={d.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 text-sm dark:border-slate-800">
                <span className="font-semibold">{d.name}</span>
                <input type="checkbox" checked={d.active !== 0} onChange={(e) => setDayActive(d.id, e.target.checked)} disabled={!canEdit} />
              </label>
            ))}
          </div>
        </Card>
        <Card>
          <h2 className="mb-3 font-extrabold">الحصص والفسحات</h2>
          <div className="space-y-2">
            {db.periods.slice().sort((a, b) => a.idx - b.idx).map((p) => (
              <label key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2 text-sm dark:border-slate-800">
                <span className="flex items-center gap-2 font-semibold">
                  {p.name}
                  <Badge tone={p.kind === 'break' ? 'amber' : 'teal'}>{p.kind === 'break' ? 'فسحة' : 'حصة'}</Badge>
                </span>
                <span className="text-xs text-slate-400">{p.start_time} - {p.end_time}</span>
                <input type="checkbox" checked={p.active !== 0} onChange={(e) => setPeriodActive(p.id, e.target.checked)} disabled={!canEdit} />
              </label>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
