import { useProfile } from '@/stores/profile-context'
import { useOllama } from '@/stores/ollama-context'
import { getConfidenceCounts, getDecodingProgress } from '@/lib/profileStats'

interface StatusBarProps {
  logOpen: boolean
  onToggleLog: () => void
  onShowShortcuts?: () => void
}

export function StatusBar({ logOpen, onToggleLog, onShowShortcuts }: StatusBarProps) {
  const { profile, saving } = useProfile()
  const { connected } = useOllama()

  const counts = profile
    ? getConfidenceCounts(profile)
    : { confirmed: 0, probable: 0, unknown: 0, total: 0 }
  const decode = profile ? getDecodingProgress(profile) : 0

  return (
    <div className="status-bar">
      <span className="item">
        <span
          className="dot"
          style={{ width: 5, height: 5, ...(connected ? {} : { background: 'var(--conf-unknown)', boxShadow: '0 0 8px var(--conf-unknown)' }) }}
        />
        <span style={{ color: 'var(--fg-dim)' }}>{connected ? 'Ollama connected' : 'Ollama offline'}</span>
      </span>
      <span className="sep">·</span>
      <span className="item">
        DECODE <b style={{ color: 'var(--accent)' }}>{decode}%</b>
      </span>
      <span className="sep">·</span>
      <span className="item">
        CONF · {counts.confirmed} confirmed / {counts.probable} probable / {counts.unknown} unknown
      </span>

      {saving && (
        <>
          <span className="sep">·</span>
          <span className="item" style={{ color: 'var(--accent)' }}>
            <span className="dot pulse-soft" style={{ width: 4, height: 4 }} /> Saving
          </span>
        </>
      )}

      <div className="flex-1" />

      <button className="item" onClick={onToggleLog} title="Toggle session log (L)">
        <span style={{ color: 'var(--fg-faint)' }}>[ L ]</span>
        <span>{logOpen ? 'Hide log' : 'Session log'}</span>
      </button>
      {onShowShortcuts && (
        <>
          <span className="sep">·</span>
          <button className="item" onClick={onShowShortcuts} title="Keyboard shortcuts (?)">
            <span style={{ color: 'var(--fg-faint)' }}>[ ? ]</span>
            <span>Shortcuts</span>
          </button>
        </>
      )}
    </div>
  )
}
