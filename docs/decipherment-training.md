# Local adapter feasibility

The CPU pilot updated a LoRA adapter on the complete Qwen3-4B-Instruct-2507 base and reproduced the third update after a fresh checkpoint reload. Four Ryzen 9 7900 threads processed 500–530 input tokens per step in 4.7–6.1 seconds. Windows reported a peak process working set of 8.16 GiB. The checkpoint, optimizer state and resumed adapter occupied 678,567 bytes. [Measured run](verification/m4-cpu-pilot.json)

The experiment used 40,960 trainable parameters out of 4,022,509,056 total. The rank-four adapter targets the final layer's query and value projections. BF16 base weights use the pinned Hugging Face revision `cdbee75f17c01a7cc42f958dc650907174af0554`. The setup retains the original Apache 2.0 license, verifies each weight shard by SHA-256 and checks metadata against upstream Git object IDs. [Pinned model source](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507/tree/cdbee75f17c01a7cc42f958dc650907174af0554)

The supervised fixture contains 48 lexical episodes across the 24 synthetic training lineages. Every episode contributes two answers. Each positive answer cites its anchors. Ambiguous and outside-inventory challenges teach different abstention reasons. The scorer checks all 96 targets before export. The training script accepts the pinned bytes of that export. The prompt contains learner-visible evidence and the loss applies only to the assistant response tokens.

The pilot took two optimizer steps, saved the adapter, optimizer and RNG state, then took a reference third step. It discarded the in-memory models, read the base and adapter from disk, restored the optimizer and RNG, and repeated the third step. Both paths returned loss 0.8126125336 and parameter SHA-256 `7476377d806f9e3b0d4b3cd979ef897a7ca579d1a7071ea0c8df8a97e62d73f6`. These timings support an initial estimate of around four to five minutes for 48 optimizer updates with the same sequence lengths, plus loading, validation and artifact writes. Learning quality requires held-out predictions.

## Reproduce

Run these commands from the configured research checkout using PowerShell 7.2 or newer and uv with support for `--no-bin` and `--no-registry`.

~~~powershell
pwsh -NoProfile -File scripts/adapter.ps1 -Action setup
pwsh -NoProfile -File scripts/adapter.ps1 -Action pilot
~~~

Setup installs Python 3.12.13, the measured Windows CPU package versions and approximately 8.06 GB of model files in the research workspace. It creates an isolated environment and verifies the model at load. It needs network access for initial downloads. The pilot runs offline at below-normal scheduling priority, requires 12 GiB available system RAM and preserves 20 GiB of HDD headroom. Each pilot writes to a fresh directory.

Local inference already uses the RX 7900 XTX. Training used the CPU because the installed Adrenalin 26.6.1 driver differs from the driver AMD documents for the current Windows training stack. Native GPU backward-pass compatibility and GPU training throughput remain unmeasured. [Installed driver mapping](https://gpuopen.com/version-table/) · [AMD training driver](https://www.amd.com/en/resources/support-articles/release-notes/RN-RAD-ROCM-10-01.html)

## Compare the fixed candidate

The candidate starts from the pinned base and a fresh seed. Its 48 optimizer updates use each training episode once. Only the final checkpoint is eligible for evaluation. [Frozen recipe](../evaluation/protocols/lexical-candidate-recipe-v1.json) · [Evaluation criteria](../evaluation/protocols/lexical-adapter-gates-v1.md)

The completed training loop took 246.57 seconds. Updates averaged 5.14 seconds, with a range of 4.53–7.48 seconds. Peak process memory across training and export reached 8.43 GiB. The saved adapter weights occupy 164,400 bytes. Its parameter hash is `faec1a8fba0a3cfeac6c210ebfb4722e0fe28572f27d83e4a724d8aead555f20`. The run record includes every update and each exported file's checksum. [Training record](verification/m5-lexical-candidate/training.json)

Run `pwsh -NoProfile -File scripts/adapter.ps1 -Action candidate` once. For the following commands, start the pinned research Ollama service on loopback port 11435 with the workspace model directory, cloud disabled and one model loaded at a time.

~~~powershell
pwsh -NoProfile -File scripts/adapter.ps1 -Action import
pwsh -NoProfile -File scripts/adapter.ps1 -Action development
pwsh -NoProfile -File scripts/adapter.ps1 -Action final
~~~

Import checks every shard against its recorded hash and compares every tensor's name, shape, dtype and bytes. The two trained projections must differ and every other tensor must match. The importer stages hard links on the research volume and supplies both models with the original tokenizer, architecture metadata and Apache license. An independent control checks that each artifact can answer through the same inference service. [Ollama import procedure](https://docs.ollama.com/import)

Ollama 0.32.5 rejected direct import with `unsupported architecture "Qwen3ForCausalLM"`. The importer therefore converts both sides to BF16 GGUF with the same pinned llama.cpp revision. It verifies the converter checkout and frozen package versions, retains conversion logs and hashes, and imports those GGUF files. The failed direct-import log remains in the local run directory. Setup acquires the converter and a separate CPU conversion environment on the research volume. That environment uses the converter's required Transformers 4.57.6 and PyTorch 2.11.0+cpu. Training remains recorded under its measured package versions. [Converter revision](https://github.com/ggml-org/llama.cpp/tree/cd959bae99ff4bed22bef2604f45241c09bbb8c8) · [Conversion dependencies](../research/adapter/requirements-conversion-windows-cpu.txt)

Each split schedules 48 episodes twice and retains all 104 challenge outcomes per model. The base and candidate each preload once before timed inference. A fresh result directory marks the start of an attempt. The reserved run requires a replay-verified development result with the same model digests. To replay either directory without starting Ollama, run the following from the configured checkout.

~~~powershell
. ./scripts/research-env.ps1
& $ResearchWorkspace.Node node_modules/tsx/dist/cli.mjs evaluation/src/decipherment/paired.ts verify (Join-Path $env:XENO_RESEARCH_RESULTS 'lexical-candidate-v1-final')
~~~
