import { DOWNLOAD_URL, RELEASE, REPO_URL, SOURCE_URL, SOURCE_REVISION } from '@/lib/site'

export function DownloadSection() {
  return <section id="download" className="section">
    <div className="section-eyebrow"><span className="acc">05</span><span className="ln" /><span>Published download</span></div>
    <h2 className="section-title">Choose with<br /><em>the version in view.</em></h2>
    <p className="section-sub">The verified Windows release candidate is available now. This is an unsigned prerelease; review the evidence and back up existing projects before upgrading.</p>
    <div className="download-panel">
      <div className="download-cta"><a className="btn-hero primary" href={DOWNLOAD_URL}>Download v{RELEASE.version} for Windows ↓</a><span className="download-meta">Windows x64 · {RELEASE.date} · {(RELEASE.bytes / 1000000).toFixed(1)} MB · unsigned</span></div>
      <p className="download-note"><b>Verified artifact:</b> source 00a25d5, with fresh installation, upgrade from v1.0.0, native audio, archive restoration and crash recovery checked independently. Later website presentation changes do not change the installer bytes.</p>
      <p className="download-note">Windows may report an unknown publisher because this installer is unsigned. Review the release and its limitations before deciding to run it.</p>
      <div className="download-links"><a href={`${REPO_URL}/releases/tag/${RELEASE.tag}`} target="_blank" rel="noreferrer">v{RELEASE.version} release details →</a><a href={`${SOURCE_URL}/docs/desktop-release.md`} target="_blank" rel="noreferrer">Build and verification guide →</a></div>
      <p className="download-note">Installer SHA-256: <code style={{ overflowWrap: 'anywhere' }}>6f9c54ba2a73e8986a7cb3c196baa0f4f5bca79b5b0fbbf5aaaab03d90e6fedf</code></p>
      <h3>Verified candidate · 1.1.0-rc.1</h3>
      <ul className="download-list">
        <li>The unsigned Windows x64 candidate passed independent installer and upgrade checks and is published as a prerelease. v1.0.0 remains a legacy release.</li>
        <li>Manual text, dictionary and grammar work require no language model.</li>
        <li>AI needs a running local Ollama service and an eligible completion model. Downloads are explicit: default gemma4:e4b is about 9.61 GB; optional llama3.2:3b is about 2.02 GB, with additional temporary disk space needed.</li>
        <li>Native audio needs the manifested Windows assets. Phones are approximate TIMIT ARPABET, not universal IPA.</li>
        <li>Offline operation begins after setup. Downloads and update checks require a network connection.</li>
        <li>Use .xeno archives to back up projects with saved recordings. Standalone profile JSON does not contain recording bytes.</li>
      </ul>
      <p className="download-note">Website / implementation source: {SOURCE_REVISION}. <a href={`${SOURCE_URL}/docs/verification/w25-release/README.md`} target="_blank" rel="noreferrer">Inspect the frozen candidate verification →</a></p>
      <p className="download-note">Install Ollama from <a href="https://ollama.com" target="_blank" rel="noreferrer">its official website</a>. Model performance depends on available memory and hardware; the smaller option has not passed a broad quality benchmark.</p>
    </div>
  </section>
}
