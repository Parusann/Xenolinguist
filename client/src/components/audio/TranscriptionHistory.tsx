import type { TranscriptionAnalysis } from 'shared/schemas/transcription'

export function TranscriptionHistory({ history, onCopy }: { history: TranscriptionAnalysis[]; onCopy: (analysis: TranscriptionAnalysis) => void }) {
  if (!history.length) return null
  return <section aria-label="Generated transcriptions" style={{ marginTop: 12 }}>
    <p className="label">Generated transcriptions · {history.length}</p>
    <p className="dim">Re-transcription preserves notes and manual segments. Up to eight results and 4 MiB per recording; existing results are never silently pruned.</p>
    {history.map((analysis, index) => <details key={analysis.id} open={index === history.length - 1}>
      <summary>Transcription {index + 1} · {analysis.result.language}</summary>
      <p style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{analysis.result.text || 'No text emitted'}</p>
      <p className="dim">{new Date(analysis.created_at).toLocaleString()} · {analysis.result.provenance.languageSelection === 'explicit' ? 'Language selected explicitly' : analysis.result.languageProb === null ? 'Language score unavailable' : `Language score ${Math.round(analysis.result.languageProb * 100)}% (uncalibrated)`}. Model segment timings are not word alignment.</p>
      <details><summary>Transcription provenance</summary>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify({ originalSha256: analysis.originalSha256,
          audio: analysis.result.audio, provenance: analysis.result.provenance }, null, 2)}</pre>
      </details>
      <button className="btn sm ghost" onClick={() => onCopy(analysis)}>Copy transcription {index + 1} to manual segments</button>
      <p className="dim">Copying replaces manual segments and dictionary links. Notes and the generated result remain unchanged.</p>
    </details>)}
  </section>
}
