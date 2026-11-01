# Bounded decipherment baseline results

The revised local Qwen model abstained on all 32 identifiable development challenges. The surface heuristic answered 28 correctly and made 24 unsupported claims on other challenges. These results motivate a first experiment in deciding when lexical anchors justify a positive answer.

The pilot contains eight generated development lineages. Each method received the same 48 episodes with 104 challenges, plus four separate hand-authored controls with eight challenges. The development challenges comprise 32 identifiable, 32 ambiguous and 40 insufficient cases. The [protocol](../evaluation/protocols/decipherment-v1.md) defines those states relative to the supplied task priors.

| Development method | Identified correct | Ambiguity or insufficient evidence handled correctly | Unsupported claims | Invalid, missing, timeout or error |
| --- | ---: | ---: | ---: | ---: |
| Exact lookup | 0/32 | 40/72 | 0/104 | 0/104 |
| Surface heuristic | 28/32 | 48/72 | 24/104 | 0/104 |
| Qwen with structured output | 0/32 | 42/72 | 0/104 | 0/104 |
| Same Qwen with optional checks | 0/32 | 41/72 | 0/104 | 0/104 |

Both revised model tracks abstained on every development challenge. Their false-claim rate per *assertion* is undefined because they made zero assertions. The tool-enabled model requested zero checks. The second model row measures tool availability. Actual tool effectiveness requires a learner that uses them. Both tracks recognized all 40 insufficient cases, but recognized ambiguity on only two and one of 32 ambiguous cases respectively.

On the eight hand-authored controls, both revised model tracks recovered zero of two identifiable answers, correctly handled two of six uncertain cases and made zero claims. The heuristic recovered both identifiable answers and made three unsupported claims. These four fixtures exercise different examples within the same narrow rule classes.

## Why two studies are retained

The first study used plain JSON decoding. Both model tracks failed on 99 of 104 development items. The records include invented challenge IDs, incomplete action envelopes and truncated completions. Each track made three unsupported claims. A low count alongside 99 failures tells little about a model's judgment.

One development revision supplied a more explicit prompt and constrained the response shape, challenge count and visible IDs. Linguistic values and uncertainty choices remained open. The model and corpus stayed fixed. Because the prompt and decoding constraints changed together, this experiment cannot separate their effects. The earlier run started cold and the revised run followed a transport probe. Compare the accuracy and failure counts across runs with those differences in mind.

Both studies used Qwen3-4B-Instruct-2507 Q4_K_M through Ollama 0.32.5 on an RX 7900 XTX. The model manifest digest was `0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0`. Each episode shared 2,048 generated tokens and 90 seconds across its calls. Temperature and seed were zero, with 8,192 context tokens. The allocation snapshot reported 3,873,366,343 VRAM bytes. This is an endpoint sample. Peak GPU memory and energy were not measured. [Model distribution](https://ollama.com/library/qwen3:4b-instruct-2507-q4_K_M)

The existing symbolic translation engine separately recovered 10/10 withheld scenes at the largest observation budget in its original small CI fixture with a supplied grammar prior. It takes scenes and a translation-specific representation. Its score uses a different denominator and cannot be ranked in this table. [Historical workspace replay](verification/m0-research-workspace.json)

## Inspect and replay the runs

Each archive includes the complete 208-record schedule, raw calls, tool checks, outcomes, original source bytes, report and summary. Replaying uses saved responses and performs zero inference calls. A verifier checks the raw requests against the learner projection, reconstructs model actions and scores, and checks every scheduled record. The reserved split has had zero learner evaluations.

| Study | Browse report | Full archive | Archive SHA-256 |
| --- | --- | --- | --- |
| Initial JSON | [Report](verification/m3-decipherment/study-v1.md) | [Archive](verification/m3-decipherment/study-v1.tar.gz) | `e5797940bdaf8cde6ab8cd51df4705e776cc553e8092a2ace7cda42c92c41999` |
| Revised structured output | [Report](verification/m3-decipherment/study-v2.md) | [Archive](verification/m3-decipherment/study-v2.tar.gz) | `7d578d5a0d12c1d28a08ac38fbd7f500746f806b6b59c126c2cd1c38c3be9a02` |

From the configured research checkout, extract either archive to a new HDD directory. Run the following from the checkout with its installed research dependencies.

~~~powershell
. ./scripts/research-env.ps1
& $ResearchWorkspace.Node node_modules/tsx/dist/cli.mjs evaluation/src/decipherment/study.ts verify <extracted-directory>
~~~

The study measures behavior under two specific interfaces on a small synthetic corpus. Natural-language performance, effects of weight updates and final-set performance remain open questions. The [first adapter experiment](../evaluation/protocols/lexical-adapter-gates-v1.md) specifies the decision criteria before any final comparison.
