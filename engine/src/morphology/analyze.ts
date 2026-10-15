import type { DictionaryEntry } from '../../../shared/types.js';
import { normalize } from '../text/normalize.js';
import { graphemes, sourceSpan, type SourceSpan } from '../text/spans.js';
import { sensesOf } from '../lexicon/senses.js';
import { Budget, LIMITS, type Grammar, type Lexeme, type DerivationStep } from '../grammar/ast.js';

export interface MorphAnalysis { lexeme: Lexeme; entry: DictionaryEntry; plural: boolean; tense: 'present' | 'past' | 'future'; steps: DerivationStep[] }
export function lexicalForms(dictionary: readonly DictionaryEntry[], grammar: Grammar, budget: Budget) {
  budget.cap(dictionary.length, LIMITS.dictionary, 'Dictionary');
  const index = new Map<string, DictionaryEntry[]>();
  for (const entry of dictionary) {
    budget.tick();
    for (const form of [entry.alien_word, ...(entry.form_aliases ?? [])]) {
      budget.tick();
      budget.cap(form.length, LIMITS.form, 'Dictionary form length');
      const key = normalize(form.trim(), grammar.policy), existing = index.get(key) ?? [];
      if (!existing.some(old => old.id === entry.id)) existing.push(entry);
      index.set(key, existing);
    }
  }
  return index;
}

export function englishLemma(meaning: string, pos: string): string | undefined {
  const lemma = meaning.trim().replace(pos === 'verb' ? /^to\s+/i : /$^/, '');
  // Prose/slash glosses are not silently converted into executable meanings.
  return /^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/.test(lemma) && (pos !== 'verb' || /^[a-z]+$/i.test(lemma)) ? lemma : undefined;
}

export function analyzeMorphology(source: string, token: SourceSpan, grammar: Grammar, index: Map<string, DictionaryEntry[]>, budget: Budget): MorphAnalysis[] {
  const out: MorphAnalysis[] = [];
  const visit = (span: SourceSpan, plural: boolean, tense: MorphAnalysis['tense'], steps: DerivationStep[], depth: number) => {
    budget.tick();
    for (const entry of index.get(normalize(span.text, grammar.policy)) ?? []) {
      budget.tick();
      const pos = entry.part_of_speech;
      if (!['noun', 'pronoun', 'verb', 'adjective'].includes(pos) || (plural && pos !== 'noun') || (tense !== 'present' && pos !== 'verb')) continue;
      for (const sense of sensesOf(entry)) {
        budget.tick();
        budget.cap(sense.meaning.length, LIMITS.form, 'Lexical meaning length');
        const lemma = englishLemma(sense.meaning, pos);
        if (!lemma) continue;
        out.push({ lexeme: { entryId: entry.id, sense: sense.sense, lemma, pos: pos as Lexeme['pos'] }, entry, plural, tense,
          steps: [{ ...span, operation: 'lexical stem', entryId: entry.id, sense: sense.sense }, ...steps] });
        budget.cap(out.length, LIMITS.analyses, 'Morphological candidates');
      }
    }
    if (depth >= LIMITS.morphologyDepth) return;
    const boundaries = graphemes(span.text).map(g => g.start).concat(span.text.length);
    for (const rule of grammar.rules) {
      budget.tick();
      const ast = rule.ast;
      if (ast.kind !== 'plural-affix' && ast.kind !== 'tense-affix') continue;
      if ((ast.kind === 'plural-affix' && plural) || (ast.kind === 'tense-affix' && tense !== 'present')) continue;
      for (const split of boundaries.slice(1, -1)) {
        budget.tick();
        const affixStart = ast.position === 'prefix' ? 0 : split, affixEnd = ast.position === 'prefix' ? split : span.text.length;
        if (normalize(span.text.slice(affixStart, affixEnd), grammar.policy) !== normalize(ast.affix, grammar.policy)) continue;
        const stem = sourceSpan(source, span.start + (ast.position === 'prefix' ? split : 0), span.start + (ast.position === 'prefix' ? span.text.length : split));
        const affixSpan = sourceSpan(source, span.start + affixStart, span.start + affixEnd);
        visit(stem, ast.kind === 'plural-affix' || plural, ast.kind === 'tense-affix' ? ast.tense : tense,
          [{ ...affixSpan, operation: ast.kind, ruleId: rule.id }, ...steps], depth + 1);
      }
    }
  };
  visit(token, false, 'present', [], 0);
  return out;
}
