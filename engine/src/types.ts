/** Shared domain contract. No seeds, lexicons or compiler implementations belong in learner inputs. */
export type Noun = 'bird' | 'robot' | 'fox' | 'child';
export type Action = 'see' | 'follow' | 'help';
export type Attribute = 'red' | 'small';
export interface Entity { noun: Noun; count: number; attributes: Attribute[] }
export interface Clause { agent: Entity; action: Action; patient: Entity; tense: 'present' | 'past' | 'future'; negated: boolean }
export interface Meaning { clauses: Clause[] }
export type Family = 'SVO' | 'SOV' | 'VSO';
export interface Observation { id: string; utterance: string; english: string; scene: Meaning }
export interface Challenge { id: string; utterance: string }
export interface LearnerInput { version: 'xeno-generator-1'; observations: Observation[]; challenges: Challenge[] }
export interface LanguageSpec {
  version: 'xeno-generator-1'; seed: number; phonemes: readonly string[];
  family: Family; adjectivePlacement: 'before' | 'after'; numberBase: number;
  features: { plural: boolean; tense: boolean; negation: boolean };
  ambiguity: 'none' | 'noun-homophone'; lexicon: Record<string, string>;
}
