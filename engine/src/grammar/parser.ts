import { normalize } from '../text/normalize.js';
import { sourceSpan, type SourceSpan } from '../text/spans.js';
import type { MorphAnalysis } from '../morphology/analyze.js';
import { Budget, LIMITS, type Grammar, type Nominal, type Derived, type DerivationStep } from './ast.js';
import { clauseRoles } from './transforms.js';

interface NominalParse { nominal: Nominal; steps: DerivationStep[] }
interface VerbParse { verb: MorphAnalysis; negated: boolean; steps: DerivationStep[] }
export function parseStructure(source: string, tokens: SourceSpan[], analyses: MorphAnalysis[][], grammar: Grammar, budget: Budget): Derived[] {
  const nominals = new Map<string, NominalParse[]>(), verbs = new Map<string, VerbParse[]>();
  const span = (start: number, end: number) => sourceSpan(source, tokens[start].start, tokens[end - 1].end);
  const key = (start: number, end: number) => `${start}:${end}`;
  // A finite span chart: NP -> noun/pronoun, or up to two licensed adjectives + noun.
  for (let start = 0; start < tokens.length; start++) {
    for (let end = start + 1; end <= Math.min(tokens.length, start + LIMITS.adjectives + 1); end++) {
      const values: NominalParse[] = [];
      const orders = end - start === 1 ? [null] : grammar.rules.filter(rule => rule.ast.kind === 'adjective-order');
      for (const order of orders) {
        budget.tick();
        const headIndex = order?.ast.kind === 'adjective-order' && order.ast.position === 'before' ? end - 1 : start;
        const adjectiveIndices = Array.from({ length: end - start }, (_, i) => start + i).filter(i => i !== headIndex);
        for (const head of analyses[headIndex].filter(a => a.lexeme.pos === 'noun' || (a.lexeme.pos === 'pronoun' && !order))) {
          const extend = (at: number, adjectives: MorphAnalysis[]) => {
            budget.tick();
            if (at < adjectiveIndices.length) {
              for (const adjective of analyses[adjectiveIndices[at]].filter(a => a.lexeme.pos === 'adjective')) extend(at + 1, [...adjectives, adjective]);
              return;
            }
            values.push({ nominal: { head: head.lexeme, plural: head.plural, adjectives: adjectives.map(a => a.lexeme), ...(head.entry.english_plural ? { englishPlural: head.entry.english_plural } : {}) },
              steps: [...head.steps, ...adjectives.flatMap(a => a.steps), ...(order ? [{ ...span(start, end), operation: 'adjective placement', ruleId: order.id }] : [])] });
            budget.cap(values.length, LIMITS.candidates, 'Noun phrase candidates');
          };
          extend(0, []);
        }
      }
      nominals.set(key(start, end), values);
    }
    verbs.set(key(start, start + 1), analyses[start].filter(a => a.lexeme.pos === 'verb').map(verb => ({ verb, negated: false, steps: verb.steps })));
    if (start + 1 < tokens.length) {
      const values: VerbParse[] = [];
      for (const rule of grammar.rules) {
        budget.tick();
        if (rule.ast.kind !== 'negation') continue;
        const markerIndex = rule.ast.position === 'before' ? start : start + 1;
        const verbIndex = rule.ast.position === 'before' ? start + 1 : start;
        if (normalize(tokens[markerIndex].text, grammar.policy) !== normalize(rule.ast.marker, grammar.policy)) continue;
        for (const verb of analyses[verbIndex].filter(a => a.lexeme.pos === 'verb')) {
          values.push({ verb, negated: true, steps: [...verb.steps, { ...tokens[markerIndex], operation: 'negation', ruleId: rule.id }] });
          budget.cap(values.length, LIMITS.candidates, 'Verb phrase candidates');
        }
      }
      verbs.set(key(start, start + 2), values);
    }
  }
  const derived: Derived[] = [];
  const add = (candidate: Omit<Derived, 'ruleIds'>) => {
    budget.tick();
    derived.push({ ...candidate, ruleIds: [...new Set(candidate.steps.flatMap(step => step.ruleId ? [step.ruleId] : []))] });
    budget.cap(derived.length, LIMITS.candidates, 'Complete derivations');
  };
  for (const nominal of nominals.get(key(0, tokens.length)) ?? []) add({ tree: { kind: 'nominal', nominal: nominal.nominal }, steps: nominal.steps });
  for (const rule of grammar.rules) {
    budget.tick();
    if (rule.ast.kind !== 'clause-order') continue;
    const ast = rule.ast, roles = clauseRoles(ast.order, ast.arguments);
    const walk = (at: number, roleIndex: number, subject?: NominalParse, object?: NominalParse, predicate?: VerbParse) => {
      budget.tick();
      if (roleIndex === roles.length) {
        if (at !== tokens.length || !subject || !predicate) return;
        const frame = ast.arguments === 1 ? 'intransitive' : 'transitive';
        if (predicate.verb.entry.verb_frame !== frame) return;
        add({ tree: { kind: 'clause', subject: subject.nominal, ...(object ? { object: object.nominal } : {}), verb: predicate.verb.lexeme,
          tense: predicate.verb.tense, negated: predicate.negated }, steps: [...subject.steps, ...(object?.steps ?? []), ...predicate.steps,
            { ...span(0, tokens.length), operation: `${ast.order} clause (${ast.arguments} arguments)`, ruleId: rule.id }] });
        return;
      }
      const role = roles[roleIndex], maxWidth = role === 'V' ? 2 : LIMITS.adjectives + 1;
      for (let end = at + 1; end <= Math.min(tokens.length, at + maxWidth); end++) {
        budget.tick();
        if (role === 'V') for (const value of verbs.get(key(at, end)) ?? []) walk(end, roleIndex + 1, subject, object, value);
        else for (const value of nominals.get(key(at, end)) ?? []) walk(end, roleIndex + 1, role === 'S' ? value : subject, role === 'O' ? value : object, predicate);
      }
    };
    walk(0, 0);
  }
  return derived;
}
