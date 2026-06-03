import { useState, useMemo, useCallback } from 'react'
import { Sidebar } from './Sidebar'
import { XenoMark } from '@/components/common/XenoMark'
import { AIChat } from './AIChat'
import { CommandPalette } from './CommandPalette'
import { SessionLog } from './SessionLog'
import { StatusBar } from './StatusBar'
import { ShortcutsHelp } from './ShortcutsHelp'
import { ToastContainer } from './ToastContainer'
import { OnboardingTour } from './OnboardingTour'
import { SampleInput } from '@/components/phase1-samples/SampleInput'
import { NumberDecoder } from '@/components/phase2-numbers/NumberDecoder'
import { VocabularyBuilder } from '@/components/phase3-vocabulary/VocabularyBuilder'
import { GrammarAnalyzer } from '@/components/phase4-grammar/GrammarAnalyzer'
import { TranslationEngine } from '@/components/phase5-translation/TranslationEngine'
import { Dashboard } from '@/components/phase6-dashboard/Dashboard'
import { SandboxSetup, type ConlangData } from '@/components/sandbox/SandboxSetup'
import { SandboxController } from '@/components/sandbox/SandboxController'
import { useProfile } from '@/stores/profile-context'
import { useOllama } from '@/stores/ollama-context'
import { useUndo } from '@/stores/undo-context'
import { useKeyboardShortcuts, type ShortcutDefinition } from '@/hooks/useKeyboardShortcuts'

export const PHASES = [
  { id: 'samples', label: 'Samples', icon: '{}', desc: 'Input & collect language samples' },
  { id: 'numbers', label: 'Numbers', icon: '#', desc: 'Decode the number system' },
  { id: 'vocabulary', label: 'Vocabulary', icon: 'Aa', desc: 'Map words to meanings' },
  { id: 'grammar', label: 'Grammar', icon: '⟨⟩', desc: 'Analyze structure & rules' },
  { id: 'translation', label: 'Translation', icon: '⇄', desc: 'Live translation engine' },
  { id: 'dashboard', label: 'Dashboard', icon: '◈', desc: 'Progress & export' },
] as const

const SANDBOX_PHASE = { id: 'sandbox', label: 'Sandbox', icon: '◈', desc: 'AI-generated language challenge' } as const

export type PhaseId = 'sandbox' | 'samples' | 'numbers' | 'vocabulary' | 'grammar' | 'translation' | 'dashboard'

export function AppShell() {
  const { profile } = useProfile()
  const { connected, selectedModel } = useOllama()
  const { undo } = useUndo()
  const isSandbox = profile?.is_sandbox
  const phases = isSandbox ? [SANDBOX_PHASE, ...PHASES] : PHASES
  const [activePhase, setActivePhase] = useState<PhaseId>(isSandbox ? 'sandbox' : 'samples')
  const [logOpen, setLogOpen] = useState(false)
  const [conlangData, setConlangData] = useState<ConlangData | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [showTour, setShowTour] = useState(() => !localStorage.getItem('xenolinguist-tour-completed'))

  const phaseIds = useMemo(() => PHASES.map((p) => p.id), [])

  const closeAll = useCallback(() => {
    setShortcutsOpen(false)
    setLogOpen(false)
    setChatOpen(false)
  }, [])

  const shortcuts = useMemo<ShortcutDefinition[]>(
    () => [
      // Navigation: 1-6 for phases
      ...phaseIds.map((id, i) => ({
        key: String(i + 1),
        handler: () => setActivePhase(id as PhaseId),
        description: `Go to ${PHASES[i].label}`,
        category: 'Navigation' as const,
      })),
      // Actions
      {
        key: 'l',
        handler: () => setLogOpen((prev) => !prev),
        description: 'Toggle session log',
        category: 'Actions' as const,
      },
      {
        key: 'k',
        ctrl: true,
        handler: () => setCommandPaletteOpen(prev => !prev),
        description: 'Search everything',
        category: 'Actions' as const,
      },
      {
        key: 'a',
        shift: true,
        handler: () => setChatOpen(prev => !prev),
        description: 'Toggle AI chat',
        category: 'Actions' as const,
      },
      {
        key: '?',
        shift: true,
        handler: () => setShortcutsOpen((prev) => !prev),
        description: 'Show keyboard shortcuts',
        category: 'Actions' as const,
      },
      {
        key: 'z',
        ctrl: true,
        handler: () => { undo() },
        description: 'Undo last action',
        category: 'Actions' as const,
      },
      // Other
      {
        key: 'Escape',
        handler: closeAll,
        description: 'Close open panel',
        category: 'Other' as const,
      },
    ],
    [phaseIds, closeAll, undo],
  )

  const registered = useKeyboardShortcuts(shortcuts)

  const currentPhase = phases.find(p => p.id === activePhase)

  const renderPhase = () => {
    switch (activePhase) {
      case 'sandbox':
        return conlangData
          ? <SandboxController conlang={conlangData} />
          : <SandboxSetup onGenerated={setConlangData} />
      case 'samples': return <SampleInput />
      case 'numbers': return <NumberDecoder />
      case 'vocabulary': return <VocabularyBuilder />
      case 'grammar': return <GrammarAnalyzer />
      case 'translation': return <TranslationEngine />
      case 'dashboard': return <Dashboard />
    }
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden relative">
      {/* Grid background */}
      <div className="fixed inset-0 z-0" style={{
        backgroundImage: `
          linear-gradient(rgba(255,255,255,0.012) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px',
        maskImage: 'radial-gradient(ellipse at 50% 50%, black 30%, transparent 75%)',
      }} />

      {/* Top header bar */}
      <header className="app-header">
        <div className="crumb">
          <XenoMark size={18} />
          <span className="cur">{profile?.name}</span>
          <span className="sep">/</span>
          <span style={{ color: 'var(--fg-mute)' }}>{currentPhase?.icon}</span>
          <span className="cur">{currentPhase?.label}</span>
        </div>

        <div className="flex-1" />

        {/* AI Chat toggle */}
        <button className="btn ghost sm" onClick={() => setChatOpen((prev) => !prev)} title="Toggle AI chat (Shift+A)">
          <span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--ai)', boxShadow: '0 0 6px var(--ai)' }} />
          <span style={{ color: chatOpen ? 'var(--ai)' : 'var(--fg-1)' }}>AI</span>
          <span style={{ color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>SHIFT+A</span>
        </button>

        {/* Status pills */}
        <div className="flex items-center gap-3" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-mute)' }}>
          <div className="flex items-center gap-1.5" title={connected ? `Primary: ${selectedModel}` : 'Ollama offline'}>
            <span
              className="dot"
              style={{ width: 5, height: 5, ...(connected ? {} : { background: 'var(--conf-unknown)', boxShadow: '0 0 8px var(--conf-unknown)' }) }}
            />
            <span style={{ color: 'var(--fg-1)' }}>{connected ? selectedModel?.split(':')[0] || 'Ollama' : 'Offline'}</span>
          </div>
          <span style={{ color: 'var(--fg-faint)' }}>·</span>
          <span><b style={{ color: 'var(--fg)' }}>{profile?.dictionary.length || 0}</b> words</span>
          <span style={{ color: 'var(--fg-faint)' }}>·</span>
          <span><b style={{ color: 'var(--fg)' }}>{profile?.samples.length || 0}</b> samples</span>
          <span style={{ color: 'var(--fg-faint)' }}>·</span>
          <span><b style={{ color: 'var(--fg)' }}>{(profile?.audio_clips || []).length}</b> clips</span>
        </div>
      </header>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden relative z-10">
        <Sidebar
          phases={phases}
          activePhase={activePhase}
          onPhaseChange={(id) => setActivePhase(id as PhaseId)}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        />

        {/* Content area — full width, no max-w cap */}
        <main className="flex-1 overflow-y-auto relative">
          <div className="p-5 phase-enter" key={activePhase}>
            {renderPhase()}
          </div>
        </main>
      </div>

      {/* Session log — bottom slide-up panel */}
      {logOpen && (
        <div className="relative z-20 h-48 glass border-t border-border flex-shrink-0 animate-slide-up">
          <SessionLog onClose={() => setLogOpen(false)} />
        </div>
      )}

      <StatusBar logOpen={logOpen} onToggleLog={() => setLogOpen(!logOpen)} onShowShortcuts={() => setShortcutsOpen(true)} />

      {shortcutsOpen && (
        <ShortcutsHelp shortcuts={registered} onClose={() => setShortcutsOpen(false)} />
      )}

      {chatOpen && <AIChat onClose={() => setChatOpen(false)} />}

      <ToastContainer />

      {commandPaletteOpen && <CommandPalette onClose={() => setCommandPaletteOpen(false)} />}

      {showTour && <OnboardingTour onComplete={() => setShowTour(false)} />}
    </div>
  )
}
