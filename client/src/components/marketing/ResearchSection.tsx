import { SOURCE_URL } from '@/lib/site'

const asset = (name: string) => `${import.meta.env.BASE_URL}research/${name}`
const evidence = `${SOURCE_URL}/docs/verification/w25-release/README.md`

export function ResearchSection() {
  return <section id="research" className="section research-section">
    <div className="section-eyebrow"><span className="acc">01</span><span className="ln" /><span>Inside the research workbench</span></div>
    <h2 className="section-title">A result<br /><em>you can trace.</em></h2>
    <p className="section-sub">Compare explanations, choose an observation that separates them, then inspect the computation. This recorded run connects one answer to a reviewed rule and an unseen translation.</p>
    <div className="research-demo-layout">
      <div className="research-recording">
        <video controls playsInline preload="none" poster={asset('derivation.png')} aria-label="Recorded symbolic research demonstration">
          <source src={asset('demo.mp4')} type="video/mp4" />
          <a href={asset('demo.mp4')}>Download the research demonstration</a>
        </video>
        <p className="research-caption">3:02 · actual workbench · captioned automation · no model calls</p>
        <details className="research-transcript"><summary>Read the demonstration and its information budget</summary>
          <p>Reserved synthetic seed 104729. Three known word meanings and two competing plural rules are supplied. Ask for “the stars”; one independent corpus answer separates the alternatives. Explicit review disables the contradicted rule. The parser derives “the rocks” from a withheld form, retaining its stem, plural rule and meaning tree. Reloading restores the project and draft; the same result is reproduced.</p>
          <p>This is a reserved lexical seed within a reused regular grammar family. It is a reproducible worked example, not a blinded human study or unrestricted language discovery.</p>
        </details>
      </div>
      <div className="research-sequence">
        <div><span>01 / OBSERVE</span><h3>Keep the original evidence.</h3><p>Immutable captures and revisioned annotations preserve the distinction between what was observed and how it was interpreted.</p></div>
        <div><span>02 / DISTINGUISH</span><h3>Ask a useful question.</h3><p>Finite candidate disagreement and declared observation costs guide grammar and number-system elicitation.</p></div>
        <div><span>03 / EXPLAIN</span><h3>Execute a reviewed rule.</h3><p>Bounded morphology and parsing produce semantic trees with the exact source spans and rules behind each derivation.</p></div>
        <a href={`${SOURCE_URL}/docs/demo-script.md`} target="_blank" rel="noreferrer">Reproduce this run and inspect its manifest →</a>
      </div>
    </div>
    <dl className="verification-strip">
      <div><dt>Unit tests per platform</dt><dd>529</dd></div>
      <div><dt>Browser checks per platform</dt><dd>56 + 10</dd></div>
      <div><dt>Installed files verified</dt><dd>3,779</dd></div>
      <div><dt>Archive round trips</dt><dd>9</dd></div>
    </dl>
    <p className="research-caption">Frozen checkpoint 00a25d5 · Windows/Linux source checks; Windows installer acceptance. Browser counts cover workbench + public pages. Eleven tooling checks also pass; three native unit cases are gated, with real installed native execution tested separately. <a href={evidence} target="_blank" rel="noreferrer">Inspect the evidence →</a></p>
  </section>
}

const results = [
  { value: '150 / 150', title: 'Withheld meanings composed', text: 'Thirty reserved languages at 29 observations with a supplied grammar prior. Model-only scored 0/300 in its repeated trials.', doc: 'evaluation-results.md', link: 'Composition experiment' },
  { value: '48 / 48', title: 'Regular affix generalization', text: 'Seven lexical anchors, 14 fit and six validation observations. Sparse evidence scored 0/48; hidden irregulars scored 24/48.', doc: 'induction-results.md', link: 'Induction and ablations' },
  { value: '2 answers', title: 'Active grammar questions', text: 'Regular cases reach 72/72 predictions after two active answers. The candidate family is supplied; unseen irregularity still causes errors.', doc: 'elicitation-results.md', link: 'Learning curves and controls' },
  { value: '5,998 → 261 ms', title: '10,000-word vocabulary view', text: 'Before/after on one Windows host. Editing improves to 102–196 ms; the 100 ms target remains unmet and small-profile startup regresses.', doc: 'performance.md', link: 'Performance measurements' },
]
export function ResultsSection() {
  return <section id="results" className="section results-section">
    <div className="section-eyebrow"><span className="acc">RESEARCH RECORD</span><span className="ln" /><span>Measured, reproducible, bounded</span></div>
    <h2 className="section-title">Inspect the result.<br /><em>Reproduce the experiment.</em></h2>
    <p className="section-sub">Versioned corpora, independent scoring, declared information budgets and retained raw attempts. Each result below has its own dataset and denominator.</p>
    <div className="result-grid">{results.map(result => <article className="result-card" key={result.title}>
      <p className="result-value">{result.value}</p><h3>{result.title}</h3><p>{result.text}</p>
      <a href={`${SOURCE_URL}/docs/${result.doc}`} target="_blank" rel="noreferrer">{result.link} →</a>
    </article>)}</div>
    <div className="research-boundary"><h3>The failed attempts are part of the record.</h3>
      <p>The model-proposal comparison produced zero application-eligible reserved candidates; a linguistic-quality advantage remains unproved. The small English acoustic pilot retains 29.72% phone error rate and 33.33% word error rate on its evaluation split, including three recurring transcription failures.</p>
      <a href={`${SOURCE_URL}/docs/benchmarks.md`} target="_blank" rel="noreferrer">Read protocols, failures and replay commands →</a>
    </div>
  </section>
}
