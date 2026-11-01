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
