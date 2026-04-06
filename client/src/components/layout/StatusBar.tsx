import { useProfile } from '@/stores/profile-context'

interface StatusBarProps {
  logOpen: boolean
  onToggleLog: () => void
  onShowShortcuts?: () => void
}

export function StatusBar({ logOpen, onToggleLog, onShowShortcuts }: StatusBarProps) {
  const { saving } = useProfile()

  return (
    <div className="relative z-10 h-6 glass border-t border-border flex items-center px-3 text-[10px] font-mono text-gray-600 gap-4">
      {saving && (
        <div className="flex items-center gap-1.5">
          <div className="w-1 h-1 rounded-full bg-accent animate-pulse" />
          <span className="text-accent/70">Saving</span>
        </div>
      )}
      <div className="flex-1" />
      {onShowShortcuts && (
        <button
          onClick={onShowShortcuts}
          className="text-gray-600 hover:text-gray-400 transition-colors flex items-center gap-1"
        >
          <kbd className="text-[9px] px-1 py-px rounded border border-white/[0.06] bg-white/[0.03] font-mono text-gray-500">?</kbd>
          <span>Shortcuts</span>
        </button>
      )}
      <button
        onClick={onToggleLog}
        className="text-gray-600 hover:text-gray-400 transition-colors flex items-center gap-1"
      >
        <span className={`inline-block w-1 h-1 rounded-full transition-colors ${logOpen ? 'bg-accent/40' : 'bg-gray-600'}`} />
        {logOpen ? 'Log' : 'Log'}
      </button>
    </div>
  )
}
