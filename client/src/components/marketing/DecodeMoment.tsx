import { useState, useEffect } from 'react'
import { DEMO_PHRASES, DEMO_VERSION } from 'shared/demo-presentation'

/** Timed display of saved glosses, not a running inference process. */
export function DecodeMoment() {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReducedMotion(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  useEffect(() => {
    if (paused || reducedMotion) return
    const timer = setInterval(() => setIndex(value => (value + 1) % DEMO_PHRASES.length), 6000)
    return () => clearInterval(timer)
  }, [paused, reducedMotion])
  const phrase = DEMO_PHRASES[index]
  return (
    <div className="demo-moment">
      <div className="hero-eyebrow"><span className="ln" /><span>Illustrative dictionary gloss</span><span>{DEMO_VERSION}</span></div>
      <div className="hero-cinematic" aria-label="Saved word glosses">
        {phrase.tokens.map(token => <span key={token.alien} className="tok is-decoded">{token.gloss}</span>)}
      </div>
      <div className="hero-source">
        <span className="tag">SRC</span><span className="alien">{phrase.alien}</span>
        <div className="sample-rail" aria-label="Example phrases">
          {DEMO_PHRASES.map((item, i) => <button key={item.id} type="button" className="sample-choice" aria-label={`Show example ${i + 1}`} aria-pressed={index === i} onClick={() => { setIndex(i); setPaused(true) }}>{i + 1}</button>)}
          {!reducedMotion && <button type="button" className="sample-choice" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? 'Resume examples' : 'Pause examples'}</button>}
        </div>
      </div>
      <p className="download-note">Saved sentence interpretation: {phrase.translation}. The gloss keeps source word order; it does not infer grammar.</p>
    </div>
  )
}
