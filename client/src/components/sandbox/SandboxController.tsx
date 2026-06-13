import { useState } from 'react'
import { useProfile } from '@/stores/profile-context'
import { SpeakButton } from '@/components/audio/SpeakButton'
import { useSessionLog } from '@/stores/session-log-context'
import type { ConlangData } from './SandboxSetup'
import type { PartOfSpeech } from 'shared/types'

/** Map the model's free-form part-of-speech tag onto the PartOfSpeech enum (it emits things
 *  like "adj"/"pron"/"conj"); unknown tags fall back to 'unknown' rather than being cast through. */
function normalizePos(pos: string): PartOfSpeech {
  const map: Record<string, PartOfSpeech> = {
    noun: 'noun', n: 'noun', verb: 'verb', v: 'verb',
    adjective: 'adjective', adj: 'adjective', pronoun: 'pronoun', pron: 'pronoun',
    number: 'number', num: 'number', numeral: 'number',
    connector: 'connector', conn: 'connector', conjunction: 'connector', conj: 'connector',
    particle: 'particle', part: 'particle',
  }
  return map[pos.toLowerCase().trim()] ?? 'unknown'
}

interface SandboxControllerProps {
  conlang: ConlangData
  /** Return to setup to generate a fresh language (used by "Play Again"). */
  onPlayAgain?: () => void
}

type TutorialStep = 1 | 2 | 3 | 4
type HintLevel = 0 | 1 | 2 | 3

interface WordState {
  guess: string
  status: 'pending' | 'correct' | 'wrong'
  hintLevel: HintLevel
  hintsUsed: number
}

interface SentenceWordState {
  guess: string
  status: 'pending' | 'correct' | 'wrong'
}

interface Stats {
  wordsDecoded: number
  totalAttempts: number
  correctAttempts: number
  hintsUsed: number
}

export function SandboxController({ conlang, onPlayAgain }: SandboxControllerProps) {
  const { profile, updateProfile, addDictionaryEntry, addSample, addGrammarRule } = useProfile()
  const { addEntry } = useSessionLog()

  // ---- Tutorial step ----
  const [step, setStep] = useState<TutorialStep>(1)
  const [completed, setCompleted] = useState(false)

  // ---- Number discovery (step 1) ----
  const numberEntries = Object.entries(conlang.number_words)
  const [numberStates, setNumberStates] = useState<Record<string, WordState>>(() => {
    const init: Record<string, WordState> = {}
    numberEntries.forEach(([, word]) => {
      init[word] = { guess: '', status: 'pending', hintLevel: 0, hintsUsed: 0 }
    })
    return init
  })
  const [visibleNumbers, setVisibleNumbers] = useState(3)

  // ---- Vocabulary mapping (step 2) ----
  const vocab = conlang.vocabulary
  const [vocabStates, setVocabStates] = useState<Record<string, WordState>>(() => {
    const init: Record<string, WordState> = {}
    vocab.forEach(v => {
      init[v.alien] = { guess: '', status: 'pending', hintLevel: 0, hintsUsed: 0 }
    })
    return init
  })
  const [visibleVocab, setVisibleVocab] = useState(3)

  // ---- Sentence decoding (step 3) ----
  const sentences = conlang.sample_sentences
  const [currentSentenceIdx, setCurrentSentenceIdx] = useState(0)
  const [sentenceGuesses, setSentenceGuesses] = useState<Record<number, string>>({})
  const [sentenceResults, setSentenceResults] = useState<Record<number, 'pending' | 'correct' | 'revealed'>>({})
  const [sentenceWordMode, setSentenceWordMode] = useState<Record<number, boolean>>({})
  const [sentenceWordStates, setSentenceWordStates] = useState<Record<string, SentenceWordState>>({})

  // ---- Grammar revelation (step 4) ----
  const [revealedRules, setRevealedRules] = useState<number[]>([])
  const [revealingRule, setRevealingRule] = useState<number | null>(null)

  // ---- Stats tracking ----
  const [stats, setStats] = useState<Stats>({
    wordsDecoded: 0,
    totalAttempts: 0,
    correctAttempts: 0,
    hintsUsed: 0,
  })

  // Build a dictionary of all known words (from steps 1 and 2 that are correct)
  const knownWords: Record<string, string> = {}
  numberEntries.forEach(([num, word]) => {
    if (numberStates[word]?.status === 'correct') {
      knownWords[word] = num
    }
  })
  vocab.forEach(v => {
    if (vocabStates[v.alien]?.status === 'correct') {
      knownWords[v.alien] = v.english
    }
  })

  // ---- Counts ----
  const correctNumbers = numberEntries.filter(([, w]) => numberStates[w]?.status === 'correct').length
  const correctVocab = vocab.filter(v => vocabStates[v.alien]?.status === 'correct').length
  const decodedSentences = Object.values(sentenceResults).filter(r => r === 'correct' || r === 'revealed').length
  const totalRulesRevealed = revealedRules.length

  // ---- Progress calculation ----
  const step1Progress = Math.min(correctNumbers / Math.max(numberEntries.length, 1), 1)
  const step2Progress = Math.min(correctVocab / Math.max(vocab.length, 1), 1)
  const step3Progress = Math.min(decodedSentences / Math.max(sentences.length, 1), 1)
  const step4Progress = Math.min(totalRulesRevealed / Math.max(conlang.rules.length, 1), 1)
  const overallProgress = Math.round(((step1Progress + step2Progress + step3Progress + step4Progress) / 4) * 100)

  // Can proceed checks
  const canProceedToStep2 = correctNumbers >= 3
  const canProceedToStep3 = correctVocab >= 3
  const canProceedToStep4 = decodedSentences >= 1
  const canFinish = conlang.rules.length > 0 && totalRulesRevealed === conlang.rules.length

  // ---- Auto-add to dictionary ----
  const handleAddToDict = (alien: string, english: string, pos: string) => {
    addDictionaryEntry({
      alien_word: alien,
      english_meaning: english,
      part_of_speech: normalizePos(pos),
      confidence: 100,
      context: 'Sandbox mode',
      examples: [],
      notes: 'Decoded in sandbox',
    })
  }

  /** Also record a decoded number in the profile's number system so the Dashboard's Numbers
   *  metric reflects sandbox progress (mappings are number → alien word). */
  const addNumberMapping = (word: string, num: string) => {
    const n = Number(num)
    if (!profile || !Number.isFinite(n)) return
    updateProfile({
      number_system: {
        ...profile.number_system,
        base: profile.number_system.base ?? conlang.number_base,
        mappings: { ...profile.number_system.mappings, [n]: word },
      },
    })
  }

  // ---- Hint generation ----
  const getNumberHint = (num: string, word: string, level: HintLevel): string => {
    const numVal = parseInt(num, 10)
    switch (level) {
      case 1: {
        if (numVal <= 5) return `This number is between 1 and 5`
        if (numVal <= 10) return `This number is between 6 and 10`
        return `This number is greater than 10`
      }
      case 2: {
        const sentenceWithWord = sentences.find(s => s.alien.includes(word))
        if (sentenceWithWord) return `Used in: "${sentenceWithWord.alien}"`
        return `This is the base-${conlang.number_base} representation of ${num}`
      }
      case 3:
        return `The answer is: ${num}`
      default:
        return ''
    }
  }

  const getVocabHint = (v: { alien: string; english: string; pos: string }, level: HintLevel): string => {
    switch (level) {
      case 1:
        return `This word is a ${v.pos}`
      case 2: {
        const sentenceWithWord = sentences.find(s => s.alien.includes(v.alien))
        if (sentenceWithWord) {
          return `This word appears in: "${sentenceWithWord.alien}"`
        }
        return `This ${v.pos} appears after verbs, suggesting it might be a direct object`
      }
      case 3:
        return `The answer is: ${v.english}`
      default:
        return ''
    }
  }

  // ---- Number handlers ----
  const handleNumberGuess = (word: string, guess: string) => {
    setNumberStates(prev => ({
      ...prev,
      [word]: { ...prev[word], guess },
    }))
  }

  const handleNumberCheck = (word: string, correctNum: string) => {
    const state = numberStates[word]
    const guess = state.guess.trim().toLowerCase()
    const correct = correctNum.trim().toLowerCase()
    const isCorrect = guess === correct

    setStats(prev => ({
      ...prev,
      totalAttempts: prev.totalAttempts + 1,
      correctAttempts: prev.correctAttempts + (isCorrect ? 1 : 0),
      wordsDecoded: prev.wordsDecoded + (isCorrect ? 1 : 0),
    }))

    if (isCorrect) {
      setNumberStates(prev => ({
        ...prev,
        [word]: { ...prev[word], status: 'correct' },
      }))
      addEntry('success', `Correct! "${word}" = ${correctNum}`)
      handleAddToDict(word, correctNum, 'number')
      addNumberMapping(word, correctNum)
    } else {
      setNumberStates(prev => ({
        ...prev,
        [word]: { ...prev[word], status: 'wrong' },
      }))
      addEntry('warning', `Not quite. "${word}" is not "${guess}"`)
    }
  }

  const handleNumberHint = (word: string) => {
    setNumberStates(prev => {
      const current = prev[word]
      const nextLevel = Math.min(current.hintLevel + 1, 3) as HintLevel
      return {
        ...prev,
        [word]: {
          ...current,
          hintLevel: nextLevel,
          hintsUsed: current.hintsUsed + 1,
        },
      }
    })
    setStats(prev => ({ ...prev, hintsUsed: prev.hintsUsed + 1 }))
  }

  const handleNumberReveal = (word: string, num: string) => {
    setNumberStates(prev => ({
      ...prev,
      [word]: { ...prev[word], status: 'correct', guess: num, hintLevel: 3 },
    }))
    setStats(prev => ({
      ...prev,
      hintsUsed: prev.hintsUsed + 1,
      wordsDecoded: prev.wordsDecoded + 1,
    }))
    addEntry('info', `Revealed: "${word}" = ${num}`)
    handleAddToDict(word, num, 'number')
    addNumberMapping(word, num)
  }

  // ---- Vocab handlers ----
  const handleVocabGuess = (alien: string, guess: string) => {
    setVocabStates(prev => ({
      ...prev,
      [alien]: { ...prev[alien], guess },
    }))
  }

  const handleVocabCheck = (alien: string, english: string, pos: string) => {
    const state = vocabStates[alien]
    const guess = state.guess.trim().toLowerCase()
    const correct = english.trim().toLowerCase()
    const isCorrect = guess === correct || correct.includes(guess) || guess.includes(correct)

    setStats(prev => ({
      ...prev,
      totalAttempts: prev.totalAttempts + 1,
      correctAttempts: prev.correctAttempts + (isCorrect ? 1 : 0),
      wordsDecoded: prev.wordsDecoded + (isCorrect ? 1 : 0),
    }))

    if (isCorrect) {
      setVocabStates(prev => ({
        ...prev,
        [alien]: { ...prev[alien], status: 'correct' },
      }))
      addEntry('success', `Correct! "${alien}" = "${english}"`)
      handleAddToDict(alien, english, pos)
    } else {
      setVocabStates(prev => ({
        ...prev,
        [alien]: { ...prev[alien], status: 'wrong' },
      }))
      addEntry('warning', `Not quite. "${alien}" is not "${guess}"`)
    }
  }

  const handleVocabHint = (alien: string) => {
    setVocabStates(prev => {
      const current = prev[alien]
      const nextLevel = Math.min(current.hintLevel + 1, 3) as HintLevel
      return {
        ...prev,
        [alien]: {
          ...current,
          hintLevel: nextLevel,
          hintsUsed: current.hintsUsed + 1,
        },
      }
    })
    setStats(prev => ({ ...prev, hintsUsed: prev.hintsUsed + 1 }))
  }

  const handleVocabReveal = (alien: string, english: string, pos: string) => {
    setVocabStates(prev => ({
      ...prev,
      [alien]: { ...prev[alien], status: 'correct', guess: english, hintLevel: 3 },
    }))
    setStats(prev => ({
      ...prev,
      hintsUsed: prev.hintsUsed + 1,
      wordsDecoded: prev.wordsDecoded + 1,
    }))
    addEntry('info', `Revealed: "${alien}" = "${english}"`)
    handleAddToDict(alien, english, pos)
  }

  // ---- Sentence handlers ----
  const handleSentenceGuess = (idx: number, guess: string) => {
    setSentenceGuesses(prev => ({ ...prev, [idx]: guess }))
  }

  const handleSentenceCheck = (idx: number) => {
    const s = sentences[idx]
    const guess = (sentenceGuesses[idx] || '').trim().toLowerCase()
    const correct = s.english.trim().toLowerCase()
    const isCorrect = guess === correct || correct.includes(guess) || guess.includes(correct)

    setStats(prev => ({
      ...prev,
      totalAttempts: prev.totalAttempts + 1,
      correctAttempts: prev.correctAttempts + (isCorrect ? 1 : 0),
    }))

    if (isCorrect) {
      setSentenceResults(prev => ({ ...prev, [idx]: 'correct' }))
      addEntry('success', `Sentence decoded correctly!`)
      addSample({
        alien_text: s.alien,
        english_translation: s.english,
        source: 'Sandbox',
        phonetic_notes: '',
        decoded: true,
        audio_id: null,
        ipa: null,
      })
    } else {
      addEntry('warning', `Translation not quite right. Try again or switch to word-by-word mode.`)
    }
  }

  const handleSentenceReveal = (idx: number) => {
    const s = sentences[idx]
    setSentenceResults(prev => ({ ...prev, [idx]: 'revealed' }))
    setSentenceGuesses(prev => ({ ...prev, [idx]: s.english }))
    addEntry('info', `Revealed sentence translation`)
    addSample({
      alien_text: s.alien,
      english_translation: s.english,
      source: 'Sandbox',
      phonetic_notes: '',
      decoded: true,
      audio_id: null,
      ipa: null,
    })
  }

  const toggleWordByWord = (idx: number) => {
    setSentenceWordMode(prev => ({ ...prev, [idx]: !prev[idx] }))
  }

  const handleSentenceWordGuess = (key: string, guess: string) => {
    setSentenceWordStates(prev => ({
      ...prev,
      [key]: { ...(prev[key] || { guess: '', status: 'pending' }), guess },
    }))
  }

  const handleSentenceWordCheck = (key: string, alienWord: string) => {
    const state = sentenceWordStates[key]
    if (!state) return
    const guess = state.guess.trim().toLowerCase()

    // Check against known dictionary
    const meaning = knownWords[alienWord]
    if (meaning) {
      const isCorrect = guess === meaning.toLowerCase() || meaning.toLowerCase().includes(guess) || guess.includes(meaning.toLowerCase())
      setSentenceWordStates(prev => ({
        ...prev,
        [key]: { ...prev[key], status: isCorrect ? 'correct' : 'wrong' },
      }))
    } else {
      // Check against full vocab + numbers
      const vocabMatch = vocab.find(v => v.alien === alienWord)
      const numMatch = numberEntries.find(([, w]) => w === alienWord)
      const correctAnswer = vocabMatch?.english || numMatch?.[0]
      if (correctAnswer) {
        const isCorrect = guess === correctAnswer.toLowerCase() || correctAnswer.toLowerCase().includes(guess) || guess.includes(correctAnswer.toLowerCase())
        setSentenceWordStates(prev => ({
          ...prev,
          [key]: { ...prev[key], status: isCorrect ? 'correct' : 'wrong' },
        }))
      } else {
        // Word isn't in the decoded dictionary, vocab, or numbers yet — give feedback rather than
        // silently ignoring the guess.
        setSentenceWordStates(prev => ({ ...prev, [key]: { ...prev[key], status: 'wrong' } }))
        addEntry('warning', `"${alienWord}" hasn't been decoded yet — map it first.`)
      }
    }
  }

  // ---- Grammar handlers ----
  const handleRevealRule = (ruleIdx: number) => {
    if (revealedRules.includes(ruleIdx)) return
    setRevealingRule(ruleIdx)
    setTimeout(() => {
      setRevealedRules(prev => [...prev, ruleIdx])
      setRevealingRule(null)
      addGrammarRule({ rule: conlang.rules[ruleIdx], evidence: [], confidence: 100 })
      addEntry('success', `Grammar rule revealed: ${conlang.rules[ruleIdx]}`)
    }, 800)
  }

  const handleRevealAllRules = () => {
    conlang.rules.forEach((rule, i) => {
      if (!revealedRules.includes(i)) {
        setTimeout(() => {
          setRevealingRule(i)
          setTimeout(() => {
            setRevealedRules(prev => [...prev, i])
            setRevealingRule(null)
            addGrammarRule({ rule, evidence: [], confidence: 100 })
            addEntry('success', `Grammar rule revealed: ${rule}`)
          }, 600)
        }, i * 900)
      }
    })
  }

  // ---- Completion ----
  const handleComplete = () => {
    setCompleted(true)
    addEntry('success', `Language fully decoded! Accuracy: ${stats.totalAttempts > 0 ? Math.round((stats.correctAttempts / stats.totalAttempts) * 100) : 0}%`)
  }

  const handlePlayAgain = () => {
    // Prefer an in-app reset (back to setup); fall back to a reload only if no handler is wired.
    if (onPlayAgain) onPlayAgain()
    else window.location.reload()
  }

  // Tokenize sentence into words
  const tokenizeSentence = (sentence: string): string[] => {
    return sentence.split(/\s+/).filter(Boolean)
  }

  const isWordKnown = (word: string): boolean => {
    return word in knownWords
  }

  // Find the meaning of a word from all sources
  const findWordMeaning = (word: string): string | null => {
    if (knownWords[word]) return knownWords[word]
    const vocabMatch = vocab.find(v => v.alien === word)
    if (vocabMatch) return vocabMatch.english
    const numMatch = numberEntries.find(([, w]) => w === word)
    if (numMatch) return numMatch[0]
    return null
  }

  // ---- Completion screen ----
  if (completed) {
    const accuracy = stats.totalAttempts > 0 ? Math.round((stats.correctAttempts / stats.totalAttempts) * 100) : 0
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="glass-card rounded-xl p-8 border-glow text-center space-y-6">
          <div className="space-y-2">
            <h2 className="text-2xl font-light text-white">
              Language <span className="text-accent font-medium text-glow">Decoded</span>
            </h2>
            <p className="text-sm text-gray-400">
              You successfully decoded <span className="text-accent">{conlang.language_name}</span>
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
            <div className="glass-inner rounded-xl p-4 space-y-1">
              <div className="text-2xl font-mono text-accent text-glow">{stats.wordsDecoded}</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">Words Decoded</div>
            </div>
            <div className="glass-inner rounded-xl p-4 space-y-1">
              <div className="text-2xl font-mono text-accent text-glow">{accuracy}%</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">Accuracy</div>
            </div>
            <div className="glass-inner rounded-xl p-4 space-y-1">
              <div className="text-2xl font-mono text-accent text-glow">{stats.hintsUsed}</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">Hints Used</div>
            </div>
          </div>

          <div className="glass-inner rounded-xl p-4 space-y-2 max-w-sm mx-auto">
            <div className="text-xs text-gray-400">Decoded {correctNumbers} numbers, {correctVocab} words, {decodedSentences} sentences</div>
            <div className="text-xs text-gray-400">Discovered {totalRulesRevealed} grammar rules</div>
          </div>

          <div className="flex gap-3 justify-center pt-2">
            <button onClick={handlePlayAgain} className="btn-ghost px-6 py-2.5">
              Play Again
            </button>
            <button
              onClick={() => {
                setCompleted(false)
                setStep(1)
              }}
              className="btn-primary px-6 py-2.5"
            >
              Continue to Full App
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ---- Step labels ----
  const stepLabels: Record<TutorialStep, string> = {
    1: 'Number Discovery',
    2: 'Word Mapping',
    3: 'Sentence Decoding',
    4: 'Grammar Revelation',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-light mb-1 text-chrome">
            Decoding: <span className="font-medium text-chrome-accent">{conlang.language_name}</span>
          </h2>
          <p className="text-xs text-gray-500">
            {conlang.word_order} word order &middot; base-{conlang.number_base} numbers
          </p>
          {(conlang.phoneme_set?.length ?? 0) > 0 && (
            <div className="mt-2 space-y-1">
              <span className="text-[10px] text-gray-600 uppercase tracking-wider">
                Phonemes &middot; {conlang.phoneme_set!.length}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {conlang.phoneme_set!.map((p, i) => (
                  <span key={i} className="badge font-mono text-[10px]">{p}</span>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">
            Step {step} of 4
          </div>
          <div className="text-xs text-accent font-medium">{stepLabels[step]}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="glass-card rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Overall Progress</span>
          <span className="text-xs font-mono text-accent">{overallProgress}%</span>
        </div>
        <div className="h-1.5 bg-white/[0.03] rounded-full overflow-hidden">
          <div
            className="h-full bg-accent/60 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
        {/* Step indicators */}
        <div className="grid grid-cols-4 gap-2">
          {([1, 2, 3, 4] as TutorialStep[]).map(s => {
            const progress = s === 1 ? step1Progress : s === 2 ? step2Progress : s === 3 ? step3Progress : step4Progress
            const isActive = step === s
            const isPast = step > s
            return (
              <button
                key={s}
                onClick={() => {
                  if (isPast || isActive) setStep(s)
                }}
                disabled={!isPast && !isActive}
                className={`glass-inner rounded-lg p-2.5 text-left transition-all border ${
                  isActive
                    ? 'border-accent/30 shadow-[0_0_12px_rgba(0,230,118,0.08)]'
                    : isPast
                      ? 'border-accent/10 opacity-70'
                      : 'border-white/[0.03] opacity-40'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-[10px] font-medium ${isActive ? 'text-accent' : isPast ? 'text-accent/60' : 'text-gray-600'}`}>
                    Step {s}
                  </span>
                  {isPast && (
                    <span className="text-[9px] text-accent/50 font-mono">DONE</span>
                  )}
                </div>
                <div className="text-[10px] text-gray-500 mb-2 truncate">{stepLabels[s]}</div>
                <div className="h-0.5 bg-white/[0.03] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent/40 rounded-full transition-all duration-500"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Step 1: Number Discovery */}
      {step === 1 && (
        <div className="space-y-4 animate-fade-in">
          <div className="glass-card rounded-xl p-5 border-glow">
            <div className="flex items-center justify-between mb-4">
              <div>
                <label className="label mb-0">Number Discovery</label>
                <p className="text-[11px] text-gray-600 mt-0.5">
                  Identify at least 3 numbers to continue. First hint is free!
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-accent">{correctNumbers}/{numberEntries.length} decoded</span>
                {visibleNumbers < numberEntries.length && (
                  <button
                    onClick={() => setVisibleNumbers(prev => Math.min(prev + 3, numberEntries.length))}
                    className="btn-ghost text-xs"
                  >
                    Show More
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {numberEntries.slice(0, visibleNumbers).map(([num, word]) => {
                const state = numberStates[word]
                return (
                  <div
                    key={num}
                    className={`glass-inner rounded-xl p-4 transition-all ${
                      state.status === 'correct'
                        ? 'border border-accent/20 shadow-[0_0_8px_rgba(0,230,118,0.06)]'
                        : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="font-mono text-sm text-gray-200">{word}</span>
                      {state.status === 'correct' && (
                        <span className="badge-confirmed text-[9px]">DECODED</span>
                      )}
                    </div>

                    {/* Hint display */}
                    {state.hintLevel > 0 && state.status !== 'correct' && (
                      <div className="mb-2 p-2 rounded-lg bg-accent/[0.04] border border-accent/10">
                        <p className="text-[10px] text-accent/70 font-mono">
                          {getNumberHint(num, word, state.hintLevel)}
                        </p>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={state.guess}
                        onChange={(e) => handleNumberGuess(word, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && state.guess.trim()) handleNumberCheck(word, num)
                        }}
                        placeholder="Your guess..."
                        disabled={state.status === 'correct'}
                        className="input flex-1 text-xs py-1.5"
                      />
                      {state.status !== 'correct' ? (
                        <>
                          <button
                            onClick={() => handleNumberCheck(word, num)}
                            disabled={!state.guess.trim()}
                            className="btn-primary text-xs py-1.5 px-2.5"
                          >
                            Check
                          </button>
                          <button
                            onClick={() => (state.hintLevel >= 3 ? handleNumberReveal(word, num) : handleNumberHint(word))}
                            disabled={state.hintLevel >= 3}
                            className="btn-ghost text-xs py-1.5 px-2"
                            title={state.hintLevel === 0 ? 'First hint is free!' : `Hint ${state.hintLevel + 1}/3`}
                          >
                            {state.hintLevel === 0 ? 'Hint' : state.hintLevel < 3 ? `Hint ${state.hintLevel + 1}` : 'Reveal'}
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-accent font-mono self-center flex-shrink-0 animate-lock-in">
                          = {num}
                        </span>
                      )}
                    </div>
                    {state.status === 'wrong' && (
                      <p className="text-[11px] text-red-400/70 mt-1.5">Try again or use a hint!</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Proceed button */}
          {canProceedToStep2 && (
            <div className="flex justify-end animate-fade-in">
              <button
                onClick={() => setStep(2)}
                className="btn-primary px-5 py-2.5 flex items-center gap-2"
              >
                Continue to Vocabulary
                <span className="text-accent/60">&rarr;</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Word Mapping */}
      {step === 2 && (
        <div className="space-y-4 animate-fade-in">
          <div className="glass-card rounded-xl p-5 border-glow">
            <div className="flex items-center justify-between mb-4">
              <div>
                <label className="label mb-0">Word Mapping</label>
                <p className="text-[11px] text-gray-600 mt-0.5">
                  Map alien words to their meanings. Hints show part-of-speech and context.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-accent">{correctVocab}/{vocab.length} mapped</span>
                {visibleVocab < vocab.length && (
                  <button
                    onClick={() => setVisibleVocab(prev => Math.min(prev + 5, vocab.length))}
                    className="btn-ghost text-xs"
                  >
                    Show More
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {vocab.slice(0, visibleVocab).map(v => {
                const state = vocabStates[v.alien]
                return (
                  <div
                    key={v.alien}
                    className={`glass-inner rounded-xl p-4 transition-all ${
                      state.status === 'correct'
                        ? 'border border-accent/20 shadow-[0_0_8px_rgba(0,230,118,0.06)]'
                        : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-sm text-gray-200">{v.alien}</span>
                        <SpeakButton text={v.alien} />
                      </div>
                      {state.status === 'correct' ? (
                        <span className="badge-confirmed text-[9px]">DECODED</span>
                      ) : (
                        <span className="text-[10px] text-gray-700 font-mono">{v.pos}</span>
                      )}
                    </div>

                    {/* Hint display */}
                    {state.hintLevel > 0 && state.status !== 'correct' && (
                      <div className="mb-2 p-2 rounded-lg bg-accent/[0.04] border border-accent/10">
                        <p className="text-[10px] text-accent/70 font-mono">
                          {getVocabHint(v, state.hintLevel)}
                        </p>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={state.guess}
                        onChange={(e) => handleVocabGuess(v.alien, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && state.guess.trim()) handleVocabCheck(v.alien, v.english, v.pos)
                        }}
                        placeholder="Meaning?"
                        disabled={state.status === 'correct'}
                        className="input flex-1 text-xs py-1.5"
                      />
                      {state.status !== 'correct' ? (
                        <>
                          <button
                            onClick={() => handleVocabCheck(v.alien, v.english, v.pos)}
                            disabled={!state.guess.trim()}
                            className="btn-primary text-xs py-1.5 px-2.5"
                          >
                            Check
                          </button>
                          <button
                            onClick={() => (state.hintLevel >= 3 ? handleVocabReveal(v.alien, v.english, v.pos) : handleVocabHint(v.alien))}
                            disabled={state.hintLevel >= 3}
                            className="btn-ghost text-xs py-1.5 px-2"
                          >
                            {state.hintLevel === 0 ? 'Hint' : state.hintLevel < 3 ? `Hint ${state.hintLevel + 1}` : 'Reveal'}
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-accent font-mono self-center flex-shrink-0 animate-lock-in">
                          = {v.english}
                        </span>
                      )}
                    </div>
                    {state.status === 'wrong' && (
                      <p className="text-[11px] text-red-400/70 mt-1.5">Not quite. Try a hint!</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="btn-ghost text-xs px-4 py-2">
              &larr; Back to Numbers
            </button>
            {canProceedToStep3 && (
              <button
                onClick={() => setStep(3)}
                className="btn-primary px-5 py-2.5 flex items-center gap-2 animate-fade-in"
              >
                Continue to Sentences
                <span className="text-accent/60">&rarr;</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Sentence Decoding */}
      {step === 3 && (
        <div className="space-y-4 animate-fade-in">
          <div className="glass-card rounded-xl p-5 border-glow">
            <div className="flex items-center justify-between mb-4">
              <div>
                <label className="label mb-0">Sentence Decoding</label>
                <p className="text-[11px] text-gray-600 mt-0.5">
                  Translate sentences using your decoded vocabulary. Known words are highlighted.
                </p>
              </div>
              <span className="text-xs font-mono text-accent">
                {decodedSentences}/{sentences.length} decoded
              </span>
            </div>

            {/* Sentence navigation */}
            <div className="flex items-center gap-2 mb-4">
              {sentences.map((_, i) => {
                const result = sentenceResults[i]
                return (
                  <button
                    key={i}
                    onClick={() => setCurrentSentenceIdx(i)}
                    className={`w-7 h-7 rounded-lg text-[10px] font-mono transition-all border ${
                      currentSentenceIdx === i
                        ? 'border-accent/30 bg-accent/10 text-accent'
                        : result === 'correct'
                          ? 'border-accent/20 bg-accent/[0.04] text-accent/60'
                          : result === 'revealed'
                            ? 'border-accent/10 bg-accent/[0.02] text-accent/40'
                            : 'border-white/[0.04] text-gray-600 hover:text-gray-400'
                    }`}
                  >
                    {i + 1}
                  </button>
                )
              })}
            </div>

            {/* Current sentence */}
            {(() => {
              const s = sentences[currentSentenceIdx]
              const result = sentenceResults[currentSentenceIdx]
              const isWordMode = sentenceWordMode[currentSentenceIdx]
              const words = tokenizeSentence(s.alien)

              return (
                <div className={`glass-inner rounded-xl p-5 transition-all ${
                  result === 'correct' || result === 'revealed'
                    ? 'border border-accent/20 shadow-[0_0_8px_rgba(0,230,118,0.06)]'
                    : ''
                }`}>
                  {/* Sentence with word highlighting */}
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <SpeakButton text={s.alien} title="Hear sentence" />
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {words.map((word, wi) => {
                        const known = isWordKnown(word)
                        return (
                          <span
                            key={wi}
                            className={`font-mono text-sm px-1.5 py-0.5 rounded ${
                              known
                                ? 'text-accent bg-accent/[0.06] border border-accent/10'
                                : 'text-red-400/80 bg-red-400/[0.04] border border-red-400/10'
                            }`}
                            title={known ? `Known: ${knownWords[word]}` : 'Unknown word'}
                          >
                            {word}
                          </span>
                        )
                      })}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 text-[10px] text-gray-600">
                        <span className="w-2 h-2 rounded-full bg-accent/30" /> Known
                        <span className="w-2 h-2 rounded-full bg-red-400/30 ml-2" /> Unknown
                      </div>
                    </div>
                  </div>

                  {result !== 'correct' && result !== 'revealed' && (
                    <>
                      {/* Toggle word-by-word */}
                      <div className="flex items-center gap-2 mb-3">
                        <button
                          onClick={() => toggleWordByWord(currentSentenceIdx)}
                          className={`text-[10px] px-2.5 py-1 rounded-lg border transition-all ${
                            isWordMode
                              ? 'border-accent/20 bg-accent/[0.06] text-accent'
                              : 'border-white/[0.04] text-gray-500 hover:text-gray-400'
                          }`}
                        >
                          Word-by-word mode
                        </button>
                        <button
                          onClick={() => {
                            if (isWordMode) toggleWordByWord(currentSentenceIdx)
                          }}
                          className={`text-[10px] px-2.5 py-1 rounded-lg border transition-all ${
                            !isWordMode
                              ? 'border-accent/20 bg-accent/[0.06] text-accent'
                              : 'border-white/[0.04] text-gray-500 hover:text-gray-400'
                          }`}
                        >
                          Full translation
                        </button>
                      </div>

                      {isWordMode ? (
                        /* Word-by-word mode */
                        <div className="space-y-2">
                          {words.map((word, wi) => {
                            const key = `${currentSentenceIdx}-${wi}`
                            const known = isWordKnown(word)
                            const wordState = sentenceWordStates[key]
                            const meaning = findWordMeaning(word)

                            if (known) {
                              return (
                                <div key={key} className="flex items-center gap-2 text-xs">
                                  <span className="font-mono text-accent w-24 truncate">{word}</span>
                                  <span className="text-gray-600">=</span>
                                  <span className="text-accent/70 font-mono">{knownWords[word]}</span>
                                  <span className="badge-confirmed text-[8px] ml-auto">KNOWN</span>
                                </div>
                              )
                            }

                            return (
                              <div key={key} className="flex items-center gap-2">
                                <span className="font-mono text-xs text-red-400/80 w-24 truncate flex-shrink-0">{word}</span>
                                <input
                                  type="text"
                                  value={wordState?.guess || ''}
                                  onChange={(e) => handleSentenceWordGuess(key, e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && wordState?.guess.trim()) handleSentenceWordCheck(key, word)
                                  }}
                                  placeholder="?"
                                  disabled={wordState?.status === 'correct'}
                                  className="input text-xs py-1 flex-1"
                                />
                                {wordState?.status === 'correct' ? (
                                  <span className="text-[10px] text-accent font-mono animate-lock-in">= {meaning}</span>
                                ) : (
                                  <button
                                    onClick={() => handleSentenceWordCheck(key, word)}
                                    disabled={!wordState?.guess?.trim()}
                                    className="btn-ghost text-[10px] py-1 px-2"
                                  >
                                    Check
                                  </button>
                                )}
                                {wordState?.status === 'wrong' && (
                                  <span className="text-[9px] text-red-400/60">x</span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        /* Full translation mode */
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={sentenceGuesses[currentSentenceIdx] || ''}
                            onChange={(e) => handleSentenceGuess(currentSentenceIdx, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && (sentenceGuesses[currentSentenceIdx] || '').trim()) {
                                handleSentenceCheck(currentSentenceIdx)
                              }
                            }}
                            placeholder="Translate this sentence..."
                            className="input flex-1 text-xs py-1.5"
                          />
                          <button
                            onClick={() => handleSentenceCheck(currentSentenceIdx)}
                            disabled={!(sentenceGuesses[currentSentenceIdx] || '').trim()}
                            className="btn-primary text-xs py-1.5 px-2.5"
                          >
                            Check
                          </button>
                          <button
                            onClick={() => handleSentenceReveal(currentSentenceIdx)}
                            className="btn-ghost text-xs py-1.5 px-2"
                          >
                            Reveal
                          </button>
                        </div>
                      )}
                    </>
                  )}

                  {(result === 'correct' || result === 'revealed') && (
                    <div className="animate-lock-in">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={result === 'correct' ? 'badge-confirmed text-[9px]' : 'badge-probable text-[9px]'}>
                          {result === 'correct' ? 'DECODED' : 'REVEALED'}
                        </span>
                      </div>
                      <p className="text-xs text-accent font-mono">{s.english}</p>
                    </div>
                  )}

                  {/* Navigate to next sentence */}
                  {(result === 'correct' || result === 'revealed') && currentSentenceIdx < sentences.length - 1 && (
                    <button
                      onClick={() => setCurrentSentenceIdx(prev => prev + 1)}
                      className="btn-ghost text-xs mt-3"
                    >
                      Next sentence &rarr;
                    </button>
                  )}
                </div>
              )
            })()}
          </div>

          {/* Navigation */}
          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="btn-ghost text-xs px-4 py-2">
              &larr; Back to Vocabulary
            </button>
            {canProceedToStep4 && (
              <button
                onClick={() => setStep(4)}
                className="btn-primary px-5 py-2.5 flex items-center gap-2 animate-fade-in"
              >
                Continue to Grammar
                <span className="text-accent/60">&rarr;</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Step 4: Grammar Revelation */}
      {step === 4 && (
        <div className="space-y-4 animate-fade-in">
          <div className="glass-card rounded-xl p-5 border-glow">
            <div className="flex items-center justify-between mb-4">
              <div>
                <label className="label mb-0">Grammar Revelation</label>
                <p className="text-[11px] text-gray-600 mt-0.5">
                  Reveal the hidden grammar rules one by one. See how they explain the patterns you observed.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-accent">
                  {totalRulesRevealed}/{conlang.rules.length} revealed
                </span>
                {totalRulesRevealed < conlang.rules.length && (
                  <button onClick={handleRevealAllRules} className="btn-ghost text-xs">
                    Reveal All
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {conlang.rules.map((rule, i) => {
                const isRevealed = revealedRules.includes(i)
                const isRevealing = revealingRule === i

                return (
                  <div
                    key={i}
                    className={`glass-inner rounded-xl p-4 transition-all duration-500 border ${
                      isRevealed
                        ? 'border-accent/20 shadow-[0_0_8px_rgba(0,230,118,0.06)]'
                        : isRevealing
                          ? 'border-accent/40 shadow-[0_0_16px_rgba(0,230,118,0.12)]'
                          : 'border-white/[0.03]'
                    }`}
                  >
                    {isRevealing && (
                      <div className="scan-overlay rounded-xl" />
                    )}

                    {isRevealed ? (
                      <div className="animate-lock-in">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="badge-confirmed text-[9px]">RULE {i + 1}</span>
                        </div>
                        <p className="text-sm text-gray-200">{rule}</p>
                        <p className="text-[10px] text-gray-600 mt-2 italic">
                          {i === 0 && `This explains the ${conlang.word_order} word order you observed in the sentences.`}
                          {i === 1 && 'Notice how this pattern appeared across multiple sentences you decoded.'}
                          {i === 2 && 'This rule explains why certain words always appeared in specific positions.'}
                          {i > 2 && 'This pattern was hidden in the sentence structures you analyzed.'}
                        </p>
                      </div>
                    ) : isRevealing ? (
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full border-2 border-accent/40 border-t-accent animate-spin" />
                        <span className="text-xs text-accent/60 font-mono">Analyzing pattern...</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleRevealRule(i)}
                        className="w-full text-left flex items-center gap-3 group"
                      >
                        <div className="w-8 h-8 rounded-lg glass-inner border border-white/[0.04] flex items-center justify-center text-gray-600 group-hover:text-accent group-hover:border-accent/20 transition-all">
                          <span className="text-xs font-mono">{i + 1}</span>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500 group-hover:text-gray-400 transition-colors">
                            Click to reveal grammar rule {i + 1}
                          </span>
                          <span className="text-[10px] text-gray-700 block">Hidden pattern</span>
                        </div>
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex justify-between">
            <button onClick={() => setStep(3)} className="btn-ghost text-xs px-4 py-2">
              &larr; Back to Sentences
            </button>
            {canFinish && (
              <button
                onClick={handleComplete}
                className="btn-primary px-5 py-2.5 flex items-center gap-2 animate-fade-in"
              >
                View Results
                <span className="text-accent/60">&rarr;</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
