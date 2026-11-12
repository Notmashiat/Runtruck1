import { useState } from 'react';
import { faAddressBook, faBoxesStacked, faBuilding, faFileInvoiceDollar, faFolderOpen, type IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { useAppShell } from '../context/AppShellContext';
import type { BillDocument } from '../data/bills';
import {
  CREDIT_STATUSES, CUSTOMER_EQUIPMENT, CUSTOMER_NEEDS, CUSTOMER_PAY, CUSTOMER_TERMS, CUSTOMER_TYPES, INACTIVE_REASONS, INDUSTRIES, INVOICE_DELIVERY, STANDINGS,
  blankCustomerForm, customerFromForm, customerToForm, nextCustomerId, type CustomerRecord,
} from '../data/customers';
import type { FormValues } from '../data/fleet';
import { USER } from '../data/mock';
import { todayIso } from '../lib/clock';
import { PHONE, STATE, ZIP } from '../lib/rules';
import { getSettings } from '../lib/settingsStore';
import { CustomerDocs } from './CustomerDocs';
import { Field, useModal, useTracked } from './FormBits';
import { NlRecordDialog, SumRow } from './NlRecordDialog';
import type { SectionSpec } from './RecordDialog';

const val = (v: FormValues, k: string) => (typeof v[k] === 'string' ? (v[k] as string).trim() : '');
const digits = (s: string) => s.replace(/\D/g, '');

function customerSections(takenNames: string[], reps: string[]): SectionSpec[] {
  const isBroker = (v: FormValues) => ['Broker', '3PL', 'Freight forwarder'].includes(val(v, 'type'));
  return [
    {
      title: 'Company',
      help: 'Who the customer is.',
      fields: [
        {
          key: 'name', label: 'Customer name', required: true, placeholder: 'As it appears on loads and invoices',
          check: (value) => (takenNames.includes(value.trim().toLowerCase()) ? 'Another customer already has this name' : null),
        },
        { key: 'legalName', label: 'Legal name', placeholder: 'e.g. Northgate Foods, Inc.' },
        { key: 'type', label: 'Customer type', type: 'select', required: true, options: CUSTOMER_TYPES },
        { key: 'industry', label: 'Industry', type: 'select', options: INDUSTRIES },
        { key: 'standing', label: 'Standing', type: 'select', required: true, options: STANDINGS },
        { key: 'since', label: 'Customer since', type: 'date' },
        { key: 'salesRep', label: 'Account owner', type: 'select', options: reps },
        { key: 'website', label: 'Website', type: 'url', placeholder: 'https://' },
        { key: 'mc', label: 'MC number', help: 'Brokers and 3PLs: their operating authority.', show: isBroker, check: (value) => (/^\d{5,7}$/.test(digits(value)) ? null : '5–7 digits') },
        { key: 'dot', label: 'USDOT number', show: isBroker, check: (value) => (/^\d{5,8}$/.test(digits(value)) ? null : '5–8 digits') },
        { key: 'ein', label: 'Tax ID (EIN)', placeholder: '12-3456789', check: (value) => (digits(value).length === 9 ? null : '9 digits') },
      ],
    },
    {
      title: 'Contacts',
      help: 'Who you deal with day to day, and who to call about pickups.',
      fields: [
        { key: 'contact', label: 'Main contact', required: true },
        { key: 'contactTitle', label: 'Title', placeholder: 'e.g. Logistics manager' },
        { key: 'email', label: 'Email', type: 'email', required: true },
        { key: 'phone', label: 'Phone', type: 'tel', required: true, check: PHONE },
        { key: 'shippingContact', label: 'Shipping / dispatch contact', placeholder: 'Desk or person who releases freight' },
        { key: 'shippingPhone', label: 'Shipping phone', type: 'tel', check: PHONE },
        { key: 'afterHoursPhone', label: 'After-hours phone', type: 'tel', check: PHONE },
      ],
    },
    {
      title: 'Billing',
      help: 'Where invoices go and how this customer pays. Invoices use these details.',
      fields: [
        { key: 'billTo', label: 'Bill to', placeholder: 'Defaults to the customer name' },
        { key: 'attn', label: 'Attention', placeholder: 'e.g. Accounts Payable' },
        { key: 'billingEmail', label: 'Billing email', type: 'email', required: true },
        { key: 'billingPhone', label: 'Billing phone', type: 'tel', check: PHONE },
        { key: 'street', label: 'Billing address', wide: true, required: true },
        { key: 'city', label: 'City', required: true },
        { key: 'state', label: 'State', required: true, maxLength: 2, upper: true, check: STATE },
        { key: 'zip', label: 'ZIP', required: true, check: ZIP },
        { key: 'terms', label: 'Payment terms', type: 'select', required: true, options: CUSTOMER_TERMS },
        { key: 'creditLimit', label: 'Credit limit ($)', type: 'number', help: 'Warns when open invoices go over it.', check: (value) => (Number(value.replace(/[$,]/g, '')) >= 0 ? null : 'Cannot be negative') },
        { key: 'credit', label: 'Credit status', type: 'select', required: true, options: [...CREDIT_STATUSES], help: 'On credit hold, loads can be created but not dispatched.' },
        { key: 'payMethod', label: 'They pay by', type: 'select', required: true, options: CUSTOMER_PAY },
        { key: 'invoiceDelivery', label: 'Send invoices by', type: 'select', required: true, options: INVOICE_DELIVERY },
        { key: 'podRequired', label: 'POD required with invoice', type: 'select', required: true, options: ['Yes', 'No'] },
        { key: 'invoiceInstructions', label: 'Billing instructions', type: 'textarea', placeholder: 'e.g. PO number on every invoice; lumper receipts attached' },
      ],
    },
    {
      title: 'Freight',
      help: 'What they ship and what their loads need.',
      fields: [
        { key: 'equipment', label: 'Equipment', type: 'checks', options: CUSTOMER_EQUIPMENT },
        { key: 'commodities', label: 'Commodities', wide: true, placeholder: 'e.g. Frozen produce, dairy' },
        { key: 'lanes', label: 'Regular lanes', type: 'textarea', placeholder: 'e.g. Fresno → Reno, Bakersfield → Phoenix' },
        { key: 'needs', label: 'Requirements', type: 'checks', options: CUSTOMER_NEEDS },
        { key: 'instructions', label: 'Pickup and delivery instructions', type: 'textarea', placeholder: 'Temperatures, tarping, check-in rules…' },
      ],
    },
    {
      title: 'Documents',
      help: 'Attach each required document (or mark a paper copy on file), and any other files.',
      fields: [
        { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Anything the team should know' },
      ],
    },
  ];
}

const SECTION_ICONS: Record<string, IconDefinition> = {
  Company: faBuilding, Contacts: faAddressBook, Billing: faFileInvoiceDollar, Freight: faBoxesStacked, Documents: faFolderOpen,
};

// Add Customer and Edit customer. Editing also moves the customer to
// inactive (or reactivates it).
export function CustomerDialog({ customer, onClose }: { customer?: CustomerRecord; onClose: () => void }) {
  const { customers, saveCustomer, deleteCustomer } = useAppShell();
  const [id] = useState(() => customer?.id ?? nextCustomerId(customers));
  const [docs, setDocs, docsChanged] = useTracked<BillDocument[]>(customer?.documents ?? []);
  const [onFile, setOnFile, onFileChanged] = useTracked<string[]>(customer?.onFile ?? []);
  const [inactivating, setInactivating] = useState(false);
  const [initial] = useState<FormValues>(() => (customer ? customerToForm(customer) : blankCustomerForm(todayIso(), USER.name)));
  const taken = customers.filter((c) => c.id !== id).map((c) => c.name.toLowerCase());
  const reps = [...new Set([USER.name, ...getSettings().team.filter((m) => m.active).map((m) => m.name)])].filter(Boolean);

  const reactivate = () => {
    if (!customer || !window.confirm(`Reactivate ${customer.name}? It goes back to the customer list and pickers.`)) return;
    const now = new Date().toISOString();
    saveCustomer({ ...customer, status: 'Active', updated: now, log: [...customer.log, { at: now, by: USER.name, action: 'Reactivated', reason: 'Reactivated by a user' }] });
    onClose();
  };

  return (
    <>
    <NlRecordDialog
      icon={faBuilding}
      description={customer ? 'Change the customer’s details below.' : 'Add a shipper, broker or other customer you haul for.'}
      tip={{ title: 'Billing comes first', text: 'Invoices use the billing email, address and terms — fill those in before the first load.' }}
      summary={(v) => (
        <>
          <SumRow label="Customer" value={val(v, 'name')} sub={val(v, 'type')} />
          <SumRow label="Main contact" value={val(v, 'contact')} sub={val(v, 'email')} />
          <SumRow label="Bill to" value={val(v, 'billTo') || val(v, 'name')} sub={[val(v, 'city'), [val(v, 'state'), val(v, 'zip')].filter(Boolean).join(' ')].filter(Boolean).join(', ')} />
          <SumRow label="Terms" value={val(v, 'terms')} sub={val(v, 'credit') && `Credit: ${val(v, 'credit')}`} />
        </>
      )}
      heading={customer ? `Edit ${customer.name}` : 'New customer'}
      saveLabel={customer ? 'Save changes' : 'Add customer'}
      sections={customerSections(taken, reps).map((x) => ({ ...x, icon: SECTION_ICONS[x.title] }))}
      initial={initial}
      isNew={!customer}
      recordLabel={customer ? customer.name : 'customer'}
      noun="customer"
      deleteNote="The customer and its documents are removed for good; loads and invoices keep the name. To keep the record, move it to inactive instead."
      extras={{ Documents: <CustomerDocs docs={docs} onFile={onFile} owner={customer?.name ?? 'New customer'} onChange={(d, f) => { setDocs(d); setOnFile(f); }} /> }}
      extraDirty={docsChanged || onFileChanged}
      footerExtra={
        customer && (customer.status === 'Active'
          ? <button type="button" className="nl-btn-danger-line nl-fbtn" onClick={() => setInactivating(true)}>Move to inactive</button>
          : <button type="button" className="nl-btn-white nl-fbtn" onClick={reactivate}>Reactivate</button>)
      }
      onSave={(v) => saveCustomer({ ...customerFromForm(v, id, docs, USER.name, customer), onFile })}
      onDelete={customer ? () => deleteCustomer(customer.id) : undefined}
      onClose={onClose}
    />
    {inactivating && customer && <InactivateDialog customer={customer} onClose={() => setInactivating(false)} onDone={onClose} />}
    </>
  );
}

// Move a customer to inactive, saying why.
export function InactivateDialog({ customer, onClose, onDone }: { customer: CustomerRecord; onClose: () => void; onDone?: () => void }) {
  const { saveCustomer } = useAppShell();
  const { ref, closeNow, ownEvent } = useModal(onClose);
  const [reason, setReason] = useState(INACTIVE_REASONS[0]);
  const [note, setNote] = useState('');

  const save = () => {
    const now = new Date().toISOString();
    saveCustomer({
      ...customer, status: 'Inactive', updated: now,
      log: [...customer.log, { at: now, by: USER.name, action: 'Moved to inactive', reason: [reason, note.trim()].filter(Boolean).join(' · ') }],
    });
    closeNow();
    onDone?.();
  };

  return (
    <dialog ref={ref} className="ui-dialog is-compact" aria-label={`Move ${customer.name} to inactive`} onClose={(e) => { if (ownEvent(e)) onClose(); }} onCancel={(e) => ownEvent(e)}>
      <div className="ui-dialog-main">
        <section className="ui-dialog-body">
          <button type="button" className="ui-dialog-close" onClick={closeNow} aria-label="Close">×</button>
          <div>
            <div className="ui-label">Move to inactive</div>
            <h2 className="ui-h2" style={{ margin: '2px 0 0' }}>{customer.name}</h2>
            <p className="ui-p" style={{ marginTop: 4 }}>It leaves the customer lists and pickers but stays on file under Inactive customers, with this reason in its log. You can reactivate it any time. Unsaved changes in the edit form are not kept.</p>
          </div>
          <Field label="Why" required>
            <select className="ui-input" value={reason} onChange={(e) => setReason(e.target.value)}>{INACTIVE_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
          </Field>
          <Field label="Note" help="Optional: anything worth remembering.">
            <textarea className="ui-input" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </section>
        <footer className="ui-dialog-foot">
          <div style={{ flex: 1 }} />
          <button type="button" className="ui-btn" onClick={closeNow}>Cancel</button>
          <button type="button" className="ui-btn ui-btn-danger-solid" onClick={save}>Move to inactive</button>
        </footer>
      </div>
    </dialog>
  );
}
