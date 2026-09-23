import { z } from 'zod';
import type { DictionaryEntry } from '../../../shared/types.js';
import { sensesOf } from '../lexicon/senses.js';
import { englishLemma } from './analyze.js';
import { sourceSpan } from '../text/spans.js';
import { Budget, BudgetExceeded, LIMITS, type Lexeme, type MeaningTree, type Nominal, type DerivationStep } from '../grammar/ast.js';
import { compileGrammar, clauseRoles } from '../grammar/transforms.js';
import type { GrammarProfile } from '../translation/derive.js';

const ref = z.strictObject({ entryId: z.string().min(1).max(128), sense: z.number().int().nonnegative().max(63).nullable(), lemma: z.string().min(1).max(512) });
const nominal = z.strictObject({ head: ref.extend({ pos: z.enum(['noun', 'pronoun']) }), plural: z.boolean(),
  adjectives: z.array(ref.extend({ pos: z.literal('adjective') })).max(LIMITS.adjectives), englishPlural: z.string().min(1).max(128).optional() });
export const meaningTreeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('nominal'), nominal }),
  z.strictObject({ kind: z.literal('clause'), subject: nominal, object: nominal.optional(), verb: ref.extend({ pos: z.literal('verb') }),
    tense: z.enum(['present', 'past', 'future']), negated: z.boolean() }),
]);
export interface Generated { text: string; steps: DerivationStep[]; ruleIds: string[] }
export interface GenerationResult { status: 'resolved' | 'ambiguous' | 'unresolved' | 'limit' | 'invalid'; candidates: Generated[]; diagnostics: string[] }
interface Phrase { text: string; steps: DerivationStep[] }
function join(parts: Phrase[]): Phrase {
  let text = ''; const steps: DerivationStep[] = [];
  for (const part of parts) {
    const offset = text.length + (text ? 1 : 0);
    text += (text ? ' ' : '') + part.text;
    steps.push(...part.steps.map(step => ({ ...step, start: offset + step.start, end: offset + step.end })));
  }
  return { text, steps };
}
export function generate(treeInput: unknown, profile: GrammarProfile): GenerationResult {
  const parsed = meaningTreeSchema.safeParse(treeInput);
  if (!parsed.success) return { status: 'invalid', candidates: [], diagnostics: ['Invalid or unsupported meaning tree.'] };
  const tree = parsed.data as MeaningTree, budget = new Budget();
  try {
    const grammar = compileGrammar(profile.grammar_rules, profile.lexical_policy);
    budget.cap(profile.dictionary.length, LIMITS.dictionary, 'Dictionary');
    const entries = new Map(profile.dictionary.map(entry => [entry.id, entry]));
    const boundEntry = (lexeme: Lexeme): DictionaryEntry => {
      budget.tick();
      const entry = entries.get(lexeme.entryId);
      const sense = entry && sensesOf(entry).find(s => s.sense === lexeme.sense);
      if (!entry || !sense || entry.part_of_speech !== lexeme.pos || englishLemma(sense.meaning, lexeme.pos) !== lexeme.lemma) throw new Error('Meaning tree no longer matches the dictionary. Analyze the source again.');
      if (!entry.alien_word.trim() || /\s/u.test(entry.alien_word.trim())) throw new Error('Generation requires a single-token canonical form.');
      budget.cap(entry.alien_word.length, LIMITS.form, 'Dictionary form length');
      return entry;
    };
    const forms = (lexeme: Lexeme, plural = false, tense: 'present' | 'past' | 'future' = 'present'): Phrase[] => {
      const entry = boundEntry(lexeme), base = entry.alien_word.trim();
      const rules = plural ? grammar.rules.filter(r => r.ast.kind === 'plural-affix') : tense !== 'present' ? grammar.rules.filter(r => r.ast.kind === 'tense-affix' && r.ast.tense === tense) : [null];
      return rules.map(rule => {
        budget.tick();
        const ast = rule?.ast;
        if (ast && ast.kind !== 'plural-affix' && ast.kind !== 'tense-affix') throw new Error('Invalid affix rule');
        const text = ast ? ast.position === 'prefix' ? ast.affix + base : base + ast.affix : base;
        const offset = ast?.position === 'prefix' ? ast.affix.length : 0;
        const steps: DerivationStep[] = [{ ...sourceSpan(text, offset, offset + base.length), operation: 'generated lexical stem', entryId: entry.id, sense: lexeme.sense }];
        if (ast && rule) steps.push({ ...sourceSpan(text, ast.position === 'prefix' ? 0 : base.length, ast.position === 'prefix' ? offset : text.length), operation: ast.kind, ruleId: rule.id });
        return { text, steps };
      });
    };
    const nounPhrases = (value: Nominal): Phrase[] => {
      const head = boundEntry(value.head);
      if (value.englishPlural !== (head.english_plural ?? undefined)) throw new Error('Noun plural metadata changed. Analyze the source again.');
      if (value.head.pos === 'pronoun' && (value.plural || value.adjectives.length)) throw new Error('Pronoun inflection/modification is unsupported.');
      const heads = forms(value.head, value.plural), adjectives = value.adjectives.map(a => forms(a));
      const orders = adjectives.length ? grammar.rules.filter(r => r.ast.kind === 'adjective-order') : [null];
      const result: Phrase[] = [];
      for (const h of heads) for (const order of orders) {
        const expand = (at: number, selected: Phrase[]) => {
          budget.tick();
          if (at < adjectives.length) { for (const adjective of adjectives[at]) expand(at + 1, [...selected, adjective]); return; }
          const phrase = join(order?.ast.kind === 'adjective-order' && order.ast.position === 'before' ? [...selected, h] : [h, ...selected]);
          if (order) phrase.steps.push({ ...sourceSpan(phrase.text, 0, phrase.text.length), operation: 'generated adjective placement', ruleId: order.id });
          result.push(phrase); budget.cap(result.length, LIMITS.candidates, 'Generated noun phrases');
        };
        expand(0, []);
      }
      return result;
    };
    let results: Phrase[] = [];
    if (tree.kind === 'nominal') results = nounPhrases(tree.nominal);
    else {
      const verb = boundEntry(tree.verb), argumentsCount = tree.object ? 2 : 1;
      if (verb.verb_frame !== (tree.object ? 'transitive' : 'intransitive')) throw new Error('Verb argument frame is missing or incompatible.');
      const subjects = nounPhrases(tree.subject), objects = tree.object ? nounPhrases(tree.object) : [null];
      const negations = tree.negated ? grammar.rules.filter(r => r.ast.kind === 'negation') : [null];
      for (const clause of grammar.rules.filter(r => r.ast.kind === 'clause-order' && r.ast.arguments === argumentsCount)) {
        if (clause.ast.kind !== 'clause-order') continue;
        for (const s of subjects) for (const o of objects) for (const v of forms(tree.verb, false, tree.tense)) for (const negation of negations) {
          budget.tick();
          let predicate = v;
          if (negation?.ast.kind === 'negation') {
            const marker: Phrase = { text: negation.ast.marker, steps: [{ ...sourceSpan(negation.ast.marker, 0, negation.ast.marker.length), operation: 'generated negation', ruleId: negation.id }] };
            predicate = join(negation.ast.position === 'before' ? [marker, v] : [v, marker]);
          }
          const roles: Record<string, Phrase> = { S: s, V: predicate, ...(o ? { O: o } : {}) };
          const phrase = join(clauseRoles(clause.ast.order, clause.ast.arguments).map(role => roles[role]));
          phrase.steps.push({ ...sourceSpan(phrase.text, 0, phrase.text.length), operation: 'generated clause order', ruleId: clause.id });
          results.push(phrase); budget.cap(results.length, LIMITS.candidates, 'Generated clauses');
        }
      }
    }
    const candidates = results.map(value => {
      budget.cap(value.text.length, LIMITS.source, 'Generated source length');
      budget.cap(value.text.split(/\s+/u).length, LIMITS.tokens, 'Generated token count');
      return { ...value, ruleIds: [...new Set(value.steps.flatMap(step => step.ruleId ? [step.ruleId] : []))] };
    });
    return { status: candidates.length === 1 ? 'resolved' : candidates.length ? 'ambiguous' : 'unresolved', candidates,
      diagnostics: candidates.length ? [] : ['A required affix, placement or clause rule is missing.'] };
  } catch (error) {
    return { status: error instanceof BudgetExceeded ? 'limit' : 'invalid', candidates: [], diagnostics: [String(error)] };
  }
}
