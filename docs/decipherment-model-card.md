# First lexical adapter result

The fixed adapter produced **no observed improvement on the primary lexical task**. On eight reserved synthetic lineages, both the matched base and candidate recovered 0/8 identifiable lexical answers and handled 16/24 uncertain lexical cases correctly. Both failed the preregistered identified-answer and uncertainty gates. The local training and inference workflow completed successfully. [Frozen gates](../evaluation/protocols/lexical-adapter-gates-v1.md) · [Reserved results](verification/m5-lexical-candidate/final-summary.json)

## Experiment

The base is Qwen3-4B-Instruct-2507 at Hugging Face revision `cdbee75f17c01a7cc42f958dc650907174af0554`. The candidate used 48 synthetic training episodes from 24 training lineages and 96 scorer-checked targets. A fresh rank-four adapter trained the final layer's query and value projections for one epoch, under the recipe committed before training. Its 40,960 trainable parameters represent approximately 0.001% of the base. [Pinned base](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507/tree/cdbee75f17c01a7cc42f958dc650907174af0554) · [Recipe](../evaluation/protocols/lexical-candidate-recipe-v1.json)

Training used four CPU threads, took 246.57 seconds and peaked at 8.43 GiB of process memory across training and export. The saved adapter weights occupy 164,400 bytes. An earlier pilot reproduced the same loss and parameter hash after loading a fresh base, adapter, optimizer and RNG state. [Training evidence](verification/m5-lexical-candidate/training.json) · [Recovery verification](verification/m4-cpu-pilot.json)

Both inference artifacts were converted by the same pinned llama.cpp revision to BF16 GGUF and loaded by Ollama 0.32.5 on the RX 7900 XTX. Every tensor name, shape, dtype and byte sequence was compared before conversion. Exactly the two trained projections changed. The artifacts share the same tokenizer, template, model parameters and architecture metadata, and preserve Qwen's Apache 2.0 license. [Runtime and provenance](verification/m5-lexical-candidate/runtime.json)

Each arm received the same observations, structured prompt, temperature zero, seed zero, 8,192-token context, 2,048-token output budget and 90-second episode limit. The primary track used no hypothesis tools. Each split scheduled 48 episodes and 104 challenges per model. The reserved run opened once after a replay-verified development comparison under the same sealed model digests.

## Results

| Split and method | Lexical identified correct | Lexical uncertainty correct | All-task identified correct | All-task uncertainty correct | Failed items |
| --- | ---: | ---: | ---: | ---: | ---: |
| Development base | 0/8 | 16/24 | 0/32 | 41/72 | 0/104 |
| Development candidate | 0/8 | 16/24 | 0/32 | 44/72 | 0/104 |
| Reserved base | 0/8 | 16/24 | 0/32 | 39/72 | 0/104 |
| Reserved candidate | 0/8 | 16/24 | 0/32 | 41/72 | 0/104 |

Both models abstained on every challenge. They made zero assertions and zero unsupported claims. False claims per assertion and answer-confidence calibration are undefined. On the reserved set, the candidate's two additional correct uncertainty responses occurred outside the lexical primary task. [Development summary](verification/m5-lexical-candidate/development-summary.json) · [Reserved summary](verification/m5-lexical-candidate/final-summary.json)

The candidate passed the validity, false-claim and transfer checks. It failed the requirement for at least six correct identifiable answers, a gain of at least four over the base, and at least 22/24 correct uncertain lexical responses. Every reserved lineage had 0/1 correct identifiable lexical answers and 2/3 correct uncertain lexical responses in both arms.

## Reserved lineage counts

| Lineage | Base lexical identified | Candidate lexical identified | Base lexical uncertainty | Candidate lexical uncertainty |
| --- | ---: | ---: | ---: | ---: |
| lineage-3300000 | 0/1 | 0/1 | 2/3 | 2/3 |
| lineage-3300001 | 0/1 | 0/1 | 2/3 | 2/3 |
| lineage-3300002 | 0/1 | 0/1 | 2/3 | 2/3 |
| lineage-3300003 | 0/1 | 0/1 | 2/3 | 2/3 |
| lineage-3300004 | 0/1 | 0/1 | 2/3 | 2/3 |
| lineage-3300005 | 0/1 | 0/1 | 2/3 | 2/3 |
| lineage-3300006 | 0/1 | 0/1 | 2/3 | 2/3 |
| lineage-3300007 | 0/1 | 0/1 | 2/3 | 2/3 |

## Resource measurements

| Reserved arm | Warm episode p50 | Warm episode p95 | Preload from HDD | GPU allocation snapshot |
| --- | ---: | ---: | ---: | ---: |
| Base | 1.053 s | 1.347 s | 117.94 s | 8.78 GiB |
| Candidate | 1.039 s | 1.308 s | 126.49 s | 8.78 GiB |

Episode times include inference, protocol handling and local model verification. Preloading occurs separately before each arm. Percentiles use the existing nearest-rank performance helper. GPU values are allocations reported after loading. Peak GPU memory and electrical power were unmeasured. The short completions used roughly 3,100 output tokens per 48-episode arm. [Resource records](verification/m5-lexical-candidate/resources.json)

## Reproduce the report

The full archives contain every scheduled request, raw response, score, source snapshot, preload record and completion hash. Both compressed archives were extracted to fresh HDD directories and replayed successfully with zero inference calls.

| Split | Archive | SHA-256 |
| --- | --- | --- |
| Development | [Full archive](verification/m5-lexical-candidate/development.tar.gz) | `eb79f025609fccff26e83895e3ea2e7287c606f46782a1d470f736a9a240d248` |
| Reserved | [Full archive](verification/m5-lexical-candidate/final.tar.gz) | `5a1b741a3c6ae22ee989ebcb65184648cb05141ab50c8c07e3de211becbb2f1` |

Extract an archive to a new directory and run the following from the configured research checkout.

~~~powershell
. ./scripts/research-env.ps1
& $ResearchWorkspace.Node node_modules/tsx/dist/cli.mjs evaluation/src/decipherment/paired.ts verify <extracted-directory>
~~~

All 205 research tests and evaluation TypeScript checks pass. The runtime, corpus, model digests, training hashes and evaluation gates are retained alongside the result.

## Product and research decision

The candidate failed the specialist release gate. The callable lexical constraint baseline remains available to application code. It handled 32/32 development lexical challenges correctly across eight lineages excluded from optimization, under an explicitly supplied finite-bijection assumption. Its proposals retain their supporting anchors and unresolved alternatives. [Product interface and demonstrations](decipherment-product-interface.md)

This experiment measures a small training set, one adapter configuration, one seed, a constrained response interface and narrow supplied rule classes. It establishes local feasibility and a null lexical result for that configuration. Additional research needs a new reserved set and controlled comparisons of training data, adapter capacity and response policy. The released reserved traces serve reproducibility and regression work.
