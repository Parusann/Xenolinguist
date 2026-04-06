import { useEffect, useRef } from 'react'
import { useSessionLog } from '@/stores/session-log-context'
import type { LogEntryType } from 'shared/types'

const TYPE_STYLES: Record<LogEntryType, string> = {
  info: 'text-gray-500',
  ai: 'text-accent',
  success: 'text-emerald-400',
  error: 'text-red-400',
  warning: 'text-amber-400',
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
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ left: scrollRef.current.scrollWidth, behavior: 'smooth' })
  }, [entries])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-accent/30" />
          <span className="label mb-0">Session Log</span>
        </div>
        <div className="flex gap-3">
          <button onClick={clearLog} className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors">Clear</button>
          <button onClick={onClose} className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors">×</button>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-2 font-mono text-[11px] leading-[1.6]">
        {entries.length === 0 && (
          <p className="text-gray-700 text-xs">No activity yet</p>
        )}
        <div className="grid grid-cols-[auto_auto_1fr] gap-x-3 gap-y-0.5">
          {entries.map((entry) => (
            <div key={entry.id} className="contents animate-fade-in">
              <span className="text-gray-700 tabular-nums">
                {new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span className={`text-center ${TYPE_STYLES[entry.type]}`}>
                {TYPE_ICON[entry.type]}
              </span>
              <span className="text-gray-400 truncate">{entry.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
