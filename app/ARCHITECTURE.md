# RunTruck: how it is built, and how to fix it

Read this first when something is broken or you are about to add a feature.
`README.md` lists every folder and screen; this file explains the rules the
code follows and where to look.

## The stack (kept small on purpose)

| What | Used for |
| --- | --- |
| TypeScript (strict) | All application code. No plain JavaScript in `src/`. |
| React 19 + React Router 7 | Screens and URLs. |
| CSS (plain, `ui-*` classes in `src/styles/shell.css`) | All styling. No CSS framework. |
| Vite 8 | Dev server and production build. |
| Vitest + Testing Library | Tests. |
| oxlint | Lint. |

Runtime dependencies are `react`, `react-dom` and `react-router-dom`, and
nothing else. PDF, Excel, Word, ZIP and CSV files are written by small modules
in `src/lib/` rather than by libraries. Think twice before adding a dependency:
each one is code nobody here has read, and it has to be kept up to date for years.

## Commands

Run these inside `app/`.

```
npm run dev        # dev server on http://localhost:5173
npm run typecheck  # TypeScript only
npm test           # all tests, once
npm run test:watch # tests, re-run on save
npm run lint       # oxlint
npm run verify     # typecheck + tests + production build (what Vercel and CI run)
```

A deploy is refused when `npm run verify` fails, so a type error or a failing
test never reaches production.

### The load test

`src/test/load/` opens RunTruck as many accounts of many companies, one after
another, all saving into the same storage through the app's own save
functions, then checks that no company's data ever reached another company,
that everything saved is still there, and that the demo company (ID 1) is
unchanged. `npm test` runs it small (6 companies × 5 accounts). The full size,
100 companies × 50 accounts (5,000 sessions, about six minutes):

```
VITE_RT_LOAD=100x50 NODE_OPTIONS=--max-old-space-size=8192 npx vitest run src/test/load
```

(In PowerShell set the two variables with `$env:VITE_RT_LOAD='100x50'` and
`$env:NODE_OPTIONS='--max-old-space-size=8192'` first.) Its storage is in
memory: it creates nothing that lasts. `tabs.load.test.tsx` covers several
tabs of one browser saving at the same moment.

## Where things live

```
src/
  main.tsx        start-up: error handlers, saved settings, the root error boundary
  App.tsx         every route; each page is loaded on demand (lib/lazyPage.ts)
  pages/          one file per screen or tab
  components/     dialogs, the shell (Sidebar, Header, AppLayout) and shared pieces
  context/        AppShellContext: the company's records and every save/delete
  data/           record types and the business rules (pure functions, tested)
  lib/            storage, errors, auth, ids, dates, exports, PDF: no screens
  styles/         CSS
  test/           test set-up, and the load test (test/load)
```

Rule of thumb: **rules go in `data/` or `lib/` as plain functions; screens only
show things and call them.** A calculation written inside a component cannot
be tested and gets copied; one in `data/` can be tested and is written once.

## How data flows

```
screen ──calls──▶ AppShellContext (saveLoad, saveInvoice, …)
                        │  usePersisted (lib/persist.ts)
                        ▼
                  lib/storage.ts ──▶ localStorage  runtruck-<companyId>-<records>
                  lib/fileStore.ts ─▶ IndexedDB    attached files
```

- **Multi-tenant keys.** Every company's records are stored under
  `runtruck-<companyId>-…` (`scopedKey` in `lib/account.ts`). Never read or
  write `localStorage` directly: go through `lib/storage.ts`, which reports
  failed saves and keeps open tabs in step.
- **Reading saved data.** Each record list has a reviver in
  `AppShellContext.tsx`. A record that does not fit is repaired or moved to
  `runtruck-<companyId>-quarantine`; one bad record never empties a list.
- **Ids are never reused** (`lib/ids.ts`), even after a record is deleted.
- **Tabs never overwrite each other.** A tab that saves a list just after
  another tab did merges the two (`lib/mergeLists.ts`), and a new record whose
  number another tab has just used is saved under the next free number.
- **Dates are `YYYY-MM-DD` strings.** Do date arithmetic only with
  `lib/isoDates.ts`; it never throws on a blank or mistyped date. "Today" is
  `todayIso()` from `lib/clock.ts` (the company's time zone).
- **Money** is rounded with `round2` (`data/invoicing.ts`).

### There is no server yet

Everything above lives in the browser. That is the one real limit of the
current build: records are per browser (about 5 MB per site), accounts are
checked in the browser, and two people do not see each other's work.

Measured sizes, for planning: a load is about 0.7–2.5 KB, an invoice about
1 KB, a customer about 1.2 KB, a login account about 0.45 KB. A 40-truck
fleet books roughly 4,000 loads a year, so one year of loads and invoices is
7 MB or more: more than a browser holds. The account register alone for 100
companies of 50 people is 2.2 MB. Before
client companies use RunTruck for real it needs a server: a database, sign-in
checked on the server, and an API.

The code is arranged so that change is contained:

- `lib/storage.ts` and `lib/persist.ts` are the only places that read and
  write records. Replace their insides with API calls and the screens do not change.
- `lib/auth.ts` is the only place that checks a password.
- Logging in is switched off for now (`LOGIN_REQUIRED` in `lib/account.ts`):
  the site opens as the owner and `/login` goes into the app. The login page,
  accounts and passwords are all kept; set it to `true` to bring them back.
- `setErrorSink()` in `lib/errorLog.ts` is where error reports can be sent to
  a server or a service such as Sentry.

## When something breaks

A crash never takes the whole app down. `components/ErrorBoundary.tsx` wraps
the app, the sidebar, the header, each page, each tab and each dialog, so a
fault shows a "Something went wrong here" panel in that one place and the rest
keeps working.

Every fault is recorded by `lib/errorLog.ts` with a reference like
`ERR-K3F9Q2`, the screen it happened on, the release and build running, and
the stack trace.

To find a problem a user reports:

1. Ask for the reference on the panel (or have them press **Copy details**).
2. Open **Developer › Error log** on that device. Each entry shows the
   message, where it happened, how many times, and the stack.
3. The stack names the real function ("at PayrollTab"): production builds keep
   function names. Source maps are not published (they would give away the
   source code). For exact lines, check out the commit shown as the entry's
   Build, run `npm run build`, and open the matching file in `app/maps/`.
4. Write a test that reproduces it in the matching `*.test.ts`, fix it, and
   run `npm run verify`.

Other signs worth knowing:

- **"Could not save" banner**: the browser's storage is full or blocked
  (`lib/storage.ts`). Nothing typed after the banner appeared is saved.
- **A list looks short**: check `runtruck-<companyId>-quarantine` in the
  browser's storage for records that could not be read.
- **Blank page after a deploy**: an old tab asked for a file from the previous
  build. `lib/lazyPage.ts` reloads once by itself.

## Releasing a feature

Every new or changed client-facing feature goes behind a release
(`data/releases.ts`) and is checked with `isLive('<change id>')`, keeping the
old behaviour otherwise. Super admins deploy a release to companies from
**Developer › Releases**. Fixes for bugs and reliability are not gated.

## Adding a feature: the checklist

1. Types and rules in `data/<thing>.ts`, with tests next to it.
2. State and save/delete in `AppShellContext.tsx` through `usePersisted`, with
   a reviver, and `noteIds` for its ids.
3. The screen in `pages/`, registered in `App.tsx` with `page(...)`.
4. Forms through `RecordDialog`; attach buttons open `AttachDialog`.
5. Long tables use `usePaged` (`lib/paging.tsx`); sorting and filters come
   from `lib/tableTools.tsx`.
6. Put it behind `isLive(...)` and add the change to `data/releases.ts`.
7. `npm run verify`.

## Security notes

- Attached files open in a tab only when they are a PDF or a picture; anything
  else is downloaded (`lib/attachments.ts`), because an HTML or SVG file opened
  on this site could run a script with the company's records.
- CSV exports neutralise cells that a spreadsheet would run as a formula (`lib/csv.ts`).
- `vercel.json` sends a Content-Security-Policy: scripts only from this site,
  no inline scripts. Keep it that way (`public/theme-init.js` exists for that reason).
- A free trial that has ended locks the company's accounts out (`trialEnded`
  in `data/companies.ts`, enforced in `lib/auth.ts`); nothing is deleted.
- Deleting a company removes its records and files from the browser
  (`purgeCompanyData` in `lib/companyStore.ts`).
- Passwords are salted and hashed (`lib/password.ts`), but they are checked in
  the browser. That is not real security until sign-in moves to a server.
