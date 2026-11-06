import { useState } from 'react';
import type { ComparisonMatch, ComparisonReport } from '../../../shared/schemas/atlas-comparison.js';
import { percent, type Source } from './api.js';
import { Icon, Notice } from './ui.js';

export function Report({ report, job, sources }: { report: ComparisonReport; job: string; sources: Source[] }) {
  const [selected, setSelected] = useState(0), match = report.matches[selected];
  return <section className="report" aria-label="Evidence report"><div className="report-heading"><div><p className="eyebrow">TRACEABLE COMPARISON</p><h2>Evidence report</h2></div>
    <a className="button" href={'/api/jobs/' + job + '/report'} download><Icon name="download" />Export report</a></div>
    {report.state !== 'complete' && <Notice>{report.state === 'insufficient' ? 'There are too few anchored concepts to interpret these comparisons. Add meaning labels and more distinct words.' : 'The work limit was reached. This report contains completed candidates only. Reduce the scope before retrying.'}</Notice>}
    <div className="report-summary"><div><strong>{report.coverage.anchoredConcepts}</strong><span>Anchored concepts</span></div><div><strong>{report.matches.length}</strong><span>References examined</span></div>
      <div><strong>{report.coverage.unanchoredEntries + report.coverage.unmappedLabels.length}</strong><span>Samples / labels needing mapping</span></div><div><strong>{report.state}</strong><span>Computation status</span></div></div>
    {report.coverage.skippedForms > 0 && <Notice>{report.coverage.skippedForms} forms exceeded the supported alignment length.</Notice>}
    {!!report.coverage.unmappedLabels.length && <p className="form-help">Unmapped meanings: {report.coverage.unmappedLabels.join(', ')}. Map these to a documented gloss or concept identifier.</p>}
    <div className="comparison-layout"><div className="candidate-list" aria-label="Reference candidates">{report.matches.map((candidate, index) => <button key={candidate.sourceId + candidate.languageId} aria-pressed={index === selected} onClick={() => setSelected(index)}>
      <div><span className="candidate-rank">{String(index + 1).padStart(2, '0')}</span><strong>{candidate.languageName}</strong></div>
      <span>{candidate.consistentConcepts}/{candidate.sharedConcepts} shared concepts explained</span><meter min={0} max={1} value={candidate.systematicSupport} aria-label={candidate.languageName + ' explained-anchor fraction'} />
      <small>{Math.round(candidate.queryConceptCoverage * 100)}% query coverage</small></button>)}</div>
      {match && <Match key={match.sourceId + match.languageId} match={match} />}</div>
    <section className="next-observations"><p className="eyebrow">MAKE THE NEXT SAMPLE COUNT</p><h3>What to collect next</h3><ol>{report.nextObservations.map(observation => <li key={observation}>{observation}</li>)}</ol></section>
    <details className="source-section"><summary>Source versions & computation record</summary><p className="form-help">Input SHA-256</p><code className="hash">{report.input.objectSha256}</code>
      <p>{report.resources.alignmentCells.toLocaleString()} alignment cells · {report.resources.durationMs.toFixed(1)} ms computation · Method {report.method}</p>
      {report.referenceSources.map(reference => { const source = sources.find(source => source.id === reference.id); return <details key={reference.id}><summary>{reference.id} · {source?.license ?? 'See source catalog'}</summary>
        <p className="hash">SHA-256 {reference.sha256}</p>{source && <><a href={source.url} target="_blank" rel="noreferrer">Open source release ↗</a><pre className="attribution">{source.attribution}</pre></>}</details>; })}
    </details>
  </section>;
}

function Match({ match }: { match: ComparisonMatch }) {
  const phonetic = match.correspondenceBasis === 'declared-phonetic-segments';
  return <article className="match-detail"><div className="match-title"><span className="tag">REFERENCE CANDIDATE</span><h3>{match.languageName}</h3><a href={match.sourceUrl} target="_blank" rel="noreferrer">Vocabulary provenance ↗</a></div>
    <div className="component-scores"><div><strong>{percent(match.orthographicSimilarity)}</strong><span>Spelling similarity</span></div><div><strong>{percent(match.phoneticSimilarity)}</strong><span>Declared segment similarity</span></div>
      <div><strong>{match.rules.length}</strong><span>Supported symbol rules</span></div><div><strong>{percent(match.featureAgreement)}</strong><span>Observed grammar agreement</span></div></div>
    <p className="form-help">Edit similarity measures aligned form resemblance. Rule coverage uses {phonetic ? 'declared phonetic segments' : 'orthographic graphemes'}. These values are not ancestry probabilities.</p>
    <div className="method-note"><strong>{match.fitsSelectedAnchors ? 'The selected anchors admit a consistent substitution model.' : 'The selected anchors do not support a consistent substitution model.'}</strong>
      <p>{match.conflicts.length} conflicting source symbols. Shuffled-label control explained {percent(match.control.meanSystematicSupport)} of concepts on average across {match.control.shifts} shifts.</p></div>
    <details open className="report-section"><summary>Aligned evidence <span>{match.pairs.length} shared concepts</span></summary><div className="table-scroll"><table><thead><tr><th>Meaning</th><th>Your form</th><th>Reference form</th><th>Spelling</th></tr></thead>
      <tbody>{match.pairs.map(pair => <tr key={pair.concept}><td>{pair.meaning}<small className="subtle">{pair.queryId} / {pair.referenceId}</small></td><td className="word">{pair.queryForm}</td><td className="word">{pair.referenceForm}</td><td>{percent(pair.orthographic.similarity)}{!pair.orthographic.unique && <small className="subtle">Tied alignment</small>}</td></tr>)}</tbody></table></div>
      {match.pairs.length === 0 && <p>No meaning-labelled evidence could be aligned to this reference.</p>}</details>
    <details className="report-section"><summary>Correspondences & counterexamples <span>{match.rules.length} supported rules</span></summary>
      {match.rules.length ? <div className="rule-grid">{match.rules.map(rule => <div key={rule.source}><code>{rule.source} → {rule.target}</code><span>{rule.concepts.length} concepts</span><details><summary>Cited forms</summary><ul>{rule.evidence.map((entry, index) => <li key={index}>{entry.referenceId} → {entry.queryId}</li>)}</ul></details></div>)}</div> : <p>No symbol rule has enough unambiguous, distinct-word support.</p>}
      {!!match.conflicts.length && <p>Conflicts: {match.conflicts.map(conflict => conflict.source + ' → ' + conflict.targets.join(' / ')).join(' · ')}</p>}</details>
    <details className="report-section"><summary>Observed grammar <span>{match.features.length} comparable observations</span></summary>{match.features.length ? match.features.map(feature => <div className="grammar-row" key={feature.key}>
      <h4>{feature.key.replaceAll('_', ' ')}</h4><p>Your observation: <strong>{feature.queryValue}</strong> · Reference: <strong>{feature.referenceValue}</strong> · {feature.state}</p>
      <p className="form-help">Your evidence: {feature.querySource}</p><a href={feature.reference.sourceUrl} target="_blank" rel="noreferrer">{feature.reference.citation}</a>
      {feature.reference.sourceRecord && <p className="form-help">Value {feature.reference.sourceRecord.id} · {feature.reference.sourceRecord.references || 'No separate value-level reference supplied'}</p>}</div>) : <p>No observed grammatical features overlap this reference. Hypothesized values are excluded.</p>}</details>
    <section className="report-section proposal-section"><div className="section-heading"><h4>Missing-form hypotheses</h4><span className="tag">PROPOSED · UNVERIFIED</span></div>
      <p>Held-out audit: {match.predictionAudit.correct}/{match.predictionAudit.emitted} emitted predictions correct, from {match.predictionAudit.scheduled} scheduled concepts.</p>
      {match.proposals.length ? <><p className="form-help">Conditional on the position-independent substitution model. Collect contextualized examples before accepting these forms.</p>
        {match.proposals.map(proposal => <div className="proposal" key={proposal.concept}><span>{proposal.meaning}</span><code>{proposal.forms.join(' / ')}</code><small>{proposal.referenceIds.join(', ')}</small></div>)}</> :
        <p className="muted">No missing form meets the evidence and audit requirements. More independent anchors may help.</p>}</section>
  </article>;
}
