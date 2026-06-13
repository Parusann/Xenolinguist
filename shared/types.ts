export interface DictionaryEntry {
  id: string;
  alien_word: string;
  english_meaning: string;
  part_of_speech: PartOfSpeech;
  confidence: number; // 0-100
  context: string;
  examples: string[];
  notes: string;
  created_at: string;
}

export interface GrammarRule {
  id: string;
  rule: string;
  evidence: string[];
  confidence: number; // 0-100
  created_at: string;
}

export interface NumberSystem {
  base: number | null;
  mappings: Record<number, string>;
  operators: Record<string, string>;
}

export interface AudioClip {
  id: string;
  filename: string;
  duration: number; // seconds
  waveform: number[]; // normalized peak values for visualization
  segments: AudioSegment[];
  created_at: string;
}

export interface AudioSegment {
  id: string;
  start: number; // seconds
  end: number; // seconds
  label: string; // word or phoneme label
  dictionary_entry_id: string | null;
}

export interface Sample {
  id: string;
  alien_text: string;
  english_translation: string | null;
  source: string;
  phonetic_notes: string;
  decoded: boolean;
  audio_id: string | null;
  ipa: string | null;
  created_at: string;
}

export interface LanguageProfile {
  id: string;
  name: string;
  description: string;
  phonetic_notes: string;
  created_at: string;
  updated_at: string;
  is_sandbox: boolean;
  sandbox_difficulty?: SandboxDifficulty;
  dictionary: DictionaryEntry[];
  grammar_rules: GrammarRule[];
  number_system: NumberSystem;
  samples: Sample[];
  audio_clips: AudioClip[];
}

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
  | 'numberAnalysis';

export interface AIRequest {
  task: AITask;
  messages: AIMessage[];
  system?: string;
  model?: string;
  stream?: boolean;
}

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
