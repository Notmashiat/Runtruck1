import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import {
  ALSO, AUDIENCES, CONTACT_EMAIL, FACTS, FAQS, FEATURES, INCLUDED, PRICING, TRIAL, contactHref,
} from '../../data/site';
import { useReveal, useScrollProgress } from '../../lib/scrollFx';
import '../../styles/site.css';
import { LOGIN_REQUIRED } from '../../lib/account';

// What the buttons into the app say: there is no login while it is switched off (lib/account.ts).
const OPEN_APP = LOGIN_REQUIRED ? 'Log in' : 'Open app';
import { JourneyScene } from './JourneyScene';

// The public marketing page ('/'). It wears the app's own look (Inter, the
// card surfaces and the colours of styles/shell.css, light or dark) so the
// page and the product feel like one thing. What it says lives in
// data/site.ts; the scroll scene is JourneyScene.tsx; the styles are
// styles/site.css.

const trialHref = contactHref('RunTruck free trial', 'Company name:\nNumber of trucks:\nYour name:\nPhone:');
const salesHref = contactHref('RunTruck for a larger fleet', 'Company name:\nNumber of trucks:\nYour name:\nPhone:');

// Reveal order within a group: each item fades up a moment after the one before.
const nth = (i: number) => ({ '--i': i }) as CSSProperties;

// A picture of the product for the top of the page: the load board, drawn
// with the app's own pieces. It tips up to face the reader as it scrolls in.
const BOARD = [
  { id: 'L-40218', route: 'Fresno, CA → Reno, NV', driver: 'M. Hale', rate: '$2,390', status: 'In transit', chip: 'blue' },
  { id: 'L-40219', route: 'Stockton, CA → Salt Lake City, UT', driver: 'D. Whitfield', rate: '$3,180', status: 'Dispatched', chip: 'blue' },
  { id: 'L-40220', route: 'Sacramento, CA → Boise, ID', driver: 'E. Nakamura', rate: '$2,910', status: 'Needs POD', chip: 'amber' },
  { id: 'L-40216', route: 'Oakland, CA → Portland, OR', driver: 'P. Raman', rate: '$3,540', status: 'Delivered', chip: 'green' },
];
const BOARD_KPIS = [
  { label: 'Active loads', value: '12' },
  { label: 'Revenue this week', value: '$48.2k' },
  { label: 'Rate per mile', value: '$2.61' },
  { label: 'Ready to invoice', value: '3' },
];

function BoardMock() {
  const ref = useScrollProgress<HTMLDivElement>('enter');
  return (
    <div className="mk-mock-wrap" ref={ref} aria-hidden="true">
      <div className="mk-mock">
        <div className="mk-mock-bar"><span /><span /><span /><em>RunTruck · Loads</em></div>
        <div className="mk-mock-kpis">
          {BOARD_KPIS.map((k) => (
            <div key={k.label}><small>{k.label}</small><strong>{k.value}</strong></div>
          ))}
        </div>
        <div className="mk-mock-table">
          <div className="mk-mock-row is-head"><span>Load</span><span>Route</span><span>Driver</span><span>Rate</span><span>Status</span></div>
          {BOARD.map((l) => (
            <div key={l.id} className="mk-mock-row">
              <span><strong>{l.id}</strong></span><span>{l.route}</span><span>{l.driver}</span><span>{l.rate}</span>
              <span><i className={`ui-chip ui-chip-${l.chip}`}>{l.status}</i></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const root = useReveal<HTMLDivElement>();
  return (
    <div className="mk" ref={root}>
      <header className="mk-nav">
        <div className="mk-wrap mk-nav-in">
          <a className="mk-brand" href="#top"><span className="ui-brand-mark" />RunTruck</a>
          <nav aria-label="Sections">
            <a href="#journey">How it works</a>
            <a href="#product">Product</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </nav>
          <Link className="ui-btn mk-nav-login" to="/login">{OPEN_APP}</Link>
          <a className="ui-btn ui-btn-primary mk-nav-cta" href={trialHref}>Start free trial</a>
        </div>
      </header>

      <main id="top">
        <section className="mk-hero mk-wrap">
          <p className="mk-eyebrow" data-reveal>Transportation management for trucking companies</p>
          <h1 data-reveal style={nth(1)}>Every load, from <span>dispatch</span> to <span>paid</span>.</h1>
          <p className="mk-lede" data-reveal style={nth(2)}>
            RunTruck runs the whole office on one record per load: dispatch, fleet, customers, invoicing, driver pay and safety.
            Enter a load once and it carries through to the invoice and the pay run.
          </p>
          <div className="mk-cta" data-reveal style={nth(3)}>
            <a className="ui-btn ui-btn-primary mk-btn-lg" href={trialHref}>Start your {TRIAL}</a>
            <a className="ui-btn mk-btn-lg" href="#journey">See how it works</a>
          </div>
          <ul className="mk-hero-facts" data-reveal style={nth(4)}>
            <li>Priced per truck</li><li>Every feature on every plan</li><li>No charge per user</li>
          </ul>
          <BoardMock />
        </section>

        <JourneyScene />

        <section id="product" className="mk-section mk-wrap">
          <p className="mk-eyebrow" data-reveal>The product</p>
          <h2 className="mk-h2" data-reveal style={nth(1)}>Everything the office runs on, in one place.</h2>
          <div className="mk-grid-3">
            {FEATURES.map((f, i) => (
              <article key={f.title} className="mk-card" data-reveal style={nth(i % 3)}>
                <span className="mk-card-no">{String(i + 1).padStart(2, '0')}</span>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </article>
            ))}
          </div>
          <ul className="mk-also" data-reveal>
            {ALSO.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </section>

        <section className="mk-band">
          <div className="mk-wrap mk-facts">
            {FACTS.map((f, i) => (
              <div key={f.label} data-reveal style={nth(i)}>
                <strong>{f.value}</strong>
                <span>{f.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mk-section mk-wrap">
          <p className="mk-eyebrow" data-reveal>Who it is for</p>
          <h2 className="mk-h2" data-reveal style={nth(1)}>Built for the people who move freight.</h2>
          <div className="mk-grid-4">
            {AUDIENCES.map((a, i) => (
              <article key={a.name} className="mk-card is-plain" data-reveal style={nth(i)}>
                <h3>{a.name}</h3>
                <p>{a.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="pricing" className="mk-section mk-wrap">
          <p className="mk-eyebrow" data-reveal>Pricing</p>
          <h2 className="mk-h2" data-reveal style={nth(1)}>One price per truck. Nothing held back.</h2>
          <div className="mk-grid-3 mk-plans">
            {PRICING.map((p, i) => (
              <article key={p.name} className={`mk-card mk-plan${p.featured ? ' is-featured' : ''}`} data-reveal style={nth(i)}>
                <div className="mk-plan-head">
                  <h3>{p.name}</h3>
                  <span>{p.fits}</span>
                </div>
                <div className="mk-price"><strong>{p.price}</strong><span>{p.unit}</span></div>
                <p>{p.note}</p>
                <a className={`ui-btn${p.featured ? ' ui-btn-primary' : ''} mk-btn-block`} href={p.name === 'Enterprise' ? salesHref : trialHref}>{p.cta}</a>
              </article>
            ))}
          </div>
          <ul className="mk-included" data-reveal>
            {INCLUDED.map((x) => <li key={x}>{x}</li>)}
          </ul>
        </section>

        <section id="faq" className="mk-section mk-wrap mk-faq">
          <div>
            <p className="mk-eyebrow" data-reveal>Questions</p>
            <h2 className="mk-h2" data-reveal style={nth(1)}>Straight answers.</h2>
          </div>
          <div className="mk-faq-list">
            {FAQS.map((f, i) => (
              <details key={f.q} data-reveal style={nth(i % 4)}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section id="start" className="mk-section mk-wrap">
          <div className="mk-start" data-reveal>
            <h2 className="mk-h2">Run your next load on RunTruck.</h2>
            <p>
              Tell us your company name and how many trucks you run. We set up your company, send your login,
              and your {TRIAL} begins.
            </p>
            <div className="mk-cta">
              {CONTACT_EMAIL && <a className="ui-btn ui-btn-primary mk-btn-lg" href={trialHref}>Start your {TRIAL}</a>}
              <Link className={`ui-btn mk-btn-lg${CONTACT_EMAIL ? '' : ' ui-btn-primary'}`} to="/login">{CONTACT_EMAIL ? OPEN_APP : LOGIN_REQUIRED ? 'Log in to your account' : 'Open RunTruck'}</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="mk-footer">
        <div className="mk-wrap mk-footer-in">
          <div>
            <span className="mk-brand"><span className="ui-brand-mark" />RunTruck</span>
            <p>The transportation management system for trucking companies.</p>
          </div>
          <nav aria-label="Footer">
            <a href="#journey">How it works</a>
            <a href="#product">Product</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
            <Link to="/login">{OPEN_APP}</Link>
          </nav>
          <small>© {new Date().getFullYear()} RunTruck</small>
        </div>
      </footer>
    </div>
  );
}
