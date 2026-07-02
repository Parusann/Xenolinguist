export const PHASES = [
  { id: 'samples', label: 'Samples', icon: '{}', desc: 'Input & collect language samples' },
  { id: 'numbers', label: 'Numbers', icon: '#', desc: 'Decode the number system' },
  { id: 'vocabulary', label: 'Vocabulary', icon: 'Aa', desc: 'Map words to meanings' },
  { id: 'grammar', label: 'Grammar', icon: '⟨⟩', desc: 'Analyze structure & rules' },
  { id: 'translation', label: 'Translation', icon: '⇄', desc: 'Live translation engine' },
  { id: 'dashboard', label: 'Dashboard', icon: '◈', desc: 'Progress & export' },
] as const

export type PhaseId = 'sandbox' | 'samples' | 'numbers' | 'vocabulary' | 'grammar' | 'translation' | 'dashboard'
