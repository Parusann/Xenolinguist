import { useState } from 'react'
import { SessionLogProvider } from '@/stores/session-log-context'
import { OllamaProvider } from '@/stores/ollama-context'
import { ProfileProvider } from '@/stores/profile-context'
import { AppShell } from '@/components/layout/AppShell'
import { LandingScreen } from '@/components/landing/LandingScreen'

export default function App() {
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
