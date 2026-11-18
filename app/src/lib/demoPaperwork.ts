// Demo paperwork for the messenger's truck groups (release 1.42): a photo of
// a bill of lading and a signed POD as a PDF, made in the browser so the demo
// drivers have something real to send. Kept on the message as a data: URL.
import type { BillDocument } from '../data/bills';

const doc = (name: string, type: string, data: string, size: number): BillDocument => ({
  id: `DOC-demo-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name, type, size, data, added: new Date().toISOString(),
});

// A phone photo of a BOL: paper on a clipboard, with the load's details.
export function demoBolPhoto(loadId: string, route: string): BillDocument | undefined {
  if (typeof document === 'undefined') return undefined;
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 460;
  const g = c.getContext('2d');
  if (!g) return undefined;
  g.fillStyle = '#5b4636';
  g.fillRect(0, 0, 640, 460);
  g.save();
  g.translate(320, 236);
  g.rotate(-0.035);
  g.fillStyle = '#fbfaf5';
  g.shadowColor = 'rgba(0,0,0,0.35)';
  g.shadowBlur = 18;
  g.fillRect(-240, -200, 480, 400);
  g.shadowBlur = 0;
  g.fillStyle = '#1f2937';
  g.font = 'bold 26px Arial, sans-serif';
  g.fillText('BILL OF LADING', -215, -150);
  g.font = '15px Arial, sans-serif';
  const lines = [`Load: ${loadId}`, `Route: ${route}`, 'Shipper: ______________________', 'Commodity: Consumer goods', 'Pieces: 24 pallets   Weight: 38,400 lb', `Seal #: 48812`];
  lines.forEach((t, i) => g.fillText(t, -215, -105 + i * 30));
  g.strokeStyle = '#9ca3af';
  g.strokeRect(-215, 85, 430, 80);
  g.fillStyle = '#1d4ed8';
  g.font = 'italic 24px "Brush Script MT", cursive';
  g.fillText('M. Hale', -190, 140);
  g.fillStyle = '#6b7280';
  g.font = '12px Arial, sans-serif';
  g.fillText('Driver signature', -205, 158);
  g.restore();
  const data = c.toDataURL('image/jpeg', 0.82);
  return doc(`BOL-${loadId}.jpg`, 'image/jpeg', data, Math.round((data.length * 3) / 4));
}

// A one-page PDF: proof of delivery with the load's number.
// PDF text here is plain ASCII: '→' becomes 'to', anything else is dropped.
const ascii = (t: string) => t.replace(/→/g, 'to').replace(/[^\x20-\x7e]/g, '');

export function demoPodPdf(loadId: string, route: string): BillDocument {
  route = ascii(route);
  const text = [`PROOF OF DELIVERY`, `Load ${loadId}`, route, 'Received in good condition: 24 pallets', 'Signed: J. Ortiz, receiving', new Date().toDateString()];
  const content = ['BT', '/F1 22 Tf', '72 720 Td', `(${text[0]}) Tj`, '/F1 13 Tf', ...text.slice(1).flatMap((t) => ['0 -26 Td', `(${t.replace(/[()\\]/g, '')}) Tj`]), 'ET'].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return doc(`POD-${loadId}.pdf`, 'application/pdf', `data:application/pdf;base64,${btoa(pdf)}`, pdf.length);
}
