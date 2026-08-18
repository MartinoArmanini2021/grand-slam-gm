import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/plus-jakarta-sans'
import '@fontsource/dm-mono'
import '@fontsource/urbanist/700.css'
import '@fontsource/urbanist/800.css'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthProvider'
import ErrorBoundary from './components/ErrorBoundary'
import { initAnalytics } from './data/analytics'
import { applyHarness } from './dev/uxHarness'
import { useGameStore } from './store/gameStore'

void initAnalytics() // no-op unless VITE_POSTHOG_KEY is set

// DEV-ONLY: seed the stores for ?ux=<scenario> before the first render (no-op in production).
applyHarness(s => useGameStore.setState(s as never))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
