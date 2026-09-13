import { DOWNLOAD_URL, RELEASE, REPO_URL, SOURCE_URL, SOURCE_REVISION } from '@/lib/site'

export function DownloadSection() {
  return <section id="download" className="section">
    <div className="section-eyebrow"><span className="acc">05</span><span className="ln" /><span>Published download</span></div>
    <h2 className="section-title">Choose with<br /><em>the version in view.</em></h2>
    <p className="section-sub">The published installer is an earlier build. The improvements described on this page are in the implementation preview and have not been released in a new installer.</p>
    <div className="download-panel">
      <div className="download-cta"><a className="btn-hero primary" href={DOWNLOAD_URL}>Download v{RELEASE.version} for Windows ↓</a><span className="download-meta">Windows x64 · {RELEASE.date} · {(RELEASE.bytes / 1000000).toFixed(1)} MB · unsigned</span></div>
      <p className="download-note"><b>v1.0.0 limitations:</b> the published build predates the verified phone-runtime repair, save recovery, local API authentication and controlled inference jobs. It may automatically attempt the default Ollama model download. Later phone-runtime checks do not certify this installer; the separate pre-implementation packaged baseline failed phone analysis. It is not the preview shown above.</p>
      <p className="download-note">Windows may report an unknown publisher because this installer is unsigned. Review the release and its limitations before deciding to run it.</p>
      <div className="download-links"><a href={`${REPO_URL}/releases/tag/${RELEASE.tag}`} target="_blank" rel="noreferrer">v{RELEASE.version} release details →</a><a href={`${SOURCE_URL}/docs/desktop-release.md`} target="_blank" rel="noreferrer">Build and verification guide →</a></div>
      <h3>Implementation preview · source {SOURCE_REVISION}</h3>
      <ul className="download-list">
        <li>Verified locally as an unpacked Windows x64 app; a new installer is still pending.</li>
        <li>Manual text, dictionary and grammar work require no language model.</li>
        <li>AI needs a running local Ollama service and an eligible completion model. Downloads are explicit: default gemma4:e4b is about 9.61 GB; optional llama3.2:3b is about 2.02 GB, with additional temporary disk space needed.</li>
        <li>Native audio needs the manifested Windows assets. Phones are approximate TIMIT ARPABET, not universal IPA.</li>
        <li>Offline operation begins after setup. Downloads and update checks require a network connection.</li>
        <li>Profile JSON does not contain recording bytes; keep original audio separately.</li>
      </ul>
      <p className="download-note">Install Ollama from <a href="https://ollama.com" target="_blank" rel="noreferrer">its official website</a>. Model performance depends on available memory and hardware; the smaller option has not passed a broad quality benchmark.</p>
    </div>
  </section>
}
