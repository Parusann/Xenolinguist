import { useState } from 'react'
import { useAI } from '@/hooks/useAI'
import { useOllama } from '@/stores/ollama-context'
import { useSessionLog } from '@/stores/session-log-context'
import { useProfile } from '@/stores/profile-context'
import type { SandboxDifficulty } from 'shared/types'

const DIFFICULTIES: { value: SandboxDifficulty; label: string; desc: string }[] = [
  { value: 'easy', label: 'Easy', desc: 'English-like structure, familiar phonemes, base-10 numbers' },
  { value: 'medium', label: 'Medium', desc: 'Different word order, agglutinative morphology, base-8 numbers' },
  { value: 'hard', label: 'Hard', desc: 'Fundamentally alien structure, unusual phonemes, complex grammar' },
]

interface SandboxSetupProps {
  onGenerated: (conlang: ConlangData) => void
}

export interface ConlangData {
  language_name: string
  phoneme_set: string[]
  number_base: number
  word_order: string
  rules: string[]
  vocabulary: { alien: string; english: string; pos: string }[]
  number_words: Record<string, string>
  sample_sentences: { alien: string; english: string }[]
}

export function SandboxSetup({ onGenerated }: SandboxSetupProps) {
  const [difficulty, setDifficulty] = useState<SandboxDifficulty>('easy')
  const [generating, setGenerating] = useState(false)
  const { runTask } = useAI()
  const { connected } = useOllama()
  const { addEntry } = useSessionLog()
  const { updateProfile } = useProfile()

  const handleGenerate = async () => {
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
      const result = await runTask('conlangGeneration', prompt)
      // Extract JSON from the response (handle markdown code blocks)
      const jsonMatch = result.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('No JSON found in response')
      const parsed = JSON.parse(jsonMatch[0]) as Partial<ConlangData>
      // The model sometimes omits or mistypes fields. SandboxController iterates
      // these at render time (Object.entries(number_words), vocabulary.forEach,
      // sample_sentences/rules), so normalize every field to a safe shape here —
      // otherwise a malformed response crashes the controller on mount.
      if (typeof parsed.language_name !== 'string' || !Array.isArray(parsed.vocabulary)) {
        throw new Error('Incomplete conlang data in response')
      }
      const conlang: ConlangData = {
        language_name: parsed.language_name,
        phoneme_set: Array.isArray(parsed.phoneme_set) ? parsed.phoneme_set : [],
        number_base: typeof parsed.number_base === 'number' ? parsed.number_base : 10,
        word_order: typeof parsed.word_order === 'string' ? parsed.word_order : '',
        rules: Array.isArray(parsed.rules) ? parsed.rules : [],
        vocabulary: parsed.vocabulary,
        number_words: parsed.number_words && typeof parsed.number_words === 'object' ? parsed.number_words : {},
        sample_sentences: Array.isArray(parsed.sample_sentences) ? parsed.sample_sentences : [],
      }
      addEntry('success', `Generated conlang: ${conlang.language_name}`)
      updateProfile({ sandbox_difficulty: difficulty })
      onGenerated(conlang)
    } catch (err) {
      addEntry('error', `Failed to generate conlang: ${(err as Error).message}`)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-light mb-1 text-chrome">
          Sandbox <span className="font-medium text-chrome-accent">Mode</span>
        </h2>
        <p className="text-xs text-gray-500">The AI will generate a language with hidden rules. Decode it step by step.</p>
      </div>

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
