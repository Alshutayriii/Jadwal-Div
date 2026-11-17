import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, CalendarClock, CheckCircle2, Download, FileDown, LayoutGrid, List, Loader2,
  Pencil, Plus, Printer, Sparkles, Trash2,
} from 'lucide-react';
import { useApp, usePerm } from '../store';
import { Badge, Card, EmptyState, Field, Modal, PageHeader, cn } from '../components/ui';
import {
  EXAM_ISSUE_LABEL, examConflicts, examPeriods, examSettings, examsCsv, generateExams,
} from '../lib/exams';
import { downloadBlob } from '../lib/reports';
import type { Exam } from '../types';

const EMPTY = {
  subject_id: 0, grade_id: 0, section_id: 0, day_id: 0, period_id: 0,
  room_id: 0, invigilator_id: 0, duration: 60, notes: '',
};

export default function Exams() {
  const { db, saveExam, deleteExam, generateExamSchedule, clearExams, toast } = useApp();
  const canEdit = usePerm('exams', 'edit');
  const [gradeFilter, setGradeFilter] = useState(0);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [genOpen, setGenOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<any>({ ...EMPTY });
  const [pdfBusy, setPdfBusy] = useState(false);
  const printRef = useRef<HTMLDivElement | null>(null);

  const settings = examSettings(db);
  const [options, setOptions] = useState<any>({
    maxPerDay: settings.maxPerDay, periodsPerDay: settings.periodsPerDay, subjectIds: [] as number[], gradeIds: [] as number[],
  });
  const [preview, setPreview] = useState<any>(null);

  const days = useMemo(() => db.days.filter((d) => d.active !== 0).sort((a, b) => a.idx - b.idx), [db.days]);
  const periods = useMemo(() => db.periods.filter((p) => p.active !== 0 && (p.kind || 'lesson') === 'lesson')
    .sort((a, b) => a.idx - b.idx), [db.periods]);
  const examSlots = useMemo(() => examPeriods(db), [db]);
  const gridPeriods = useMemo(() => {
    const used = new Set((db.exams || []).map((e) => Number(e.period_id)));
    return periods.filter((p) => used.has(p.id) || examSlots.some((x) => x.id === p.id));
  }, [periods, db.exams, examSlots]);
  const subjects = useMemo(() => db.subjects.filter((s) => s.active !== 0), [db.subjects]);
  const sections = useMemo(() => db.sections.filter((s) => s.active !== 0)
    .sort((a, b) => a.grade_id - b.grade_id || a.name.localeCompare(b.name, 'ar')), [db.sections]);

  const gradeName = (id?: number | null) => db.grades.find((g) => g.id === Number(id))?.name || '';
  const sectionName = (id?: number | null) => db.sections.find((s) => s.id === Number(id))?.name || '';
  const subjectName = (id?: number | null) => db.subjects.find((s) => s.id === Number(id))?.name || '';
  const teacherName = (id?: number | null) => db.teachers.find((t) => t.id === Number(id))?.name || '';
  const roomName = (id?: number | null) => db.rooms.find((r) => r.id === Number(id))?.name || '';

  const diagnosis = useMemo(() => examConflicts(db, db.exams || []), [db]);
  const filtered = useMemo(() => (db.exams || []).filter((e) => {
    if (!gradeFilter) return true;
    const sec = db.sections.find((s) => s.id === Number(e.section_id));
    return Number(e.grade_id) === gradeFilter || Number(sec?.grade_id) === gradeFilter;
  }), [db.exams, db.sections, gradeFilter]);

  const grouped = useMemo(() => {
    const list = sections.filter((s) => !gradeFilter || s.grade_id === gradeFilter);
    return list.map((section) => ({
      section,
      grade: gradeName(section.grade_id),
      exams: filtered.filter((e) => Number(e.section_id) === section.id),
    }));
  }, [sections, filtered, gradeFilter]);

  function start(exam?: Exam) {
    setEditing(exam?.id ?? null);
    setForm(exam ? {
      ...exam,
      grade_id: exam.grade_id || db.sections.find((s) => s.id === Number(exam.section_id))?.grade_id || 0,
      room_id: exam.room_id || 0, invigilator_id: exam.invigilator_id || 0, notes: exam.notes || '',
    } : {
      ...EMPTY,
      subject_id: subjects[0]?.id || 0,
      grade_id: gradeFilter || db.grades[0]?.id || 0,
      day_id: days[0]?.id || 0,
      period_id: periods[0]?.id || 0,
    });
    setFormOpen(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      saveExam({
        ...form,
        grade_id: form.grade_id || null,
        section_id: form.section_id || null,
        room_id: form.room_id || null,
        invigilator_id: form.invigilator_id || null,
      }, editing);
      toast('ok', editing ? 'تم تحديث الاختبار' : 'تمت إضافة الاختبار');
      setFormOpen(false);
    } catch (err: any) { toast('err', err.message); }
  }

  function remove(exam: Exam) {
    if (!confirm(`حذف اختبار ${subjectName(exam.subject_id)} — ${sectionName(exam.section_id)}؟`)) return;
    try { deleteExam(exam.id); toast('ok', 'تم حذف الاختبار'); }
    catch (err: any) { toast('err', err.message); }
  }

  function runPreview() {
    try {
      const result = generateExams(db, {
        maxPerDay: Number(options.maxPerDay), periodsPerDay: Number(options.periodsPerDay),
        subjectIds: options.subjectIds, gradeIds: options.gradeIds,
      });
      setPreview(result);
      toast('ok', `معاينة: ${result.placed} اختبارًا قابلًا للتوزيع`);
    } catch (err: any) { toast('err', err.message); }
  }

  function applyGeneration() {
    try {
      const result = generateExamSchedule({
        maxPerDay: Number(options.maxPerDay), periodsPerDay: Number(options.periodsPerDay),
        subjectIds: options.subjectIds, gradeIds: options.gradeIds,
      });
      setGenOpen(false);
      setPreview(null);
      toast(result.unplaced.length ? 'info' : 'ok',
        `تم توليد ${result.placed} اختبارًا${result.unplaced.length ? ` — ${result.unplaced.length} دون مكان` : ''}`);
    } catch (err: any) { toast('err', err.message); }
  }

  function exportCsv() {
    if (!db.exams?.length) { toast('err', 'لا يوجد جدول اختبارات لتصديره.'); return; }
    downloadBlob('جدول-الاختبارات.csv', new Blob([examsCsv(db)], { type: 'text/csv;charset=utf-8' }));
  }

  async function exportPdf() {
    if (!printRef.current) return;
    setPdfBusy(true);
    try {
      const { exportElementPdf } = await import('../lib/pdf');
      await exportElementPdf(printRef.current, {
        filename: 'جدول-الاختبارات', title: 'جدول الاختبارات',
        schoolName: db.school.name, logo: db.school.logo,
        academicYear: db.school.academic_year, term: db.school.term, principal: db.school.principal,
        landscape: true,
        note: `الاختبارات: ${db.exams.length} · تعارضات: ${diagnosis.errors} · تنبيهات: ${diagnosis.warnings}`,
      });
      toast('ok', 'تم إنشاء PDF للاختبارات');
    } catch (err: any) { toast('err', err.message || 'تعذّر إنشاء PDF'); }
    finally { setPdfBusy(false); }
  }

  function toggleList(key: 'subjectIds' | 'gradeIds', id: number) {
    setOptions((prev: any) => ({
      ...prev,
      [key]: prev[key].includes(id) ? prev[key].filter((x: number) => x !== id) : [...prev[key], id],
    }));
    setPreview(null);
  }

  const examCell = (sectionId: number, dayId: number, periodId: number) => filtered.find((e) => Number(e.section_id) === sectionId
    && Number(e.day_id) === dayId && Number(e.period_id) === periodId);

  return (
    <div>
      <PageHeader
        icon={CalendarClock}
        title="جدول الاختبارات"
        subtitle={`${db.exams.length} اختبارًا · ${diagnosis.errors} تعارضًا · ${diagnosis.warnings} تنبيهًا`}
        actions={(
          <>
            <button className="btn-ghost" onClick={exportCsv} disabled={!db.exams.length}><Download size={15} /> CSV</button>
            <button className="btn-ghost" onClick={exportPdf} disabled={!db.exams.length || pdfBusy}>
              {pdfBusy ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />} PDF
            </button>
            <button className="btn-ghost" onClick={() => window.print()} disabled={!db.exams.length}><Printer size={15} /> طباعة</button>
            {canEdit ? <button className="btn-primary" onClick={() => { setPreview(null); setGenOpen(true); }}><Sparkles size={16} /> توليد تلقائي</button> : null}
            {canEdit ? <button className="btn-ghost" onClick={() => start()}><Plus size={16} /> اختبار</button> : null}
          </>
        )}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="flex items-center gap-3">
          <span className={cn('grid h-11 w-11 place-items-center rounded-2xl', diagnosis.errors ? 'bg-rose-50 text-rose-700 dark:bg-rose-900/40' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40')}>
            {diagnosis.errors ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
          </span>
          <div><div className="text-xs text-slate-500">التعارضات الصارمة</div><div className="text-2xl font-extrabold">{diagnosis.errors}</div></div>
        </Card>
        <Card className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-50 text-amber-700 dark:bg-amber-900/40"><AlertTriangle size={20} /></span>
          <div><div className="text-xs text-slate-500">تنبيهات (قاعة/مراقب/حد يومي)</div><div className="text-2xl font-extrabold">{diagnosis.warnings}</div></div>
        </Card>
        <Card className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-900/40"><CalendarClock size={20} /></span>
          <div><div className="text-xs text-slate-500">الاختبارات الموزعة</div><div className="text-2xl font-extrabold">{db.exams.length}</div></div>
        </Card>
        <Card className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-teal-50 text-teal-700 dark:bg-teal-900/40"><CheckCircle2 size={20} /></span>
          <div><div className="text-xs text-slate-500">الشعب المغطاة</div><div className="text-2xl font-extrabold">{new Set(db.exams.map((e) => e.section_id)).size} / {sections.length}</div></div>
        </Card>
      </div>

      <Card className="no-print mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="تصفية بالصف">
            <select className="input min-w-48" value={gradeFilter} onChange={(e) => setGradeFilter(Number(e.target.value))}>
              <option value={0}>كل الصفوف</option>
              {db.grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </Field>
          <div className="flex rounded-xl border border-slate-200 p-1 dark:border-slate-800">
            <button className={cn('btn-sm rounded-lg px-3', view === 'grid' && 'bg-brand-600 text-white')} onClick={() => setView('grid')}><LayoutGrid size={15} /> شبكة</button>
            <button className={cn('btn-sm rounded-lg px-3', view === 'list' && 'bg-brand-600 text-white')} onClick={() => setView('list')}><List size={15} /> قائمة</button>
          </div>
          <div className="text-xs text-slate-400">انقر على أي خانة لتعديل اختبارها. التوليد يراعي القاعات والمراقبين وعدم توفر المعلم.</div>
          {canEdit && db.exams.length ? (
            <button className="btn-ghost btn-sm mr-auto text-rose-600" onClick={() => {
              if (confirm('مسح كل جدول الاختبارات الحالي؟')) { clearExams(); toast('ok', 'تم مسح جدول الاختبارات'); }
            }}><Trash2 size={14} /> مسح الكل</button>
          ) : null}
        </div>
      </Card>

      {diagnosis.issues.length ? (
        <Card className="no-print mb-4">
          <h2 className="mb-3 font-extrabold">تشخيص جدول الاختبارات</h2>
          <div className="max-h-56 space-y-1.5 overflow-y-auto">
            {diagnosis.issues.slice(0, 80).map((issue) => (
              <div key={issue.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 px-3 py-2 text-xs dark:border-slate-800">
                <Badge tone={issue.severity === 'error' ? 'rose' : 'amber'}>{EXAM_ISSUE_LABEL[issue.type] || issue.type}</Badge>
                <span className="flex-1">{issue.message}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : db.exams.length ? (
        <div className="no-print mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          لا تعارضات في جدول الاختبارات الحالي.
        </div>
      ) : null}

      <div ref={printRef} className="print-area">
        <div className="mb-3 hidden items-center justify-between border-b border-slate-300 pb-3 print:flex">
          <div>
            <div className="text-lg font-extrabold">{db.school.name}</div>
            <div className="text-xs">{db.school.academic_year} · {db.school.term} · جدول الاختبارات</div>
          </div>
          {db.school.logo ? <img src={db.school.logo} alt="شعار" className="max-h-16" /> : null}
        </div>

        {!db.exams.length ? (
          <Card>
            <EmptyState icon={CalendarClock} title="لا يوجد جدول اختبارات بعد"
              hint="استخدم «توليد تلقائي» لتوزيع اختبارات المواد على الشعب مع قاعة ومراقب، أو أضف اختبارًا يدويًا." />
          </Card>
        ) : view === 'grid' ? (
          <div className="space-y-5">
            {grouped.map(({ section, grade, exams }) => (
              <Card key={section.id} className="overflow-hidden">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-extrabold">{grade} — شعبة {section.name}</h3>
                  <Badge tone={exams.length ? 'brand' : 'slate'}>{exams.length} اختبارًا</Badge>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[11px]">
                    <thead>
                      <tr>
                        <th className="border border-slate-300 bg-slate-100 p-1.5 dark:border-slate-700 dark:bg-slate-800">الحصة</th>
                        {days.map((d) => <th key={d.id} className="border border-slate-300 bg-slate-100 p-1.5 dark:border-slate-700 dark:bg-slate-800">{d.name}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {gridPeriods.map((p) => (
                        <tr key={p.id}>
                          <th className="border border-slate-300 bg-slate-50 p-1.5 text-[10px] dark:border-slate-700 dark:bg-slate-900">{p.name}</th>
                          {days.map((d) => {
                            const exam = examCell(section.id, d.id, p.id);
                            return (
                              <td key={d.id} className={cn('border border-slate-300 p-1.5 text-center align-middle dark:border-slate-700', exam && 'bg-brand-50/70 dark:bg-brand-900/20')}>
                                {exam ? (
                                  <button type="button" className="w-full text-center" onClick={() => canEdit && start(exam)} title="تعديل الاختبار">
                                    <div className="font-bold">{subjectName(exam.subject_id)}</div>
                                    <div className="text-[10px] text-slate-500">{roomName(exam.room_id) || 'بلا قاعة'}</div>
                                    <div className="text-[9px] text-slate-400">{teacherName(exam.invigilator_id) || 'بلا مراقب'}</div>
                                  </button>
                                ) : ''}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))}
            {!grouped.length ? <Card><EmptyState icon={CalendarClock} title="لا اختبارات في هذا الصف" /></Card> : null}
          </div>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900">
                  <tr>
                    {['اليوم', 'الحصة', 'الصف', 'الشعبة', 'المادة', 'القاعة', 'المراقب', 'المدة', 'ملاحظات', 'إجراءات'].map((h) => (
                      <th key={h} className="border border-slate-200 p-2 dark:border-slate-800">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice().sort((a, b) => (db.days.find((d) => d.id === a.day_id)?.idx || 0) - (db.days.find((d) => d.id === b.day_id)?.idx || 0)
                    || (db.periods.find((p) => p.id === a.period_id)?.idx || 0) - (db.periods.find((p) => p.id === b.period_id)?.idx || 0))
                    .map((exam) => {
                      const sec = db.sections.find((s) => s.id === Number(exam.section_id));
                      return (
                        <tr key={exam.id}>
                          <td className="border border-slate-200 p-2 dark:border-slate-800">{db.days.find((d) => d.id === exam.day_id)?.name}</td>
                          <td className="border border-slate-200 p-2 dark:border-slate-800">{db.periods.find((p) => p.id === exam.period_id)?.name}</td>
                          <td className="border border-slate-200 p-2 dark:border-slate-800">{gradeName(exam.grade_id || sec?.grade_id)}</td>
                          <td className="border border-slate-200 p-2 dark:border-slate-800">{sectionName(exam.section_id)}</td>
                          <td className="border border-slate-200 p-2 font-semibold dark:border-slate-800">{subjectName(exam.subject_id)}</td>
                          <td className="border border-slate-200 p-2 dark:border-slate-800">{roomName(exam.room_id) || '—'}</td>
                          <td className="border border-slate-200 p-2 dark:border-slate-800">{teacherName(exam.invigilator_id) || '—'}</td>
                          <td className="border border-slate-200 p-2 dark:border-slate-800">{exam.duration || 60}</td>
                          <td className="border border-slate-200 p-2 dark:border-slate-800">{exam.notes || '—'}</td>
                          <td className="border border-slate-200 p-2 dark:border-slate-800">
                            <div className="no-print flex gap-1">
                              <button className="btn-ghost btn-sm" onClick={() => start(exam)} disabled={!canEdit}><Pencil size={13} /></button>
                              <button className="btn-ghost btn-sm text-rose-600" onClick={() => remove(exam)} disabled={!canEdit}><Trash2 size={13} /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  {!filtered.length ? <tr><td colSpan={10} className="p-6 text-center text-slate-400">لا اختبارات ضمن التصفية.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'تعديل اختبار' : 'إضافة اختبار'} wide
        footer={<><button className="btn-ghost" onClick={() => setFormOpen(false)}>إلغاء</button><button className="btn-primary" form="exam-form">حفظ</button></>}>
        <form id="exam-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="الصف">
            <select className="input" value={form.grade_id || ''} onChange={(e) => setForm({ ...form, grade_id: Number(e.target.value), section_id: 0 })}>
              <option value="">كل الصفوف</option>
              {db.grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </Field>
          <Field label="الشعبة">
            <select className="input" value={form.section_id || ''} onChange={(e) => setForm({ ...form, section_id: Number(e.target.value) })} required>
              <option value="">اختر الشعبة</option>
              {db.sections.filter((s) => !form.grade_id || s.grade_id === Number(form.grade_id)).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
          <Field label="المادة">
            <select className="input" value={form.subject_id || ''} onChange={(e) => setForm({ ...form, subject_id: Number(e.target.value) })} required>
              <option value="">اختر المادة</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="المدة (دقيقة)"><input className="input" type="number" min={15} max={240} value={form.duration || 60} onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })} /></Field>
          <Field label="اليوم">
            <select className="input" value={form.day_id || ''} onChange={(e) => setForm({ ...form, day_id: Number(e.target.value) })} required>
              {days.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="الحصة">
            <select className="input" value={form.period_id || ''} onChange={(e) => setForm({ ...form, period_id: Number(e.target.value) })} required>
              {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="القاعة">
            <select className="input" value={form.room_id || ''} onChange={(e) => setForm({ ...form, room_id: Number(e.target.value) })}>
              <option value="">قاعة الشعبة</option>
              {db.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
          <Field label="المراقب">
            <select className="input" value={form.invigilator_id || ''} onChange={(e) => setForm({ ...form, invigilator_id: Number(e.target.value) })}>
              <option value="">بلا مراقب</option>
              {db.teachers.filter((t) => t.active !== 0).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="ملاحظات"><input className="input" value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          </div>
        </form>
      </Modal>

      <Modal open={genOpen} onClose={() => { setGenOpen(false); setPreview(null); }} title="توليد جدول الاختبارات" wide
        footer={(
          <>
            <button className="btn-ghost" onClick={() => { setGenOpen(false); setPreview(null); }}>إلغاء</button>
            <button className="btn-ghost" onClick={runPreview}><Sparkles size={15} /> معاينة</button>
            <button className="btn-primary" onClick={applyGeneration} disabled={!preview}>تطبيق التوليد</button>
          </>
        )}>
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="أقصى اختبارات للشعبة في اليوم">
              <input className="input" type="number" min={1} max={5} value={options.maxPerDay}
                onChange={(e) => { setOptions({ ...options, maxPerDay: e.target.value }); setPreview(null); }} />
            </Field>
            <Field label="عدد حصص الاختبار في اليوم" hint="تُستخدم أول حصص اليوم النشطة.">
              <input className="input" type="number" min={1} max={6} value={options.periodsPerDay}
                onChange={(e) => { setOptions({ ...options, periodsPerDay: e.target.value }); setPreview(null); }} />
            </Field>
          </div>

          <div>
            <div className="label">الصفوف (اترك الكل فارغًا لكل الصفوف)</div>
            <div className="flex flex-wrap gap-2">
              {db.grades.map((g) => (
                <label key={g.id} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs dark:border-slate-800">
                  <input type="checkbox" checked={options.gradeIds.includes(g.id)} onChange={() => toggleList('gradeIds', g.id)} /> {g.name}
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="label">المواد (اترك الكل فارغًا لكل المواد)</div>
            <div className="grid max-h-40 gap-1 overflow-y-auto rounded-xl border border-slate-200 p-2 sm:grid-cols-2 dark:border-slate-800">
              {subjects.map((s) => (
                <label key={s.id} className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={options.subjectIds.includes(s.id)} onChange={() => toggleList('subjectIds', s.id)} /> {s.name}
                </label>
              ))}
            </div>
          </div>

          {preview ? (
            <div className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
              <div className="mb-2 flex flex-wrap gap-2">
                <Badge tone="green">قابل للتوزيع: {preview.placed}</Badge>
                <Badge tone={preview.unplaced.length ? 'rose' : 'green'}>دون مكان: {preview.unplaced.length}</Badge>
                <Badge tone={preview.issues.some((i: any) => i.severity === 'error') ? 'rose' : 'amber'}>
                  تعارضات: {preview.issues.filter((i: any) => i.severity === 'error').length}
                </Badge>
              </div>
              {preview.unplaced.length ? (
                <div className="max-h-32 space-y-1 overflow-y-auto text-xs text-rose-700 dark:text-rose-300">
                  {preview.unplaced.slice(0, 40).map((u: any, i: number) => (
                    <div key={i}>{sectionName(u.section_id)} — {subjectName(u.subject_id)}: {u.reason}</div>
                  ))}
                </div>
              ) : <div className="text-xs text-slate-500">كل الاختبارات المطلوبة وجدت قاعة ومراقبًا وخانة مناسبة.</div>}
            </div>
          ) : (
            <p className="text-xs leading-5 text-slate-500">
              يولّد اختبارًا واحدًا لكل شعبة ومادة مختارة، ويختار قاعة مناسبة (معمل للمواد التي تحتاج معملًا)، ومراقبًا
              مؤهلًا غير مشغول، مع توزيع الاختبارات على الأيام والحصص دون تجاوز الحد اليومي.
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
