import { useState, useEffect } from 'react'
import { DEMO_PHRASES, DEMO_VERSION } from 'shared/demo-presentation'

/** Cinematic replay of saved dictionary meanings; no inference is started. */
export function DecodeMoment() {
  const [frame, setFrame] = useState({ index: 0, step: -1 })
  const [paused, setPaused] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const phrase = DEMO_PHRASES[frame.index]
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReducedMotion(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  useEffect(() => {
    if (paused || reducedMotion) return
    const count = phrase.tokens.length
    const delay = frame.step < 0 ? 280 : frame.step < count ? 720 : frame.step === count ? 2200 : 480
    const timer = setTimeout(() => setFrame(current => current.step > count
      ? { index: (current.index + 1) % DEMO_PHRASES.length, step: -1 }
      : { ...current, step: current.step + 1 }), delay)
    return () => clearTimeout(timer)
  }, [frame, paused, reducedMotion, phrase.tokens.length])
  const hidden = !reducedMotion && frame.step > phrase.tokens.length
  return (
    <div className="demo-moment">
      <div className="hero-eyebrow"><span className="ln" /><span>Translation replay</span><span className="acc">●</span><span>{DEMO_VERSION} · sample {frame.index + 1}</span></div>
      <div className="hero-cinematic" aria-label="Saved word glosses" style={{ opacity: hidden ? 0 : 1, transition: 'opacity 480ms ease' }}>
        {phrase.tokens.map((token, i) => {
          const state = reducedMotion || frame.step > i ? 'decoded' : frame.step === i ? 'scanning' : 'alien'
          return <span key={`${frame.index}-${i}`} className={`tok is-${state}`}>
            {state === 'alien' ? token.alien : token.gloss}<span className="scanmark" aria-hidden="true" />
          </span>
        })}
      </div>
      <div className="hero-source">
        <span className="tag">SRC</span><span className="alien">{phrase.alien}</span>
        <div className="sample-rail" aria-label="Example phrases">
          <span className="sample-label">SAMPLES</span>
          {DEMO_PHRASES.map((item, i) => <button key={item.id} type="button" className="sample-choice" aria-label={`Show example ${i + 1}`} aria-pressed={frame.index === i} onClick={() => { setFrame({ index: i, step: item.tokens.length }); setPaused(true) }}><span className={`pip${frame.index === i ? ' active' : ''}`} aria-hidden="true" />{i + 1}</button>)}
          {!reducedMotion && <button type="button" className="sample-choice" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? 'Resume examples' : 'Pause examples'}</button>}
        </div>
      </div>
      <p className="download-note">Saved sentence interpretation: {phrase.translation}. Animated dictionary lookup · no model calls. Word glosses keep source order.</p>
    </div>
  )
}
