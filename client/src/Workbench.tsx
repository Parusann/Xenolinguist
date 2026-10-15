import { useState } from 'react'
import { SessionLogProvider } from '@/stores/session-log-context'
import { OllamaProvider } from '@/stores/ollama-context'
import { ProfileProvider } from '@/stores/profile-context'
import { AppShell } from '@/components/layout/AppShell'
import { LandingScreen } from '@/components/landing/LandingScreen'
import { LocalSessionGate } from '@/components/layout/LocalSessionGate'
import { RuntimeStatus } from '@/components/layout/RuntimeStatus'
import { WorkspaceBoundary } from '@/components/layout/WorkspaceBoundary'
import { DesktopRecovery } from '@/components/layout/DesktopRecovery'
export default function Workbench(){
  const [activeProfileId,setActiveProfileId]=useState<string|null>(null)
  return <LocalSessionGate><SessionLogProvider><OllamaProvider><ProfileProvider onProfileChange={p=>setActiveProfileId(p?.id??null)}>
    <WorkspaceBoundary key={activeProfileId}>{activeProfileId?<AppShell key={activeProfileId}/>:<LandingScreen/>}</WorkspaceBoundary>
    <RuntimeStatus/>
    <DesktopRecovery/>
  </ProfileProvider></OllamaProvider></SessionLogProvider></LocalSessionGate>
}
