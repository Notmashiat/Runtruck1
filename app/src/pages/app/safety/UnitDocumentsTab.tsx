import { useState } from 'react';
import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { UnitDocumentsDialog } from '../../../components/UnitDocumentsDialog';
import { useAppShell } from '../../../context/AppShellContext';
import { renewBy, renewWindow, type DocStatus } from '../../../data/compliance';
import { fmtDate } from '../../../data/invoicing';
import { STATUS_ORDER, unitDocumentRows, type UnitDoc, type UnitDocRow } from '../../../data/unitDocuments';
import { matchesQuery } from '../../../lib/search';
import { SortTh, useSort, usePageFilters, type FilterDef } from '../../../lib/tableTools';
import { usePaged } from '../../../lib/paging';

// Safety › Unit Documents (release 1.36): each truck's and trailer's
// registration, annual inspection, insurance and IFTA decal, most urgent first.
// Update opens the unit's documents popup.

const STATUSES: DocStatus[] = ['Expired', 'Missing', 'Expiring', 'Valid'];
const ROW_LABEL: Record<DocStatus, string> = { Expired: 'Expired', Missing: 'Missing', Expiring: 'Expiring', Valid: 'Current' };

function DocCell({ d }: { d?: UnitDoc }) {
  if (!d) return <td><span className="ui-stop-meta" style={{ marginTop: 0 }}>—</span></td>;
  return (
    <td>
      {d.date ? fmtDate(d.date) : <span className="ui-stop-meta" style={{ marginTop: 0, display: 'inline' }}>No date</span>}
      {d.status !== 'Valid' && <div className="ui-stop-meta" style={d.status === 'Expired' || d.status === 'Missing' ? { color: 'var(--ui-red)' } : undefined}>{d.status}</div>}
    </td>
  );
}

export function UnitDocumentsTab() {
  const { query, trucks, trailers } = useAppShell();
  const [updating, setUpdating] = useState<UnitDocRow | null>(null);
  const all = unitDocumentRows(trucks, trailers);
  const docs = all.flatMap((r) => r.docs);
  const count = (s: DocStatus) => docs.filter((d) => d.status === s).length;
  const current = all.filter((r) => r.status === 'Valid' || r.status === 'Expiring').length;
  const inspectionsDue = all.filter((r) => r.docs.find((d) => d.document === 'Annual inspection')?.status !== 'Valid');

  const kpis = [
    { label: 'Units current', value: `${current}/${all.length}`, note: 'Active trucks and trailers with nothing expired or missing' },
    { label: 'Expired or missing', value: String(count('Expired') + count('Missing')), note: all.filter((r) => r.status === 'Expired' || r.status === 'Missing').map((r) => r.unit).join(' · ') || 'Nothing out of date' },
    { label: `Expiring (${renewWindow()} d)`, value: String(count('Expiring')), note: `Renew before ${fmtDate(renewBy(), true)}` },
    { label: 'Inspections due', value: String(inspectionsDue.length), note: inspectionsDue.length ? inspectionsDue.map((r) => r.unit).join(' · ') : 'All annual inspections current' },
  ];

  const filters: FilterDef<UnitDocRow>[] = [
    { key: 'status', label: 'Status', type: 'select', get: (r) => ROW_LABEL[r.status], options: STATUSES.map((s) => ROW_LABEL[s]) },
    { key: 'kind', label: 'Unit type', type: 'select', get: (r) => (r.kind === 'truck' ? 'Truck' : 'Trailer'), options: ['Truck', 'Trailer'] },
  ];
  const find = (r: UnitDocRow, doc: string) => r.docs.find((d) => d.document === doc);
  const dateOf = (r: UnitDocRow, doc: string) => find(r, doc)?.date || '9999';
  const sort = useSort(
    usePageFilters(all.filter((r) => matchesQuery({ unit: r.unit, label: r.label, kind: r.kind }, query)), filters),
    {
      unit: (r) => r.unit, status: (r) => STATUS_ORDER(r.status), reg: (r) => dateOf(r, 'Registration'),
      insp: (r) => dateOf(r, 'Annual inspection'), ins: (r) => dateOf(r, 'Insurance'), ifta: (r) => dateOf(r, 'IFTA decal'),
    },
  );
  const rows = sort.key ? sort.rows : [...sort.rows].sort((a, b) => STATUS_ORDER(a.status) - STATUS_ORDER(b.status) || a.unit.localeCompare(b.unit));
  const paged = usePaged(rows);

  return (
    <>
      <Kpis items={kpis} />
      <Card title="Unit documents" flush action={<span className="ui-stop-meta" style={{ marginTop: 0 }}>Registration · annual inspection · insurance · IFTA</span>}>
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="unit">Unit</SortTh>
              <SortTh sort={sort} k="reg">Registration</SortTh>
              <SortTh sort={sort} k="insp">Next inspection</SortTh>
              <SortTh sort={sort} k="ins">Insurance</SortTh>
              <SortTh sort={sort} k="ifta">IFTA decal</SortTh>
              <SortTh sort={sort} k="status">Status</SortTh>
              <th className="num" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {paged.rows.map((r) => (
              <tr key={r.id}>
                <td className="strong">{r.kind === 'truck' ? 'Truck' : 'Trailer'} {r.unit}<div className="ui-stop-meta">{r.label || '—'}</div></td>
                <DocCell d={find(r, 'Registration')} />
                <DocCell d={find(r, 'Annual inspection')} />
                <DocCell d={find(r, 'Insurance')} />
                <DocCell d={find(r, 'IFTA decal')} />
                <td><Tag label={ROW_LABEL[r.status]} tagClass={r.status === 'Valid' ? 'tag-green' : r.status === 'Expiring' ? 'tag-accent' : 'tag-outline'} /></td>
                <td className="num"><button type="button" className="ui-link" onClick={() => setUpdating(r)}>Update…</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {paged.pager}
        {rows.length === 0 && <div className="ui-empty">{all.length ? 'Nothing matches the search or filters.' : 'No active trucks or trailers. Add them in Fleet.'}</div>}
      </Card>

      {updating && (
        <UnitDocumentsDialog
          kind={updating.kind}
          truck={updating.kind === 'truck' ? trucks.find((t) => t.id === updating.id) : undefined}
          trailer={updating.kind === 'trailer' ? trailers.find((t) => t.id === updating.id) : undefined}
          onClose={() => setUpdating(null)}
        />
      )}
    </>
  );
}
