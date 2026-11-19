# Bounded decipherment baseline study

| Cohort / method | Identified accuracy | Answer coverage | Uncertainty success | False claims | Failed items | Median ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| controls/lookup | 0.0% | 0.0% | 33.3% | 1/8 | 0 | 0.0 |
| controls/model | 0.0% | 0.0% | 33.3% | 0/8 | 0 | 547.0 |
| controls/model-tools | 0.0% | 0.0% | 33.3% | 0/8 | 0 | 482.9 |
| controls/surface | 100.0% | 100.0% | 50.0% | 3/8 | 0 | 0.1 |
| development/lookup | 0.0% | 0.0% | 55.6% | 0/104 | 0 | 0.1 |
| development/model | 0.0% | 0.0% | 58.3% | 0/104 | 0 | 714.0 |
| development/model-tools | 0.0% | 0.0% | 56.9% | 0/104 | 0 | 624.0 |
| development/surface | 87.5% | 87.5% | 66.7% | 24/104 | 0 | 0.1 |

Development and independent software controls are reported separately. No reserved evaluation was run. These supplied finite rule classes do not demonstrate unrestricted language decipherment.

Lookup memorizes exact demonstrations. Surface heuristics use greedy boundaries, inventory elimination, context-free aligned symbol maps and the first consistent affix decomposition. They are deliberately simple controls, not exhaustive identifiability solvers.

Model and model-tools use the same evidence, priors, temperature, seed, context and total generated-token/time budgets. Tool checks consume that shared budget. Serial method order rotates by episode; cold loads are retained. One model seed and eight development lineages do not establish statistical superiority.

Node RSS is sampled after each episode and is not peak system or GPU memory. Model allocation snapshots, when available, are stored separately in manifest.json. Token totals and full requests/responses are retained in records.jsonl. The existing supplied-grammar-prior translation benchmark has a different task contract and remains a separately reported control.
