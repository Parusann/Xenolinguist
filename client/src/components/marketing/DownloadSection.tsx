import { DOWNLOAD_URL } from '@/lib/site'

const REPO = 'https://github.com/Parusann/Xenolinguist'

/** Public-site download / welcome block. Rendered only on the GitHub Pages
 *  build (see HeroPage). Built from the existing marketing CSS vocabulary so it
 *  reads as part of the locked design rather than a bolt-on. */
export function DownloadSection() {
  return (
    <section id="download" className="section">
      <div className="section-eyebrow">
        <span className="acc">05</span>
        <span className="ln" />
        <span>Get it</span>
      </div>
      <h2 className="section-title">
        Bring it <em>home.</em><br />
        Run it on your machine.
      </h2>
      <p className="section-sub">
        Xenolinguist is a desktop app. Download it once and work entirely
        offline — your samples, your dictionary, and the AI inference all stay on
        your machine.
      </p>

      <div className="download-panel">
        <div className="download-cta">
          <a className="btn-hero primary" href={DOWNLOAD_URL} download>
            <span>Download for Windows</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>↓</span>
          </a>
          <span className="download-meta">Windows 10 / 11 · 64-bit · v1.0.0</span>
        </div>

        <p className="download-note">
          Unsigned build — Windows may warn “unknown publisher.” Click{' '}
          <b>More info → Run anyway.</b> It’s open source, so you can{' '}
          <a href={REPO} target="_blank" rel="noreferrer">read every line</a> first.
        </p>

        <p className="download-note">
          AI features (translation, field notes) use a local{' '}
          <a href="https://ollama.com" target="_blank" rel="noreferrer">Ollama</a>{' '}
          model — free, and it runs on your machine. The rest of the workbench
          works without it.
        </p>

        <ul className="download-list">
          <li>Local-first — nothing leaves your machine</li>
          <li>Runs fully offline</li>
          <li>Voice decoding bundled (espeak-ng · whisper · IPA model)</li>
          <li>Import / export everything as JSON</li>
        </ul>

        <div className="download-links">
          <a href={`${REPO}/releases`} target="_blank" rel="noreferrer">All releases →</a>
          <a href={REPO} target="_blank" rel="noreferrer">View source →</a>
        </div>
      </div>
    </section>
  )
}
