# Executable typed grammar

W17 adds a bounded symbolic parser to the workbench. A typed rule can license a previously unseen surface form or determine semantic roles in a clause. It is a manually configured grammar interpreter, not a learned decipherment system. The W15 research baselines remain frozen and separate.

## Working with rules

Grammar records retain their prose, evidence and optional user belief. **Notebook prose only** never executes. The structured editor supports:

| Rule | Licensed operation |
| --- | --- |
| Plural affix | One nonempty prefix or suffix on a noun |
| Tense affix | One nonempty past or future prefix or suffix on a verb |
| Negation marker | One separate token immediately before or after a verb |
| Adjective placement | Up to two adjective tokens before or after a noun |
| Clause order | SVO, SOV or VSO with one or two arguments; O is omitted for one-argument clauses |

The affix includes its separator: `-en` and `en` are different rules. The editor validates fields and offers a preview using the saved grammar plus the unsaved new rule. The inspector can update a saved rule's executable representation or return it to notebook-only mode. Neither a successful preview nor a cited example establishes linguistic accuracy.

Vocabulary records specify parts of speech. A verb must also have an explicit **Verb argument frame**: subject only or subject and object. Unspecified verbs do not form executable clauses. The frame belongs to the dictionary entry; different frames for different senses currently require separate entries. An optional **English plural override** handles noun forms such as `oxen`.

## Concrete derivations

For a dictionary containing `nesh = star`, `kor = stone`, `ka = I`, `shu = large` and `lor = to see`, licensed suffix `-en` applies to `kor-en` even when that plural is absent from the dictionary. The analysis cites the `kor` entry and plural rule separately. With transitive `lor`, SOV order, an after-noun adjective rule, before-verb `ix`, and past prefix `pa-`:

```
ka nesh-en shu ix pa-lor
subject: I
object: large stars
predicate: see, past, negated
controlled English: I did not see the large stars
```

Changing subject/object order changes the meaning tree. The engine does not recover roles by reordering a completed string of English glosses. `nesh ka lor` yields a star as subject and the speaker as object. Noun phrases can also stand alone: `nesh-en` yields a plural nominal and `the stars`.

Every candidate contains dictionary entry and sense references, a meaning tree, applied rule IDs and a sequence of original UTF-16 source spans. Affix and stem spans remain distinct, including decomposed Unicode accents. Morphology uses the W16 NFC/case comparison policy without replacing the source string.

## Execution and limits

The interpreter compiles strict data records into five rule variants. No `eval`, generated code, prose interpretation or model request is involved. It builds normalized lexical bindings, explores licensed affix removal, fills a small span chart for noun/verb phrases, and combines those spans according to licensed clause roles. Whole lexical forms and derived forms compete; a memorized `nesh-en` entry does not suppress a plural analysis from `nesh`.

Default hard bounds are 2,048 source characters, 16 whitespace-delimited tokens, 64 grammar records, 5,000 dictionary entries, 512 characters per indexed form or matched meaning, 32 morphological analyses per token, 32 candidates per chart region/final output, two morphology steps and two adjectives. The aggregate 4,096-operation budget can stop a run before the individual maximums are reached, including during index construction. Morphological features cannot be applied repeatedly: this version licenses a noun plural or verb tense, not arbitrary affix chains.

Results explicitly distinguish `resolved`, `ambiguous`, `unresolved`, `limit` and `invalid-grammar`. Resolved means one complete derivation under the asserted grammar. It is not a calibrated confidence or real-world correctness claim. Distinct derivations remain ambiguous even when they happen to produce the same English text. If a search bound is reached, no partial result is promoted to a unique answer.

The grammar parser requires user-supplied whitespace boundaries. Dictionary segmentation from W16 still applies to lexical lookup, but is not a hidden segmentation oracle for clause parsing. One terminal `.`, `!` or `?` is allowed; internal punctuation, extra clauses, connectors, prepositional roles, questions, copular structures, numeric quantities, infixes and general agreement are outside this first grammar. It consumes the complete supported input instead of dropping unknown tails.

## English and reverse generation

The Translation screen labels **Lexical gloss**, **Symbolic translation** and **AI Translation** separately. Symbolic analysis is an explicit action. Editing the source marks the old result as stale; changing grammar/dictionary data re-evaluates a submitted analysis. Failure never triggers the model.

The English renderer is deliberately controlled. Ordinary predicates use `do/does`, `did` or `will` plus the lexical base verb, and optional `not`, avoiding guessed irregular past forms. Nouns use regular plural spelling, a small documented-in-code irregular list, or an explicit plural override. This is not a general English inflection library. The seven supported pronoun meanings are I, you, he, she, it, we and they, with subject/object forms. Unsupported pronouns and copular/modal predicates receive a separate rendering failure. Slash/prose glosses are not split to invent lexical meanings; choose explicit senses before execution.

Each candidate offers **Reverse generation from this meaning**. This takes the typed meaning tree, verifies its lexical references against the current dictionary, and enumerates licensed canonical alien forms and orders. It returns generated-text spans and rule IDs, with explicit missing-rule, invalid-reference and limit states. It does not parse arbitrary English prose. The existing English-to-alien field remains lexical phrase substitution. Reverse generation uses single-token canonical alien forms; multi-token dictionary entries and irregular alien forms need later rule support.

## Demo and persistence

New Eridian profiles use `eridian-demo-3`. The plural, negation, adjective and clause rules were manually supplied, along with selected explicit senses and verb frames. Existing saved demo profiles are not overwritten. The historical prose samples remain teaching material; `vel tor krash` and `ka ven zo` remain unsupported by this parser rather than being forced into a transitive clause. Selecting a demo sense is a manual corpus definition, not discovered knowledge.

Optional `executable`, `verb_frame` and `english_plural` fields extend profile version 2. Typed mutations, JSON language-field import and `.xeno` archives preserve them. Blank affixes and unsupported structures fail shared runtime validation. Archive restoration remaps owning rule/entry IDs; derivations are recomputed rather than saved with stale references. Older strict-schema versions may reject the new fields.

## Verification boundary

The grammar tests exercise unseen plural stems, both tense affix directions, negation placement, adjective order, SVO/SOV/VSO roles, subject/object reversal, lexical/morphological ambiguity, source spans, unsupported syntax, English overrides, search limits and reverse-generation round trips. Archive integration checks restored execution against remapped IDs and rejects malformed rules without modifying stored state. Browser tests exercise editor validation, unsaved preview, save/reload, notebook conversion, derived meaning and zero model calls. The independent installer harness requires a plural/past/negated SOV derivation and reverse generation, plus preservation of typed grammar and dictionary frames through archives.

These are bounded interpreter acceptance tests, not a held-out induction benchmark or a claim of natural-language coverage. W18 will address learning rules from grounded observations. See [implementation progress](implementation-progress.md) for the exact tested revision and completed CI evidence.
