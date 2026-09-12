import { useEffect, useRef, useState } from 'react'
import { useAI } from '@/hooks/useAI'
import { useOllama } from '@/stores/ollama-context'
import { useSessionLog } from '@/stores/session-log-context'
import { useProfile } from '@/stores/profile-context'
import { startSandbox } from '@/stores/sandbox-session'
import { conlangSchema } from 'shared/schemas/sandbox'
import { ZodError } from 'zod'
import type { SandboxDifficulty } from 'shared/types'

const DIFFICULTIES: { value: SandboxDifficulty; label: string; desc: string }[] = [
  { value: 'easy', label: 'Easy', desc: 'English-like structure, familiar phonemes, base-10 numbers' },
  { value: 'medium', label: 'Medium', desc: 'Different word order, agglutinative morphology, base-8 numbers' },
  { value: 'hard', label: 'Hard', desc: 'Fundamentally alien structure, unusual phonemes, complex grammar' },
]

export function SandboxSetup() {
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const [error, setError] = useState('')
  const failedResponse = useRef('')
  const [difficulty, setDifficulty] = useState<SandboxDifficulty>('easy')
  const [generating, setGenerating] = useState(false)
  const { runTask } = useAI()
  const { connected, getModelForTask } = useOllama()
  const { addEntry } = useSessionLog()
  const { profile } = useProfile()

  const handleGenerate = async () => {
    if (!profile || generating) return
    const owner = profile.id, model = getModelForTask('conlangGeneration')
    setError(''); failedResponse.current = ''
    setGenerating(true)
    addEntry('ai', `Generating ${difficulty} conlang...`)

    const prompt = `Generate a ${difficulty}-difficulty constructed language.

${difficulty === 'easy' ? 'Requirements: SVO word order, base-10 numbers, simple phonemes (no tones or clicks), no complex morphology. Should feel somewhat familiar.' : ''}
${difficulty === 'medium' ? 'Requirements: SOV or VSO word order, base-8 numbers, some agglutinative morphology (prefixes/suffixes for tense, plurality). Moderately challenging.' : ''}
${difficulty === 'hard' ? 'Requirements: OSV or free word order with case markers, base-12 numbers, complex morphology with infixes and tone markers, alien-feeling phonemes. Very challenging.' : ''}

Generate at least:
- 10 number words (1 through 10+ in your base system)
- 20 vocabulary words across nouns, verbs, adjectives, and pronouns
- 5 grammar rules
- 8 sample sentences of increasing complexity

Use decimal integer keys for number_words. Declare every alien sentence token (including inflected forms and particles) in vocabulary or number_words. Spellings must be unique. Optional accepted_forms arrays may declare explicit synonymous English answers for vocabulary and sentences. Do not include undeclared tokens.

IMPORTANT: Respond ONLY with valid JSON matching this exact format, no other text:
{
  "language_name": "string",
  "phoneme_set": ["list"],
  "number_base": number,
  "word_order": "string",
  "rules": ["list of grammar rules"],
  "vocabulary": [{"alien": "word", "english": "meaning", "pos": "noun/verb/adj/pronoun"}],
  "number_words": {"1": "word", "2": "word"},
  "sample_sentences": [{"alien": "sentence", "english": "translation"}]
}`

    try {
      const result = await runTask('conlangGeneration', prompt, { model })
      if (!mounted.current) return
      failedResponse.current = result
      // Extract JSON from the response (handle markdown code blocks)
      const jsonMatch = result.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('No JSON found in response')
      const conlang = conlangSchema.parse(JSON.parse(jsonMatch[0]))
      startSandbox(owner, conlang, difficulty, model)
      failedResponse.current = ''
      addEntry('success', `Generated practice: ${conlang.language_name}`)
    } catch (err) {
      if (!mounted.current) return
      const message = err instanceof ZodError ? err.issues.slice(0, 4).map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ') : (err as Error).message
      setError(`Could not start practice. ${message}. Try generating again.`)
      addEntry('error', 'Generated practice could not be validated')
    } finally {
      if (mounted.current) setGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-light mb-1 text-chrome">
          Sandbox <span className="font-medium text-chrome-accent">Mode</span>
        </h2>
        <p className="text-xs text-gray-500">Generate a language for creative practice. Answers are stored for recovery and checked against accepted forms; this is not a validated linguistic benchmark.</p>
      </div>

      {profile && !profile.sandbox_session && (profile.dictionary.length > 0 || profile.samples.length > 0 || profile.grammar_rules.length > 0 || Object.keys(profile.number_system.mappings).length > 0) &&
        <p role="status" className="text-sm text-amber-300">This workspace has earlier practice entries but no saved exercise key. The previous exercise cannot be reconstructed. Your entries are preserved; generate a new practice session to continue.</p>}
      {error && <div role="alert" className="space-y-2 text-sm text-amber-300">
        <p>{error}</p>
        {failedResponse.current && <button className="btn sm ghost" onClick={() => {
          const url = URL.createObjectURL(new Blob([failedResponse.current], { type: 'text/plain' }))
          const link = document.createElement('a'); link.href = url; link.download = 'sandbox-generation-diagnostic.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
        }}>Download failed response for diagnostics</button>}
      </div>}
      <div className="glass-card rounded-xl p-6 space-y-5 border-glow">
        <label className="label">Select Difficulty</label>
        <div className="grid grid-cols-3 gap-3">
          {DIFFICULTIES.map(d => (
            <button
              key={d.value}
              onClick={() => setDifficulty(d.value)}
              className={`glass-inner rounded-xl p-5 text-left transition-all border ${
                difficulty === d.value
                  ? 'border-accent/30 shadow-[0_0_12px_rgba(0,230,118,0.08)]'
                  : 'border-white/[0.03] hover:border-white/[0.06]'
              }`}
            >
              <div className={`text-sm font-medium mb-1.5 ${difficulty === d.value ? 'text-accent text-glow' : 'text-gray-300'}`}>
                {d.label}
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed">{d.desc}</p>
            </button>
          ))}
        </div>

        <button
          onClick={handleGenerate}
          disabled={!connected || generating}
          className="btn-primary w-full py-3"
        >
          {generating ? 'Generating Language...' : 'Generate & Start Decoding'}
        </button>

        {!connected && (
          <p className="text-xs text-red-400/70 text-center">Ollama must be running to generate a language.</p>
        )}

        {generating && (
          <div className="relative h-0.5 bg-white/[0.03] rounded overflow-hidden">
            <div className="absolute inset-y-0 w-1/3 bg-accent/40 rounded animate-scan" />
          </div>
        )}
      </div>
    </div>
  )
}
