import { useState } from 'react'
import { useProfile } from '@/stores/profile-context'
import { useAI } from '@/hooks/useAI'
import { useOllama } from '@/stores/ollama-context'

export function NumberDecoder() {
  const { profile, updateProfile } = useProfile()
  const { runTask, loading, streamedText } = useAI()
  const { connected } = useOllama()
  const [range, setRange] = useState(20)
  const [analysisResult, setAnalysisResult] = useState('')

  const mappings = profile?.number_system.mappings || {}

  const handleMapping = (num: number, word: string) => {
    if (!profile) return
    const newMappings = { ...profile.number_system.mappings }
    if (word.trim()) {
      newMappings[num] = word.trim()
    } else {
      delete newMappings[num]
    }
    updateProfile({
      number_system: { ...profile.number_system, mappings: newMappings },
    })
  }

  const handleOperator = (op: string, word: string) => {
    if (!profile) return
    const newOps = { ...profile.number_system.operators }
    if (word.trim()) {
      newOps[op] = word.trim()
    } else {
      delete newOps[op]
    }
    updateProfile({
      number_system: { ...profile.number_system, operators: newOps },
    })
  }

  const handleAnalyze = async () => {
    const mapped = Object.entries(mappings)
      .map(([n, w]) => `${n} = "${w}"`)
      .join('\n')
    if (!mapped) return
    const result = await runTask('numberAnalysis', `Number mappings:\n${mapped}`)
    setAnalysisResult(result)
  }

  const mappedCount = Object.keys(mappings).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-light mb-1 text-chrome">
            Number <span className="font-medium text-chrome-accent">System</span>
          </h2>
          <p className="text-xs text-gray-500">Map the unknown language's number words. Always step one in first-contact linguistics.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleAnalyze}
            disabled={!connected || loading || mappedCount < 3}
            className="btn-primary text-xs"
          >
            {loading ? 'Analyzing...' : 'Detect Base System'}
          </button>
          {mappedCount < 3 && (
            <span className="text-[11px] text-gray-600">Map at least 3 numbers</span>
          )}
        </div>
      </div>

      {/* Two-column: Number grid left, Operators + Number line right */}
      <div className="grid grid-cols-3 gap-4 items-start">
        {/* Left: Number grid (takes 2/3 width) */}
        <div className="col-span-2 glass-card rounded-xl p-5 border-glow">
          <div className="flex items-center justify-between mb-4">
            <label className="label mb-0">
              Number Mappings · {mappedCount}/{range}
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600">Range</span>
              <select
                value={range}
                onChange={(e) => setRange(Number(e.target.value))}
                className="input text-xs py-1 px-2 w-20"
              >
                <option value={10}>1-10</option>
                <option value={20}>1-20</option>
                <option value={50}>1-50</option>
                <option value={100}>1-100</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-2 stagger-children">
            {Array.from({ length: range }, (_, i) => i + 1).map(num => (
              <div
                key={num}
                className={`glass-inner rounded-lg p-2.5 transition-all duration-300 ${
                  mappings[num]
                    ? 'border border-accent/20 shadow-[0_0_8px_rgba(0,230,118,0.06)] animate-glow-pulse'
                    : 'border border-white/[0.03]'
                }`}
              >
                <div className={`text-[10px] font-mono mb-1.5 ${mappings[num] ? 'text-accent/60' : 'text-gray-600'}`}>{num}</div>
                <input
                  type="text"
                  value={mappings[num] || ''}
                  onChange={(e) => handleMapping(num, e.target.value)}
                  placeholder="—"
                  className="w-full bg-transparent text-sm font-mono text-gray-200 placeholder:text-gray-700 focus:outline-none focus:placeholder:text-gray-600"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Right: Operators + Number line (takes 1/3 width) */}
        <div className="col-span-1 space-y-4">
          <div className="glass-card rounded-xl p-5">
            <label className="label mb-3">Operators</label>
            <div className="space-y-2">
              {['+', '-', '×', '÷', '='].map(op => (
                <div key={op} className="glass-inner rounded-lg p-2.5 border border-white/[0.03] flex items-center gap-3">
                  <div className="text-sm text-gray-500 font-mono w-5 text-center flex-shrink-0">{op}</div>
                  <input
                    type="text"
                    value={profile?.number_system.operators[op] || ''}
                    onChange={(e) => handleOperator(op, e.target.value)}
                    placeholder="—"
                    className="w-full bg-transparent text-sm font-mono text-gray-200 placeholder:text-gray-700 focus:outline-none"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Number line visualization */}
          {mappedCount > 0 && (
            <div className="glass-card rounded-xl p-5">
              <label className="label mb-3">Number Line</label>
              <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
                {Array.from({ length: range }, (_, i) => i + 1).map(num => (
                  <div
                    key={num}
                    className={`flex items-center gap-2 px-2 py-1 rounded-lg transition-colors ${
                      mappings[num] ? 'bg-accent/[0.06]' : ''
                    }`}
                  >
                    <span className="text-[10px] text-gray-600 font-mono w-6 text-right flex-shrink-0">{num}</span>
                    <div className={`w-px h-3 ${mappings[num] ? 'bg-accent/40' : 'bg-white/[0.06]'}`} />
                    <span className={`text-[11px] font-mono truncate ${
                      mappings[num] ? 'text-accent' : 'text-gray-700'
                    }`}>
                      {mappings[num] || '·'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AI Analysis — full width below */}
      {(loading || analysisResult) && (
        <div className={`glass-card rounded-xl p-5 ${loading ? 'scan-overlay' : ''}`}>
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-accent animate-pulse' : 'bg-accent/40'}`} />
            <label className="label mb-0 text-accent">
              {loading ? 'Analyzing' : 'Number System Analysis'}
            </label>
          </div>
          {loading && (
            <div className="relative h-0.5 bg-white/[0.03] rounded overflow-hidden mb-4">
              <div className="absolute inset-y-0 w-1/3 bg-accent/40 rounded animate-scan" />
            </div>
          )}
          <pre className="text-[13px] text-gray-400 whitespace-pre-wrap font-mono leading-relaxed">
            {loading ? streamedText : analysisResult}
          </pre>
        </div>
      )}
    </div>
  )
}
