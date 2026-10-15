import type { DictionaryEntry, LanguageProfile, LexicalPolicy } from '../../../shared/types.js';
import { DEFAULT_LEXICAL_POLICY, normalize } from '../text/normalize.js';
import { lookupUnits, tokenize, type TextToken } from '../text/tokenize.js';
import { sourceSpan, type SourceSpan } from '../text/spans.js';
import { sensesOf, type SenseAnalysis } from './senses.js';

interface Trie { next: Map<string, Trie>; values: SenseAnalysis[] }
const node = (): Trie => ({ next: new Map(), values: [] });
export interface LexicalAnalysis extends SenseAnalysis, SourceSpan {}
export interface LexicalToken extends TextToken { candidates: LexicalAnalysis[] }

export class LexiconIndex {
  readonly dictionary: readonly DictionaryEntry[];
  readonly policy: LexicalPolicy;
  private forward = node();
  private reverse = node();
  private forms = new Map<string, SenseAnalysis[]>();

  constructor(dictionary: readonly DictionaryEntry[], policy = DEFAULT_LEXICAL_POLICY) {
    this.dictionary = dictionary;
    this.policy = { ...policy };
    for (const entry of dictionary) {
      const senses = sensesOf(entry);
      for (const form of new Set([entry.alien_word, ...(entry.form_aliases ?? [])])) {
        const key = normalize(form.trim(), policy);
        const existing = this.forms.get(key) ?? [];
        for (const sense of senses) if (!existing.some(item => item.entry.id === entry.id && item.sense === sense.sense)) existing.push(sense);
        this.forms.set(key, existing);
        this.insert(this.forward, form, senses, policy);
      }
      for (const sense of senses) {
        // Legacy glosses, including slashes and infinitives, remain whole phrases.
        for (const meaning of [sense.meaning, ...sense.aliases]) this.insert(this.reverse, meaning, [sense], this.reversePolicy());
      }
    }
  }

  private reversePolicy(): LexicalPolicy { return { ...this.policy, segmentation: 'whitespace' }; }
  private key(token: TextToken, policy: LexicalPolicy): string {
    return token.kind === 'space' ? ' ' : normalize(token.text, policy);
  }
  private insert(root: Trie, form: string, values: SenseAnalysis[], policy: LexicalPolicy) {
    if (!form.trim()) return;
    let current = root;
    for (const token of lookupUnits(form.trim(), policy)) {
      const key = this.key(token, policy);
      if (!current.next.has(key)) current.next.set(key, node());
      current = current.next.get(key)!;
    }
    for (const value of values) if (!current.values.some(old => old.entry.id === value.entry.id && old.sense === value.sense)) current.values.push(value);
  }

  lookup(form: string): readonly SenseAnalysis[] { return this.forms.get(normalize(form.trim(), this.policy)) ?? []; }

  search(query: string): DictionaryEntry[] {
    const key = normalize(query, this.policy);
    return this.dictionary.filter(entry => [entry.alien_word, entry.english_meaning, ...(entry.form_aliases ?? []),
      ...sensesOf(entry).flatMap(sense => [sense.meaning, ...sense.aliases])].some(text => normalize(text, this.policy).includes(key)));
  }

  analyze(source: string, direction: 'forward' | 'reverse' = 'forward'): LexicalToken[] {
    const policy = direction === 'forward' ? this.policy : this.reversePolicy();
    const units = lookupUnits(source, policy);
    const root = direction === 'forward' ? this.forward : this.reverse;
    const groups: { start: number; end: number; candidates: LexicalAnalysis[] }[] = [];
    // All matching edges survive. Overlapping edges form an unresolved region; no
    // greedy longest-match or first-record decision can hide a competing analysis.
    for (let i = 0; i < units.length; i++) {
      if (units[i].kind === 'space') continue;
      let current: Trie | undefined = root;
      for (let j = i; j < units.length; j++) {
        current = current.next.get(this.key(units[j], policy));
        if (!current) break;
        if (!current.values.length) continue;
        const span = sourceSpan(source, units[i].start, units[j].end);
        const candidates = current.values.map(value => ({ ...value, ...span }));
        const previous = groups.at(-1);
        if (previous && span.start < previous.end) {
          previous.end = Math.max(previous.end, span.end);
          previous.candidates.push(...candidates);
        } else groups.push({ ...span, candidates });
      }
    }
    const result: LexicalToken[] = [];
    let cursor = 0;
    const unknown = (end: number) => {
      for (const token of tokenize(source.slice(cursor, end), policy)) {
        result.push({ ...token, start: cursor + token.start, end: cursor + token.end, candidates: [] });
      }
    };
    for (const group of groups) {
      unknown(group.start);
      result.push({ ...sourceSpan(source, group.start, group.end), kind: 'word', candidates: group.candidates });
      cursor = group.end;
    }
    unknown(source.length);
    return result;
  }
}

// Weak keys release closed profiles. Revision plus dictionary/policy identities also
// invalidate optimistic edits before the server increments the revision.
const cache = new WeakMap<readonly DictionaryEntry[], { id: string; revision: number; policyKey: string; index: LexiconIndex }>();
export function profileLexicon(profile: Pick<LanguageProfile, 'id' | 'revision' | 'dictionary' | 'lexical_policy'>): LexiconIndex {
  const policy = profile.lexical_policy ?? DEFAULT_LEXICAL_POLICY;
  const policyKey = JSON.stringify(policy);
  const existing = cache.get(profile.dictionary);
  if (existing?.id === profile.id && existing.revision === profile.revision && existing.policyKey === policyKey) return existing.index;
  const index = new LexiconIndex(profile.dictionary, policy);
  cache.set(profile.dictionary, { id: profile.id, revision: profile.revision, policyKey, index });
  return index;
}

export function renderToken(token: LexicalToken, direction: 'forward' | 'reverse' = 'forward'): string {
  if (token.kind !== 'word') return token.text;
  if (!token.candidates.length) return `[${token.text}]`;
  const values = token.candidates.map(candidate => {
    const value = direction === 'forward' ? candidate.meaning : candidate.entry.alien_word;
    return candidate.start === token.start && candidate.end === token.end ? value : `${candidate.text} → ${value}`;
  });
  return values.length === 1 ? values[0] || `[${token.text}]` : `⟦${values.join(' | ')}⟧`;
}
