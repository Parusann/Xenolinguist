import { useState } from 'react'
import { HeroMark } from './HeroMark'
import { DEMO_DICTIONARY, DEMO_INPUT, DEMO_VERSION, demoLookup } from 'shared/demo-presentation'
import { PRIMARY_LABEL, REPO_URL, SOURCE_URL, SOURCE_REVISION } from '@/lib/site'

const PHASE_DEFS = [
  { num: '01', glyph: '{ }', name: 'Samples', desc: 'Save text, context and original recordings. Request audio analysis when needed.' },
  { num: '02', glyph: '#', name: 'Numbers', desc: 'Map words to integers. Explore candidate bases with visible support and ties.' },
  { num: '03', glyph: 'Aa', name: 'Vocabulary', desc: 'Record meanings, examples and optional user belief. A rating is not measured accuracy.' },
  { num: '04', glyph: '⟨⟩', name: 'Grammar', desc: 'Write grammar notes and supporting examples. Review local-model suggestions yourself.' },
  { num: '05', glyph: '⇄', name: 'Translation', desc: 'Look up known words in source order. Unknown forms remain unresolved; grammar is not applied automatically.' },
  { num: '06', glyph: '◈', name: 'Dashboard', desc: 'Review content counts and saved metric history. Export profile JSON or dictionary CSV; audio files are separate.' },
]

export function PhasesSection() {
  return <section id="method" className="section">
    <div className="section-eyebrow"><span className="acc">02</span><span className="ln" /><span>The workflow · implementation preview</span></div>
    <h2 className="section-title">Six phases.<br /><em>Build an interpretation.</em></h2>
    <p className="section-sub">Move between observations, vocabulary and hypotheses as your corpus grows. These tools organize an investigation; they do not establish that an unknown language has been decoded. Keys 1–6 switch phases when you are not typing.</p>
    <div className="phases-ribbon">{PHASE_DEFS.map(phase => <div key={phase.num} className="phase-card"><div className="num">PHASE {phase.num}</div><div className="glyph">{phase.glyph}</div><div className="pname">{phase.name}</div><div className="pdesc">{phase.desc}</div></div>)}</div>
  </section>
}

export function DemoSection() {
  const [input, setInput] = useState(DEMO_INPUT)
  const decoded = demoLookup(input)
  const words = decoded.filter(item => !item.punctuation)
  const matched = words.filter(item => item.entry).length
  return <section id="proof" className="section">
    <div className="section-eyebrow"><span className="acc">03</span><span className="ln" /><span>Interactive dictionary demonstration</span></div>
    <h2 className="section-title">Type some Eridian.<br /><em>Look up saved meanings.</em></h2>
    <p className="section-sub">This browser-only widget uses the same {DEMO_DICTIONARY.size}-entry fictional dictionary as the app’s new Eridian demo ({DEMO_VERSION}). It makes no model or API requests. Matching is by exact word, ignoring case and simple punctuation; unknown words show [?].</p>
    <div className="demo-frame">
      <div className="demo-bar"><span className="dot-bar" /><span style={{ marginLeft: 8 }}>Eridian → saved English glosses</span><span style={{ flex: 1 }} /><span style={{ color: 'var(--accent)' }}>Local dictionary lookup · no AI</span></div>
      <div className="demo-grid">
        <div className="demo-pane">
          <label htmlFor="demo-input">Source — Eridian</label>
          <textarea id="demo-input" value={input} maxLength={2000} onChange={event => setInput(event.target.value)} aria-describedby="demo-help" />
          <p id="demo-help" className="download-note">Try “ka nesh lor”, “sa ren ku vol”, or an unknown word. Inputs stay in this page and are not saved.</p>
          <p className="download-note">{words.length} words · {matched} matched · {words.length - matched} unknown</p>
        </div>
        <div className="demo-pane">
          <h4>Word glosses — source order</h4>
          <output aria-label="Dictionary result" htmlFor="demo-input" className="demo-result">{decoded.map((item, i) => <span key={i} className={item.entry ? 'c-confirmed' : item.punctuation ? '' : 'c-unknown'} title={item.entry ? `${item.token}: ${item.entry.part_of_speech}` : undefined}>{!item.punctuation && i > 0 ? ' ' : ''}{item.gloss}</span>)}</output>
          <p className="download-note">{matched}/{words.length} words matched. This is dictionary coverage for this input, not translation accuracy or a confidence score.</p>
        </div>
      </div>
    </div>
  </section>
}

const FEATURES = [
  { ico: '⌂', title: 'Controlled local inference', text: 'The preview verifies local completion-model metadata, shows setup status and supports cancelling queued or running jobs. Chat requires a separately installed Ollama model.' },
  { ico: '♪', title: 'Recordings with provenance', text: 'Keep original audio alongside a prepared analysis copy. Windows checks cover PCM16 WAV, browser-prepared recordings, whisper transcription and approximate TIMIT ARPABET phones from an English-trained model.' },
  { ico: '△', title: 'Evidence and user belief', text: 'Keep observed samples, asserted dictionary entries and optional belief ratings distinct. No probability of correctness or independently evaluated language coverage is claimed.' },
  { ico: '◈', title: 'Creative practice', text: 'Generate a practice language with an eligible local model. Sessions and answers are saved. The generated answer key can be inconsistent, so practice scores are not scientific evaluation.' },
]
export function FeaturesSection() {
  return <section className="section" aria-label="Preview capabilities" style={{ paddingTop: 24 }}><div className="features">{FEATURES.map(feature => <div key={feature.title} className="feature"><div className="ico">{feature.ico}</div><h3>{feature.title}</h3><p>{feature.text}</p></div>)}</div></section>
}

export function PrivacySection() {
  return <section id="privacy" className="section"><div className="privacy-block">
    <div className="section-eyebrow"><span className="acc">04</span><span className="ln" /><span>Local data, explicit setup</span></div>
    <div className="big-quote">Keep your corpus<br /><em>on your own machine.</em></div>
    <p className="section-sub">Profiles and recordings are stored locally. In the implementation preview, generation accepts verified local completion models and rejects cloud-backed metadata. This depends on an accurately reporting local Ollama daemon.</p>
    <p className="download-note">Offline work requires installed application assets and, for AI, a downloaded model and running Ollama. Installation, model downloads, external links and desktop update checks use the network. OS/browser speech fallback depends on the selected voice. The static website is hosted on GitHub Pages; its dictionary widget does not send your text to a server.</p>
    <p className="download-note">JSON exports contain profile data and audio references, not recording bytes. A complete portable archive, reproducible language benchmarks and a deterministic language compiler are roadmap work.</p>
    <a href={`${SOURCE_URL}/docs/limitations.md`} target="_blank" rel="noreferrer">Read the current limitations →</a>
  </div></section>
}

export function FinalCTA({ onEnterApp }: { onEnterApp: () => void }) {
  return <section id="open" className="final-cta">
    <div className="section-eyebrow" style={{ justifyContent: 'center' }}><span className="ln" /><span>Source & license</span><span className="ln" /></div>
    <h2>Explore the<br /><em>implementation.</em></h2>
    <p className="sub">Read the architecture, tests and known limits. The repository is publicly viewable under a proprietary license; the license grants no general reuse rights.</p>
    <div className="hero-cta" style={{ justifyContent: 'center' }}><button className="btn-hero primary" onClick={onEnterApp}>{PRIMARY_LABEL} →</button><a className="btn-hero" href={SOURCE_URL} target="_blank" rel="noreferrer">View implementation source →</a></div>
  </section>
}

export function HeroFooter() {
  return <footer className="hero-footer"><span className="hero-mark-row"><HeroMark size={18} /><span className="word" style={{ fontSize: 13 }}><span className="light">xeno</span>linguist</span></span>
    <span>Preview source {SOURCE_REVISION}</span><a href={`${REPO_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer">Proprietary license</a><span className="grow" />
    <a href={`${SOURCE_URL}/docs/FEATURES.md`} target="_blank" rel="noreferrer">Feature reference</a><a href={`${REPO_URL}/releases`} target="_blank" rel="noreferrer">Releases</a><span>© 2026 Parusan Natheeswaran</span>
  </footer>
}
