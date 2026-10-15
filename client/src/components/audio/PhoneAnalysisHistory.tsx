import type { PhoneAnalysis } from 'shared/schemas/phone-analysis'

export function PhoneAnalysisHistory({ history, onCopy }: { history: PhoneAnalysis[]; onCopy: (analysis: PhoneAnalysis) => void }) {
  if (!history.length) return null
  return <section aria-label="Generated phone analyses" style={{ marginTop: 12 }}>
    <p className="label">Generated phone analyses · {history.length}</p>
    <p className="dim">Uncalibrated acoustic scores and approximate timings. Re-analysis keeps manual segments intact.</p>
    {history.map((analysis, index) => <details key={analysis.id} open={index === history.length - 1}>
      <summary>Phone analysis {index + 1} · {analysis.result.segments.length} runs</summary>
      <p className="font-mono" style={{ overflowWrap: 'anywhere' }}>{analysis.result.ipa || 'No phones emitted'}</p>
      <p className="dim">{new Date(analysis.created_at).toLocaleString()} · {analysis.result.identity.alphabet} · {analysis.result.processing.chunks.length} windows</p>
      <details><summary>Audio and model provenance</summary>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify({ originalSha256: analysis.originalSha256,
          audio: analysis.result.audio, model: analysis.result.identity, decoding: analysis.result.ctc.decoder,
          scores: analysis.result.ctc.scoreDefinition, timing: analysis.result.ctc.timingDefinition }, null, 2)}</pre>
      </details>
      <button className="btn sm ghost" onClick={() => onCopy(analysis)}>Copy analysis {index + 1} to manual segments</button>
      <p className="dim">Copying replaces the current manual segments and their dictionary links. The generated record stays unchanged.</p>
    </details>)}
  </section>
}
