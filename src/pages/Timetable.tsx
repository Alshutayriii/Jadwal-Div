import { useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Grid3X3, Lock, LockOpen, Plus, Rocket, Sparkles, Trash2, X,
} from 'lucide-react';
import { useApp, usePerm } from '../store';
import { activeSchedule, enrich, scheduleLessons } from '../lib/model';
import { detect } from '../lib/conflicts';
import { Badge, Card, Field, Modal, PageHeader, cn, EmptyState } from '../components/ui';

const TYPE_LABEL: Record<string, string> = {
  teacher_clash: 'تعارض معلم', section_clash: 'تعارض شعبة', room_clash: 'تعارض قاعة',
  unplaced: 'حصص غير موزعة', no_teacher: 'إسناد بلا معلم', teacher_overload: 'تجاوز النصاب',
  teacher_daily: 'تجاوز الحد اليومي', section_daily: 'سقف يوم الشعبة', unqualified: 'معلم غير مؤهل',
  unavailable: 'معلم غير متاح', subject_repeat: 'تكرار مادة', lab_missing: 'معمل ناقص',
  consecutive: 'تجاوز التجاور',
};

export default function Timetable() {
  const { db, generateSchedule, publishSchedule, addLesson, updateLesson, deleteLesson, toggleLock, toast } = useApp();
  const canEdit = usePerm('timetable', 'edit');
  const sch = activeSchedule(db);
  const lessons = useMemo(() => (sch ? scheduleLessons(db, sch.id) : []), [db, sch]);
  const days = db.days.filter((d) => d.active !== 0).sort((a, b) => a.idx - b.idx);
  const periods = db.periods.filter((p) => p.active !== 0 && p.kind !== 'break').sort((a, b) => a.idx - b.idx);
  const [sectionId, setSectionId] = useState<number>(db.sections[0]?.id || 0);
  const section = db.sections.find((s) => s.id === sectionId);
  const sectionLessons = lessons.filter((l) => l.section_id === sectionId);
  const ctx = useMemo(() => enrich(db), [db]);
  const conflicts = useMemo(() => detect({ ...ctx, lessons, school: db.school }), [ctx, lessons, db.school]);
  const [genOpen, setGenOpen] = useState(false);
  const [seed, setSeed] = useState(42);
  const [genResult, setGenResult] = useState<any>(null);
  const [cell, setCell] = useState<{ day: number; period: number; lesson?: any } | null>(null);
  const [form, setForm] = useState<any>({});

  const sectionAssignments = db.assignments.filter((a) => a.section_id === sectionId);
  const cellFor = (day: number, period: number) => sectionLessons.find((l) => l.day_id === day && l.period_id === period);

  function openCell(day: number, period: number) {
    const lesson = cellFor(day, period);
    if (!canEdit) return;
    if (lesson) {
      setForm({ ...lesson });
      setCell({ day, period, lesson });
    } else {
      const a = sectionAssignments[0];
      setForm({
        assignment_id: a?.id || null, section_id: sectionId, subject_id: a?.subject_id || db.subjects[0]?.id,
        teacher_id: a?.teacher_id || null, room_id: a?.room_id || section?.room_id || null, day_id: day, period_id: period,
      });
      setCell({ day, period });
    }
  }

  function saveCell(e: React.FormEvent) {
    e.preventDefault();
    if (!cell) return;
    const candidate = {
      ...form,
      section_id: sectionId,
      day_id: Number(form.day_id),
      period_id: Number(form.period_id),
      teacher_id: form.teacher_id ? Number(form.teacher_id) : null,
      room_id: form.room_id ? Number(form.room_id) : null,
      subject_id: Number(form.subject_id),
      assignment_id: form.assignment_id ? Number(form.assignment_id) : null,
    };
    try {
      const res = cell.lesson ? updateLesson(cell.lesson.id, candidate) : addLesson(candidate);
      if (!res.ok) { toast('err', res.problems.join(' • ')); return; }
      toast('ok', cell.lesson ? 'تم تحديث الحصة' : 'تمت إضافة الحصة');
      setCell(null);
    } catch (err: any) { toast('err', err.message); }
  }

  function doGenerate() {
    try {
      const res = generateSchedule({ seed: Number(seed), timeLimitMs: 7000, maxRestarts: 60 });
      setGenResult(res);
      setGenOpen(false);
      toast(res.unplaced?.length ? 'info' : 'ok', `وُضعت ${res.lessons.length} حصة من ${res.stats?.required ?? '—'}`);
    } catch (err: any) { toast('err', err.message); }
  }

  function doPublish() {
    if (!sch) return;
    if (conflicts.errors) { toast('err', `لا يمكن النشر: ${conflicts.errors} تعارضًا`); return; }
    try {
      publishSchedule(sch.id);
      toast('ok', 'تم نشر الجدول');
    } catch (err: any) { toast('err', err.message); }
  }

  function removeLesson() {
    if (!cell?.lesson || !confirm('حذف هذه الحصة من الجدول؟')) return;
    deleteLesson(cell.lesson.id);
    toast('ok', 'تم حذف الحصة');
    setCell(null);
  }

  if (!db.sections.length) return <EmptyState title="لا توجد شعب" hint="أضف الصفوف والشعب أولًا." />;

  return (
    <div>
      <PageHeader
        icon={Grid3X3}
        title="الجدول الدراسي"
        subtitle={sch ? `${sch.name} · ${sch.status === 'published' ? 'منشور' : 'مسودة'} · ${lessons.length} حصة` : 'لا يوجد جدول بعد'}
        actions={canEdit ? (
          <>
            <button className="btn-ghost" onClick={() => setGenOpen(true)}><Sparkles size={16} /> توليد آلي</button>
            <button className="btn-primary" onClick={doPublish} disabled={!sch || conflicts.errors > 0}><Rocket size={16} /> نشر الجدول</button>
          </>
        ) : null}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone={conflicts.errors ? 'rose' : 'green'}>
          {conflicts.errors ? <><AlertTriangle size={13} className="ml-1" /> {conflicts.errors} خطأ</> : <><CheckCircle2 size={13} className="ml-1" /> بلا تعارض</>}
        </Badge>
        <Badge tone={conflicts.warnings ? 'amber' : 'slate'}>{conflicts.warnings} تنبيه</Badge>
        <Badge tone="brand">{lessons.length} / {db.assignments.reduce((s, a) => s + a.weekly_periods, 0)} حصة</Badge>
        {genResult ? <Badge tone={genResult.unplaced?.length ? 'amber' : 'green'}>{genResult.message || `نتيجة التوليد: ${genResult.lessons.length}`}</Badge> : null}
        <div className="flex-1" />
        <select className="input max-w-xs" value={sectionId} onChange={(e) => setSectionId(Number(e.target.value))}>
          {db.sections.map((s) => {
            const g = db.grades.find((x) => x.id === s.grade_id);
            return <option key={s.id} value={s.id}>{g?.name} — شعبة {s.name}</option>;
          })}
        </select>
      </div>

      <Card className="overflow-x-auto p-3">
        <table className="w-full min-w-[820px] border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="w-28 rounded-xl bg-slate-100 p-2 text-xs dark:bg-slate-800">الحصة / اليوم</th>
              {days.map((d) => <th key={d.id} className="rounded-xl bg-slate-100 p-2 text-xs dark:bg-slate-800">{d.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => (
              <tr key={p.id}>
                <td className="rounded-xl bg-slate-50 p-2 text-center text-[11px] font-bold dark:bg-slate-900">
                  <div>{p.name}</div>
                  <div className="font-normal text-slate-400">{p.start_time}</div>
                </td>
                {days.map((d) => {
                  const l = cellFor(d.id, p.id);
                  return (
                    <td key={d.id} className="p-0">
                      <button
                        type="button"
                        onClick={() => openCell(d.id, p.id)}
                        className={cn(
                          'h-16 w-full rounded-xl border p-1.5 text-right align-top transition',
                          l
                            ? 'border-transparent text-white shadow-sm'
                            : 'border-dashed border-slate-200 text-slate-300 hover:border-brand-400 hover:bg-brand-50/50 dark:border-slate-700 dark:hover:bg-slate-800',
                        )}
                        style={l ? { background: l.subject_color || '#6366f1' } : undefined}
                      >
                        {l ? (
                          <span className="flex h-full flex-col justify-between">
                            <span className="flex items-start justify-between gap-1">
                              <span className="line-clamp-2 text-[11px] font-extrabold leading-4">{l.subject_name}</span>
                              {l.locked ? <Lock size={11} className="shrink-0 opacity-80" /> : null}
                            </span>
                            <span className="truncate text-[10px] opacity-90">{l.teacher_name || 'بلا معلم'} · {l.room_name || '—'}</span>
                          </span>
                        ) : <Plus size={16} className="mx-auto" />}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-extrabold"><AlertTriangle size={17} /> التعارضات</h2>
          {conflicts.conflicts.length ? (
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {conflicts.conflicts.map((c: any) => (
                <div key={c.id} className="rounded-xl border border-slate-100 p-2.5 text-xs dark:border-slate-800">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge tone={c.severity === 'error' ? 'rose' : 'amber'}>{TYPE_LABEL[c.type] || c.type}</Badge>
                    <span className="font-bold">{c.entity}</span>
                    <span className="text-slate-400">{c.slot}</span>
                  </div>
                  <div className="text-slate-600 dark:text-slate-300">{c.reason}</div>
                  {c.suggestion ? <div className="mt-1 text-emerald-700 dark:text-emerald-300">المقترح: {c.suggestion}</div> : null}
                </div>
              ))}
            </div>
          ) : <p className="rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">الجدول سليم. يمكنك النشر.</p>}
        </Card>

        <Card>
          <h2 className="mb-3 font-extrabold">ملخص الشعبة</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950"><div className="text-xs text-slate-400">الحصص الموزعة</div><div className="text-xl font-extrabold">{sectionLessons.length}</div></div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950"><div className="text-xs text-slate-400">المطلوب</div><div className="text-xl font-extrabold">{sectionAssignments.reduce((s, a) => s + a.weekly_periods, 0)}</div></div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950"><div className="text-xs text-slate-400">الإسنادات</div><div className="text-xl font-extrabold">{sectionAssignments.length}</div></div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950"><div className="text-xs text-slate-400">حصص مثبتة</div><div className="text-xl font-extrabold">{sectionLessons.filter((l) => l.locked).length}</div></div>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-slate-400">
            اضغط أي خانة لإضافة حصة أو تعديلها. الحصص المثبتة تبقى في مكانها عند إعادة التوليد.
          </p>
        </Card>
      </div>

      {/* توليد */}
      <Modal open={genOpen} onClose={() => setGenOpen(false)} title="توليد جدول آلي بقيود"
        footer={<><button className="btn-ghost" onClick={() => setGenOpen(false)}>إلغاء</button><button className="btn-primary" onClick={doGenerate}><Sparkles size={16} /> توليد</button></>}>
        <div className="space-y-3 text-sm">
          <p className="rounded-xl bg-brand-50 px-3 py-2 text-xs leading-6 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200">
            محرك heuristic ببذرة ثابتة: يمنع تعارض المعلم والشعبة والقاعة، ويحترم النصاب والحد اليومي وعدم التوفر والمعامل.
            أي حصة يتعذر وضعها تُعرض في التعارضات بسببها، ولا تُحذف بصمت.
          </p>
          <Field label="البذرة (نفس المدخلات + نفس البذرة = نفس النتيجة)">
            <input className="input" type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
          </Field>
          <div className="rounded-xl border border-slate-200 p-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            سيُحفظ الجدول الحالي كمسودة جديدة، ويمكنك مقارنته ثم النشر. لن يُحذف أي جدول قديم.
          </div>
        </div>
      </Modal>

      {/* خلية */}
      <Modal open={!!cell} onClose={() => setCell(null)} title={cell?.lesson ? 'تعديل حصة' : 'إضافة حصة'}
        footer={cell?.lesson ? (
          <>
            <button className="btn-ghost text-rose-600" onClick={removeLesson}><Trash2 size={15} /> حذف</button>
            <button className="btn-ghost" onClick={() => { toggleLock(cell.lesson.id); setCell(null); toast('ok', 'تم تغيير التثبيت'); }}>
              {cell.lesson.locked ? <LockOpen size={15} /> : <Lock size={15} />} {cell.lesson.locked ? 'إلغاء التثبيت' : 'تثبيت'}
            </button>
            <button className="btn-primary" form="lesson-form">حفظ</button>
          </>
        ) : (
          <><button className="btn-ghost" onClick={() => setCell(null)}>إلغاء</button><button className="btn-primary" form="lesson-form">إضافة</button></>
        )}
      >
        <form id="lesson-form" onSubmit={saveCell} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="المادة">
            <select className="input" value={form.subject_id || ''} onChange={(e) => {
              const subjectId = Number(e.target.value);
              const a = sectionAssignments.find((x) => x.subject_id === subjectId);
              setForm({ ...form, subject_id: subjectId, teacher_id: a?.teacher_id || form.teacher_id, assignment_id: a?.id || null });
            }}>
              {db.subjects.filter((s) => s.active !== 0).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field></div>
          <Field label="المعلم">
            <select className="input" value={form.teacher_id || ''} onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}>
              <option value="">بلا معلم</option>
              {db.teachers.filter((t) => t.active !== 0).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="القاعة">
            <select className="input" value={form.room_id || ''} onChange={(e) => setForm({ ...form, room_id: e.target.value })}>
              <option value="">قاعة الشعبة</option>
              {db.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
          <Field label="اليوم">
            <select className="input" value={form.day_id || ''} onChange={(e) => setForm({ ...form, day_id: e.target.value })}>
              {days.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="الحصة">
            <select className="input" value={form.period_id || ''} onChange={(e) => setForm({ ...form, period_id: e.target.value })}>
              {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          {!sectionAssignments.some((a) => a.subject_id === Number(form.subject_id)) ? (
            <div className="sm:col-span-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              هذه المادة غير مسندة لهذه الشعبة. الحصة ستُضاف يدويًا وقد تظهر كتكرار أو تجاوز.
            </div>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
