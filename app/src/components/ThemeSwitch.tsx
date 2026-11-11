import { faMoon, faSun } from '@fortawesome/free-regular-svg-icons';
import { useSettings } from '../lib/settingsStore';
import { Fa } from './Fa';

// Light or dark from the top bar (release 1.22): the same choice as
// Settings › Appearance › Theme, saved for this account.
export function ThemeSwitch() {
  const [s, update] = useSettings();
  const theme = s.appearance.theme;
  const dark = theme === 'Dark' || (theme === 'System' && Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches));
  const pick = (next: 'Light' | 'Dark') => update((prev) => ({ ...prev, appearance: { ...prev.appearance, theme: next } }));
  return (
    <div className="ui-theme" role="group" aria-label="Theme">
      <button type="button" className={`ui-theme-btn${dark ? '' : ' is-on'}`} aria-pressed={!dark} title="Light theme" aria-label="Light theme" onClick={() => pick('Light')}>
        <Fa icon={faSun} />
      </button>
      <button type="button" className={`ui-theme-btn${dark ? ' is-on' : ''}`} aria-pressed={dark} title="Dark theme" aria-label="Dark theme" onClick={() => pick('Dark')}>
        <Fa icon={faMoon} />
      </button>
    </div>
  );
}
