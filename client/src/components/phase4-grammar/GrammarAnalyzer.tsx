import { useState } from 'react'
import { useProfile } from '@/stores/profile-context'
import { useAI } from '@/hooks/useAI'
import { useOllama } from '@/stores/ollama-context'
import { getConfidenceLevel } from 'shared/constants'
import { formatDictionaryForPrompt, formatSamplesForPrompt, formatGrammarForPrompt } from 'shared/prompts'

export function GrammarAnalyzer() {
  const { profile, addGrammarRule, removeGrammarRule } = useProfile()
  const { runTask, loading, streamedText } = useAI()
  const { connected } = useOllama()
  const [analysisResult, setAnalysisResult] = useState('')
  const [newRule, setNewRule] = useState('')
  const [newEvidence, setNewEvidence] = useState('')
  const [newConfidence, setNewConfidence] = useState(70)

  const rules = profile?.grammar_rules || []

  const handleAnalyze = async () => {
    if (!profile) return
    const prompt = `Dictionary:\n${formatDictionaryForPrompt(profile.dictionary)}\n\nExisting grammar rules:\n${formatGrammarForPrompt(profile.grammar_rules)}\n\nSamples:\n${formatSamplesForPrompt(profile.samples)}`
    const result = await runTask('grammarInference', prompt)
    setAnalysisResult(result)
  }

  const handleAddRule = () => {
    if (!newRule.trim()) return
    addGrammarRule({
      rule: newRule.trim(),
      evidence: newEvidence.trim() ? newEvidence.split('\n').map(s => s.trim()).filter(Boolean) : [],
      confidence: newConfidence,
    })
    setNewRule('')
    setNewEvidence('')
    setNewConfidence(70)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div>
            <h2 className="text-xl font-light mb-0 text-chrome">
              Grammar <span className="font-medium text-chrome-accent">Analysis</span>
            </h2>
            <p className="text-xs text-gray-500">Identify word order, morphology, and structural patterns.</p>
          </div>
          {rules.length > 0 && (
            <div className="flex gap-3 text-xs text-gray-600">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400/50" />
                {rules.filter(r => getConfidenceLevel(r.confidence) === 'confirmed').length} confirmed
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400/50" />
                {rules.filter(r => getConfidenceLevel(r.confidence) === 'probable').length} probable
              </span>
            </div>
          )}
        </div>
        <button
          onClick={handleAnalyze}
          disabled={!connected || loading || !profile?.dictionary.length}
          className="btn-primary text-xs"
        >
          {loading ? 'Analyzing...' : 'Analyze Grammar'}
        </button>
      </div>

      {/* Two-column: Add form left, Rules list right */}
      <div className="grid grid-cols-5 gap-4 items-start">
        {/* Left column: Add rule form */}
        <div className="col-span-2 glass-card rounded-xl p-5 space-y-3">
          <label className="label text-accent mb-0">Add Grammar Rule</label>
          <div>
            <label className="label">Rule Description</label>
            <textarea
              value={newRule}
              onChange={(e) => setNewRule(e.target.value)}
              placeholder='e.g., "Word order is SOV — verb always appears last"'
              rows={3}
              className="input w-full resize-none"
            />
          </div>
          <div>
            <label className="label">Evidence (one per line)</label>
            <textarea
              value={newEvidence}
              onChange={(e) => setNewEvidence(e.target.value)}
              placeholder="Supporting examples from samples..."
              rows={3}
              className="input input-mono w-full resize-none"
            />
          </div>
          <div>
            <label className="label">Confidence · {newConfidence}%</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                value={newConfidence}
                onChange={(e) => setNewConfidence(Number(e.target.value))}
                className="flex-1 accent-accent"
              />
              <span className={`badge badge-${getConfidenceLevel(newConfidence)} text-[10px]`}>
                {getConfidenceLevel(newConfidence)}
              </span>
            </div>
          </div>
          <button
            onClick={handleAddRule}
            disabled={!newRule.trim()}
            className="btn-primary text-xs"
          >
            Add Rule
          </button>
        </div>

        {/* Right column: Confirmed Rules */}
        <div className="col-span-3">
          {rules.length > 0 ? (
            <div>
              <label className="label mb-2">Confirmed Rules · {rules.length}</label>
              <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1 stagger-children">
                {rules.map(rule => {
                  const level = getConfidenceLevel(rule.confidence)
                  return (
                    <div key={rule.id} className="glass-card rounded-lg p-3.5 group">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-3">
                            <p className="text-sm text-gray-200 leading-relaxed flex-1">{rule.rule}</p>
                            <div className="flex gap-2 flex-shrink-0 items-center">
                              <span className={`badge badge-${level}`}>
                                {rule.confidence}%
                              </span>
                              <button
                                onClick={() => removeGrammarRule(rule.id)}
                                className="text-xs text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                              >×</button>
                            </div>
                          </div>
                          {rule.evidence.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {rule.evidence.map((e, i) => (
                                <p key={i} className="text-[11px] font-mono text-gray-600 flex items-center gap-1.5">
                                  <span className="text-accent/30">→</span> {e}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="glass-card rounded-xl p-8 flex items-center justify-center h-full">
              <p className="text-sm text-gray-700">
                {profile?.dictionary.length
                  ? 'No rules yet. Add rules manually or use AI analysis.'
                  : 'Build your vocabulary first to enable grammar analysis.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* AI Analysis — full width below */}
      {(loading || analysisResult) && (
        <div className={`glass-card rounded-xl p-5 ${loading ? 'scan-overlay' : ''}`}>
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-accent animate-pulse' : 'bg-accent/40'}`} />
            <label className="label mb-0 text-accent">
              {loading ? 'Analyzing Grammar' : 'Grammar Analysis'}
            </label>
          </div>
          {loading && (
            <div className="relative h-0.5 bg-white/[0.03] rounded overflow-hidden mb-4">
              <div className="absolute inset-y-0 w-1/3 bg-accent/40 rounded animate-scan" />
            </div>
          )}
          <pre className="text-[13px] text-gray-400 whitespace-pre-wrap font-mono leading-relaxed">
            {loading ? streamedText : analysisResult}
          </pre>
        </div>
      )}
    </div>
  )
}
