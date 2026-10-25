// RunTruck's releases: what each version adds or changes. Super admins
// (Company ID 1) always run the newest code, so they can try it first; a
// client company only gets a release once a super admin deploys it in
// Developer › Releases.
//
// How to ship a change:
// 1. Add it to a release below (a new release at the end of the list, or
//    the newest one if that is not deployed yet), with a unique change id.
// 2. In the code, show the new or changed behaviour only where
//    isLive('<change id>') is true (lib/releases.ts), and keep the old
//    behaviour otherwise, so companies that have not received the release
//    keep working exactly as before.
// 3. Once it is deployed to every company, the check can be removed in a
//    later clean-up (the entry stays here as history).

export type ChangeKind = 'New' | 'Updated' | 'Fixed';

export interface Change {
  id: string;
  kind: ChangeKind;
  section: string;
  title: string;
  details: string;
}

export interface Release {
  id: string;
  date: string;
  title: string;
  // The release every company already had when releases began: live for all.
  baseline?: boolean;
  changes: Change[];
}

export const RELEASES: Release[] = [
  {
    id: '1.0',
    date: '2026-10-01',
    title: 'RunTruck as every company has it today',
    baseline: true,
    changes: [
      { id: 'base-loads', kind: 'New', section: 'Loads', title: 'Load board and load details', details: 'New Load form, editing, status, stops and documents.' },
      { id: 'base-planner', kind: 'New', section: 'Planner', title: 'Planner calendar', details: 'Day, week and month views with loads and events.' },
      { id: 'base-fleet', kind: 'New', section: 'Fleet', title: 'Drivers, trucks and trailers', details: 'Full records with archive and delete.' },
      { id: 'base-facilities', kind: 'New', section: 'Facilities', title: 'Facility register', details: 'Shippers, receivers, yards and truck stops.' },
      { id: 'base-accounting', kind: 'New', section: 'Accounting', title: 'Invoicing', details: 'Invoices with PDF, batches, past-due reminders and late fees.' },
      { id: 'base-dashboard', kind: 'New', section: 'Dashboard', title: 'Customizable dashboard', details: 'Live numbers, charts and resizable widgets.' },
      { id: 'base-settings', kind: 'New', section: 'Settings', title: 'Settings, login and accounts', details: 'Company settings, filters and sorting on every table, permissions per account.' },
    ],
  },
  {
    id: '1.1',
    date: '2026-10-01',
    title: 'Export loads',
    changes: [
      {
        id: 'loads-export', kind: 'New', section: 'Loads', title: 'Export loads to a spreadsheet',
        details: 'An Export button on Loads downloads every load as a CSV file that opens in Excel or Google Sheets.',
      },
    ],
  },
  {
    id: '1.2',
    date: '2026-10-01',
    title: 'Export data from Settings',
    changes: [
      {
        id: 'settings-export', kind: 'New', section: 'Settings', title: 'Export data',
        details: 'Settings › Export data downloads any records the account can open (loads, fleet, customers, facilities, accounting, HR, safety, planner), filtered by dates, drivers, units, customers or text, with a choice of columns, as PDF, Word, Excel or CSV, after a review step.',
      },
      {
        id: 'loads-export-moved', kind: 'Updated', section: 'Loads', title: 'Export moves to Settings',
        details: 'The Export button on Loads is replaced by Settings › Export data.',
      },
    ],
  },
  {
    id: '1.3',
    date: '2026-10-01',
    title: 'Bills',
    changes: [
      {
        id: 'bills-manage', kind: 'New', section: 'Accounting', title: 'Manage bills',
        details: 'Each bill on Accounting › Bills opens to every detail, with Edit bill, Mark paid, Schedule payment, Void and Undo payment, and documents (vendor invoices, receipts, contracts) attached to the bill.',
      },
      {
        id: 'bills-add', kind: 'New', section: 'Accounting', title: 'Add Bill form, one-time or recurring',
        details: '+ Add Bill opens a form for the vendor, invoice #, category, amount, dates and terms, what it is charged to (truck, trailer, driver, load, terminal), payment and documents. Recurring bills (weekly to yearly, with an optional end date) make the next bill when one is paid.',
      },
    ],
  },
  {
    id: '1.4',
    date: '2026-10-01',
    title: 'Customers',
    changes: [
      {
        id: 'crm-customers', kind: 'New', section: 'CRM', title: 'Add Customer form and customer details',
        details: '+ Add Customer opens a form for the company, contacts, billing (bill-to, terms, credit limit, how they pay and get invoices), freight profile and documents on file. Each customer on CRM opens to every detail, with Edit customer, attached documents and a log.',
      },
      {
        id: 'crm-inactive', kind: 'New', section: 'CRM', title: 'Inactive customers',
        details: 'Customers can be moved to inactive with a reason, and move there by themselves after a year with no loads or invoices. Inactive customers (top right) lists them with when, why and by whom, and can reactivate them.',
      },
      {
        id: 'attach-popup', kind: 'Updated', section: 'Loads', title: 'Attach documents by drag and drop',
        details: 'Attach on the New Load documents step opens a popup: drag and drop the file or browse for it. Bills and customers attach the same way.',
      },
    ],
  },
  {
    id: '1.5',
    date: '2026-10-01',
    title: 'Payroll',
    changes: [
      {
        id: 'payroll', kind: 'New', section: 'Accounting', title: 'Payroll: employees, pay runs and pay stubs',
        details: 'Accounting › Payroll keeps everyone the company pays (drivers, owner-operators, staff) with how they are paid, payout details, every-pay deductions and documents. + New pay run works out pay for a period (drivers from delivered loads per mile, % of line haul or per load; hourly and salaried staff), with one-off additions, deductions, holds and estimated withholding; runs go Draft → Approved → Paid, with PDF pay stubs. Archived (top right) keeps people who left, with why, when and who.',
      },
    ],
  },
  {
    id: '1.6',
    date: '2026-10-01',
    title: 'Payroll in HR',
    changes: [
      {
        id: 'payroll-in-hr', kind: 'Updated', section: 'HR', title: 'Payroll moves to HR',
        details: 'Payroll is now the first tab under HR (HR › Payroll, then Employee Contracts and Onboarding) and leaves Accounting. Old Accounting › Payroll links open HR › Payroll, and anyone who could open Accounting › Payroll can open HR › Payroll.',
      },
    ],
  },
  {
    id: '1.7',
    date: '2026-10-02',
    title: 'HR contracts and onboarding',
    changes: [
      {
        id: 'hr-contracts', kind: 'Updated', section: 'HR', title: 'Employee contracts you can draft, sign, renew and end',
        details: '+ New Contract opens a form for the agreement (W-2 employment, 1099 contractor, owner-operator lease, lease-purchase, offer letter), term and renewal, notice and introductory period, pay and benefits, equipment, lease payment, escrow, fuel and insurance for drivers, and clauses. Each contract opens to its terms, documents and log, with Download PDF, Send for signature, Record signatures, Renew, End and Add to payroll. The page flags renewals and endings in the next 60 days, unsigned contracts, introductory-period reviews and people on payroll with no contract.',
      },
      {
        id: 'hr-onboarding', kind: 'Updated', section: 'HR', title: 'Onboarding checklists from application to first day',
        details: '+ Start Onboarding opens a form for the candidate, position, start date, pay offered and, for drivers, CDL, medical certificate, endorsements and experience. Each hire gets a checklist for their role (drivers: the DOT qualification file, Clearinghouse query, drug test and road test; owner-operators: lease, insurance and truck paperwork; office and shop staff: their own), ticked off with who and when. Hired people go to payroll, Fleet › Drivers (with their qualification dates) and a contract in a click; candidates who do not join are closed with a reason.',
      },
    ],
  },
  {
    id: '1.8',
    date: '2026-10-02',
    title: 'Safety',
    changes: [
      {
        id: 'safety-maintenance', kind: 'Updated', section: 'Safety', title: 'Maintenance work orders',
        details: '+ Log Service opens a work order for a truck or trailer: service type (PM, DOT annual inspection, brakes, tires, reefer…), priority and out-of-service, due date or odometer, shop, estimate and repeat interval. Each order moves Scheduled → In shop → Waiting on parts → Done with a log; Complete records parts, labor, odometer and invoice, updates the unit (service date, inspection date, next PM, back in service), can add a bill to Accounting and books the next one. The page flags overdue work, units out of service, monthly spend, and inspections or PMs coming due with nothing booked.',
      },
      {
        id: 'safety-documents', kind: 'Updated', section: 'Safety', title: 'Driver qualification files',
        details: 'One file per driver with every document (CDL, medical card, hazmat, TWIC, MVR and annual reviews, Clearinghouse query, drug test), its rule and status, and who cannot drive. Update renews a document on the driver record with the new copy attached; Request documents asks a driver for them with a due date and an email ready to send, and open requests are tracked until received.',
      },
      {
        id: 'safety-violations', kind: 'Updated', section: 'Safety', title: 'Roadside inspections and BASICs',
        details: '+ Log Violation records an inspection (level, report, location, driver, equipment) as clean or with a violation (BASIC, code, severity, out of service, fine). The page shows inspections and the out-of-service rate for 12 months, weighted points by BASIC and by driver for 24 months, and each inspection can be challenged through DataQs, closed with an outcome, used to coach the driver or turned into a work order.',
      },
      {
        id: 'safety-claims', kind: 'Updated', section: 'Safety', title: 'Cargo and accident claims',
        details: '+ New Claim records cargo, accident and equipment claims with the load, driver, equipment, claimant, amounts, insurance and, for accidents, what the DOT accident register needs. Cargo claims show the 30-day acknowledgment and 120-day decision deadlines (49 CFR 370); payments by insurance, the company or a driver deduction, recoveries, denials and withdrawals are logged. The accident register lists recordable accidents for 3 years.',
      },
    ],
  },
  {
    id: '1.9',
    date: '2026-10-02',
    title: 'Load status, documents and history',
    changes: [
      {
        id: 'load-tracking', kind: 'Updated', section: 'Loads', title: 'Update a load from its page: status, documents, history',
        details: 'Update status on a load’s page moves it through Needs driver, Dispatched, At pickup, In transit, Delayed, Needs POD and Delivered, and records the day it was delivered (which invoicing and driver pay use). Documents on the load page can be attached, replaced, opened and downloaded; attaching the proof of delivery to a load that is waiting for it marks it Delivered. Activity shows who did what and when.',
      },
    ],
  },
  {
    id: '1.10',
    date: '2026-10-02',
    title: 'Message driver, live driver roster, and the buttons that did nothing',
    changes: [
      {
        id: 'driver-message', kind: 'New', section: 'Loads', title: 'Message driver from a load’s page',
        details: 'Message driver on a load’s page writes the load’s stops, times, reference and freight as a message and opens it as a text or an email to the driver on the load, from the phone or mail app of the device in use, or starts a call. The message can be edited or copied first, and opening one is noted in the load’s history. Before this the button did nothing.',
      },
      {
        id: 'fleet-log-service', kind: 'New', section: 'Fleet', title: 'Log service from the Trucks tab',
        details: 'Log service on Fleet › Trucks opens the work order form (the same one as Safety › Maintenance), so a repair or service can be logged from the truck list. Before this the button did nothing.',
      },
      {
        id: 'paid-export', kind: 'New', section: 'Accounting', title: 'Export paid invoices',
        details: 'Export on Accounting › Paid downloads every paid invoice as a spreadsheet: invoice, customer, loads, issue date, the day it was paid, how, days to pay and the amount. Before this the button did nothing.',
      },
      {
        id: 'driver-roster-live', kind: 'Updated', section: 'Fleet', title: 'Driver roster figures come from the company’s own records',
        details: 'On Fleet › Drivers, Current load is the load the driver is on now, Miles this week adds up the loads they delivered since Monday, and Pay YTD is what pay runs have paid them this year (a dash when the driver is not on payroll). Before this the three were typed-in figures that never changed. Hours left needs an electronic logging device connection, so it shows a dash until one is connected instead of a made-up number.',
      },
    ],
  },
  {
    id: '1.11',
    date: '2026-10-03',
    title: 'Load pipeline',
    changes: [
      {
        id: 'load-pipeline', kind: 'Updated', section: 'Loads', title: 'A pipeline bar at the top of the Loads page',
        details: 'The Loads page opens with a bar like Fleet’s tabs: Booked, Dispatched, En route, Delivered, Invoiced and Complete. Booked is a load with nobody assigned yet, En route covers at pickup, in transit and delayed, Delivered is waiting to be invoiced, Invoiced is on a sent invoice not yet paid, and Complete is paid. Clicking a stage lists its loads; the search still looks across every load. It replaces the Active, Needs POD, Delivered and All buttons.',
      },
    ],
  },
  {
    id: '1.12',
    date: '2026-10-03',
    title: 'Load pipeline: Booked until dispatched, moves forward and back',
    changes: [
      {
        id: 'load-pipeline-moves', kind: 'Updated', section: 'Loads', title: 'A load stays Booked until it is dispatched, and can be moved forward or back',
        details: 'A load with a driver or carrier lined up is now Booked (a new status), not Dispatched: it moves to Dispatched only when someone says the driver is on the way to the pickup. Each load (in its row on the Loads page and on its own page) has "Move to …" to send it to the next stage and "← Back to …" to undo a mistake; the move opens Update status with the new status chosen, to confirm (and to enter the delivery day). From Delivered the next step is Create invoice, and from Invoiced, Record payment; Invoiced and Complete follow the invoice, so they are changed in Accounting.',
      },
    ],
  },
  {
    id: '1.13',
    date: '2026-10-03',
    title: 'Move a load forward or back from the top bar',
    changes: [
      {
        id: 'load-detail-moves', kind: 'Updated', section: 'Loads', title: 'The load page’s top bar moves the load forward or back',
        details: 'On a load’s page, Update status is replaced by a button that moves the load to its next stage ("Move to Delivered →" when it is en route; Create invoice and Record payment once it is delivered and invoiced). On the left of the same bar, an orange "← Back to …" button moves it back a stage after a warning asking to confirm. A status between stages (At pickup, Delayed, Needs POD) is set from "Change status" beside the load’s status. On the Loads page, the Back button in a load’s row is orange and asks first too.',
      },
    ],
  },
  {
    id: '1.14',
    date: '2026-10-03',
    title: 'Urgent alerts in the sidebar',
    changes: [
      {
        id: 'sidebar-alerts', kind: 'New', section: 'Everywhere', title: 'A notification bar for urgent alerts at the top of the sidebar',
        details: 'The sidebar starts with a notification bar that shows only urgent alerts, with a red dot at its right end when something needs attention: a truck or trailer broken down or out of service while it has a load ("Truck T-123 reported a breakdown while en route with load L-123"), a load running late, a pickup today or already missed with no driver, and a driver on a load with an expired CDL or medical card. Clicking it opens the load (or, with several alerts, lists them all). With nothing urgent it says so, without the dot. Accounts that cannot open Loads do not get load alerts.',
      },
    ],
  },
  {
    id: '1.15',
    date: '2026-10-03',
    title: 'Driver card',
    changes: [
      {
        id: 'driver-card', kind: 'New', section: 'Fleet', title: 'A driver card that opens from the driver’s name',
        details: 'Clicking a driver’s name (on Fleet › Drivers, Fleet › Trucks and the Loads page) opens a card with the driver’s name, ID, status, date of birth, CDL number and state, class, expiry, endorsements and medical card, whether they run Solo, Team or Strong solo, their phone, email and address, and their emergency contact. A team driver’s card also shows the co-driver’s details. "Edit info" at the bottom right opens the driver’s editor. The driver form gains "Runs as" (Solo, Team, Strong solo) and, for a team, "Co-driver".',
      },
    ],
  },
  {
    id: '1.16',
    date: '2026-10-15',
    title: 'No summary cards on list pages',
    changes: [
      {
        id: 'no-summary-cards', kind: 'Updated', section: 'Everywhere', title: 'The row of summary cards is gone from the list pages',
        details: 'The cards with a big number at the top of the list pages (for example Undispatched, In transit, Delivered and Needs POD on the Loads page) are removed from Loads, Customers, Facilities, Fleet, Accounting, Safety, HR and Developer, so each page opens straight on its list. A load’s own page keeps its row of details (customer, rate and so on).',
      },
    ],
  },
  {
    id: '1.17',
    date: '2026-10-15',
    title: 'The dashboard fits the window',
    changes: [
      {
        id: 'dashboard-fit', kind: 'Updated', section: 'Dashboard', title: 'Up to 7 widgets, all on one screen',
        details: 'The dashboard shows at most 7 widgets and fits them to the window, so the page no longer scrolls: their heights shrink together when the window is short, and a long list scrolls inside its own widget. In Customize, once 7 are shown the other switches are off until one is hidden. A dashboard that was set up with more keeps its first 7. The standard layout is now the four numbers, the revenue chart beside Needs attention, and the Active loads table across the width. On a phone, where widgets sit one above the other, the page still scrolls.',
      },
    ],
  },
  {
    id: '1.18',
    date: '2026-10-25',
    title: 'A new New Load popup',
    changes: [
      {
        id: 'load-form-v2', kind: 'Updated', section: 'Loads', title: 'New Load on one page: pickup, delivery and freight side by side',
        details: 'New Load (and Edit load) opens on Load Information: customer, tender number and truck across the top, then the pickup, the delivery and the freight in three columns, and notes. Each stop has its facility, address, city and state, ZIP, the window it opens and closes (date and time, which can run into the next day), the actual times and two PO numbers. Freight has commodity, weight, declared value, pieces, packaging, the rate, a temperature range and hazmat with as many UN numbers as needed. The fuel surcharge (the percentage in Settings › Invoicing), the total miles (estimated from the registered facilities on the route) and the rate per mile are worked out from the rate and stops. Picking a truck adds the driver assigned to it in Fleet › Trucks. Stops lists every stop in order (facility, address, and the day and time it opens), and a click on one opens its fields; Add Stop puts another before the final delivery. LTL holds the shipment type and LTL details, and Documents the paperwork. Next at the bottom moves to the following page. Equipment, trailer, partner carrier and billing fields are no longer in the popup; a load that already has them keeps them.',
      },
    ],
  },
];

export const releaseIndex = (id: string) => RELEASES.findIndex((r) => r.id === id);
export const BASELINE = RELEASES.find((r) => r.baseline) ?? RELEASES[0];
export const LATEST = RELEASES[RELEASES.length - 1];

// The release a change belongs to.
export function releaseOf(changeId: string): Release | undefined {
  return RELEASES.find((r) => r.changes.some((c) => c.id === changeId));
}
