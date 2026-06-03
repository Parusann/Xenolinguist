import { useSessionLog } from '@/stores/session-log-context'
import type { LogEntryType } from 'shared/types'

const TYPE_COLOR: Record<LogEntryType, string> = {
  info: 'var(--fg-mute)',
  ai: 'var(--ai)',
  success: 'var(--conf-confirmed)',
  error: 'var(--conf-unknown)',
  warning: 'var(--conf-probable)',
}

const TYPE_ICON: Record<LogEntryType, string> = {
  info: '·',
  ai: '◆',
  success: '✓',
  error: '✗',
  warning: '!',
}

export function SessionLog({ onClose }: { onClose: () => void }) {
  const { entries, clearLog } = useSessionLog()

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center justify-between"
        style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}
      >
        <span className="kicker">Session Log</span>
        <div className="flex" style={{ gap: 14 }}>
          <button
            onClick={clearLog}
            style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-mute)', background: 'none', border: 0, cursor: 'pointer' }}
          >
            Clear
          </button>
          <button
            onClick={onClose}
            style={{ fontSize: 13, color: 'var(--fg-mute)', background: 'none', border: 0, cursor: 'pointer', lineHeight: 1 }}
            title="Close (L)"
          >
            ✕
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 20px 12px' }}>
        {entries.length === 0 && (
          <p style={{ color: 'var(--fg-faint)', fontSize: 12, fontFamily: 'var(--font-mono)', paddingTop: 8 }}>No activity yet</p>
        )}
        {entries
          .slice()
          .reverse()
          .map((entry) => (
            <div
              key={entry.id}
              className={`log-entry${entry.type === 'success' || entry.type === 'ai' ? ' kind-milestone' : ''}`}
            >
              <span className="ts">
                {new Date(entry.timestamp).toLocaleTimeString('en-US', {
                  hour12: false,
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
              <span className="kind" style={{ color: TYPE_COLOR[entry.type] }}>
                {TYPE_ICON[entry.type]}
              </span>
              <span className="body">{entry.message}</span>
            </div>
          ))}
      </div>
    </div>
  )
}
