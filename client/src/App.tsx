import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { SessionLogProvider } from '@/stores/session-log-context'
import { OllamaProvider } from '@/stores/ollama-context'
import { ProfileProvider } from '@/stores/profile-context'
import { AppShell } from '@/components/layout/AppShell'
import { LandingScreen } from '@/components/landing/LandingScreen'
import { LocalSessionGate } from '@/components/layout/LocalSessionGate'
import { RuntimeStatus } from '@/components/layout/RuntimeStatus'
import { HeroPage } from '@/components/marketing/HeroPage'

/** The workbench app: profile selector → shell. Providers scoped here so the
 *  marketing route ("/") stays a lightweight static page. */
function Workbench() {
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null)

  return (
    <SessionLogProvider>
      <OllamaProvider>
        <ProfileProvider onProfileChange={(p) => setActiveProfileId(p?.id ?? null)}>
          {activeProfileId ? <AppShell key={activeProfileId} /> : <LandingScreen />}
          <RuntimeStatus />
        </ProfileProvider>
      </OllamaProvider>
    </SessionLogProvider>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HeroPage />} />
      <Route path="/app" element={<LocalSessionGate><Workbench /></LocalSessionGate>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
