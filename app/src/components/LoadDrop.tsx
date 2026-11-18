import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useAppShell } from '../context/AppShellContext';
import type { BillDocument } from '../data/bills';
import type { Load } from '../data/mock';
import { carriesFile, loadFileProblem, readDrop } from '../lib/fileDrop';
import { toast } from '../lib/toast';
import { NewLoadDialog } from './NewLoadDialog';

// Dropping files on a load (release 1.44): a row in Loads, or a load's own
// page. The load's edit popup opens with the files in its documents, to check
// and save. Files can come from the computer or be dragged out of Messages.
export function useLoadDrop(): { props: (loadId: string) => Record<string, unknown>; overId: string | null; dialog: ReactNode } {
  const { loads } = useAppShell();
  const [overId, setOverId] = useState<string | null>(null);
  const [target, setTarget] = useState<{ load: Load; docs: BillDocument[]; from: string } | null>(null);
  // Entering a child fires enter before the parent's leave: count them.
  const depth = useRef<Record<string, number>>({});

  const props = (loadId: string) => ({
    onDragEnter: (e: DragEvent) => {
      if (!carriesFile(e)) return;
      e.preventDefault();
      depth.current[loadId] = (depth.current[loadId] ?? 0) + 1;
      setOverId(loadId);
    },
    onDragOver: (e: DragEvent) => {
      if (!carriesFile(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: () => {
      depth.current[loadId] = Math.max(0, (depth.current[loadId] ?? 1) - 1);
      if (!depth.current[loadId]) setOverId((o) => (o === loadId ? null : o));
    },
    onDrop: async (e: DragEvent) => {
      if (!carriesFile(e)) return;
      e.preventDefault();
      e.stopPropagation();
      depth.current = {};
      setOverId(null);
      const load = loads.find((l) => l.id === loadId);
      if (!load) return;
      const got = await readDrop(e.dataTransfer, loadFileProblem);
      if (got.problems.length) toast(got.problems.join(' '), 'info');
      if (got.docs.length) setTarget({ load, docs: got.docs, from: got.from });
    },
  });

  const dialog = target ? (
    <NewLoadDialog load={target.load} attach={{ docs: target.docs, from: target.from }} onClose={() => setTarget(null)} onDeleted={() => setTarget(null)} />
  ) : null;
  return { props, overId, dialog };
}
