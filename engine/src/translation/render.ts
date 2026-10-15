import type { MeaningTree, Nominal } from '../grammar/ast.js';

const pronouns: Record<string, { subject: string; object: string; third: boolean }> = {
  i: { subject: 'I', object: 'me', third: false }, you: { subject: 'you', object: 'you', third: false },
  he: { subject: 'he', object: 'him', third: true }, she: { subject: 'she', object: 'her', third: true },
  it: { subject: 'it', object: 'it', third: true }, we: { subject: 'we', object: 'us', third: false }, they: { subject: 'they', object: 'them', third: false },
};
const irregular: Record<string, string> = { person: 'people', child: 'children', man: 'men', woman: 'women', mouse: 'mice', foot: 'feet', tooth: 'teeth', sheep: 'sheep', fish: 'fish' };
export function pluralize(lemma: string): string {
  const words = lemma.split(' '), last = words.pop()!;
  const plural = (Object.hasOwn(irregular, last) ? irregular[last] : undefined) ?? (/[^aeiou]y$/i.test(last) ? last.slice(0, -1) + 'ies' : /(?:s|x|z|ch|sh)$/i.test(last) ? last + 'es' : last + 's');
  return [...words, plural].join(' ');
}
function nominalText(nominal: Nominal, role: 'subject' | 'object'): string | undefined {
  if (nominal.head.pos === 'pronoun') return pronouns[nominal.head.lemma.toLowerCase()]?.[role];
  const noun = nominal.plural ? nominal.englishPlural ?? pluralize(nominal.head.lemma) : nominal.head.lemma;
  return ['the', ...nominal.adjectives.map(a => a.lemma), noun].join(' ');
}
/** Controlled English uses auxiliaries to avoid inventing irregular verb inflections. */
export function renderEnglish(tree: MeaningTree): { status: 'rendered'; text: string } | { status: 'unsupported'; reason: string } {
  if (tree.kind === 'nominal') {
    const text = nominalText(tree.nominal, 'subject');
    return text ? { status: 'rendered', text } : { status: 'unsupported', reason: 'Pronoun is outside the controlled English renderer.' };
  }
  if (['be', 'can', 'could', 'may', 'might', 'must', 'shall', 'should', 'will', 'would', 'ought'].includes(tree.verb.lemma.toLowerCase()))
    return { status: 'unsupported', reason: 'Copular and modal predicates are outside the controlled English renderer.' };
  const subject = nominalText(tree.subject, 'subject'), object = tree.object ? nominalText(tree.object, 'object') : undefined;
  if (!subject || (tree.object && !object)) return { status: 'unsupported', reason: 'Pronoun is outside the controlled English renderer.' };
  const third = tree.subject.head.pos === 'pronoun' ? pronouns[tree.subject.head.lemma.toLowerCase()].third : !tree.subject.plural;
  const auxiliary = tree.tense === 'past' ? 'did' : tree.tense === 'future' ? 'will' : third ? 'does' : 'do';
  return { status: 'rendered', text: [subject, auxiliary, ...(tree.negated ? ['not'] : []), tree.verb.lemma, ...(object ? [object] : [])].join(' ') };
}
