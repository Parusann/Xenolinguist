import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { SessionLogProvider } from '@/stores/session-log-context'
import { OllamaProvider } from '@/stores/ollama-context'
import { ProfileProvider } from '@/stores/profile-context'
import { AppShell } from '@/components/layout/AppShell'
import { LandingScreen } from '@/components/landing/LandingScreen'
import { HeroPage } from '@/components/marketing/HeroPage'

/** The workbench app: profile selector → shell. Providers scoped here so the
 *  marketing route ("/") stays a lightweight static page. */
function Workbench() {
  const [hasProfile, setHasProfile] = useState(false)

  return (
    <SessionLogProvider>
      <OllamaProvider>
        <ProfileProvider onProfileChange={(p) => setHasProfile(!!p)}>
          {hasProfile ? <AppShell /> : <LandingScreen />}
        </ProfileProvider>
      </OllamaProvider>
    </SessionLogProvider>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HeroPage />} />
      <Route path="/app" element={<Workbench />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
