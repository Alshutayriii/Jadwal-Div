import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, FileSpreadsheet, FileText, FileDown, Loader2, Printer, Table2 } from 'lucide-react';
import { useApp } from '../store';
import { buildReport, catalog, downloadBlob, reportCsv } from '../lib/reports';
import { todayIso } from '../lib/model';
import { Badge, Card, Field, PageHeader, cn } from '../components/ui';

export default function Reports() {
  const { db, toast } = useApp();
  const types = catalog();
  const [type, setType] = useState('school_schedule');
  const [params, setParams] = useState<any>({ sectionId: db.sections[0]?.id, teacherId: db.teachers[0]?.id, date: todayIso(), from: '', to: '' });
  const [report, setReport] = useState<any>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [searchParams] = useSearchParams();
  const printRef = useRef<HTMLDivElement | null>(null);

  const meta = types.find((t) => t.type === type);
  const needs = (meta as any)?.needs;

  function run() {
    try {
      const res = buildReport({ type, params, db });
      setReport(res);
      toast('ok', `تم إنشاء «${res.title}»`);
    } catch (err: any) { toast('err', err.message); }
  }

  function exportCsv() {
    if (!report) return;
    downloadBlob(`${report.filename}.csv`, new Blob([reportCsv(report)], { type: 'text/csv;charset=utf-8' }));
  }

  async function exportXlsx() {
    if (!report) return;
    const XLSX = await import('xlsx');
    const cols = report.columns || [];
    const data = (report.rows || []).map((row: any) => {
      const obj: any = {};
      for (const c of cols) obj[c.label] = row[c.key] ?? '';
      return obj;
    });
    const ws = XLSX.utils.json_to_sheet(data, { header: cols.map((c: any) => c.label) });
    (ws as any)['!views'] = [{ RTL: true }];
    (ws as any)['!cols'] = cols.map((c: any) => ({ wch: Math.max(10, Math.min(40, Number(c.width) || 16)) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'تقرير');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    downloadBlob(`${report.filename}.xlsx`, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }

  async function exportPdf() {
    if (!report) return;
    setPdfBusy(true);
    try {
      const { exportElementPdf } = await import('../lib/pdf');
      await exportElementPdf(printRef.current, {
        filename: report.filename,
        title: report.title,
        subtitle: report.subtitle,
        schoolName: db.school.name,
        logo: db.school.logo,
        academicYear: db.school.academic_year,
        term: db.school.term,
        principal: db.school.principal,
        landscape: Boolean(report.grid),
        note: report.summary?.length ? report.summary.join(' · ') : '',
      });
      toast('ok', 'تم إنشاء ملف PDF');
    } catch (err: any) { toast('err', err.message || 'تعذّر إنشاء PDF'); }
    finally { setPdfBusy(false); }
  }

  // فتح تقرير مباشرة من البحث الشامل (?type=teacher_schedule&teacher=3).
  useEffect(() => {
    const t = searchParams.get('type');
    if (!t) return;
    const teacher = Number(searchParams.get('teacher') || 0);
    const section = Number(searchParams.get('section') || 0);
    const next = {
      ...params,
      ...(teacher ? { teacherId: teacher } : {}),
      ...(section ? { sectionId: section } : {}),
    };
    setType(t);
    setParams(next);
    try { setReport(buildReport({ type: t, params: next, db })); } catch { /* تجاهل */ }
    // يتحدث عند الدخول برابط عميق أو تغيير نوع التقرير في العنوان.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const gridDays = report?.grid?.days || [];
  const gridPeriods = report?.grid?.periods || [];

  return (
    <div>
      <PageHeader icon={FileText} title="التقارير" subtitle={`${types.length} تقريرًا مع معاينة وتصدير CSV وExcel وPDF عربي حقيقي`} />

      <div className="no-print mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {types.map((t: any) => (
          <button key={t.type} onClick={() => { setType(t.type); setReport(null); }}
            className={cn('card p-3 text-right text-xs font-bold transition hover:border-brand-400', type === t.type && 'border-brand-600 bg-brand-50 dark:bg-brand-900/30')}>
            {t.title}
          </button>
        ))}
      </div>

      <Card className="no-print mb-4">
        <div className="flex flex-wrap items-end gap-3">
          {needs === 'section' ? (
            <Field label="الشعبة">
              <select className="input" value={params.sectionId || ''} onChange={(e) => setParams({ ...params, sectionId: Number(e.target.value) })}>
                {db.sections.map((s) => <option key={s.id} value={s.id}>{db.grades.find((g) => g.id === s.grade_id)?.name} — {s.name}</option>)}
              </select>
            </Field>
          ) : null}
          {needs === 'teacher' || needs === 'teacher_date' ? (
            <Field label="المعلم">
              <select className="input" value={params.teacherId || ''} onChange={(e) => setParams({ ...params, teacherId: Number(e.target.value) })}>
                {db.teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
          ) : null}
          {needs === 'date' || needs === 'teacher_date' ? (
            <Field label="التاريخ"><input className="input" type="date" value={params.date} onChange={(e) => setParams({ ...params, date: e.target.value })} /></Field>
          ) : null}
          {needs === 'range' ? (
            <>
              <Field label="من"><input className="input" type="date" value={params.from} onChange={(e) => setParams({ ...params, from: e.target.value })} /></Field>
              <Field label="إلى"><input className="input" type="date" value={params.to} onChange={(e) => setParams({ ...params, to: e.target.value })} /></Field>
            </>
          ) : null}
          <button className="btn-primary" onClick={run}><Table2 size={16} /> معاينة</button>
          {report ? (
            <>
              <button className="btn-ghost" onClick={exportCsv}><Download size={15} /> CSV</button>
              <button className="btn-ghost" onClick={exportXlsx}><FileSpreadsheet size={15} /> Excel</button>
              <button className="btn-primary" onClick={exportPdf} disabled={pdfBusy}>
                {pdfBusy ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />} {pdfBusy ? 'جارٍ إنشاء PDF…' : 'PDF احترافي'}
              </button>
              <button className="btn-ghost" onClick={() => window.print()}><Printer size={15} /> طباعة</button>
            </>
          ) : null}
        </div>
      </Card>

      {report ? (
        <div className="print-area" ref={printRef}>
          <div className="mb-4 hidden items-center justify-between border-b border-slate-300 pb-3 print:flex print-only">
            <div>
              <div className="text-lg font-extrabold">{db.school.name}</div>
              <div className="text-xs">{db.school.academic_year} · {db.school.term} · {report.title}</div>
            </div>
            {db.school.logo ? <img src={db.school.logo} alt="شعار" className="max-h-16" /> : null}
          </div>

          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-extrabold">{report.title}</h2>
                <p className="text-xs text-slate-400">{report.subtitle} · {report.scheduleName}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {report.summary.map((s: string) => <Badge key={s} tone="brand">{s}</Badge>)}
              </div>
            </div>

            {report.grid ? (
              <div className="space-y-6 print-table">
                {report.grid.groups.map((group: any) => (
                  <div key={group.title}>
                    <div className="mb-1 text-sm font-bold">{group.title} {group.subtitle ? <span className="text-xs font-normal text-slate-400">— {group.subtitle}</span> : null}</div>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-[10px]">
                        <thead>
                          <tr>
                            <th className="border border-slate-300 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800">الحصة</th>
                            {gridDays.map((d: any) => <th key={d.id} className="border border-slate-300 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800">{d.name}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {gridPeriods.map((p: any) => (
                            <tr key={p.id}>
                              <th className="border border-slate-300 bg-slate-50 p-1 text-[9px] dark:border-slate-700 dark:bg-slate-900">{p.name}</th>
                              {gridDays.map((d: any) => {
                                const c = group.cells[`${d.id}-${p.id}`];
                                return (
                                  <td key={d.id} className="border border-slate-300 p-1 text-center align-middle dark:border-slate-700" style={{ background: c?.color ? `${c.color}22` : undefined }}>
                                    {c ? (
                                      <>
                                        <div className="font-bold">{c.subject}</div>
                                        <div className="text-[9px] text-slate-500">{c.teacher || '—'}</div>
                                        {c.room ? <div className="text-[8px] text-slate-400">{c.room}</div> : null}
                                      </>
                                    ) : ''}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-xs print-table">
                  <thead><tr>{report.columns.map((c: any) => <th key={c.key} className="border border-slate-300 bg-slate-100 p-1.5 dark:border-slate-700 dark:bg-slate-800">{c.label}</th>)}</tr></thead>
                  <tbody>
                    {report.rows.slice(0, 2000).map((row: any, i: number) => (
                      <tr key={i}>{report.columns.map((c: any) => <td key={c.key} className="border border-slate-200 p-1.5 dark:border-slate-800">{row[c.key] ?? ''}</td>)}</tr>
                    ))}
                    {!report.rows.length ? <tr><td colSpan={report.columns.length} className="p-6 text-center text-slate-400">لا بيانات ضمن الشروط.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      ) : (
        <Card>
          <div className="grid place-items-center gap-2 py-12 text-center">
            <FileText className="text-slate-300" size={40} />
            <div className="font-bold">اختر تقريرًا ثم اضغط «معاينة»</div>
            <p className="max-w-md text-xs leading-5 text-slate-400">
              التصدير إلى CSV يضيف BOM ليفتح عربيًا في Excel. «PDF احترافي» يُنشئ ملف PDF داخل التطبيق بترويسة المدرسة والشعار وتشكيل عربي صحيح، و«طباعة» تبقى متاحة.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
