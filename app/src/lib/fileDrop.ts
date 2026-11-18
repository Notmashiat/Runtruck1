// Dragging files onto RunTruck (release 1.44). Two kinds of drag carry a file:
// files from the computer, and an attachment dragged out of Messages (which
// carries the stored document itself, under DOC_TYPE, so it works between
// the app and the popped-out Messages window too).
import type { DragEvent } from 'react';
import type { BillDocument } from '../data/bills';
import { readAttachment } from './attachments';

export const DOC_TYPE = 'application/x-runtruck-doc';

// What a load accepts (as in New Load): PDF, PNG or JPG, 10 MB at most.
export const LOAD_FILE_TYPES = /\.(pdf|png|jpe?g)$/i;
export const LOAD_MAX_BYTES = 10 * 1024 * 1024;
export function loadFileProblem(name: string, size: number): string {
  if (!LOAD_FILE_TYPES.test(name)) return `${name}: only PDF, PNG or JPG files.`;
  if (size > LOAD_MAX_BYTES) return `${name} is larger than 10 MB.`;
  return '';
}

// Does this drag carry a file (from the computer or from Messages)?
export function carriesFile(e: Pick<DragEvent, 'dataTransfer'> | globalThis.DragEvent): boolean {
  const types = Array.from(e.dataTransfer?.types ?? []);
  return types.includes('Files') || types.includes(DOC_TYPE);
}

// Start dragging an attachment out of Messages.
export function startDocDrag(e: DragEvent, doc: BillDocument, from: string) {
  e.dataTransfer.effectAllowed = 'copy';
  e.dataTransfer.setData(DOC_TYPE, JSON.stringify({ doc, from }));
  e.dataTransfer.setData('text/plain', doc.name);
}

export interface Dropped { docs: BillDocument[]; problems: string[]; from: string }

// The files a drop brought, saved in this browser. `check` turns away files a
// place does not take (with why); `from` says where they came from.
export async function readDrop(dt: DataTransfer, check?: (name: string, size: number) => string): Promise<Dropped> {
  const raw = dt.getData(DOC_TYPE);
  if (raw) {
    try {
      const { doc, from } = JSON.parse(raw) as { doc: BillDocument; from: string };
      const problem = check?.(doc.name, doc.size) ?? '';
      return problem ? { docs: [], problems: [problem], from } : { docs: [doc], problems: [], from: from ? `${from}’s message` : 'Messages' };
    } catch {
      return { docs: [], problems: ['That attachment could not be read.'], from: '' };
    }
  }
  const docs: BillDocument[] = [];
  const problems: string[] = [];
  for (const f of Array.from(dt.files)) {
    const problem = check?.(f.name, f.size) ?? '';
    if (problem) { problems.push(problem); continue; }
    const doc = await readAttachment(f);
    if (typeof doc === 'string') problems.push(doc);
    else docs.push(doc);
  }
  return { docs, problems, from: 'your computer' };
}

// A file dropped where nothing takes it would make the browser open it and
// leave RunTruck: anywhere else, a drop does nothing (and shows no drop sign).
export function installStrayDropGuard() {
  const guard = (e: globalThis.DragEvent) => {
    if (e.defaultPrevented || !carriesFile(e)) return;
    e.preventDefault();
    if (e.type === 'dragover' && e.dataTransfer) e.dataTransfer.dropEffect = 'none';
  };
  window.addEventListener('dragover', guard);
  window.addEventListener('drop', guard);
}
