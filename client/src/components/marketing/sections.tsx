import { useState } from 'react'
import { HeroMark } from './HeroMark'
import { DEMO_DICTIONARY, DEMO_INPUT, DEMO_VERSION, demoLookup } from 'shared/demo-presentation'
import { PRIMARY_LABEL, REPO_URL, SOURCE_URL, SOURCE_REVISION } from '@/lib/site'

const PHASE_STAMPS = ['FOUNDATION', 'FIRST WIN', 'GROWING', 'STRUCTURE', 'MOMENT', 'RECEIPT']
const PHASE_DEFS = [
  { num: '01', glyph: '{ }', name: 'Samples', desc: 'Save text, context and original recordings. Request audio analysis when needed.' },
  { num: '02', glyph: '#', name: 'Numbers', desc: 'Test bounded arithmetic grammars, inspect composition trees and ask distinguishing questions.' },
  { num: '03', glyph: 'Aa', name: 'Vocabulary', desc: 'Record meanings, examples and optional user belief. A rating is not measured accuracy.' },
  { num: '04', glyph: '⟨⟩', name: 'Grammar', desc: 'Compare typed rules, learn from grounded examples and review proposed changes with evidence.' },
  { num: '05', glyph: '⇄', name: 'Translation', desc: 'Keep lexical glosses, symbolic meaning trees and optional model output separate. Inspect each derivation.' },
  { num: '06', glyph: '◈', name: 'Dashboard', desc: 'Review saved metrics and export verified .xeno archives with recordings. Counts are not accuracy.' },
]

export function PhasesSection() {
  return <section id="method" className="section">
    <div className="section-eyebrow"><span className="acc">02</span><span className="ln" /><span>The research workflow</span></div>
    <h2 className="section-title">Six phases.<br /><em>Build an interpretation.</em></h2>
    <p className="section-sub">Move between observations, vocabulary and executable hypotheses as your corpus grows. Ask discriminating questions, inspect derivations and retain the decisions behind them. Keys 1–6 switch phases when you are not typing.</p>
    <div className="phases-ribbon">{PHASE_DEFS.map((phase, index) => <div key={phase.num} className="phase-card"><div className="num">PHASE {phase.num}</div><div className="glyph">{phase.glyph}</div><div className="pname">{phase.name}</div><div className="pdesc">{phase.desc}</div><div className="stamp">— {PHASE_STAMPS[index]}</div></div>)}</div>
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
      <div className="demo-bar"><span className="dot-bar" /><span className="dot-bar" /><span className="dot-bar" /><span style={{ marginLeft: 8 }}>Eridian → saved English glosses</span><span style={{ flex: 1 }} /><span style={{ color: 'var(--accent)' }}>Local dictionary lookup · no AI</span></div>
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
  { ico: '⌘', title: 'Keyboard-first exploration', text: 'Open the command palette with Ctrl/Cmd+K to find phases, tools, words and samples. Move through the six research phases with number shortcuts when you are not typing.' },
  { ico: '◐', title: 'Confidence-aware views', text: 'Keep your own belief ratings visible through token colors, rating rings and word inspectors. These views express recorded judgments; evaluated accuracy and evidence support are reported separately.' },
  { ico: '⌂', title: 'Controlled local inference', text: 'Bounded context and tools produce typed proposals. Citation and execution checks precede explicit, revision-aware review. Jobs are cancellable; model access requires a separately installed eligible Ollama model.' },
  { ico: '♪', title: 'Recordings with provenance', text: 'Retain original and prepared audio identities, generated results and manual corrections. Windowed native phone analysis supports recordings up to five minutes; transcription is capped at two. Phones are approximate English-trained TIMIT ARPABET.' },
  { ico: '△', title: 'A durable evidence notebook', text: 'Link immutable captures, annotation revisions, competing hypotheses and replayable derivations. Changed dependencies mark analyses stale. Revisioned saves, retained drafts and complete .xeno archives protect the research history.' },
  { ico: '◈', title: 'Sandbox & language compiler', text: 'Deterministic practice uses versioned generated languages and private server grading. A separate creative mode uses local-model generation; its practice scores remain distinct from the controlled research evaluations.' },
]
export function FeaturesSection() {
  return <section className="section" aria-label="Implementation capabilities" style={{ paddingTop: 24 }}><div className="features">{FEATURES.map(feature => <div key={feature.title} className="feature"><div className="ico">{feature.ico}</div><h3>{feature.title}</h3><p>{feature.text}</p></div>)}</div></section>
}

export function PrivacySection() {
  return <section id="privacy" className="section"><div className="privacy-block">
    <div className="section-eyebrow"><span className="acc">04</span><span className="ln" /><span>Local data, explicit setup</span></div>
    <div className="big-quote">Keep your corpus<br /><em>on your own machine.</em></div>
    <p className="section-sub">Profiles and recordings are stored locally. In the published candidate, generation accepts verified local completion models and rejects cloud-backed metadata. This depends on an accurately reporting local Ollama daemon.</p>
    <div className="privacy-facts">
      <div><strong>Local</strong><span>Project data and optional Ollama inference</span></div>
      <div><strong>Explicit</strong><span>Model downloads and reviewed proposals</span></div>
      <div><strong>.xeno</strong><span>Portable project archives with recordings</span></div>
    </div>
    <p className="download-note">Offline work requires installed application assets and, for AI, a downloaded model and running Ollama. Installation, model downloads, external links and desktop update checks use the network. OS/browser speech fallback depends on the selected voice. The static website is hosted on GitHub Pages; its dictionary widget does not send your text to a server.</p>
    <p className="download-note">The candidate includes portable .xeno archives, a deterministic compiler and frozen benchmarks with retained failures. Strict offline mode disables update checks, model downloads and OS voice fallback. The published Windows candidate and its setup requirements are identified below.</p>
    <a href={`${SOURCE_URL}/docs/limitations.md`} target="_blank" rel="noreferrer">Read the current limitations →</a>
    <p><a href={`${SOURCE_URL}/docs/technical-case-study.md`} target="_blank" rel="noreferrer">Technical case study</a> · <a href={`${SOURCE_URL}/docs/benchmarks.md`} target="_blank" rel="noreferrer">Reproduce the benchmarks</a> · <a href={`${SOURCE_URL}/docs/demo-script.md`} target="_blank" rel="noreferrer">Three-minute demonstration</a></p>
  </div></section>
}

export function FinalCTA({ onEnterApp }: { onEnterApp: () => void }) {
  return <section id="open" className="final-cta">
    <div className="section-eyebrow" style={{ justifyContent: 'center' }}><span className="ln" /><span>Source & license</span><span className="ln" /></div>
    <h2>Make first<br /><em>contact.</em></h2>
    <p className="sub">Read the architecture, tests and known limits. The repository is publicly viewable under a proprietary license; the license grants no general reuse rights.</p>
    <div className="hero-cta" style={{ justifyContent: 'center' }}><button className="btn-hero primary" onClick={onEnterApp}>{PRIMARY_LABEL} →</button><a className="btn-hero" href={SOURCE_URL} target="_blank" rel="noreferrer">View implementation source →</a><a className="btn-hero" href={REPO_URL} target="_blank" rel="noreferrer">★ Star on GitHub</a></div>
  </section>
}

export function HeroFooter() {
  return <footer className="hero-footer"><span className="hero-mark-row"><HeroMark size={18} /><span className="word" style={{ fontSize: 13 }}><span className="light">xeno</span>linguist</span></span>
    <span>Current source {SOURCE_REVISION}</span><a href={`${REPO_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer">Proprietary license</a><span className="grow" />
    <a href={`${SOURCE_URL}/docs/FEATURES.md`} target="_blank" rel="noreferrer">Feature reference</a><a href={`${REPO_URL}/releases`} target="_blank" rel="noreferrer">Releases</a><a href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a><a href="https://github.com/Parusann" target="_blank" rel="noreferrer">@parusan</a><span>© 2026 Parusan Natheeswaran</span>
  </footer>
}
