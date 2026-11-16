import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

export interface PdfMeta {
  filename: string;
  title: string;
  subtitle?: string;
  schoolName?: string;
  logo?: string | null;
  academicYear?: string;
  term?: string;
  principal?: string;
  landscape?: boolean;
  note?: string;
}

const FONT = "'Cairo', system-ui, sans-serif";

function box(style: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const div = document.createElement('div');
  Object.assign(div.style, style);
  return div;
}

/**
 * يصدر PDF حقيقيًا (A4) من عنصر HTML عبر رسمه بمحرك المتصفح،
 * ما يضمن تشكيل الحروف العربية وتطابق التخطيط مع المعاينة.
 * المحتوى الطويل يُقسَّم إلى صفحات، مع تكرار الترويسة والتذييل ورقم الصفحة.
 */
export async function exportElementPdf(el: HTMLElement | null, meta: PdfMeta): Promise<void> {
  if (!el) throw new Error('لا يوجد محتوى لتصديره إلى PDF.');
  const fonts = (document as any).fonts;
  if (fonts?.ready) { try { await fonts.ready; } catch { /* ignore */ } }

  const root = document.documentElement;
  const wasDark = root.classList.contains('dark');
  if (wasDark) root.classList.remove('dark');

  const pageW = meta.landscape ? 297 : 210;
  const pageH = meta.landscape ? 210 : 297;
  const margin = 8;
  const headerMm = 17;
  const footerMm = 9;
  const gapMm = 3;
  const contentW = pageW - margin * 2;
  const contentH = pageH - margin * 2 - headerMm - gapMm - footerMm;
  const widthPx = Math.round(contentW * (96 / 25.4));

  const host = box({
    position: 'fixed', left: '-20000px', top: '0', width: `${widthPx}px`,
    background: '#ffffff', color: '#0f172a', fontFamily: FONT, direction: 'rtl',
    padding: '0', zIndex: '-1',
  });

  const header = box({
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px',
    borderBottom: '2px solid #4338ca', paddingBottom: '6px', marginBottom: '8px',
    direction: 'rtl', fontFamily: FONT, color: '#0f172a', background: '#ffffff',
  });
  const right = box({ display: 'flex', alignItems: 'center', gap: '12px' });
  if (meta.logo) {
    const img = document.createElement('img');
    img.src = meta.logo;
    img.alt = '';
    Object.assign(img.style, { height: '46px', width: 'auto', objectFit: 'contain' });
    right.appendChild(img);
  }
  const titles = box({ display: 'flex', flexDirection: 'column', gap: '2px' });
  const schoolName = box({ fontSize: '17px', fontWeight: '800', lineHeight: '1.3' });
  schoolName.textContent = meta.schoolName || 'جدول المدرسة';
  const subtitle = box({ fontSize: '11px', color: '#475569', lineHeight: '1.5' });
  subtitle.textContent = [meta.academicYear, meta.term, meta.principal ? `المدير: ${meta.principal}` : '']
    .filter(Boolean).join(' · ');
  titles.appendChild(schoolName);
  titles.appendChild(subtitle);
  right.appendChild(titles);
  header.appendChild(right);

  const left = box({ textAlign: 'left', fontSize: '10px', color: '#475569', lineHeight: '1.6' });
  const titleEl = box({ fontSize: '13px', fontWeight: '800', color: '#1e293b' });
  titleEl.textContent = meta.title;
  left.appendChild(titleEl);
  const dateEl = box({ direction: 'ltr', textAlign: 'left' });
  dateEl.textContent = new Date().toLocaleDateString('ar-SA');
  left.appendChild(dateEl);
  header.appendChild(left);

  const body = box({ background: '#ffffff', padding: '0', direction: 'rtl', fontFamily: FONT });
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.no-print, [data-no-pdf]').forEach((n) => n.remove());
  clone.classList.remove('no-print');
  Object.assign(clone.style, { margin: '0', maxWidth: 'none', width: '100%' });
  body.appendChild(clone);
  if (meta.note) {
    const note = box({ marginTop: '6px', fontSize: '10px', color: '#64748b' });
    note.textContent = meta.note;
    body.appendChild(note);
  }

  host.appendChild(header);
  host.appendChild(body);
  document.body.appendChild(host);

  try {
    const opts = { scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true } as any;
    const headerCanvas = await html2canvas(header, opts);
    const bodyCanvas = await html2canvas(body, opts);
    const doc = new jsPDF({ orientation: meta.landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
    const pxPerMm = bodyCanvas.width / contentW;
    const sliceH = Math.floor(contentH * pxPerMm);
    const headerH = Math.min(headerMm, (headerCanvas.height / headerCanvas.width) * contentW);
    const pages = Math.max(1, Math.ceil(bodyCanvas.height / sliceH));

    for (let page = 0; page < pages; page++) {
      if (page > 0) doc.addPage();
      // الترويسة تُرسم كصورة لضمان تشكيل العربية.
      doc.addImage(headerCanvas.toDataURL('image/jpeg', 0.94), 'JPEG', margin, margin, contentW, headerH);
      const y0 = page * sliceH;
      const h = Math.min(sliceH, bodyCanvas.height - y0);
      const slice = document.createElement('canvas');
      slice.width = bodyCanvas.width;
      slice.height = h;
      const g = slice.getContext('2d');
      if (!g) throw new Error('تعذّر تجهيز الصفحة.');
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, slice.width, slice.height);
      g.drawImage(bodyCanvas, 0, y0, bodyCanvas.width, h, 0, 0, bodyCanvas.width, h);
      const top = margin + headerH + gapMm;
      doc.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', margin, top, contentW, h / pxPerMm);

      // التذييل
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.2);
      doc.line(margin, pageH - margin - footerMm + 2, pageW - margin, pageH - margin - footerMm + 2);
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`${page + 1} / ${pages}`, pageW / 2, pageH - margin - 2, { align: 'center' });
      doc.text(new Date().toLocaleDateString('en-GB'), margin, pageH - margin - 2, { align: 'left' });
    }
    doc.save(meta.filename.endsWith('.pdf') ? meta.filename : `${meta.filename}.pdf`);
  } finally {
    host.remove();
    if (wasDark) root.classList.add('dark');
  }
}
