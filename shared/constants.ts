import type { PartOfSpeech, LanguageProfile } from './types';

export const CONFIDENCE_THRESHOLDS = {
  CONFIRMED: 76,
  PROBABLE: 41,
  UNKNOWN: 0,
} as const;

export const CONFIDENCE_COLORS = {
  confirmed: { text: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/30' },
  probable: { text: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/30' },
  unknown: { text: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/30' },
} as const;

export const PART_OF_SPEECH_OPTIONS: { value: PartOfSpeech; label: string }[] = [
  { value: 'noun', label: 'Noun' },
  { value: 'verb', label: 'Verb' },
  { value: 'adjective', label: 'Adjective' },
  { value: 'pronoun', label: 'Pronoun' },
  { value: 'number', label: 'Number' },
  { value: 'connector', label: 'Connector' },
  { value: 'particle', label: 'Particle' },
  { value: 'unknown', label: 'Unknown' },
];

export const VOCABULARY_CATEGORIES = [
  'all',
  'number',
  'noun',
  'verb',
  'adjective',
  'pronoun',
  'connector',
  'particle',
  'unknown',
] as const;

export const SOURCE_PRESETS = [
  'Overheard conversation',
  'Written inscription',
  'Radio signal',
  'Direct communication',
  'Text document',
  'Other',
] as const;

export function getConfidenceLevel(confidence: number): 'confirmed' | 'probable' | 'unknown' {
  if (confidence >= CONFIDENCE_THRESHOLDS.CONFIRMED) return 'confirmed';
  if (confidence >= CONFIDENCE_THRESHOLDS.PROBABLE) return 'probable';
  return 'unknown';
}

export function createDefaultProfile(): Omit<LanguageProfile, 'id' | 'created_at' | 'updated_at'> {
  return {
    name: '',
    description: '',
    phonetic_notes: '',
    is_sandbox: false,
    dictionary: [],
    grammar_rules: [],
    number_system: { base: null, mappings: {}, operators: {} },
    samples: [],
    audio_clips: [],
  };
}
