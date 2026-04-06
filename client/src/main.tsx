import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ToastProvider } from './stores/toast-context'
import { UndoProvider } from './stores/undo-context'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <UndoProvider>
        <App />
      </UndoProvider>
    </ToastProvider>
  </StrictMode>,
)
