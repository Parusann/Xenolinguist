import { useState } from 'react'
import { useProfile } from '@/stores/profile-context'
import { XenoMark } from '@/components/common/XenoMark'

interface Phase {
  id: string
  label: string
  icon: string
  desc: string
}

interface SidebarProps {
  phases: readonly Phase[]
  activePhase: string
  onPhaseChange: (id: string) => void
  onOpenCommandPalette?: () => void
}

/** Phase → number key (matches the 1–6 keyboard shortcuts; sandbox has none). */
const PHASE_NUM: Record<string, number> = {
  samples: 1,
  numbers: 2,
  vocabulary: 3,
  grammar: 4,
  translation: 5,
  dashboard: 6,
}

export function Sidebar({ phases, activePhase, onPhaseChange, onOpenCommandPalette }: SidebarProps) {
  const { closeProfile } = useProfile()
  const [expanded, setExpanded] = useState(false)

  return (
    <aside
      className={`sidebar${expanded ? ' expanded' : ''}`}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      {/* Mark — click to return to the profile selector */}
      <div
        className="sidebar-mark"
        role="button"
        tabIndex={0}
        onClick={closeProfile}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            closeProfile()
          }
        }}
        title="Back to profiles"
        style={{ cursor: 'pointer' }}
      >
        <XenoMark size={28} />
        <span className="word">xenolinguist</span>
      </div>

      {/* Phase navigation */}
      <div style={{ padding: '8px 0', flex: 1 }}>
        {phases.map((phase) => {
          const isActive = activePhase === phase.id
          const num = PHASE_NUM[phase.id]
          return (
            <button
              key={phase.id}
              data-tour={phase.id}
              className={`sidebar-item${isActive ? ' active' : ''}`}
              onClick={() => onPhaseChange(phase.id)}
              title={!expanded ? phase.label : undefined}
            >
              <span className="glyph">{phase.icon}</span>
              <span className="name">{phase.label}</span>
              {num != null && <span className="num">{num}</span>}
            </button>
          )
        })}
      </div>

      {/* Footer — command palette */}
      <div style={{ padding: '8px 8px', borderTop: '1px solid var(--border)' }}>
        <button
          className="sidebar-item"
          style={{ color: 'var(--fg-mute)' }}
          onClick={onOpenCommandPalette}
          title={!expanded ? 'Command palette (⌘K)' : undefined}
        >
          <span className="glyph">⌘K</span>
          <span className="name">Command</span>
        </button>
      </div>
    </aside>
  )
}
