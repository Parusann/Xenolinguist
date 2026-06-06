import { useState } from 'react'
import { HeroMark } from './HeroMark'

/* ── Phases ribbon ────────────────────────────────────────────────────── */
const PHASE_DEFS = [
  { num: '01', glyph: '{ }', name: 'Samples', desc: 'Capture raw alien text. Tag the source, add phonetic notes, attach audio.', stamp: 'FOUNDATION' },
  { num: '02', glyph: '#', name: 'Numbers', desc: 'Map number words. Detect the base. The Rosetta Stone of any new language.', stamp: 'FIRST WIN' },
  { num: '03', glyph: 'Aa', name: 'Vocabulary', desc: 'Build the dictionary. Each word carries confidence, context, examples, alternates.', stamp: 'GROWING' },
  { num: '04', glyph: '⟨⟩', name: 'Grammar', desc: 'Document rules — word order, morphology, structure. Each rule needs evidence.', stamp: 'STRUCTURE' },
  { num: '05', glyph: '⇄', name: 'Translation', desc: 'Live word-by-word. Hover any token for candidates, confidence, source samples.', stamp: 'MOMENT' },
  { num: '06', glyph: '◈', name: 'Dashboard', desc: 'Field log. Decoding %, milestone timeline, AI field notes, import / export.', stamp: 'RECEIPT' },
]

export function PhasesSection() {
  return (
    <section id="method" className="section">
      <div className="section-eyebrow">
        <span className="acc">02</span>
        <span className="ln" />
        <span>The method</span>
      </div>
      <h2 className="section-title">
        Six steps. <em>One workflow.</em><br />
        From silence to sentence.
      </h2>
      <p className="section-sub">
        Every unknown language is decoded the same way — collect raw, crack the numbers, build a dictionary, infer grammar, translate, look back. Xenolinguist turns that loop into a tool. Keyboard <span className="font-mono" style={{ color: 'var(--fg)' }}>1–6</span> jumps you between phases.
      </p>

      <div className="phases-ribbon">
        {PHASE_DEFS.map((p, i) => (
          <div key={i} className="phase-card">
            <div className="num">PHASE {p.num}</div>
            <div className="glyph">{p.glyph}</div>
            <div className="pname">{p.name}</div>
            <div className="pdesc">{p.desc}</div>
            <div className="stamp">— {p.stamp}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── Interactive mini-decoder demo ────────────────────────────────────── */
interface DictEntry { en: string; conf: number; pos: string }
const DEMO_DICT: Record<string, DictEntry> = {
  'nesh': { en: 'I', conf: 86, pos: 'pron' },
  'tor': { en: 'see', conf: 79, pos: 'verb' },
  'fen': { en: 'three', conf: 96, pos: 'num' },
  'krash-ai': { en: 'stones', conf: 88, pos: 'noun' },
  'ka-tev': { en: 'seven', conf: 94, pos: 'num' },
  'shen': { en: 'big', conf: 81, pos: 'adj' },
  'tin': { en: 'small/softly', conf: 80, pos: 'adj' },
  'thaal': { en: 'sun', conf: 91, pos: 'noun' },
  'vesh': { en: 'vessel', conf: 84, pos: 'noun' },
  'mira': { en: 'water', conf: 88, pos: 'noun' },
  'ek': { en: 'is/are', conf: 82, pos: 'verb' },
  'lo': { en: 'you', conf: 85, pos: 'pron' },
  'ra': { en: 'and', conf: 84, pos: 'conn' },
  'kel': { en: 'give', conf: 78, pos: 'verb' },
  'kurr': { en: '[?]', conf: 28, pos: '?' },
  'tirek': { en: 'good/full', conf: 52, pos: 'adj' },
}

type Bucket = 'confirmed' | 'probable' | 'unknown'
interface Decoded { tok: string; type?: 'punct'; en?: string; conf?: number; pos?: string; bucket?: Bucket }

function tokensFromText(t: string): string[] {
  return t.trim().split(/(\s+|[.,!?])/).filter((x) => x.trim().length > 0)
}

function bucket(c: number | null | undefined): Bucket | null {
  if (c == null) return null
  if (c >= 76) return 'confirmed'
  if (c >= 41) return 'probable'
  return 'unknown'
}

export function DemoSection() {
  const [input, setInput] = useState('nesh tor fen krash-ai. lo ra nesh, mira ek vesh.')
  const tokens = tokensFromText(input)
  const decoded: Decoded[] = tokens.map((tok) => {
    const clean = tok.toLowerCase()
    if (/^[.,!?]$/.test(tok)) return { tok, type: 'punct' }
    const entry = DEMO_DICT[clean]
    if (entry) return { tok, ...entry, bucket: bucket(entry.conf) ?? undefined }
    return { tok, en: '[?]', conf: 14, pos: '?', bucket: 'unknown' }
  })

  const confirmed = decoded.filter((d) => d.bucket === 'confirmed').length
  const probable = decoded.filter((d) => d.bucket === 'probable').length
  const unknown = decoded.filter((d) => d.bucket === 'unknown').length
  const words = decoded.filter((d) => d.type !== 'punct').length

  const rowStyle: React.CSSProperties = {
    display: 'flex', gap: 12, alignItems: 'center',
    marginTop: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-mute)',
  }

  return (
    <section id="proof" className="section">
      <div className="section-eyebrow">
        <span className="acc">03</span>
        <span className="ln" />
        <span>Try it</span>
      </div>
      <h2 className="section-title">
        Type some Eridian.<br />
        Watch it <em>decode.</em>
      </h2>
      <p className="section-sub">
        A 16-word Eridian fragment is loaded below. Edit the source on the left — the right side updates token-by-token, each word colored by the confidence it lives at in the dictionary.
      </p>

      <div className="demo-frame">
        <div className="demo-bar">
          <span className="dot-bar" />
          <span className="dot-bar" />
          <span className="dot-bar" />
          <span style={{ marginLeft: 8 }}>xenolinguist · live translation · Eridian → English</span>
          <span style={{ flex: 1 }} />
          <span style={{ color: 'var(--accent)' }}>● llama3.1:70b · local</span>
        </div>
        <div className="demo-grid">
          <div className="demo-pane">
            <h4>Source — Eridian</h4>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                resize: 'vertical',
                color: 'var(--fg)',
                fontFamily: 'var(--font-mono)',
                fontSize: 22,
                lineHeight: 1.55,
                minHeight: 180,
                width: '100%',
                padding: 0,
              }}
            />
            <div style={rowStyle}>
              <span>{words} tokens</span>
              <span style={{ color: 'var(--fg-faint)' }}>·</span>
              <span className="c-confirmed">{confirmed} confirmed</span>
              <span className="c-probable">{probable} probable</span>
              <span className="c-unknown">{unknown} unknown</span>
            </div>
          </div>
          <div className="demo-pane">
            <h4>Translation — English</h4>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 22, lineHeight: 1.55, fontWeight: 300, letterSpacing: '-0.005em',
              flex: 1,
            }}>
              {decoded.map((d, i) => {
                if (d.type === 'punct') return <span key={i} style={{ color: 'var(--fg-mute)' }}>{d.tok}</span>
                const cls = 'wt-' + d.bucket
                const color = d.bucket === 'confirmed' ? 'var(--conf-confirmed)' : d.bucket === 'probable' ? 'var(--conf-probable)' : 'var(--conf-unknown)'
                return (
                  <span key={i} className={'word-token ' + cls} title={`${d.tok} → ${d.en} · ${d.conf}%`} style={{ color }}>
                    {d.en}{' '}
                  </span>
                )
              })}
            </div>
            <div style={rowStyle}>
              <span>avg conf <span style={{ color: 'var(--fg)' }}>{words ? Math.round(decoded.filter((d) => d.conf).reduce((s, d) => s + (d.conf || 0), 0) / words) : 0}%</span></span>
              <span style={{ flex: 1 }} />
              <span>↑ try typing your own</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ── Feature grid ─────────────────────────────────────────────────────── */
const FEATURES = [
  { ico: '⌂', title: 'Local-first', text: 'Everything — your samples, your dictionary, your AI inference — runs on your machine via Ollama. Nothing leaves.' },
  { ico: '♪', title: 'Audio decoding', text: 'Drop in field recordings. Auto-segment, label phonemes, link clips to dictionary entries. Click consonants welcome.' },
  { ico: '△', title: 'Confidence-aware', text: 'Every word, every rule, every translation carries a 0–100 score. Color, weight, opacity, blur — pick how you want to see it.' },
  { ico: '◈', title: 'Sandbox mode', text: 'Let the AI generate a synthetic language with hidden rules. Practice decoding from scratch, then peek at the answer key.' },
]

export function FeaturesSection() {
  return (
    <section className="section" style={{ paddingTop: 24 }}>
      <div className="features">
        {FEATURES.map((f, i) => (
          <div key={i} className="feature">
            <div className="ico">{f.ico}</div>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── Privacy block (editorial moment) ─────────────────────────────────── */
export function PrivacySection() {
  return (
    <section id="privacy" className="section">
      <div className="privacy-block">
        <div className="section-eyebrow" style={{ marginBottom: 28 }}>
          <span className="acc">04</span>
          <span className="ln" />
          <span>On privacy</span>
        </div>
        <div className="big-quote">
          You're decoding a language nobody knows.<br />
          We don't think your <em>only copy of it</em> should sit on someone else's server.
        </div>
        <div style={{ marginTop: 36, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, maxWidth: 900 }}>
          {[
            { k: '100%', v: 'of inference runs locally via Ollama' },
            { k: '0', v: 'bytes of your dictionary leave the machine' },
            { k: 'JSON', v: 'round-trip: import, edit, export, version' },
          ].map((s, i) => (
            <div key={i}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 200, color: 'var(--accent)', lineHeight: 1, letterSpacing: '-0.03em' }}>{s.k}</div>
              <div style={{ marginTop: 8, fontSize: 13, color: 'var(--fg-1)', lineHeight: 1.5 }}>{s.v}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Final CTA ────────────────────────────────────────────────────────── */
export function FinalCTA({ onEnterApp }: { onEnterApp: () => void }) {
  return (
    <section id="open" className="final-cta">
      <div className="section-eyebrow" style={{ justifyContent: 'center' }}>
        <span className="ln" />
        <span>Ready?</span>
        <span className="ln" />
      </div>
      <h2>
        Make first<br />
        <em>contact.</em>
      </h2>
      <p className="sub">
        Open the workbench. Drop in your first sample. The first sentence you decode is the one you'll remember.
      </p>
      <div style={{ display: 'inline-flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button className="btn-hero primary" onClick={onEnterApp}>
          <span>Open workbench</span>
          <span style={{ fontFamily: 'var(--font-mono)' }}>→</span>
        </button>
        <button className="btn-hero">
          <span>★ Star on GitHub</span>
        </button>
      </div>
    </section>
  )
}

/* ── Footer ───────────────────────────────────────────────────────────── */
export function HeroFooter() {
  return (
    <footer className="hero-footer">
      <span className="hero-mark-row">
        <HeroMark size={18} />
        <span className="word" style={{ fontSize: 13 }}><span className="light">xeno</span>linguist</span>
      </span>
      <span style={{ color: 'var(--fg-faint)' }}>·</span>
      <span>v0.7.2</span>
      <span style={{ color: 'var(--fg-faint)' }}>·</span>
      <span>MIT</span>
      <span className="grow" />
      <a href="#">Docs</a>
      <a href="#">GitHub</a>
      <a href="#">Changelog</a>
      <a href="#">@parusan</a>
    </footer>
  )
}
