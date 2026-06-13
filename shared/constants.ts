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

/** Whitelist the known LanguageProfile data fields from arbitrary input (a request body or a
 *  previously-saved file), dropping unknown keys and coercing each field to a safe shape.
 *  Excludes id/created_at/updated_at, which the store manages. */
export function pickProfileData(
  input: Partial<LanguageProfile>,
): Omit<LanguageProfile, 'id' | 'created_at' | 'updated_at'> {
  const d = createDefaultProfile();
  const ns = input.number_system;
  return {
    name: typeof input.name === 'string' ? input.name : d.name,
    description: typeof input.description === 'string' ? input.description : d.description,
    phonetic_notes: typeof input.phonetic_notes === 'string' ? input.phonetic_notes : d.phonetic_notes,
    is_sandbox: typeof input.is_sandbox === 'boolean' ? input.is_sandbox : d.is_sandbox,
    ...(input.sandbox_difficulty ? { sandbox_difficulty: input.sandbox_difficulty } : {}),
    dictionary: Array.isArray(input.dictionary) ? input.dictionary : d.dictionary,
    grammar_rules: Array.isArray(input.grammar_rules) ? input.grammar_rules : d.grammar_rules,
    number_system:
      ns && typeof ns === 'object'
        ? {
            base: typeof ns.base === 'number' ? ns.base : null,
            mappings: ns.mappings && typeof ns.mappings === 'object' ? ns.mappings : {},
            operators: ns.operators && typeof ns.operators === 'object' ? ns.operators : {},
          }
        : d.number_system,
    samples: Array.isArray(input.samples) ? input.samples : d.samples,
    audio_clips: Array.isArray(input.audio_clips) ? input.audio_clips : d.audio_clips,
  };
}
