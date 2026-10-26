import type { Settings } from '../data/settings';
import { DISPATCHERS, TERMINALS } from '../data/fleet';
import { BILLING, COMPANY, FACTORING } from '../data/invoicing';
import { CARRIERS, USER } from '../data/mock';
import { getSettings, numSetting, subscribeSettings } from './settingsStore';
import { applyTheme } from './theme';

const replaceAll = (list: string[], next: string[]) => list.splice(0, list.length, ...next);

// Carry the settings into the shared app data: the signed-in person, the
// company on invoices and emails, terminals, dispatchers, the factoring
// company, and the look of the app.
function apply(s: Settings) {
  const p = s.profile;
  const c = s.company;
  const inv = s.invoicing;

  Object.assign(USER, { name: p.name, role: p.title, email: p.email, company: c.name });
  Object.assign(COMPANY, {
    name: c.name, legal: c.legal || c.name, street: c.street, city: c.city, state: c.state, zip: c.zip,
    phone: c.phone, email: c.email, website: c.website,
    mc: c.mc ? `MC ${c.mc.replace(/^MC\s*/i, '')}` : '', dot: c.dot ? `USDOT ${c.dot.replace(/^(US)?DOT\s*/i, '')}` : '',
    remit: inv.remit, bank: inv.bank, accountLast4: inv.accountLast4, lateFeePct: numSetting(inv.lateFeePct, 0),
  });
  if (CARRIERS[0]) Object.assign(CARRIERS[0], { name: `${c.name} (own fleet)`, mc: COMPANY.mc, dot: c.dot ? `DOT ${c.dot}` : '' });

  replaceAll(TERMINALS, s.operations.terminals.filter((t) => t.trim()));
  replaceAll(DISPATCHERS, s.team.filter((m) => m.active && (m.role === 'Dispatcher' || m.role === 'Admin')).map((m) => m.name));

  // The factoring company batches can be sent to.
  if (inv.factoringName.trim()) {
    const key = `${inv.factoringName.trim()} (factoring)`;
    // A renamed factoring company is a different company: it does not inherit the old one's address.
    const previous = BILLING[key] ?? { name: '', attn: '', street: '', city: '', state: '', zip: '', email: '', phone: '' };
    BILLING[key] = { ...previous, name: inv.factoringName.trim(), email: inv.factoringEmail.trim() || previous.email };
    replaceAll(FACTORING, [key]);
  }

  // Appearance.
  const a = s.appearance;
  const root = document.documentElement;
  const dark = a.theme === 'Dark' || (a.theme === 'System' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  applyTheme(dark ? 'dark' : 'light');
  if (a.accent === 'Blue') delete root.dataset.accent;
  else root.dataset.accent = a.accent.toLowerCase();
  root.style.setProperty('--ui-zoom', a.textSize === 'Small' ? '0.92' : a.textSize === 'Large' ? '1.1' : '1');
  if (a.density === 'Compact') root.dataset.density = 'compact';
  else delete root.dataset.density;
}

// Before the first render: apply what is saved, then keep applying changes.
// "System" follows the device's light/dark setting as it changes.
export function initSettings() {
  apply(getSettings());
  subscribeSettings(apply);
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (getSettings().appearance.theme === 'System') apply(getSettings());
  });
}
