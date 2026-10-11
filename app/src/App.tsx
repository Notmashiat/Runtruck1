import { Suspense, type ComponentType, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { TabbedSection } from './components/TabbedSection';
import { PAYROLL_IN_HR, PAYROLL_PATH, SECTION_TABS, type ViewKey } from './data/mock';
import { LandingPage } from './pages/marketing/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { LOGIN_REQUIRED } from './lib/account';
import { can } from './lib/auth';
import { lazyNamed as page } from './lib/lazyPage';
import { getSettings } from './lib/settingsStore';

// Each screen is its own download, fetched the first time it is opened, so
// an account never loads the code of a section it may not open, and the
// public site does not load the app. lazyNamed (lib/lazyPage.ts) reloads once
// if a screen will not download because RunTruck was updated meanwhile.
const AppLayout = page(() => import('./components/AppLayout'), 'AppLayout');

const DashboardPage = page(() => import('./pages/app/DashboardPage'), 'DashboardPage');
const LoadsPage = page(() => import('./pages/app/LoadsPage'), 'LoadsPage');
const LoadDetailPage = page(() => import('./pages/app/LoadDetailPage'), 'LoadDetailPage');
const PlannerPage = page(() => import('./pages/app/PlannerPage'), 'PlannerPage');
const CustomersPage = page(() => import('./pages/app/CustomersPage'), 'CustomersPage');
const FacilitiesPage = page(() => import('./pages/app/FacilitiesPage'), 'FacilitiesPage');
const SettingsPage = page(() => import('./pages/app/SettingsPage'), 'SettingsPage');
const DriversTab = page(() => import('./pages/app/fleet/DriversTab'), 'DriversTab');
const TrucksTab = page(() => import('./pages/app/fleet/TrucksTab'), 'TrucksTab');
const TrailersTab = page(() => import('./pages/app/fleet/TrailersTab'), 'TrailersTab');
const UninvoicedTab = page(() => import('./pages/app/accounting/UninvoicedTab'), 'UninvoicedTab');
const InvoicedTab = page(() => import('./pages/app/accounting/InvoicedTab'), 'InvoicedTab');
const BatchesTab = page(() => import('./pages/app/accounting/BatchesTab'), 'BatchesTab');
const PastDueTab = page(() => import('./pages/app/accounting/PastDueTab'), 'PastDueTab');
const PaidTab = page(() => import('./pages/app/accounting/PaidTab'), 'PaidTab');
const PayrollTab = page(() => import('./pages/app/accounting/PayrollTab'), 'PayrollTab');
const BillsTab = page(() => import('./pages/app/accounting/BillsTab'), 'BillsTab');
const EmployeeContractsTab = page(() => import('./pages/app/hr/EmployeeContractsTab'), 'EmployeeContractsTab');
const OnboardingTab = page(() => import('./pages/app/hr/OnboardingTab'), 'OnboardingTab');
const MaintenanceTab = page(() => import('./pages/app/safety/MaintenanceTab'), 'MaintenanceTab');
const DriverDocumentsTab = page(() => import('./pages/app/safety/DriverDocumentsTab'), 'DriverDocumentsTab');
const ViolationsTab = page(() => import('./pages/app/safety/ViolationsTab'), 'ViolationsTab');
const ClaimSettlementsTab = page(() => import('./pages/app/safety/ClaimSettlementsTab'), 'ClaimSettlementsTab');
const AccountManagerTab = page(() => import('./pages/app/developer/AccountManagerTab'), 'AccountManagerTab');
const ClientsTab = page(() => import('./pages/app/developer/ClientsTab'), 'ClientsTab');
const AccountsTab = page(() => import('./pages/app/developer/AccountsTab'), 'AccountsTab');
const ReleasesTab = page(() => import('./pages/app/developer/ReleasesTab'), 'ReleasesTab');
const DeactivatedTab = page(() => import('./pages/app/developer/DeactivatedTab'), 'DeactivatedTab');
const ErrorLogTab = page(() => import('./pages/app/developer/ErrorLogTab'), 'ErrorLogTab');

// A section or tab the signed-in account may not open sends it to the
// Dashboard (which every account has). The check runs on every visit, so
// typing the address does not get round it.
function Allow({ perm, children }: { perm: string; children: ReactNode }) {
  return can(perm) ? children : <Navigate to="/app/dashboard" replace />;
}

// A tabbed section opens on the first tab the account may use.
function FirstTab({ section }: { section: ViewKey }) {
  const first = SECTION_TABS[section]?.find((t) => can(`${section}/${t.key}`));
  return <Navigate to={first ? first.key : '/app/dashboard'} replace />;
}

// /app opens the start page chosen in Settings › Appearance (read when it is
// visited), or the Dashboard if that page is not allowed.
function StartPage() {
  const start = getSettings().appearance.startPage;
  return <Navigate to={can(start) ? start : 'dashboard'} replace />;
}

// Old payroll links (and Accounting › Payroll once it is in HR), keeping ?view=archived.
function ToPayroll() {
  const { search } = useLocation();
  return <Navigate to={`${PAYROLL_PATH}${search}`} replace />;
}

// A tabbed section: its own permission, then one per tab.
function section(key: ViewKey, tabs: [string, ComponentType][]) {
  return (
    <Route path={key} element={<Allow perm={key}><TabbedSection /></Allow>}>
      <Route index element={<FirstTab section={key} />} />
      {tabs.map(([tab, Tab]) => (
        <Route key={tab} path={tab} element={<Allow perm={`${key}/${tab}`}><Tab /></Allow>} />
      ))}
    </Route>
  );
}

export default function App() {
  return (
    <Suspense fallback={<div className="ui-empty">Loading…</div>}>
    <Routes>
      <Route path="/" element={<LandingPage />} />
      {/* With logging in switched off (lib/account.ts), /login opens the app. */}
      <Route path="/login" element={LOGIN_REQUIRED ? <LoginPage /> : <Navigate to="/app" replace />} />
      <Route path="/app" element={<AppLayout />}>
        <Route index element={<StartPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="loads" element={<Allow perm="loads"><LoadsPage /></Allow>} />
        <Route path="loads/:id" element={<Allow perm="loads"><LoadDetailPage /></Allow>} />
        <Route path="planner" element={<Allow perm="planner"><PlannerPage /></Allow>} />
        {section('fleet', [['drivers', DriversTab], ['trucks', TrucksTab], ['trailers', TrailersTab]])}
        <Route path="crm" element={<Allow perm="crm"><CustomersPage /></Allow>} />
        <Route path="facilities" element={<Allow perm="facilities"><FacilitiesPage /></Allow>} />
        <Route path="settings" element={<Navigate to="profile" replace />} />
        <Route path="settings/:section" element={<SettingsPage />} />
        {section('accounting', [
          ['uninvoiced', UninvoicedTab], ['invoiced', InvoicedTab], ['batches', BatchesTab], ['past-due', PastDueTab],
          ['paid', PaidTab], ...(PAYROLL_IN_HR ? [] : [['payroll', PayrollTab] as [string, ComponentType]]), ['bills', BillsTab],
        ])}
        {PAYROLL_IN_HR && <Route path="accounting/payroll" element={<ToPayroll />} />}
        {section('hr', [
          ...(PAYROLL_IN_HR ? [['payroll', PayrollTab] as [string, ComponentType]] : []),
          ['employee-contracts', EmployeeContractsTab], ['onboarding', OnboardingTab],
        ])}
        {section('safety', [
          ['maintenance', MaintenanceTab], ['driver-documents', DriverDocumentsTab], ['violations', ViolationsTab], ['settlements', ClaimSettlementsTab],
        ])}
        {/* Developer is RunTruck's own console: super admins under Company ID 1 only. */}
        {section('developer', [['account-manager', AccountManagerTab], ['clients', ClientsTab], ['accounts', AccountsTab], ['deactivated', DeactivatedTab], ['releases', ReleasesTab], ['errors', ErrorLogTab]])}
      </Route>
      {/* Section URLs from before the sidebar was reorganised, so old links still land. They
          sit outside the /app layout on purpose: the tab bar and top bar key off the section
          in the URL, and these are not sections any more. */}
      <Route path="/app/drivers" element={<Navigate to="/app/fleet/drivers" replace />} />
      <Route path="/app/trucks" element={<Navigate to="/app/fleet/trucks" replace />} />
      <Route path="/app/customers" element={<Navigate to="/app/crm" replace />} />
      <Route path="/app/invoices" element={<Navigate to="/app/accounting/invoiced" replace />} />
      <Route path="/app/settlements" element={<ToPayroll />} />
      <Route path="/app/accounting/settlements" element={<ToPayroll />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
