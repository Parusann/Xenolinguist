# L2-ARCTIC acoustic pilot

These 24 recordings and manual annotations are a subset of **L2-ARCTIC**, by Guanlong Zhao, Sinem Sonsaat, Alif Silpachai, Ivana Lucic, Evgeny Chukharev-Hudilainen, John Levis and Ricardo Gutierrez-Osuna (Interspeech 2018, DOI 10.21437/Interspeech.2018-1110).

The files retain the corpus's **Creative Commons Attribution–NonCommercial 4.0** license, reproduced in [LICENSE](LICENSE). They are separate evaluation material, not covered by the application license and not shipped in the installer. The corpus authors retain attribution and rights. Audio and TextGrid bytes are unchanged; `corpus.json` is a parsed selection manifest. Runtime evaluation downmixes and resamples a derivative to 16 kHz PCM16 and records its separate hash.

Primary sources: [corpus and license](https://psi.engr.tamu.edu/l2-arctic-corpus/), [annotation conventions](https://psi.engr.tamu.edu/l2-arctic-corpus-docs/), [paper](https://www.isca-archive.org/interspeech_2018/zhao18b_interspeech.html). Retrieval uses the public raw-file mirror `chikingsley/l2-arctic-release-v5.0`, pinned to `cc02fd37197966e5de11ad737f7affd577c61992`; this is a third-party mirror, not an assertion of an official release checksum. Archive and individual member SHA-256 values are retained.

`python scripts/prepare-acoustic-corpus.py` verifies the pinned archives before extracting only named members into this directory. It selects the first 12 sorted manual annotations from ASI, then the first 12 LXC annotations whose prompt IDs were not selected for ASI. ASI is development; LXC is evaluation. There is no selection by model performance. These are two non-native English speakers (Hindi and Mandarin backgrounds), not a representative population sample or an unseen-training-data guarantee. No model fitting is performed on either split.

See [the frozen scoring protocol](../../../../docs/acoustic-protocol.md) before running inference. Non-commercial use and attribution requirements apply to redistributing these data and their derivatives.
