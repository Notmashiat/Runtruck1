import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './styles/industry.css'
import './styles/app.css'
import './styles/shell.css'
import './styles/newload.css'
import './styles/calendar.css'
import './styles/dashboard.css'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ErrorToast } from './components/StatusBanners'
import { installErrorHandlers, reportError, setErrorRelease } from './lib/errorLog'
import { currentRelease } from './lib/releases'
import { initTheme } from './lib/theme'
import { initSettings } from './lib/applySettings'
import { storedSession } from './lib/account'
import { ownStylesheets, reloadForNewVersion, stylesMissing } from './lib/lazyPage'
import App from './App.tsx'

// Record problems from here on (see lib/errorLog.ts).
installErrorHandlers()

// Opened mid-update, the stylesheet can fail to arrive while the scripts do:
// reload (a few times at most) to fetch it, instead of drawing an unstyled page.
if (stylesMissing()) reloadForNewVersion(ownStylesheets())

// Start-up steps must not be able to stop the app from drawing: a failure
// here is recorded and the app carries on with its defaults.
for (const [name, step] of [
  ['theme', initTheme],
  // Only for someone signed in: the login and marketing pages keep the
  // browser's last theme and read nobody's settings.
  ['settings', () => { if (storedSession()) initSettings() }],
  ['release', () => setErrorRelease(currentRelease().id)],
] as const) {
  try {
    step()
  } catch (error) {
    reportError(error, { kind: 'script', where: `Start-up (${name})` })
  }
}

// The outermost error boundary: if nothing else catches a fault, the person
// sees a message with a Reload button rather than an empty window.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary where="RunTruck" variant="app">
      <BrowserRouter>
        <App />
      </BrowserRouter>
      <ErrorToast />
    </ErrorBoundary>
  </StrictMode>,
)
