# W22 elicitation evaluation protocol

This experiment measures question selection among supplied finite alternatives. It compares the shipping uniform-disagreement/cost selector with seeded random selection and a fixed curriculum. It does not measure discovery of new grammars, W19 number induction, model quality, human learning or natural-language accuracy. The alternatives, number bases/atoms and grammar lexicon are supplied priors.

## Freeze and partitions

`evaluation/src/elicitation/corpus.ts` declares version `elicitation-experiment-1`. Development seeds are 8100–8105; reserved evaluation seeds are 9200–9211; CI uses 11939. Fixture tests use separate seeds. Each seed supplies two domains and four conditions, producing 48 development cases, 96 evaluation cases and eight CI cases. Every case has six held-out queries disjoint from its answerable question pool. Seed-specific lexical forms are disjoint, but the partitions reuse the same finite structural templates; this is not a test of structural generalization.

The complete implementation, source tests and this protocol must be committed before development or evaluation results are inspected. Run both partitions at that revision, without tuning between them. Any later tuning informed by evaluation results requires fresh reserved cases. The runner rejects dirty tracked files, untracked experiment source, existing output directories and incomplete archives. There is no resume operation: interrupted runs remain incomplete and cannot be reported as complete.

## Cases and controls

Number cases supply six alternatives: four multiplicative combinations of addition order and factor/base order, and two additive orders. Bases cycle through 5, 7, 11 and 13. Eight questions range from atomic forms to multiples and sums. Six withheld targets exercise further composition. Grammar cases supply eight alternatives combining prefix/suffix plural, prefix/suffix past and SVO/SOV order, with fixed future and negation rules. Three lexical anchors ground ten available questions, including singular/plural, tense, role swap and negation. Six held-out clauses combine features.

Each domain has four paired conditions:

- **Regular:** the independent oracle renderer follows one supplied alternative.
- **Costly:** the same forms, with selected informative questions assigned cost four instead of one. Number questions at least twice the base with remainder one cost four; grammar past-clause and plural-subject questions cost four.
- **Withheld irregular:** visible inputs and available answers are identical to regular, but the first two held-out targets have unseen irregular forms. This deliberately tests unobservable exceptions and must retain wrong regularizations.
- **Unavailable:** one additional alternative lacks enough atoms or rules to predict all questions. Missing predictions cannot be treated as contradictions or earn disagreement credit.

Oracle forms come from independent finite renderers, not the engine composer. Tests check these renderers against the intended alternative on separate fixture seeds. There is no model call. Costs are declared synthetic effort units, not measured time or human effort.

## Policies and information boundary

Every policy begins with the same alternatives and uses the same answerable, unobserved, affordable pool. Duplicate candidate aliases collapse before filtering. Only a definite predicted-form mismatch removes an alternative; unavailable or ambiguous predictions remain unresolved. No accepted executable knowledge is rewritten.

The active policy uses the shipping selector's uniform candidate-group entropy divided by cost and its deterministic ties. Random selection samples the available pool using the frozen 32-bit hash and seeds 17, 43, 89, 131 and 197. The fixed curriculum takes the first remaining question in corpus order. Both baselines can ask questions with zero information or unavailable predictions; the active policy can stop when it has no eligible informative question. These are explicit controls, not optimized curricula.

`choose` receives only visible priors, available questions, observed answers, policy, random seed and remaining cost. It receives no case ID, hidden truth, oracle table or held-out target. The oracle returns only the selected answer. Target scoring happens after selection and never feeds back. Full oracle tables and targets appear only in the retained corpus for post-run audit.

Each case runs one active, five random and one curriculum trace: 336 development, 672 evaluation and 56 CI traces. Stop at a single alternative, no alternatives, no policy query, eight observations or exhausted affordable choices within a total cost of 12. Novel answers can contradict every alternative; this is an abstention, not a recovered grammar.

## Outcomes and comparisons

Record the prior state and every selected question, complete selector input/plan, answer, cumulative cost, remaining alternatives and held-out prediction. A target receives a prediction only when every remaining alternative has the same unique form. Zero alternatives, disagreement and unavailable predictions abstain. Compare using the engine's NFC/case-insensitive form normalization. Report correct, wrong and abstained outcomes with their full denominators; wrong and abstained outcomes both count against correct rate.

Report observation curves at integer budgets 0–8 and cost curves at 0–12, separately by domain and condition. Each point takes the last state of the recorded trace within that budget and carries it forward after stopping. Cost curves are prefixes of the total-budget-12 run, not newly optimized policies for each smaller budget. The prior point counts before any answer. Include mean observed queries, cost and remaining alternatives.

Random totals have five traces per case, while active and curriculum have one. Compare rates, and average the five random repetitions within each case for paired comparisons. Retain every case's active-minus-baseline correct-rate delta, its mean, and win/tie/loss counts. These are descriptive comparisons on deterministic synthetic templates, not confidence intervals or significance tests. No aggregate across conditions should conceal irregular errors or unavailable abstentions.

Exceptions remain failed scheduled records. Preserve their last valid state, or six abstentions if no state exists, and report failures separately. Never drop failed runs from denominators. Replay must reject missing or duplicate scheduled records, changed source/corpus/trace/summary hashes, traversal paths and incomplete runs.

## Run and replay

After installing locked dependencies and committing the freeze:

```sh
npm run evaluate:elicitation -- development test-results/w22-curves-development
npm run evaluate:elicitation -- evaluation test-results/w22-curves-evaluation
npm run evaluate:elicitation -- verify test-results/w22-curves-evaluation
```

CI runs the separate `ci` partition on Windows and Linux. It is an engineering regression check, not a fresh quality result. Each archive contains the manifest, exact source and lockfile snapshot, independent oracle corpus, all traces and recomputed summaries. Snapshot inventory and archived byte hashes remain exact; comparing a current checkout permits only CRLF/LF differences.

To replay a future extracted archive independently of later source changes, enter its `source` directory, run `npm ci`, then `npx tsx evaluation/src/elicitation/run.ts verify ..`. Replay recomputes all deterministic choices, predictions and scores; it does not reconstruct the original runtime or establish real-world performance. Retain both complete archives and their hashes with the results report.
