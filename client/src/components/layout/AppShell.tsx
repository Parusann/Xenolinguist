import { useState, useMemo, useCallback } from 'react'
import { Sidebar } from './Sidebar'
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
      <header className="relative z-10 h-10 glass border-b border-border flex items-center px-4 gap-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="XL" className="w-6 h-6 drop-shadow-[0_0_6px_rgba(0,230,118,0.3)]" />
          <div className="w-px h-3.5 bg-border" />
          <span className="text-[12px] text-gray-400 font-medium">{profile?.name}</span>
        </div>

        {/* Phase breadcrumb */}
        <div className="flex items-center gap-1.5 text-[12px]">
          <span className="text-gray-700">›</span>
          <span className="font-mono text-accent/70 text-[11px]">{currentPhase?.icon}</span>
          <span className="text-gray-300">{currentPhase?.label}</span>
        </div>

        <div className="flex-1" />

        {/* Right side status */}
        <div className="flex items-center gap-4 text-[11px] font-mono">
          <button
            onClick={() => setChatOpen(prev => !prev)}
            className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-bold transition-colors ${chatOpen ? 'bg-accent/20 text-accent' : 'bg-white/[0.04] text-gray-500 hover:text-accent hover:bg-accent/10'}`}
            title="Toggle AI chat (Shift+A)"
          >
            AI
          </button>
          <div className="flex items-center gap-1.5" title={connected ? `Primary: ${selectedModel}` : 'Ollama offline'}>
            <div className={`w-1.5 h-1.5 rounded-full transition-colors ${connected ? 'bg-accent animate-breathe' : 'bg-red-400'}`} />
            <span className="text-gray-500">{connected ? selectedModel?.split(':')[0] || 'Ollama' : 'Offline'}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-600">
            <span>{profile?.dictionary.length || 0} words</span>
            <span className="text-gray-800">·</span>
            <span>{profile?.samples.length || 0} samples</span>
            <span className="text-gray-800">·</span>
            <span>{(profile?.audio_clips || []).length} clips</span>
          </div>
        </div>
      </header>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden relative z-10">
        <Sidebar
          phases={phases}
          activePhase={activePhase}
          onPhaseChange={(id) => setActivePhase(id as PhaseId)}
        />

        {/* Content area — full width, no max-w cap */}
        <main className="flex-1 overflow-y-auto relative">
          <div className="p-5 animate-fade-in" key={activePhase}>
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
