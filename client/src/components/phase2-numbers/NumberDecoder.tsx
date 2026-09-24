import { useState } from 'react'
import { useProfile } from '@/stores/profile-context'
import { useAI } from '@/hooks/useAI'
import { useOllama } from '@/stores/ollama-context'
import { NumberGrammarPanel } from './NumberGrammarPanel'
import { countMappings } from 'shared/metrics/workspace-metrics'

const OPERATORS = ['+', '-', '×', '÷', '=']

export function NumberDecoder() {
  const { profile, updateProfile } = useProfile()
  const { runTask, loading, streamedText } = useAI()
  const { ready: connected } = useOllama()
  const [range, setRange] = useState(20)
  const [analysisResult, setAnalysisResult] = useState('')
  const [hover, setHover] = useState<number | null>(null)

  const numberSystem = profile?.number_system || { base: null, mappings: {}, operators: {} }
  const mappings = numberSystem.mappings as Record<number, string>
  const operators = numberSystem.operators as Record<string, string>
  const base = numberSystem.base
  const mappedCount = countMappings(mappings, 1, range)
  const displayBase = base

  const decompose = (n: number): number[] => {
    const b = displayBase
    if (!Number.isInteger(b) || !b || b < 2 || b > 36 || n <= 0) return []
    const out: number[] = []
    let x = n
    while (x > 0) { out.unshift(x % b); x = Math.floor(x / b) }
    return out
  }

  const handleMapping = (num: number, word: string) => {
    if (!profile) return
    const m = { ...mappings }
    if (word.trim()) m[num] = word.trim()
    else delete m[num]
    updateProfile({ number_system: { ...numberSystem, mappings: m } })
  }

  const handleOperator = (op: string, word: string) => {
    if (!profile) return
    const o = { ...operators }
    if (word.trim()) o[op] = word.trim()
    else delete o[op]
    updateProfile({ number_system: { ...numberSystem, operators: o } })
  }

  const handleDetectBase = async () => {
    if (!profile) return
    const mapped = Object.entries(mappings).map(([n, w]) => `${n} = "${w}"`).join('\n')
    if (mapped) {
      try { setAnalysisResult(await runTask('numberAnalysis', `Number mappings:\n${mapped}`)) }
      catch { /* useAI surfaces/logs the error */ }
    }
  }

  const numbers = Array.from({ length: range }, (_, i) => i + 1)
  const unmapped = numbers.filter((n) => !mappings[n]?.trim()).length
  const opsSet = OPERATORS.filter((op) => operators[op]).length

  const notes: { dot: string; text: React.ReactNode }[] = []
  notes.push({ dot: 'probable', text: <>Base selection is a working user assertion. Positional breakdown uses that selection only.</> })
  notes.push({ dot: unmapped > 0 ? 'probable' : 'confirmed', text: <>{unmapped > 0 ? <>{unmapped} of 1–{range} still unmapped.</> : <>All numbers 1–{range} are mapped.</>}</> })
  notes.push({ dot: opsSet > 0 ? 'confirmed' : 'unknown', text: <>{opsSet}/{OPERATORS.length} operators defined{opsSet === 0 ? ' — define + and = to start.' : '.'}</> })

  return (
    <div className="phase-enter" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 20, height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <div className="flex" style={{ alignItems: 'baseline', gap: 12 }}>
              <h1 className="h-display" style={{ margin: 0, fontSize: 30 }}>Number <em>System</em></h1>
              <span className="kicker">PHASE 02</span>
            </div>
            <p className="dim" style={{ marginTop: 6, fontSize: 13, maxWidth: 580 }}>Numbers are the Rosetta Stone. Map words to integers, explore possible structure, and compare alternative bases.</p>
          </div>
          <div className="flex" style={{ gap: 8, alignItems: 'center' }}>
            <span className="label" style={{ marginBottom: 0 }}>Range</span>
            <select className="input" value={range} onChange={(e) => setRange(Number(e.target.value))} style={{ width: 90 }}>
              <option value={10}>1–10</option>
              <option value={20}>1–20</option>
              <option value={50}>1–50</option>
              <option value={100}>1–100</option>
            </select>
            <button className="btn primary sm" onClick={handleDetectBase} disabled={!connected || loading || mappedCount < 3} title={mappedCount < 3 ? 'Map at least 3 numbers' : undefined}>{loading ? 'Analyzing…' : '⌖ AI Analyze'}</button>
          </div>
        </div>

        {profile && <NumberGrammarPanel profile={profile} />}
        <div className="glass-card" style={{ padding: 18 }}>
          <h2 className="label">Manual positional notation</h2>
          <p className="dim">This user-selected base controls the visual digit breakdown only. It does not select, accept or validate an inferred language grammar.</p>
          <label className="label">Working base (user-selected)
            <select className="input" aria-label="Working base" value={base ?? ''} onChange={event => updateProfile({ number_system: { ...numberSystem, base: event.target.value ? Number(event.target.value) : null } })}>
              <option value="">Unset</option>{Array.from({ length: 35 }, (_, i) => i + 2).map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </div>

        {/* Mappings grid */}
        <div className="glass-card" style={{ padding: 18 }}>
          <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
            <span className="label" style={{ marginBottom: 0 }}>Mappings · {mappedCount}/{range}</span>
            <span className="font-mono" style={{ fontSize: 11, color: 'var(--fg-mute)' }}>click to edit · hover for breakdown</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
            {numbers.map((n) => {
              const word = mappings[n]
              const has = !!word?.trim()
              const parts = decompose(n)
              return (
                <div key={n} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(null)} className="glass-inner" style={{ padding: '12px 14px', borderColor: hover === n ? 'rgba(0,230,118,0.4)' : has ? 'var(--border-mid)' : 'var(--border)', background: hover === n ? 'rgba(0,230,118,0.06)' : 'var(--bg-inner)', transition: 'all 120ms ease' }}>
                  <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                    <span className="font-mono" style={{ fontSize: 11, color: 'var(--fg-mute)' }}>{n}</span>
                    <span className="font-mono" style={{ fontSize: 9, color: has ? 'var(--accent)' : 'var(--fg-faint)' }}>{has ? '● mapped' : '—'}</span>
                  </div>
                  <input aria-label={`Number ${n} mapping`} value={word || ''} onChange={(e) => handleMapping(n, e.target.value)} placeholder="—" style={{ width: '100%', background: 'transparent', border: 0, outline: 'none', fontFamily: 'var(--font-mono)', fontSize: has ? 14 : 13, fontWeight: 500, color: has ? 'var(--fg)' : 'var(--fg-faint)' }} />
                  <div className="flex" style={{ gap: 4, marginTop: 4, height: 4 }}>
                    {parts.map((p, i) => (
                      <span key={i} style={{ width: 6, height: 4, borderRadius: 1, background: p ? `rgba(0,230,118,${0.3 + p * 0.12})` : 'rgba(255,255,255,0.05)' }} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {(loading || analysisResult) && (
          <div className={`glass-card ${loading ? 'scan-overlay' : ''}`} style={{ padding: 16 }}>
            <div className="flex" style={{ gap: 8, marginBottom: 10, alignItems: 'center' }}>
              <span className="dot" style={{ background: 'var(--ai)', boxShadow: '0 0 6px var(--ai)' }} />
              <span className="label" style={{ color: 'var(--ai)', marginBottom: 0 }}>{loading ? 'Analyzing' : 'Number System Analysis'}</span>
            </div>
            <pre style={{ fontSize: 13, color: 'var(--fg-1)', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', lineHeight: 1.6, margin: 0 }}>{loading ? streamedText : analysisResult}</pre>
          </div>
        )}
      </div>

      {/* RIGHT — operators + notes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="glass-card" style={{ padding: 18 }}>
          <span className="label">Operators</span>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {OPERATORS.map((op) => {
              const w = operators[op]
              return (
                <div key={op} className="flex" style={{ gap: 12, padding: '8px 12px', borderRadius: 8, background: w ? 'var(--bg-inner)' : 'transparent', border: '1px solid ' + (w ? 'var(--border-mid)' : 'var(--border)') }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.03)', color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', fontSize: 14, flexShrink: 0 }}>{op}</div>
                  <input value={w || ''} onChange={(e) => handleOperator(op, e.target.value)} placeholder="—" style={{ flex: 1, background: 'transparent', border: 0, outline: 'none', fontFamily: 'var(--font-mono)', fontSize: 13, color: w ? 'var(--fg)' : 'var(--fg-faint)' }} />
                  {w && <span className="badge confirmed" style={{ padding: '2px 6px', fontSize: 9 }}>set</span>}
                </div>
              )
            })}
          </div>
        </div>

        <div className="glass-card" style={{ padding: 18 }}>
          <span className="label">Pattern Notes</span>
          <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5, color: 'var(--fg-1)', lineHeight: 1.5 }}>
            {notes.map((note, i) => (
              <li key={i} className="flex" style={{ gap: 8, alignItems: 'flex-start' }}>
                <span className={'dot ' + note.dot} style={{ marginTop: 6, flexShrink: 0 }} />
                <span>{note.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
