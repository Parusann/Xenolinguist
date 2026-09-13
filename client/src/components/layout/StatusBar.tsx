import { useProfile } from '@/stores/profile-context'
import { useOllama } from '@/stores/ollama-context'
import { workspaceMetrics } from 'shared/metrics/workspace-metrics'
import { SaveStatus } from './SaveStatus'

interface StatusBarProps {
  logOpen: boolean
  onToggleLog: () => void
  onShowShortcuts?: () => void
}

export function StatusBar({ logOpen, onToggleLog, onShowShortcuts }: StatusBarProps) {
  const { profile } = useProfile()
  const { ready: connected } = useOllama()

  const metrics = profile ? workspaceMetrics(profile) : null

  return (
    <div className="status-bar">
      <span className="item">
        <span
          className="dot"
          style={{ width: 5, height: 5, ...(connected ? {} : { background: 'var(--conf-unknown)', boxShadow: '0 0 8px var(--conf-unknown)' }) }}
        />
        <span style={{ color: 'var(--fg-dim)' }}>{connected ? 'Ollama connected' : 'Local chat not ready'}</span>
      </span>
      <span className="sep">·</span>
      <span className="item">
        OBSERVATIONS <b style={{ color: 'var(--accent)' }}>{metrics?.observations ?? 0}</b>
      </span>
      <span className="sep">·</span>
      <span className="item">
        {metrics?.assertedEntries ?? 0} assertions · evaluation unavailable
      </span>

      <span className="sep">·</span>
      <SaveStatus />

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
