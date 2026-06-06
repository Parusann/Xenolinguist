import { useState, useEffect } from 'react'

/**
 * DecodeMoment — the cinematic word-by-word decoding centerpiece. Exact port of
 * the designer prototype (prototypes/hero/Hero.jsx): each token cycles
 * is-alien → is-scanning → is-decoded.conf-* on a 720ms cadence, holds, fades,
 * and advances to the next phrase. The SampleRail pips jump between phrases.
 */

type Conf = 'confirmed' | 'probable' | 'unknown'
interface Token { a: string; d: string; c: Conf }
interface Phrase { label: string; alien: string; tokens: Token[] }

const PHRASES: Phrase[] = [
  {
    label: 'Eridian · sample 042 · greeting',
    alien: 'kurr lo vrash?',
    tokens: [
      { a: 'kurr', d: 'stranger,', c: 'unknown' },
      { a: 'lo', d: 'do you', c: 'confirmed' },
      { a: 'vrash', d: 'speak?', c: 'probable' },
    ],
  },
  {
    label: 'Eridian · sample 014 · counting',
    alien: 'ka-tev krash-ai ek vesh.',
    tokens: [
      { a: 'ka-tev', d: 'Seven', c: 'confirmed' },
      { a: 'krash-ai', d: 'stones', c: 'confirmed' },
      { a: 'ek', d: 'are in', c: 'probable' },
      { a: 'vesh.', d: 'the vessel.', c: 'confirmed' },
    ],
  },
  {
    label: 'Eridian · sample 029 · request',
    alien: "lo'meth nesh, vrash tin.",
    tokens: [
      { a: "lo'meth", d: 'Listen', c: 'probable' },
      { a: 'nesh,', d: 'to me,', c: 'confirmed' },
      { a: 'vrash', d: 'speak', c: 'probable' },
      { a: 'tin.', d: 'softly.', c: 'probable' },
    ],
  },
  {
    label: 'Eridian · sample 008 · observation',
    alien: 'thaal-ek shen.',
    tokens: [
      { a: 'thaal-ek', d: 'The sun is', c: 'probable' },
      { a: 'shen.', d: 'enormous.', c: 'confirmed' },
    ],
  },
]

function SampleRail({ count, active, onJump }: { count: number; active: number; onJump: (i: number) => void }) {
  return (
    <div className="sample-rail">
      <span style={{ color: 'var(--fg-faint)', fontSize: 10 }}>SAMPLES</span>
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className={'pip' + (i === active ? ' active' : '')}
          onClick={() => onJump(i)}
          style={{ cursor: 'pointer' }}
        />
      ))}
    </div>
  )
}

export function DecodeMoment({ speed = 1 }: { speed?: number }) {
  const [pIdx, setPIdx] = useState(0)
  const [tIdx, setTIdx] = useState(-1) // -1 = pre-scan, 0..n-1 = scanning idx, n = all decoded
  const [hidden, setHidden] = useState(false)

  const phrase = PHRASES[pIdx]

  useEffect(() => {
    // Reset and play
    setHidden(false)
    setTIdx(-1)
    const tokens = PHRASES[pIdx].tokens.length
    const scanStep = 720 / speed
    const holdAfter = 2200 / speed
    const fadeBetween = 480 / speed

    const timers: ReturnType<typeof setTimeout>[] = []
    timers.push(setTimeout(() => setTIdx(0), 280 / speed))
    for (let i = 1; i < tokens; i++) {
      timers.push(setTimeout(() => setTIdx(i), 280 / speed + i * scanStep))
    }
    timers.push(setTimeout(() => setTIdx(tokens), 280 / speed + tokens * scanStep))
    timers.push(setTimeout(() => setHidden(true), 280 / speed + tokens * scanStep + holdAfter))
    timers.push(setTimeout(() => {
      setPIdx((i) => (i + 1) % PHRASES.length)
    }, 280 / speed + tokens * scanStep + holdAfter + fadeBetween))
    return () => timers.forEach(clearTimeout)
  }, [pIdx, speed])

  return (
    <div>
      <div className="hero-eyebrow float-up">
        <span className="ln" />
        <span>Live decoder</span>
        <span className="acc">●</span>
        <span style={{ color: 'var(--fg-dim)' }}>{phrase.label}</span>
      </div>

      <div className="hero-cinematic" style={{ opacity: hidden ? 0 : 1, transition: 'opacity 480ms ease' }}>
        {phrase.tokens.map((tok, i) => {
          let state = 'alien'
          if (tIdx > i) state = 'decoded'
          else if (tIdx === i) state = 'scanning'
          const cls =
            'tok ' +
            (state === 'alien' ? 'is-alien' : state === 'scanning' ? 'is-scanning' : 'is-decoded ') +
            (state === 'decoded' ? 'conf-' + tok.c : '')
          const content = state === 'alien' ? tok.a : tok.d
          return (
            <span key={pIdx + '-' + i} className={cls}>
              {content}
              <span className="scanmark" />
            </span>
          )
        })}
      </div>

      <div className="hero-source float-up" style={{ animationDelay: '120ms' }}>
        <span className="tag">SRC</span>
        <span className="alien">{phrase.alien}</span>
        <span style={{ flex: 1 }} />
        <SampleRail count={PHRASES.length} active={pIdx} onJump={(i) => setPIdx(i)} />
      </div>
    </div>
  )
}
