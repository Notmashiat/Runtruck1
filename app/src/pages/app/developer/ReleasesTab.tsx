import { Fragment, useState, type ReactNode } from 'react';
import { Card } from '../../../components/Card';
import { useModal } from '../../../components/FormBits';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { isPaying, type ClientCompany } from '../../../data/companies';
import { fmtDate } from '../../../data/invoicing';
import { USER } from '../../../data/mock';
import { RELEASES, type Change } from '../../../data/releases';
import { me } from '../../../lib/auth';
import { useAccounts } from '../../../lib/accountStore';
import { useCompanies } from '../../../lib/companyStore';
import {
  companyReleaseIndex, deployVersion, latestDeployedIndex, mergeVersions, newCompaniesIndex, pendingVersions, setVersionCompanies, versionIdTaken,
  splitVersion, useReleaseState, versionAt, versions, type ReleaseAction, type Version,
} from '../../../lib/releases';

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
const KIND_TAG: Record<Change['kind'], string> = { New: 'tag-green', Updated: 'tag-accent', Fixed: 'tag-neutral' };
const ACTION: Record<ReleaseAction, { label: string; tag: string }> = {
  deploy: { label: 'Deployed', tag: 'tag-green' },
  redeploy: { label: 'Redeployed', tag: 'tag-accent' },
  rollback: { label: 'Rolled back', tag: 'tag-outline' },
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const by = () => me()?.accountId ?? '';

function Changes({ list }: { list: Change[] }) {
  return (
    <ul className="rel-changes">
      {list.map((c) => (
        <li key={c.id}>
          <Tag label={c.kind} tagClass={KIND_TAG[c.kind]} />
          <div>
            <div className="rel-change-title">{c.section} · {c.title}</div>
            <div className="ui-stop-meta">{c.details}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Shell({ label, title, onClose, children, foot }: { label: string; title: string; onClose: () => void; children: ReactNode; foot: (close: () => void) => ReactNode }) {
  const { ref, closeNow, ownEvent } = useModal(onClose);
  return (
    <dialog ref={ref} className="ui-dialog is-compact rel-dialog" aria-label={title} onClose={(e) => { if (ownEvent(e)) onClose(); }} onCancel={(e) => ownEvent(e)}>
      <div className="ui-dialog-main">
        <section className="ui-dialog-body">
          <button type="button" className="ui-dialog-close" onClick={closeNow} aria-label="Close">×</button>
          <div>
            <div className="ui-label">{label}</div>
            <h2 className="ui-h2" style={{ margin: '2px 0 0' }}>{title}</h2>
          </div>
          {children}
        </section>
        <footer className="ui-dialog-foot">{foot(closeNow)}</footer>
      </div>
    </dialog>
  );
}

// Deploy a version to the paid accounts (and anything not yet out before it).
function DeployDialog({ version, onClose }: { version: Version; onClose: () => void }) {
  const companies = useCompanies();
  const s = useReleaseState();
  const [trials, setTrials] = useState(false);
  const [paused, setPaused] = useState(false);
  const [forNew, setForNew] = useState(true);
  const included = pendingVersions(s).filter((v) => v.first <= version.first);
  const accounts = useAccounts();
  // Deactivated companies never get updates.
  const pick = (c: ClientCompany) => !c.deactivated && (isPaying(c) || (trials && c.status === 'Trial') || (paused && c.status === 'Paused'));
  const chosen = companies.filter((c) => pick(c) && companyReleaseIndex(c, s) < version.last);
  const already = companies.filter((c) => pick(c) && companyReleaseIndex(c, s) >= version.last).length;
  const count = (st: ClientCompany['status']) => companies.filter((c) => c.status === st).length;

  return (
    <Shell
      label="Deploy to paid accounts" title={`RunTruck ${version.id} · ${version.title}`} onClose={onClose}
      foot={(close) => (
        <>
          <div style={{ flex: 1 }} />
          <button type="button" className="ui-btn" onClick={close}>Cancel</button>
          <button
            type="button" className="ui-btn ui-btn-primary"
            // Nothing to deploy to: no company ticked and not the version for new companies.
            disabled={chosen.length === 0 && !forNew}
            title={chosen.length === 0 && !forNew ? 'Tick at least one company' : undefined}
            onClick={() => { deployVersion(version, chosen.map((c) => c.companyId), forNew, by(), USER.name); close(); }}
          >
            Deploy {version.id} to {plural(chosen.length, 'company', 'companies')}
          </button>
        </>
      )}
    >
      <p className="ui-p" style={{ margin: 0 }}>Every account in the companies below gets these changes the next time it opens RunTruck.</p>
      {included.map((v) => (
        <div key={v.id}>
          <div className="ui-label" style={{ marginBottom: 6 }}>{v.id} · {v.title}</div>
          <Changes list={v.changes} />
        </div>
      ))}
      <div>
        <div className="ui-label" style={{ marginBottom: 6 }}>Goes to</div>
        <div className="rel-checks">
          <label className="ui-check"><input type="checkbox" checked disabled /> Paying companies (Active, Past due) · {companies.filter(isPaying).length}</label>
          <label className="ui-check"><input type="checkbox" checked={trials} onChange={(e) => setTrials(e.target.checked)} /> Companies on a free trial · {count('Trial')}</label>
          <label className="ui-check"><input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} /> Paused companies · {count('Paused')}</label>
          <label className="ui-check"><input type="checkbox" checked={forNew} onChange={(e) => setForNew(e.target.checked)} /> Companies created from now on start on {version.id}</label>
        </div>
        <p className="ui-stop-meta" style={{ marginTop: 8 }}>
          {chosen.length ? chosen.map((c) => `${c.name} (${c.companyId})`).join(', ') : 'No company needs it right now.'}
          {already ? ` · ${already} already ${already === 1 ? 'has' : 'have'} it.` : ''} You can add or remove companies later with Roll back / redeploy.
        </p>
        <p className="ui-stop-meta" style={{ marginTop: 4 }}>
          Reaches {plural(accounts.filter((a) => a.status === 'Active' && chosen.some((c) => c.companyId === a.companyId)).length, 'active account')}.
          {(() => {
            const frozen = accounts.filter((a) => a.status === 'Deactivated' && chosen.some((c) => c.companyId === a.companyId)).length;
            const skipped = companies.filter((c) => c.deactivated).length;
            return `${frozen ? ` ${plural(frozen, 'deactivated account')} in these companies ${frozen === 1 ? 'keeps its' : 'keep their'} version.` : ''}${skipped ? ` ${plural(skipped, 'deactivated company', 'deactivated companies')} ${skipped === 1 ? 'is' : 'are'} skipped.` : ''}`;
          })()}
        </p>
      </div>
    </Shell>
  );
}

// Merge versions that have not gone out into one version.
function MergeDialog({ chosen, onClose }: { chosen: Version[]; onClose: () => void }) {
  const s = useReleaseState();
  const all = versions(s);
  const first = Math.min(...chosen.map((v) => v.first));
  const last = Math.max(...chosen.map((v) => v.last));
  const covered = all.filter((v) => v.first >= first && v.last <= last);
  const pulledIn = covered.filter((v) => !chosen.some((c) => c.id === v.id));
  const [id, setId] = useState(covered[0]?.id ?? '');
  const [title, setTitle] = useState(covered.map((v) => v.title).join(' + '));
  const clash = versionIdTaken(id, covered.flatMap((v) => v.releases.map((r) => r.id)), s);
  const problem = !id.trim() ? 'Give the version a number' : clash ? `Version ${id.trim()} already exists` : !title.trim() ? 'Give the version a name' : '';

  return (
    <Shell
      label="Merge into one version" title={`${covered.map((v) => v.id).join(' + ')} → ${id.trim() || '…'}`} onClose={onClose}
      foot={(close) => (
        <>
          <div className="ui-stop-meta" style={{ marginTop: 0 }}>{problem}</div>
          <div style={{ flex: 1 }} />
          <button type="button" className="ui-btn" onClick={close}>Cancel</button>
          <button type="button" className="ui-btn ui-btn-primary" disabled={Boolean(problem)} onClick={() => { mergeVersions(covered, id, title, USER.name); close(); }}>
            Merge into {id.trim() || 'one version'}
          </button>
        </>
      )}
    >
      <p className="ui-p" style={{ margin: 0 }}>
        They go out together as one version, with one entry in the history. You can split it again until it is deployed.
        {pulledIn.length ? ` Versions go out in order, so ${pulledIn.map((v) => v.id).join(', ')} ${pulledIn.length === 1 ? 'is' : 'are'} merged in too.` : ''}
      </p>
      <div className="ui-form-grid">
        <label className="ui-field">
          <span className="ui-field-label">Version number</span>
          <input className="ui-input" value={id} onChange={(e) => setId(e.target.value)} placeholder="e.g. 1.1" />
        </label>
        <label className="ui-field">
          <span className="ui-field-label">Name</span>
          <input className="ui-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
      </div>
      <div>
        <div className="ui-label" style={{ marginBottom: 6 }}>Everything in it ({plural(covered.reduce((n, v) => n + v.changes.length, 0), 'change')})</div>
        <Changes list={covered.flatMap((v) => v.changes)} />
      </div>
    </Shell>
  );
}

// Pick exactly which companies have a version: tick to redeploy, untick to roll back.
function ManageDialog({ version, onClose }: { version: Version; onClose: () => void }) {
  const companies = useCompanies();
  const s = useReleaseState();
  const has = (c: ClientCompany) => companyReleaseIndex(c, s) >= version.first;
  const [want, setWant] = useState<Record<string, boolean>>(() => Object.fromEntries(companies.map((c) => [c.companyId, has(c)])));
  const [forNew, setForNew] = useState(newCompaniesIndex(s) >= version.first);
  const before = versionAt(version.first - 1, s);
  const gaining = companies.filter((c) => want[c.companyId] && !has(c));
  const losing = companies.filter((c) => !want[c.companyId] && has(c));
  const flipNew = forNew !== newCompaniesIndex(s) >= version.first;
  // Deactivated companies stay as they are.
  const setAll = (fn: (c: ClientCompany) => boolean) => setWant(Object.fromEntries(companies.map((c) => [c.companyId, c.deactivated ? has(c) : fn(c)])));
  const nothing = gaining.length === 0 && losing.length === 0 && !flipNew;

  return (
    <Shell
      label="Roll back / redeploy" title={`RunTruck ${version.id} · ${version.title}`} onClose={onClose}
      foot={(close) => (
        <>
          <div className="ui-stop-meta" style={{ marginTop: 0 }}>
            {nothing ? 'No changes yet.' : [gaining.length && `${plural(gaining.length, 'company', 'companies')} ${gaining.length === 1 ? 'gets' : 'get'} ${version.id}`, losing.length && `${plural(losing.length, 'company', 'companies')} ${losing.length === 1 ? 'goes' : 'go'} back to ${before.id}`, flipNew && (forNew ? 'new companies start on it' : 'new companies no longer start on it')].filter(Boolean).join(' · ')}
          </div>
          <div style={{ flex: 1 }} />
          <button type="button" className="ui-btn" onClick={close}>Cancel</button>
          <button
            type="button" className="ui-btn ui-btn-primary" disabled={nothing}
            onClick={() => {
              if (losing.length && !window.confirm(`Roll ${version.id} back from ${losing.map((c) => c.name).join(', ')}? They go back to ${before.id}${version.last < RELEASES.length - 1 ? ', along with any later version they had' : ''}.`)) return;
              setVersionCompanies(version, want, companies, forNew, by(), USER.name);
              close();
            }}
          >
            Apply changes
          </button>
        </>
      )}
    >
      <p className="ui-p" style={{ margin: 0 }}>
        Ticked companies have {version.id}. Tick a company to send it {version.id} (for example one left out the first time); untick to roll it back to {before.id}.
      </p>
      <div className="exp-links">
        <button type="button" className="ui-link" onClick={() => setAll(isPaying)}>All paying</button>
        <button type="button" className="ui-link" onClick={() => setAll((c) => c.status !== 'Cancelled')}>All but cancelled</button>
        <button type="button" className="ui-link" onClick={() => setAll(() => true)}>Every company</button>
        <button type="button" className="ui-link" onClick={() => setAll(() => false)}>None</button>
        <button type="button" className="ui-link" onClick={() => setAll(has)}>As it is now</button>
      </div>
      {companies.length === 0 ? (
        <div className="ui-stop-meta">No client companies yet.</div>
      ) : (
        <div className="ui-table-wrap">
          <table className="ui-table">
            <thead><tr><th aria-label="Has it" /><th>Company</th><th>Status</th><th>Now on</th><th>After</th></tr></thead>
            <tbody>
              {companies.map((c) => {
                const now = versionAt(companyReleaseIndex(c, s), s);
                const after = want[c.companyId] === has(c) ? now : want[c.companyId] ? version : before;
                return (
                  <tr
                    key={c.companyId} className={c.deactivated ? 'is-off' : 'is-clickable'} title={c.deactivated ? 'Deactivated: reactivate the company first' : undefined}
                    onClick={() => { if (!c.deactivated) setWant({ ...want, [c.companyId]: !want[c.companyId] }); }}
                  >
                    <td><input type="checkbox" checked={want[c.companyId] ?? false} disabled={Boolean(c.deactivated)} onChange={() => undefined} aria-label={`${c.name} has ${version.id}`} /></td>
                    <td className="strong">{c.name}<div className="ui-stop-meta">{c.companyId}</div></td>
                    <td>{c.deactivated ? 'Deactivated' : c.status}</td>
                    <td>{now.id}</td>
                    <td>{after.id === now.id ? <span className="muted">No change</span> : <strong>{after.id}</strong>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <label className="ui-check"><input type="checkbox" checked={forNew} onChange={(e) => setForNew(e.target.checked)} /> Companies created from now on start on {version.id}</label>
    </Shell>
  );
}

// Developer › Releases: what is new or changed, what is waiting to go out,
// which companies run which version, and the history.
export function ReleasesTab() {
  const companies = useCompanies();
  const s = useReleaseState();
  const [deploying, setDeploying] = useState<Version | null>(null);
  const [managing, setManaging] = useState<Version | null>(null);
  const [merging, setMerging] = useState<Version[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const all = versions(s);
  const pending = pendingVersions(s);
  const isPending = (v: Version) => pending.some((p) => p.id === v.id);
  const newest = all[all.length - 1];
  const deployed = versionAt(latestDeployedIndex(s), s);
  const paying = companies.filter(isPaying);
  const onNewest = paying.filter((c) => companyReleaseIndex(c, s) >= newest.last).length;
  const waitingChanges = pending.reduce((n, v) => n + v.changes.length, 0);
  const lastEvent = [...s.log].sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  const chosen = pending.filter((v) => picked.includes(v.id));

  const kpis = [
    { label: 'Newest version', value: newest.id, note: newest.title },
    { label: 'Deployed to clients', value: deployed.id, note: lastEvent ? `${ACTION[lastEvent.action].label} ${when(lastEvent.at)} by ${lastEvent.byName}` : 'Nothing deployed since 1.0' },
    { label: 'Waiting to deploy', value: String(pending.length), note: pending.length ? plural(waitingChanges, 'change') : 'All caught up' },
    { label: 'Paying companies on newest', value: `${onNewest}/${paying.length}`, note: 'Super admins always run the newest' },
  ];

  const statusOf = (v: Version) => {
    if (v.baseline) return { label: 'Live for everyone', tag: 'tag-green' };
    if (isPending(v)) return { label: 'Ready to deploy', tag: 'tag-outline' };
    const have = paying.filter((c) => companyReleaseIndex(c, s) >= v.first).length;
    return { label: have === paying.length ? 'Deployed' : `Deployed to ${have}/${paying.length}`, tag: have === paying.length ? 'tag-green' : 'tag-accent' };
  };

  return (
    <>
      <Kpis items={kpis} />

      <Card title="Ready to deploy">
        {pending.length === 0 ? (
          <div className="ui-stop-meta">Nothing waiting. New and updated features appear here as soon as they are added.</div>
        ) : (
          <>
            <div className="rel-toolbar">
              <p className="ui-p" style={{ margin: 0, flex: 1 }}>
                Live for super admins now; client companies keep their version until you deploy.
                {pending.length > 1 ? ' Tick two or more to merge them into one version.' : ''}
              </p>
              {pending.length > 1 && (
                <button type="button" className="ui-btn" disabled={chosen.length < 2} onClick={() => setMerging(chosen)}>
                  Merge {chosen.length >= 2 ? `${chosen.length} versions` : 'selected'} into one
                </button>
              )}
            </div>
            {pending.map((v, i) => (
              <div key={v.id} className="rel-pending">
                <div className="rel-pending-head">
                  {pending.length > 1 && (
                    <input type="checkbox" aria-label={`Select ${v.id} to merge`} checked={picked.includes(v.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, v.id] : picked.filter((x) => x !== v.id))} />
                  )}
                  <div>
                    <div className="rel-version">RunTruck {v.id}</div>
                    <div className="ui-stop-meta">
                      {v.title} · written {fmtDate(v.date)}
                      {v.merge ? ` · merged from ${v.releases.map((r) => r.id).join(' + ')}` : ''}
                      {i > 0 ? ` · deploying it also sends ${pending.slice(0, i).map((x) => x.id).join(', ')}` : ''}
                    </div>
                  </div>
                  <div style={{ flex: 1 }} />
                  {v.merge && <button type="button" className="ui-link" onClick={() => splitVersion(v)}>Split</button>}
                  {/* Only the next version to deploy is the highlighted action. */}
                  <button type="button" className={`ui-btn${i === 0 ? ' ui-btn-primary' : ''}`} onClick={() => setDeploying(v)}>Deploy {v.id} to paid accounts</button>
                </div>
                <Changes list={v.changes} />
              </div>
            ))}
          </>
        )}
      </Card>

      <Card title="All versions" flush>
        <table className="ui-table">
          <thead>
            <tr><th>Version</th><th>Written</th><th>What</th><th className="num">Changes</th><th>Status</th><th className="num" aria-label="Actions" /></tr>
          </thead>
          <tbody>
            {[...all].reverse().map((v) => {
              const open = openId === v.id;
              const st = statusOf(v);
              const live = !v.baseline && !isPending(v);
              return (
                <Fragment key={v.id}>
                  <tr className={`is-clickable${open ? ' is-open' : ''}`} onClick={() => setOpenId(open ? null : v.id)} aria-expanded={open}>
                    <td className="strong">{v.id}{v.merge && <div className="ui-stop-meta">{v.releases.map((r) => r.id).join(' + ')}</div>}</td>
                    <td>{fmtDate(v.date)}</td>
                    <td>{v.title}</td>
                    <td className="num">{v.changes.length}</td>
                    <td><Tag label={st.label} tagClass={st.tag} /></td>
                    <td className="num">
                      {live && <button type="button" className="ui-btn ui-btn-sm" onClick={(e) => { e.stopPropagation(); setManaging(v); }}>Roll back / redeploy</button>}
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={6} className="ui-expand-cell">
                        <div className="ui-batch"><Changes list={v.changes} /></div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card title="History" flush>
        <table className="ui-table">
          <thead>
            <tr><th>When</th><th>Action</th><th>Version</th><th>By</th><th>Companies</th><th className="num" aria-label="Actions" /></tr>
          </thead>
          <tbody>
            {[...s.log].sort((a, b) => (a.at < b.at ? 1 : -1)).map((e) => {
              const v = versionAt(RELEASES.findIndex((r) => r.id === e.release), s);
              const names = e.companies.map((id) => companies.find((c) => c.companyId === id)?.name ?? id);
              return (
                <tr key={e.id}>
                  <td>{when(e.at)}</td>
                  <td><Tag label={ACTION[e.action].label} tagClass={ACTION[e.action].tag} /></td>
                  <td className="strong">{v.id}</td>
                  <td>{e.byName}</td>
                  <td>
                    {names.length ? names.join(', ') : 'No existing companies'}
                    {e.newCompanies && <div className="ui-stop-meta">{e.newCompanies === 'on' ? 'New companies start on it' : 'New companies no longer start on it'}</div>}
                  </td>
                  <td className="num">
                    {!isPending(v) && !v.baseline && <button type="button" className="ui-btn ui-btn-sm" onClick={() => setManaging(v)}>Roll back / redeploy</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {s.log.length === 0 && <div className="ui-empty">Nothing deployed yet.</div>}
      </Card>

      {deploying && <DeployDialog version={deploying} onClose={() => setDeploying(null)} />}
      {managing && <ManageDialog version={managing} onClose={() => setManaging(null)} />}
      {merging && <MergeDialog chosen={merging} onClose={() => { setMerging(null); setPicked([]); }} />}
    </>
  );
}
