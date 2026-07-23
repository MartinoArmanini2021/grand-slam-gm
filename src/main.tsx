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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
