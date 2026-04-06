import { useState } from 'react'
import { useProfile } from '@/stores/profile-context'

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
}

function getPhaseProgress(phase: string, profile: any): number | null {
  if (!profile) return null
  switch (phase) {
    case 'samples': return profile.samples.length > 0 ? Math.min(profile.samples.length * 10, 100) : 0
    case 'numbers': return Object.keys(profile.number_system.mappings).length > 0
      ? Math.min(Object.keys(profile.number_system.mappings).length * 5, 100) : 0
    case 'vocabulary': return profile.dictionary.length > 0
      ? Math.min(profile.dictionary.length * 2, 100) : 0
    case 'grammar': return profile.grammar_rules.length > 0
      ? Math.min(profile.grammar_rules.length * 10, 100) : 0
    default: return null
  }
}

export function Sidebar({ phases, activePhase, onPhaseChange }: SidebarProps) {
  const { profile, closeProfile } = useProfile()
  const [expanded, setExpanded] = useState(false)

  return (
    <nav
      className={`glass border-r border-border flex flex-col flex-shrink-0 transition-all duration-300 ${
        expanded ? 'w-48' : 'w-[52px]'
      }`}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <div className="flex-1 py-2 px-1.5 space-y-0.5">
        {phases.map((phase) => {
          const isActive = activePhase === phase.id
          const progress = getPhaseProgress(phase.id, profile)

          return (
            <button
              key={phase.id}
              data-tour={phase.id}
              onClick={() => onPhaseChange(phase.id)}
              title={!expanded ? phase.label : undefined}
              className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-all duration-200 group relative ${
                isActive
                  ? 'bg-accent/8 text-white'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.02]'
              }`}
            >
              {/* Active indicator */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-accent rounded-r glow-accent-soft animate-scale-pop" />
              )}

              {/* Icon */}
              <div className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-mono flex-shrink-0 transition-all ${
                isActive
                  ? 'bg-accent/15 text-accent border border-accent/20'
                  : 'bg-white/[0.03] text-gray-500 border border-white/[0.04] group-hover:border-white/[0.08]'
              }`}>
                {phase.icon}
              </div>

              {/* Label — only when expanded */}
              {expanded && (
                <div className="flex-1 min-w-0 animate-fade-in">
                  <div className="text-[12px] font-medium truncate">{phase.label}</div>
                  {progress !== null && progress > 0 && (
                    <div className="mt-0.5 h-[2px] bg-white/[0.04] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent/40 rounded-full transition-all duration-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Bottom */}
      <div className="p-1.5 border-t border-border">
        <button
          onClick={closeProfile}
          title={!expanded ? 'Back' : undefined}
          className="w-full flex items-center justify-center gap-2 px-2 py-2 text-xs text-gray-600 hover:text-gray-400 rounded-md hover:bg-white/[0.02] transition-colors"
        >
          <span className="text-[10px]">←</span>
          {expanded && <span className="animate-fade-in text-[11px]">Back</span>}
        </button>
      </div>
    </nav>
  )
}
