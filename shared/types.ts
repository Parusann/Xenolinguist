import type { lexicalPolicySchema, lexicalSenseSchema } from './schemas/lexicon.js';
import type { z } from 'zod';
import type { executableRuleSchema } from './schemas/grammar.js';
export type ExecutableRule = z.infer<typeof executableRuleSchema>;
import type { dictionaryEntrySchema, grammarRuleSchema, numberSystemSchema, audioClipSchema, audioSegmentSchema, sampleSchema, profileSchema } from './schemas/profile';

export type DictionaryEntry = z.infer<typeof dictionaryEntrySchema>;
export type GrammarRule = z.infer<typeof grammarRuleSchema>;
export type NumberSystem = z.infer<typeof numberSystemSchema>;
export type { NumberObservation, NumberGrammar, NumberExpression } from './schemas/numbers.js';
export type AudioClip = z.infer<typeof audioClipSchema>;
export type AudioSegment = z.infer<typeof audioSegmentSchema>;
export type Sample = z.infer<typeof sampleSchema>;
export type LanguageProfile = z.infer<typeof profileSchema>;
export type ProfileIndex = Pick<LanguageProfile, 'id' | 'name' | 'created_at' | 'updated_at'> & { recovery_error?: string };

export interface SessionLogEntry {
  id: string;
  timestamp: string;
  type: LogEntryType;
  message: string;
  metadata?: Record<string, unknown>;
}

export type PartOfSpeech =
  | 'noun'
  | 'verb'
  | 'adjective'
  | 'pronoun'
  | 'number'
  | 'connector'
  | 'particle'
  | 'unknown';

export type LogEntryType = 'info' | 'ai' | 'success' | 'error' | 'warning';

export type SandboxDifficulty = 'easy' | 'medium' | 'hard';

export type AITask =
  | 'patternAnalysis'
  | 'grammarInference'
  | 'translation'
  | 'conlangGeneration'
  | 'quickSuggest'
  | 'numberAnalysis'
  | 'phoneticAnalysis';

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface OllamaStatus {
  connected: boolean;
  models: string[];
}

export interface SttSegment {
  start: number;   // seconds
  end: number;     // seconds
  text: string;
}

export type SttMode = 'transcription' | 'phonetic-guess';

export interface SttResult {
  language: string;     // ISO code from whisper, e.g. "en"
  languageProb: number; // 0-1; 0 when unknown (not emitted)
  text: string;
  segments: SttSegment[];
  mode: SttMode;
}

/** One phone from the IPA recognizer, time-aligned to the audio via CTC. */
export interface IpaSegment {
  phone: string;
  start: number; // seconds
  end: number;   // seconds
}

/** Result of POST /api/ipa: the joined phone string + per-phone timings. */
export interface IpaResult {
  ipa: string;
  segments: IpaSegment[];
  identity?: { modelId: string; modelSha256: string; alphabet: 'TIMIT ARPABET'; transformers: string; backend: string; node: string };
}
export type LexicalPolicy = z.infer<typeof lexicalPolicySchema>;
export type LexicalSense = z.infer<typeof lexicalSenseSchema>;
