import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './pages/App'
import { AppRuntimeErrorBoundary } from './pages/App/AppRuntimeErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRuntimeErrorBoundary><BrowserRouter><App /></BrowserRouter></AppRuntimeErrorBoundary>
  </StrictMode>,
)
